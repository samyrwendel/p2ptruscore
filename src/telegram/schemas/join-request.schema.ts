import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type JoinRequestStatus =
  | 'pending_terms'
  | 'pending_approval'
  | 'approved'
  | 'rejected';

/**
 * Solicitação de entrada no grupo, PERSISTIDA (antes ficava só em memória num Map, perdida a cada restart do bot
 * → botões de aprovar/recusar/entrar davam "não encontrada ou já processada"). Agora sobrevive a restart.
 */
@Schema({ collection: 'join_requests', timestamps: true })
export class JoinRequest {
  @Prop({ required: true, unique: true, index: true })
  userId: number;

  @Prop({ required: true })
  userName: string;

  @Prop({ required: true })
  requestedAt: Date;

  @Prop({ default: false })
  termsAccepted: boolean;

  @Prop()
  termsAcceptedAt?: Date;

  @Prop({
    required: true,
    default: 'pending_terms',
    enum: ['pending_terms', 'pending_approval', 'approved', 'rejected'],
  })
  status: JoinRequestStatus;

  @Prop()
  adminMessageId?: number;

  // adminId -> messageId. Armazenado como objeto simples (chaves string); o repositório converte de/para Map.
  @Prop({ type: Object, default: undefined })
  adminMessageIds?: Record<string, number>;

  @Prop()
  approvalMessageId?: number;
}

export type JoinRequestDocument = HydratedDocument<JoinRequest>;
export const JoinRequestSchema = SchemaFactory.createForClass(JoinRequest);
