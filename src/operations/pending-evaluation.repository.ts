import { Injectable, Logger } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { AbstractRepository } from '../database/abstract.repository';
import { PendingEvaluation } from './schemas/pending-evaluation.schema';

@Injectable()
export class PendingEvaluationRepository extends AbstractRepository<PendingEvaluation> {
  protected readonly logger = new Logger(PendingEvaluationRepository.name);

  constructor(
    @InjectModel(PendingEvaluation.name)
    pendingEvaluationModel: Model<PendingEvaluation>,
    @InjectConnection()
    connection: Connection,
  ) {
    super(pendingEvaluationModel, connection);
  }

  async createPendingEvaluation(
    operationId: Types.ObjectId,
    evaluatorId: Types.ObjectId,
    targetId: Types.ObjectId
  ): Promise<PendingEvaluation | null> {
    // Verificar se já existe um pending evaluation para essa combinação (previne duplicados)
    // Usa findOneOptional para não lançar exceção se não existir
    const existing = await this.findOneOptional({
      operation: operationId,
      evaluator: evaluatorId,
      target: targetId
    });

    if (existing) {
      this.logger.warn(`⚠️ Pending evaluation already exists for operation ${operationId}, evaluator ${evaluatorId}, target ${targetId} - skipping creation`);
      return existing;
    }

    const nextNotificationAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hora após criação
    return this.create({
      operation: operationId,
      evaluator: evaluatorId,
      target: targetId,
      completed: false,
      notificationCount: 0,
      autoEvaluated: false,
      nextNotificationAt: nextNotificationAt
    } as any);
  }

  async findPendingByUser(userId: Types.ObjectId): Promise<PendingEvaluation[]> {
    return this.find({ evaluator: userId, completed: false });
  }

  async hasPendingEvaluations(userId: Types.ObjectId): Promise<boolean> {
    // Somente considerar pendências que realmente exigem ação do usuário:
    // aquelas vinculadas a operações já concluídas.
    try {
      const results = await this.model.aggregate([
        { $match: { evaluator: userId, completed: false } },
        {
          $lookup: {
            from: 'operations',
            localField: 'operation',
            foreignField: '_id',
            as: 'op'
          }
        },
        { $unwind: '$op' },
        // No banco os statuses são strings minúsculas (e.g., 'completed')
        { $match: { 'op.status': 'completed' } },
        { $limit: 1 }
      ]).exec();
      return (results?.length || 0) > 0;
    } catch (err) {
      this.logger.warn('Failed to check pending evaluations with operation status filter:', err);
      return false;
    }
  }

  async findAllPending(): Promise<PendingEvaluation[]> {
    return this.find({ completed: false });
  }

  async deleteById(id: Types.ObjectId): Promise<void> {
    await this.model.deleteOne({ _id: id });
  }

  async completePendingEvaluation(
    operationId: Types.ObjectId,
    evaluatorId: Types.ObjectId
  ): Promise<PendingEvaluation | null> {
    return this.findOneAndUpdate(
      { 
        operation: operationId, 
        evaluator: evaluatorId, 
        completed: false 
      },
      { 
        completed: true, 
        completedAt: new Date() 
      }
    );
  }

  async findByOperationAndEvaluator(
    operationId: Types.ObjectId,
    evaluatorId: Types.ObjectId
  ): Promise<PendingEvaluation | null> {
    return this.findOne({
      operation: operationId,
      evaluator: evaluatorId
    });
  }

  async deletePendingEvaluationsByOperation(
    operationId: Types.ObjectId
  ): Promise<number> {
    const result = await this.model.deleteMany({
      operation: operationId,
      completed: false
    });
    return result.deletedCount || 0;
  }

  async countPendingNotCompleted(): Promise<number> {
    return this.model.countDocuments({
      completed: false,
      autoEvaluated: { $ne: true }
    });
  }

  async countPendingToNotify(): Promise<number> {
    return this.model.countDocuments({
      completed: false,
      autoEvaluated: { $ne: true },
      nextNotificationAt: { $lte: new Date() }
    });
  }

  async countAutoEvaluated(): Promise<number> {
    return this.model.countDocuments({
      autoEvaluated: true
    });
  }
}
