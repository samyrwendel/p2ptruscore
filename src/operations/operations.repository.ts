import { Injectable, Logger } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection, ClientSession } from 'mongoose';
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
    lockedPrice?: number,
  ): Promise<Operation | null> {
    // Atomic update com condições para prevenir race conditions
    // Só atualiza se:
    // 1. Status é PENDING
    // 2. acceptor não existe ou é null
    // Operações não expiram mais - verificação de expiresAt removida
    const update: Record<string, unknown> = {
      acceptor: acceptorId,
      status: OperationStatus.ACCEPTED,
      acceptedAt: new Date(),
    };
    // Cotação automática (google/binance): grava o preço travado JUNTO no update atômico,
    // no mesmo instante do aceite (nunca deixa a operação ACCEPTED com price 0).
    if (lockedPrice !== undefined) {
      update.price = lockedPrice;
    }
    return this.model
      .findOneAndUpdate(
        {
          _id: operationId,
          status: OperationStatus.PENDING,
          $or: [
            { acceptor: { $exists: false } },
            { acceptor: null }
          ]
        },
        update,
        { new: true },
      )
      .exec();
  }

  // ATÔMICO (audit intertravamento): só cancela se o status atual estiver entre os permitidos. Retorna null se
  // o estado já mudou (ex.: botão velho de cancelar/validade numa op já em disputa/fraude/concluída) → o chamador
  // rejeita e NÃO deleta a mensagem. Default seguro (user/validade/cleanup); admin passa um conjunto mais amplo.
  async cancelOperation(
    operationId: Types.ObjectId,
    allowedStatuses: OperationStatus[] = [
      OperationStatus.PENDING,
      OperationStatus.ACCEPTED,
      OperationStatus.PENDING_COMPLETION,
    ],
  ): Promise<Operation | null> {
    return this.model
      .findOneAndUpdate(
        { _id: operationId, status: { $in: allowedStatuses } },
        { status: OperationStatus.CANCELLED },
        { new: true },
      )
      .exec();
  }

  // ATÔMICO: reverter (desistir) só de op ACEITA (mesmo estado que o service valida em revertOperation).
  // null = estado mudou (ex.: contraparte pediu conclusão no meio) → rejeitar, sem reverter indevidamente.
  async revertAcceptedOperation(operationId: Types.ObjectId): Promise<Operation | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: operationId,
          status: OperationStatus.ACCEPTED,
        },
        {
          status: OperationStatus.PENDING,
          wasReverted: true,
          $unset: { acceptor: 1 } // Remove o campo acceptor
        },
        { new: true },
      )
      .exec();
  }

  async disputeOperation(
    operationId: Types.ObjectId,
    complainantId: Types.ObjectId,
    reason: string,
  ): Promise<Operation | null> {
    // ATÔMICO: só contesta de op aceita/aguardando conclusão. Se uma conclusão/reversão/cancelamento correu no
    // meio, a condição não casa → null → rejeita (evita concluir-vs-contestar corrompendo o estado final).
    // previousStatus vem de '$status' NO PRÓPRIO update (pipeline) — sem read separado, sem TOCTOU no valor salvo.
    return this.model
      .findOneAndUpdate(
        {
          _id: operationId,
          status: { $in: [OperationStatus.ACCEPTED, OperationStatus.PENDING_COMPLETION] },
        },
        [
          {
            $set: {
              previousStatus: '$status',
              status: OperationStatus.DISPUTED,
              disputedBy: complainantId,
              disputedAt: new Date(),
              disputeReason: { $literal: reason },
            },
          },
        ],
        { new: true },
      )
      .exec();
  }

  async updateOperation(
    operationId: Types.ObjectId,
    updateData: Partial<Operation>,
    options?: { session?: ClientSession; expectedStatus?: OperationStatus[] },
  ): Promise<Operation | null> {
    // Se expectedStatus for informado, o update vira ATÔMICO-condicional (só aplica se o status atual estiver
    // no conjunto) → retorna null quando o estado já mudou. Usado por transições sensíveis (pedir conclusão, admin).
    const filter: Record<string, unknown> = { _id: operationId };
    if (options?.expectedStatus && options.expectedStatus.length > 0) {
      filter.status = { $in: options.expectedStatus };
    }
    return this.model
      .findOneAndUpdate(filter, updateData, {
        new: true,
        ...(options?.session && { session: options.session })
      })
      .exec();
  }

  async completeOperation(
    operationId: Types.ObjectId,
    options?: { session?: ClientSession },
  ): Promise<Operation | null> {
    // ATÔMICO: só conclui a partir de PENDING_COMPLETION. Double-click ou concluir-vs-outra-ação → o 2º retorna
    // null e o service NÃO dispara notificação/avaliação duplicada.
    return this.model
      .findOneAndUpdate(
        { _id: operationId, status: OperationStatus.PENDING_COMPLETION },
        {
          status: OperationStatus.COMPLETED,
          completionRequestedBy: null,
          completionRequestedAt: null
        },
        {
          new: true,
          ...(options?.session && { session: options.session })
        },
      )
      .exec();
  }

  /**
   * Conta operações concluídas (status COMPLETED) — total acumulado da comunidade.
   * COMPLETED é terminal (revert é bloqueado e não há transição saindo dele),
   * então esta contagem é monotônica na prática. Índice em `status` cobre a query.
   */
  async countCompleted(): Promise<number> {
    return this.model
      .countDocuments({ status: OperationStatus.COMPLETED })
      .exec();
  }

  // ATÔMICO (defensivo — hoje sem callers; o service pede conclusão via updateOperation com expectedStatus).
  // Mantido atômico para não reintroduzir corrida se for religado no futuro.
  async requestCompletion(
    operationId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<Operation | null> {
    return this.model
      .findOneAndUpdate(
        { _id: operationId, status: OperationStatus.ACCEPTED },
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

  async findStalePendingOperations(olderThanDays: number): Promise<Operation[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    return this.model
      .find({
        status: OperationStatus.PENDING,
        createdAt: { $lt: cutoffDate },
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

  /**
   * Encontra operações pendentes antigas que ainda não receberam verificação de validade
   * @param olderThanDays Operações pendentes há mais de X dias (desde criação ou última confirmação)
   */
  async findOperationsNeedingValidityCheck(olderThanDays: number): Promise<Operation[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    return this.model
      .find({
        status: OperationStatus.PENDING,
        validityCheckSentAt: { $exists: false }, // Ainda não foi enviada verificação
        $or: [
          // Operações nunca confirmadas e criadas há mais de X dias
          {
            validityConfirmedAt: { $exists: false },
            createdAt: { $lt: cutoffDate },
          },
          // Operações já confirmadas mas a confirmação foi há mais de X dias
          {
            validityConfirmedAt: { $lt: cutoffDate },
          },
        ],
      })
      .exec();
  }

  /**
   * Encontra operações que receberam verificação mas não foram confirmadas dentro do prazo
   * @param checkSentBeforeHours Verificações enviadas há mais de X horas sem resposta
   */
  async findUnconfirmedValidityChecks(checkSentBeforeHours: number): Promise<Operation[]> {
    const cutoffDate = new Date();
    cutoffDate.setTime(cutoffDate.getTime() - (checkSentBeforeHours * 60 * 60 * 1000));

    return this.model
      .find({
        status: OperationStatus.PENDING,
        validityCheckSentAt: { $lt: cutoffDate, $exists: true },
        validityConfirmedAt: { $exists: false }, // Não confirmou ainda
      })
      .exec();
  }

  /**
   * Marca que a verificação de validade foi enviada
   */
  async markValidityCheckSent(
    operationId: Types.ObjectId,
    messageId: number,
  ): Promise<Operation | null> {
    return this.model
      .findByIdAndUpdate(
        operationId,
        {
          validityCheckSentAt: new Date(),
          validityCheckMessageId: messageId,
        },
        { new: true },
      )
      .exec();
  }

  /**
   * Marca que o criador confirmou a validade da operação
   * A operação não será verificada novamente por X dias (baseado em validityConfirmedAt)
   */
  async confirmOperationValidity(operationId: Types.ObjectId): Promise<Operation | null> {
    return this.model
      .findByIdAndUpdate(
        operationId,
        {
          validityConfirmedAt: new Date(), // Nova data de confirmação - reinicia o contador de dias
          // Limpar campos de verificação pendente para permitir nova verificação futura
          $unset: { validityCheckSentAt: 1, validityCheckMessageId: 1 },
        },
        { new: true },
      )
      .exec();
  }
}