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
  LIQUID = 'liquid',
  FIAT = 'fiat',
}

export enum AssetType {
  USDC = 'USDC',
  USDT = 'USDT',
  USDE = 'USDe',
  DEPIX = 'DEPIX',
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
  PENDING_COMPLETION = 'pending_completion', // Aguardando confirmação da outra parte
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  CLOSED = 'closed',
  DISPUTED = 'disputed',           // Em disputa - operação contestada
  UNDER_REVIEW = 'under_review',   // Sob análise de administrador
  FRAUD_REPORTED = 'fraud_reported', // Fraude reportada - operação suspensa
}

export enum QuotationType {
  MANUAL = 'manual',
  GOOGLE = 'google',
  BINANCE = 'binance',
  API = 'api',
}

export enum QuotationSource {
  GOOGLE = 'google',
  BINANCE = 'binance',
  MANUAL = 'manual',
}

@Schema({ timestamps: true, versionKey: false })
export class Operation extends AbstractDocument {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  creator: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name })
  acceptor?: Types.ObjectId;

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

  @Prop({ enum: QuotationSource })
  quotationSource?: QuotationSource;

  @Prop()
  exchangeRate?: number;

  @Prop()
  exchangeRateTimestamp?: Date;

  @Prop()
  description?: string;

  @Prop({ type: [String] })
  paymentMethods?: string[];

  @Prop({ enum: OperationStatus, default: OperationStatus.PENDING })
  status: OperationStatus;

  @Prop({ type: Types.ObjectId, ref: User.name })
  completionRequestedBy?: Types.ObjectId; // Quem solicitou a conclusão

  @Prop()
  completionRequestedAt?: Date; // Quando foi solicitada a conclusão

  @Prop({ type: Types.ObjectId, ref: User.name })
  awaitingConfirmationFrom?: Types.ObjectId; // De quem está aguardando confirmação

  @Prop()
  awaitingConfirmationSince?: Date; // Desde quando está aguardando

  @Prop({ maxlength: 1000 })
  transactionDetails?: string; // Detalhes da transação fornecidos pelo solicitante

  @Prop({ type: Types.ObjectId, ref: User.name })
  disputedBy?: Types.ObjectId;

  @Prop()
  disputedAt?: Date;

  @Prop({ maxlength: 500 })
  disputeReason?: string;

  @Prop({ enum: OperationStatus })
  previousStatus?: OperationStatus;

  @Prop({ default: false })
  wasReverted?: boolean;

  @Prop({ maxlength: 200 })
  transactionHash?: string; // Hash da transação blockchain

  @Prop({ maxlength: 100 })
  blockchainNetwork?: string; // Rede blockchain utilizada (ethereum, bitcoin, etc.)

  @Prop()
  transactionConfirmed?: boolean; // Se a transação foi confirmada

  @Prop()
  transactionConfirmedAt?: Date; // Quando foi confirmada

  @Prop({ maxlength: 500 })
  explorerUrl?: string; // URL do explorer para verificação

  @Prop()
  messageId?: number;

  @Prop()
  privateEvaluationMessageId?: number;

  // ID da mensagem privada enviada ao criador ao notificar a aceitação
  @Prop()
  creatorAcceptanceDmMessageId?: number;

  // ID da mensagem privada enviada à outra parte ao solicitar conclusão
  @Prop()
  completionRequestDmMessageId?: number;

  @Prop({ default: Date.now })
  expiresAt: Date;
}

export const OperationSchema = SchemaFactory.createForClass(Operation);

// Índices simples
OperationSchema.index({ creator: 1 });
OperationSchema.index({ acceptor: 1 });

// Índices compostos para queries frequentes
OperationSchema.index({ creator: 1, status: 1 }); // Minhas operações por status
OperationSchema.index({ acceptor: 1, status: 1 }); // Operações aceitas por status
OperationSchema.index({ group: 1, status: 1, createdAt: -1 }); // Operações do grupo ordenadas
OperationSchema.index({ status: 1, expiresAt: 1 }); // Cleanup de expiradas
OperationSchema.index({ status: 1, createdAt: -1 }); // Operações por status e data