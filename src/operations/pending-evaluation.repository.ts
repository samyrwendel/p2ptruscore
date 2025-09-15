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
  ): Promise<PendingEvaluation> {
    return this.create({
      operation: operationId,
      evaluator: evaluatorId,
      target: targetId,
      completed: false
    });
  }

  async findPendingByUser(userId: Types.ObjectId): Promise<PendingEvaluation[]> {
    return this.find({ evaluator: userId, completed: false });
  }

  async hasPendingEvaluations(userId: Types.ObjectId): Promise<boolean> {
    const count = await this.model.countDocuments({ 
      evaluator: userId, 
      completed: false 
    });
    return count > 0;
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
}