import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Types } from 'mongoose';
import { PendingEvaluationRepository } from './pending-evaluation.repository';
import { OperationsRepository } from './operations.repository';
import { PendingEvaluation } from './schemas/pending-evaluation.schema';
import { OperationStatus } from './schemas/operation.schema';

@Injectable()
export class PendingEvaluationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PendingEvaluationService.name);

  constructor(
    private readonly pendingEvaluationRepository: PendingEvaluationRepository,
    private readonly operationsRepository: OperationsRepository,
  ) {}

  async createPendingEvaluation(
    operationId: Types.ObjectId,
    evaluatorId: Types.ObjectId,
    targetId: Types.ObjectId
  ): Promise<PendingEvaluation> {
    return this.pendingEvaluationRepository.createPendingEvaluation(
      operationId,
      evaluatorId,
      targetId
    );
  }

  async hasPendingEvaluations(userId: Types.ObjectId): Promise<boolean> {
    return this.pendingEvaluationRepository.hasPendingEvaluations(userId);
  }

  async getPendingEvaluations(userId: Types.ObjectId): Promise<PendingEvaluation[]> {
    return this.pendingEvaluationRepository.findPendingByUser(userId);
  }

  async completePendingEvaluation(
    operationId: Types.ObjectId,
    evaluatorId: Types.ObjectId
  ): Promise<PendingEvaluation | null> {
    const completed = await this.pendingEvaluationRepository.completePendingEvaluation(
      operationId,
      evaluatorId
    );
    if (completed) {
      this.logger.log(`Pending evaluation completed for operation ${operationId} by user ${evaluatorId}`);
    }
    return completed;
  }

  async canUserCreateOperations(userId: Types.ObjectId): Promise<{ canCreate: boolean; reason?: string }> {
    const hasPending = await this.hasPendingEvaluations(userId);
    if (hasPending) {
      const pendings = await this.getPendingEvaluations(userId);
      const pendingCount = pendings.length;
      return {
        canCreate: false,
        reason: `Você tem ${pendingCount} avaliação(ões) pendente(s) (apenas de operações concluídas). Complete-as antes de criar novas operações.`
      };
    }
    return { canCreate: true };
  }

  async canUserAcceptOperations(userId: Types.ObjectId): Promise<{ canAccept: boolean; reason?: string }> {
    const hasPending = await this.hasPendingEvaluations(userId);
    if (hasPending) {
      const pendings = await this.getPendingEvaluations(userId);
      const pendingCount = pendings.length;
      return {
        canAccept: false,
        reason: `Você tem ${pendingCount} avaliação(ões) pendente(s) (apenas de operações concluídas). Complete-as antes de aceitar novas operações.`
      };
    }
    return { canAccept: true };
  }

  async hasActiveDisputes(userId: Types.ObjectId): Promise<boolean> {
    try {
      const disputedOperations = await this.operationsRepository.find({
        $or: [
          { creator: userId },
          { acceptor: userId }
        ],
        status: OperationStatus.DISPUTED
      });
      return disputedOperations.length > 0;
    } catch (error) {
      this.logger.error(`Error checking active disputes for user ${userId}:`, error);
      return false;
    }
  }

  async getActiveDisputesCount(userId: Types.ObjectId): Promise<number> {
    try {
      const disputedOperations = await this.operationsRepository.find({
        $or: [
          { creator: userId },
          { acceptor: userId }
        ],
        status: OperationStatus.DISPUTED
      });
      return disputedOperations.length;
    } catch (error) {
      this.logger.error(`Error getting active disputes count for user ${userId}:`, error);
      return 0;
    }
  }

  async getDisputeAnalysis(userId: Types.ObjectId): Promise<{ asComplainant: number; asDefendant: number; total: number }> {
    try {
      const disputedOperations = await this.operationsRepository.find({
        $or: [
          { creator: userId },
          { acceptor: userId }
        ],
        status: OperationStatus.DISPUTED
      });
      let asComplainant = 0;
      let asDefendant = 0;
      for (const operation of disputedOperations) {
        if (operation.disputedBy?.toString() === userId.toString()) {
          asComplainant++;
        } else {
          asDefendant++;
        }
      }
      return { asComplainant, asDefendant, total: disputedOperations.length };
    } catch (error) {
      this.logger.error(`Error getting dispute analysis for user ${userId}:`, error);
      return { asComplainant: 0, asDefendant: 0, total: 0 };
    }
  }

  async getUserDisputeWarning(userId: Types.ObjectId): Promise<string | null> {
    try {
      const analysis = await this.getDisputeAnalysis(userId);
      if (analysis.total === 0) return null;
      if (analysis.asDefendant > 0) {
        if (analysis.asDefendant === 1 && analysis.asComplainant === 0) return '🚨 **Este usuário está sendo contestado em 1 operação**';
        if (analysis.asDefendant > 1 && analysis.asComplainant === 0) return `🚨 **Este usuário está sendo contestado em ${analysis.asDefendant} operações**`;
        if (analysis.asDefendant === 1 && analysis.asComplainant > 0) return `🚨 **Este usuário está sendo contestado em 1 operação** (e contestou ${analysis.asComplainant})`;
        return `🚨 **Este usuário está sendo contestado em ${analysis.asDefendant} operações** (e contestou ${analysis.asComplainant})`;
      }
      if (analysis.asComplainant === 1) return '⚠️ **Este usuário contestou 1 operação**';
      return `⚠️ **Este usuário contestou ${analysis.asComplainant} operações**`;
    } catch (error) {
      this.logger.error(`Error getting user dispute warning for user ${userId}:`, error);
      return null;
    }
  }

  async cleanupOrphanPendings(): Promise<{ removed: number; checked: number }> {
    const pendings = await this.pendingEvaluationRepository.findAllPending();
    let removed = 0;
    let checked = pendings.length;
    for (const pending of pendings) {
      try {
        const op = await this.operationsRepository.findOne({ _id: pending.operation });
        if (!op) {
          await this.pendingEvaluationRepository.deleteById(pending._id);
          removed++;
          continue;
        }
        if (op.status !== OperationStatus.COMPLETED) {
          await this.pendingEvaluationRepository.deleteById(pending._id);
          removed++;
        }
      } catch (err) {
        this.logger.warn('Error checking pending evaluation:', err);
      }
    }
    this.logger.log(`Cleanup orphan pendings: removed=${removed}, checked=${checked}`);
    return { removed, checked };
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      const result = await this.cleanupOrphanPendings();
      this.logger.log(`Startup cleanup of orphan pendings completed: removed=${result.removed}, checked=${result.checked}`);
    } catch (err) {
      this.logger.warn('Startup cleanup of orphan pendings failed:', err);
    }
  }
}
