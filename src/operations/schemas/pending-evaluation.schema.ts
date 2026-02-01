import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AbstractDocument } from '../../database/abstract.schema';
import { User } from '../../users/schemas/user.schema';
import { Operation } from './operation.schema';

@Schema({ timestamps: true })
export class PendingEvaluation extends AbstractDocument {
  @Prop({ type: Types.ObjectId, ref: 'Operation', required: true })
  operation: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  evaluator: Types.ObjectId; // Usuário que precisa avaliar

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  target: Types.ObjectId; // Usuário a ser avaliado

  @Prop({ default: false })
  completed: boolean;

  @Prop({ type: Date })
  completedAt?: Date;

  // Sistema de notificações exponenciais
  @Prop({ default: 0 })
  notificationCount: number; // Número de notificações enviadas (0-7)

  @Prop({ type: Date })
  lastNotificationAt?: Date; // Data da última notificação

  @Prop({ type: Date })
  nextNotificationAt?: Date; // Data da próxima notificação programada

  @Prop({ default: false })
  autoEvaluated: boolean; // Se a avaliação foi feita automaticamente

  @Prop({ type: Date })
  autoEvaluatedAt?: Date; // Data da avaliação automática

  @Prop({ type: String })
  autoEvaluationReason?: string; // Motivo da avaliação automática
}

export const PendingEvaluationSchema = SchemaFactory.createForClass(PendingEvaluation);

// Índice único composto para prevenir duplicatas (uma avaliação por combinação operation+evaluator+target)
PendingEvaluationSchema.index(
  { operation: 1, evaluator: 1, target: 1 },
  { unique: true, background: true }
);

// Índices para consultas frequentes
PendingEvaluationSchema.index({ evaluator: 1, completed: 1 });
PendingEvaluationSchema.index({ completed: 1, autoEvaluated: 1, nextNotificationAt: 1 });