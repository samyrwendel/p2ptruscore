import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AbstractDocument } from '../../database/abstract.schema';
import { User } from '../../users/schemas/user.schema';
import { Group } from '../../groups/schemas/group.schema';

@Schema({ _id: false })
class KarmaHistory {
  @Prop({ default: Date.now })
  timestamp: Date;

  @Prop({ required: true })
  karmaChange: number;

  @Prop({ required: false })
  comment?: string;

  @Prop({ type: Types.ObjectId, ref: User.name, required: false })
  evaluator?: Types.ObjectId;

  @Prop({ required: false })
  evaluatorName?: string;

  @Prop({ required: false, min: 1, max: 5 })
  starRating?: number;
}

@Schema({ timestamps: true, versionKey: false })
export class Karma extends AbstractDocument {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  user: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Group.name, required: true })
  group: Types.ObjectId;

  @Prop({ default: 0 })
  karma: number;

  @Prop({ type: [KarmaHistory], default: [] })
  history: KarmaHistory[];

  @Prop({ default: 0 })
  givenKarma: number;

  @Prop({ default: 0 })
  givenHate: number;

  // Contadores de estrelas recebidas
  @Prop({ default: 0 })
  stars5: number;

  @Prop({ default: 0 })
  stars4: number;

  @Prop({ default: 0 })
  stars3: number;

  @Prop({ default: 0 })
  stars2: number;

  @Prop({ default: 0 })
  stars1: number;
}

export const KarmaSchema = SchemaFactory.createForClass(Karma);

KarmaSchema.index({ user: 1, group: 1 }, { unique: true });
KarmaSchema.index({ group: 1, karma: -1 });
KarmaSchema.index({ group: 1, karma: 1 });
KarmaSchema.index({ group: 1, givenKarma: -1 });
KarmaSchema.index({ group: 1, givenHate: -1 });
