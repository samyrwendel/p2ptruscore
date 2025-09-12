import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { PendingEvaluationRepository } from './pending-evaluation.repository';
import { PendingEvaluation } from './schemas/pending-evaluation.schema';

@Injectable()
export class PendingEvaluationService {
  private readonly logger = new Logger(PendingEvaluationService.name);

  constructor(
    private readonly pendingEvaluationRepository: PendingEvaluationRepository,
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
      const pendingCount = (await this.getPendingEvaluations(userId)).length;
      return {
        canCreate: false,
        reason: `Você tem ${pendingCount} avaliação(ões) pendente(s). Complete-as antes de criar novas operações.`
      };
    }
    
    return { canCreate: true };
  }

  async canUserAcceptOperations(userId: Types.ObjectId): Promise<{ canAccept: boolean; reason?: string }> {
    const hasPending = await this.hasPendingEvaluations(userId);
    
    if (hasPending) {
      const pendingCount = (await this.getPendingEvaluations(userId)).length;
      return {
        canAccept: false,
        reason: `Você tem ${pendingCount} avaliação(ões) pendente(s). Complete-as antes de aceitar novas operações.`
      };
    }
    
    return { canAccept: true };
  }
}