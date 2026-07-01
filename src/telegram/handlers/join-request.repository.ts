import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  JoinRequest,
  JoinRequestDocument,
  JoinRequestStatus,
} from '../schemas/join-request.schema';

/**
 * Forma de domínio usada pelo handler: adminMessageIds como Map real (o handler usa .size e iteração for...of).
 * O repositório converte de/para o objeto simples persistido no Mongo.
 */
export interface PendingJoinRequest {
  userId: number;
  userName: string;
  requestedAt: Date;
  termsAccepted: boolean;
  termsAcceptedAt?: Date;
  status: JoinRequestStatus;
  adminMessageId?: number;
  adminMessageIds?: Map<number, number>;
  approvalMessageId?: number;
}

@Injectable()
export class JoinRequestRepository {
  constructor(
    @InjectModel(JoinRequest.name)
    private readonly model: Model<JoinRequestDocument>,
  ) {}

  private toDomain(doc: any): PendingJoinRequest | null {
    if (!doc) return null;
    const adminMessageIds = doc.adminMessageIds
      ? new Map<number, number>(
          Object.entries(doc.adminMessageIds).map(([k, v]) => [Number(k), Number(v)]),
        )
      : undefined;
    return {
      userId: doc.userId,
      userName: doc.userName,
      requestedAt: doc.requestedAt,
      termsAccepted: !!doc.termsAccepted,
      termsAcceptedAt: doc.termsAcceptedAt ?? undefined,
      status: doc.status,
      adminMessageId: doc.adminMessageId ?? undefined,
      adminMessageIds,
      approvalMessageId: doc.approvalMessageId ?? undefined,
    };
  }

  async findByUserId(userId: number): Promise<PendingJoinRequest | null> {
    const doc = await this.model.findOne({ userId }).lean().exec();
    return this.toDomain(doc);
  }

  async upsert(req: PendingJoinRequest): Promise<void> {
    const adminMessageIds = req.adminMessageIds
      ? Object.fromEntries(
          [...req.adminMessageIds.entries()].map(([k, v]) => [String(k), v]),
        )
      : undefined;
    await this.model
      .updateOne(
        { userId: req.userId },
        {
          $set: {
            userId: req.userId,
            userName: req.userName,
            requestedAt: req.requestedAt,
            termsAccepted: req.termsAccepted,
            termsAcceptedAt: req.termsAcceptedAt,
            status: req.status,
            adminMessageId: req.adminMessageId,
            adminMessageIds,
            approvalMessageId: req.approvalMessageId,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async deleteByUserId(userId: number): Promise<void> {
    await this.model.deleteOne({ userId }).exec();
  }

  async findAll(): Promise<PendingJoinRequest[]> {
    const docs = await this.model.find().lean().exec();
    return docs
      .map((d) => this.toDomain(d))
      .filter((r): r is PendingJoinRequest => r !== null);
  }
}
