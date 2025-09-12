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
}

export const PendingEvaluationSchema = SchemaFactory.createForClass(PendingEvaluation);