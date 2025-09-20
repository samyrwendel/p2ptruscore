import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AbstractDocument } from '../../database/abstract.schema';
import { User } from './user.schema';
import { Group } from '../../groups/schemas/group.schema';

@Schema({ timestamps: true, versionKey: false })
export class TermsAcceptance extends AbstractDocument {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  user: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Group.name, required: true })
  group: Types.ObjectId;

  @Prop({ required: true })
  acceptedAt: Date;

  @Prop({ required: true })
  termsVersion: string;

  @Prop({ required: true })
  userTelegramId: number;

  @Prop({ required: true })
  groupTelegramId: number;

  @Prop({ required: false })
  ipAddress?: string;

  @Prop({ required: false })
  userAgent?: string;
}

export const TermsAcceptanceSchema = SchemaFactory.createForClass(TermsAcceptance);

// Índices para otimização de consultas
TermsAcceptanceSchema.index({ user: 1, group: 1 }, { unique: true });
TermsAcceptanceSchema.index({ userTelegramId: 1, groupTelegramId: 1 });
TermsAcceptanceSchema.index({ acceptedAt: 1 });
TermsAcceptanceSchema.index({ termsVersion: 1 });