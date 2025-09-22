import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AbstractDocument } from '../../database/abstract.schema';
import { User } from '../../users/schemas/user.schema';
import { Group } from '../../groups/schemas/group.schema';

export enum OperationType {
  BUY = 'buy',
  SELL = 'sell',
  ANNOUNCEMENT = 'announcement',
  EXCHANGE = 'exchange',
}

export enum NetworkType {
  BTC = 'btc',
  ETH = 'eth',
  ARBITRUM = 'arbitrum',
  BASE = 'base',
  BNB = 'bnb',
  SOLANA = 'solana',
  POLYGON = 'polygon',
  FIAT = 'fiat',
}

export enum AssetType {
  USDC = 'USDC',
  USDT = 'USDT',
  USDE = 'USDe',
  BTC = 'BTC',
  ETH = 'ETH',
  XRP = 'XRP',
  DOLAR = 'DOLAR',
  EURO = 'EURO',
  REAL = 'REAL',
  FIAT = 'FIAT',
  WBTC = 'WBTC',
  CBBTC = 'CBBTC',
  BNB = 'BNB',
  MATIC = 'MATIC',
  ARB = 'ARB',
  OP = 'OP',
  SOL = 'SOL',
  ARBITRUM = 'ARBITRUM',
  BASE = 'BASE',
  SOLANA = 'SOLANA',
  POLYGON = 'POLYGON',
}

export enum OperationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  CLOSED = 'closed',
}

export enum QuotationType {
  MANUAL = 'manual',
  GOOGLE = 'google',
  API = 'api',
}

@Schema({ timestamps: true, versionKey: false })
export class Operation extends AbstractDocument {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  creator: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name })
  acceptor?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name })
  acceptedBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Group.name, required: false })
  group?: Types.ObjectId;

  @Prop({ enum: OperationType, required: true })
  type: OperationType;

  @Prop({ type: [String], enum: AssetType, required: true })
  assets: AssetType[];

  @Prop({ type: [String], enum: NetworkType, required: true })
  networks: NetworkType[];

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  price: number;

  @Prop({ enum: QuotationType, required: true })
  quotationType: QuotationType;

  @Prop()
  description?: string;

  @Prop({ enum: OperationStatus, default: OperationStatus.PENDING })
  status: OperationStatus;

  @Prop()
  messageId?: number;

  @Prop()
  privateEvaluationMessageId?: number;

  @Prop({ default: Date.now })
  expiresAt: Date;
}

export const OperationSchema = SchemaFactory.createForClass(Operation);

OperationSchema.index({ creator: 1 });
OperationSchema.index({ group: 1, status: 1 });
OperationSchema.index({ status: 1, expiresAt: 1 });
OperationSchema.index({ acceptor: 1 });