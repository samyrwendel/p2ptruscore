import { Injectable, Logger } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { AbstractRepository } from '../database/abstract.repository';
import { Operation, OperationStatus } from './schemas/operation.schema';

@Injectable()
export class OperationsRepository extends AbstractRepository<Operation> {
  protected readonly logger = new Logger(OperationsRepository.name);

  constructor(
    @InjectModel(Operation.name) operationModel: Model<Operation>,
    @InjectConnection() connection: Connection,
  ) {
    super(operationModel, connection);
  }

  async findByCreator(creatorId: Types.ObjectId): Promise<Operation[]> {
    return this.model.find({ creator: creatorId }).exec();
  }

  async findByGroup(
    groupId: Types.ObjectId,
    status?: OperationStatus,
  ): Promise<Operation[]> {
    const filter: any = { group: groupId };
    if (status) {
      filter.status = status;
    }
    return this.find(filter);
  }

  async findByAcceptor(acceptorId: Types.ObjectId): Promise<Operation[]> {
    return this.model.find({ acceptor: acceptorId }).exec();
  }

  async findPendingOperations(groupId?: Types.ObjectId): Promise<Operation[]> {
    const filter: any = { status: OperationStatus.PENDING };
    if (groupId) {
      filter.group = groupId;
    }
    return this.model.find(filter).sort({ createdAt: -1 }).exec();
  }

  async acceptOperation(
    operationId: Types.ObjectId,
    acceptorId: Types.ObjectId,
  ): Promise<Operation | null> {
    return this.model
      .findByIdAndUpdate(
        operationId,
        {
          acceptor: acceptorId,
          status: OperationStatus.ACCEPTED,
        },
        { new: true },
      )
      .exec();
  }

  async cancelOperation(operationId: Types.ObjectId): Promise<Operation | null> {
    return this.model
      .findByIdAndUpdate(
        operationId,
        { status: OperationStatus.CANCELLED },
        { new: true },
      )
      .exec();
  }

  async revertAcceptedOperation(operationId: Types.ObjectId): Promise<Operation | null> {
    return this.model
      .findByIdAndUpdate(
        operationId,
        { 
          status: OperationStatus.PENDING,
          $unset: { acceptor: 1 } // Remove o campo acceptor
        },
        { new: true },
      )
      .exec();
  }

  async completeOperation(
    operationId: Types.ObjectId,
  ): Promise<Operation | null> {
    return this.model
      .findByIdAndUpdate(
        operationId,
        { 
          status: OperationStatus.COMPLETED,
          completionRequestedBy: null,
          completionRequestedAt: null
        },
        { new: true },
      )
      .exec();
  }

  async requestCompletion(
    operationId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<Operation | null> {
    return this.model
      .findByIdAndUpdate(
        operationId,
        { 
          status: OperationStatus.PENDING_COMPLETION,
          completionRequestedBy: userId,
          completionRequestedAt: new Date()
        },
        { new: true },
      )
      .exec();
  }

  async closeOperation(operationId: Types.ObjectId): Promise<Operation | null> {
    return this.model
      .findByIdAndUpdate(
        operationId,
        { status: OperationStatus.CLOSED },
        { new: true },
      )
      .exec();
  }

  async findExpiredOperations(): Promise<Operation[]> {
    return this.model
      .find({
        status: OperationStatus.PENDING,
        expiresAt: { $lt: new Date() },
      })
      .exec();
  }

  async deletePendingOperations(creatorId: Types.ObjectId): Promise<number> {
    const result = await this.model
      .deleteMany({
        creator: creatorId,
        status: OperationStatus.PENDING,
      })
      .exec();
    return result.deletedCount || 0;
  }
}