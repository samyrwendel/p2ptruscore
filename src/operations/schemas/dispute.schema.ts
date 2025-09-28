import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AbstractDocument } from '../../database/abstract.schema';
import { User } from '../../users/schemas/user.schema';
import { Operation } from './operation.schema';

export enum DisputeStatus {
  OPEN = 'open',                    // Disputa aberta
  UNDER_REVIEW = 'under_review',    // Sob análise de admin
  RESOLVED = 'resolved',            // Resolvida
  DISMISSED = 'dismissed',          // Rejeitada (contestação inválida)
  ESCALATED = 'escalated'           // Escalada para moderação superior
}

export enum DisputeType {
  NON_PAYMENT = 'non_payment',           // Não pagou
  NON_DELIVERY = 'non_delivery',         // Não entregou
  WRONG_AMOUNT = 'wrong_amount',         // Valor incorreto
  FRAUD_ATTEMPT = 'fraud_attempt',       // Tentativa de fraude
  COMMUNICATION_ISSUE = 'communication_issue', // Problema de comunicação
  TERMS_VIOLATION = 'terms_violation',   // Violação dos termos
  OTHER = 'other'                        // Outros motivos
}

export enum DisputeResolution {
  FAVOR_COMPLAINANT = 'favor_complainant',  // A favor do reclamante
  FAVOR_DEFENDANT = 'favor_defendant',      // A favor do acusado
  PARTIAL_REFUND = 'partial_refund',        // Reembolso parcial
  OPERATION_CANCELLED = 'operation_cancelled', // Operação cancelada
  WARNING_ISSUED = 'warning_issued',        // Advertência emitida
  USER_BANNED = 'user_banned',              // Usuário banido
  NO_ACTION = 'no_action'                   // Nenhuma ação necessária
}

@Schema({ timestamps: true, versionKey: false })
export class Dispute extends AbstractDocument {
  @Prop({ type: Types.ObjectId, ref: Operation.name, required: true })
  operation: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  complainant: Types.ObjectId; // Quem está contestando

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  defendant: Types.ObjectId; // Contra quem está contestando

  @Prop({ enum: DisputeType, required: true })
  type: DisputeType;

  @Prop({ required: true, maxlength: 500 })
  reason: string; // Motivo detalhado da contestação

  @Prop({ enum: DisputeStatus, default: DisputeStatus.OPEN })
  status: DisputeStatus;

  @Prop({ type: [String] })
  evidence?: string[]; // URLs ou IDs de evidências (prints, etc.)

  @Prop({ type: Types.ObjectId, ref: User.name })
  assignedAdmin?: Types.ObjectId; // Admin responsável pela análise

  @Prop({ enum: DisputeResolution })
  resolution?: DisputeResolution;

  @Prop({ maxlength: 1000 })
  adminNotes?: string; // Notas do administrador

  @Prop()
  resolvedAt?: Date;

  @Prop({ default: 0 })
  priority: number; // 0=normal, 1=alta, 2=crítica

  @Prop({ default: false })
  isAppeal: boolean; // Se é um recurso de uma decisão anterior

  @Prop({ type: Types.ObjectId, ref: 'Dispute' })
  originalDispute?: Types.ObjectId; // Referência à disputa original (em caso de recurso)
}

export const DisputeSchema = SchemaFactory.createForClass(Dispute);

// Índices para performance
DisputeSchema.index({ operation: 1 });
DisputeSchema.index({ complainant: 1 });
DisputeSchema.index({ defendant: 1 });
DisputeSchema.index({ status: 1 });
DisputeSchema.index({ assignedAdmin: 1 });
DisputeSchema.index({ createdAt: -1 });