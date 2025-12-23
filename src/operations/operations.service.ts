import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { OperationsRepository } from './operations.repository';
import { OperationsBroadcastService } from './operations-broadcast.service';
import { PendingEvaluationRepository } from './pending-evaluation.repository';
import {
  Operation,
  OperationType,
  NetworkType,
  AssetType,
  OperationStatus,
  QuotationType,
  QuotationSource,
} from './schemas/operation.schema';
import { UsersService } from '../users/users.service';
import { GroupsService } from '../groups/groups.service';
import { KarmaService } from '../karma/karma.service';
import { TransactionService } from '../shared/transaction.service';

export interface CreateOperationDto {
  creatorId: Types.ObjectId;
  groupId?: Types.ObjectId | null;
  chatId?: number; // ID do chat para definir grupo automaticamente
  type: OperationType;
  assets: AssetType[];
  networks: NetworkType[];
  amount: number;
  price: number;
  quotationType: QuotationType;
  quotationSource?: QuotationSource;
  description?: string;
  paymentMethods?: string[];
  expiresInHours?: number;
}

@Injectable()
export class OperationsService {
  private readonly logger = new Logger(OperationsService.name);

  constructor(
    private readonly operationsRepository: OperationsRepository,
    private readonly broadcastService: OperationsBroadcastService,
    private readonly usersService: UsersService,
    private readonly groupsService: GroupsService,
    private readonly pendingEvaluationRepository: PendingEvaluationRepository,
    private readonly karmaService: KarmaService,
    private readonly transactionService: TransactionService,
  ) {}

  async createOperation(dto: CreateOperationDto): Promise<Operation> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (dto.expiresInHours || 24));

    // Se groupId for null mas chatId estiver disponível, criar/encontrar o grupo
    // Apenas para grupos (chatId negativo), não para chats privados (chatId positivo)
    let groupObjectId = dto.groupId;
    if (!groupObjectId && dto.chatId && dto.chatId < 0) {
      try {
        const group = await this.groupsService.findOrCreate({
          id: dto.chatId,
          title: `Grupo ${dto.chatId}`
        });
        groupObjectId = group._id;
        this.logger.log(`Group created/found for chat ${dto.chatId}: ${groupObjectId}`);
      } catch (error) {
        this.logger.warn(`Failed to create/find group for chat ${dto.chatId}:`, error);
      }
    }

    const operation = await this.operationsRepository.create({
      creator: dto.creatorId,
      group: groupObjectId || undefined,
      type: dto.type,
      assets: dto.assets,
      networks: dto.networks,
      amount: dto.amount,
      price: dto.price,
      quotationType: dto.quotationType,
      quotationSource: dto.quotationSource,
      description: dto.description,
      paymentMethods: dto.paymentMethods,
      status: OperationStatus.PENDING,
      expiresAt,
    });

    this.logger.log(
      `Operation created: ${operation._id} by user ${dto.creatorId}`,
    );
    
    // Broadcast será feito pelo handler que chamou createOperation
    // Removido para evitar duplicação
    
    return operation;
  }

  async getOperationById(operationId: Types.ObjectId): Promise<Operation> {
    const operation = await this.operationsRepository.findOne({
      _id: operationId,
    });
    if (!operation) {
      throw new NotFoundException('Operação não encontrada');
    }
    return operation;
  }

  async getGroupById(groupId: string): Promise<any> {
    return this.groupsService.findById(groupId);
  }

  async getUserOperations(userId: Types.ObjectId): Promise<Operation[]> {
    return this.operationsRepository.findByCreator(userId);
  }

  async findByGroup(groupId: Types.ObjectId): Promise<Operation[]> {
    return this.operationsRepository.findByGroup(groupId);
  }

  async getGroupOperations(
    groupId: Types.ObjectId,
    status?: OperationStatus,
  ): Promise<Operation[]> {
    return this.operationsRepository.findByGroup(groupId, status);
  }

  async getPendingOperations(groupId?: Types.ObjectId): Promise<Operation[]> {
    return this.operationsRepository.findPendingOperations(groupId);
  }

  async acceptOperation(
    operationId: Types.ObjectId,
    acceptorId: Types.ObjectId,
  ): Promise<Operation> {
    const operation = await this.getOperationById(operationId);

    if (operation.status !== OperationStatus.PENDING) {
      throw new BadRequestException('Esta operação não está mais disponível');
    }

    if (operation.creator.toString() === acceptorId.toString()) {
      throw new ForbiddenException('Você não pode aceitar sua própria operação');
    }

    if (new Date() > operation.expiresAt) {
      await this.operationsRepository.cancelOperation(operationId);
      throw new BadRequestException('Esta operação expirou');
    }

    const updatedOperation = await this.operationsRepository.acceptOperation(
      operationId,
      acceptorId,
    );

    if (!updatedOperation) {
      throw new ConflictException(
        '❌ Esta operação já foi aceita por outro usuário ou não está mais disponível.\n\n' +
        '💡 **Dica:** Use `/operacoes-disponiveis` para ver operações abertas.'
      );
    }

    this.logger.log(
      `Operation ${operationId} accepted by user ${acceptorId}`,
    );
    
    this.logger.log(`🔄 Chamando notifyOperationAccepted para operação ${operationId}`);
    
    // Notify the group about the acceptance
    await this.broadcastService.notifyOperationAccepted(updatedOperation, acceptorId);
    
    this.logger.log(`✅ notifyOperationAccepted concluído para operação ${operationId}`);
    
    return updatedOperation;
  }

  async disputeOperation(
    operationId: Types.ObjectId,
    complainantId: Types.ObjectId,
    defendantId: Types.ObjectId,
    disputeType: any,
    reason: string,
  ): Promise<Operation> {
    const operation = await this.getOperationById(operationId);

    // Verificar se a operação pode ser disputada
    const disputableStatuses = [OperationStatus.ACCEPTED, OperationStatus.PENDING_COMPLETION];
    if (!disputableStatuses.includes(operation.status)) {
      throw new BadRequestException('Esta operação não pode ser contestada no status atual');
    }

    // Verificar se já foi disputada
    if (operation.status === OperationStatus.DISPUTED) {
      throw new BadRequestException('Esta operação já está em disputa');
    }

    // Atualizar a operação para status disputado
    const updatedOperation = await this.operationsRepository.disputeOperation(
      operationId,
      complainantId,
      reason
    );

    if (!updatedOperation) {
      throw new BadRequestException('Erro ao registrar contestação');
    }

    this.logger.log(`Operation ${operationId} disputed by user ${complainantId} against ${defendantId}`);
    
    // Notificar todas as partes sobre a disputa
    try {
      await this.broadcastService.notifyOperationDisputed(
        updatedOperation,
        complainantId,
        defendantId,
        reason
      );
      this.logger.log(`✅ Dispute notifications sent for operation ${operationId}`);
    } catch (notificationError) {
      this.logger.error(`Failed to send dispute notifications for operation ${operationId}:`, notificationError);
      // Não falhar a operação se as notificações falharem
    }
    
    return updatedOperation;
  }

  async cancelOperation(
    operationId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<Operation> {
    const operation = await this.getOperationById(operationId);

    // Verificar se o usuário é o criador da operação
    const isCreator = operation.creator.toString() === userId.toString();
    const isAcceptor = operation.acceptor?.toString() === userId.toString();
    
    if (!isCreator && !isAcceptor) {
      throw new ForbiddenException('Você só pode cancelar operações que criou ou aceitou');
    }

    // Verificar se a operação já foi concluída - não pode ser cancelada
    if (operation.status === OperationStatus.COMPLETED) {
      throw new BadRequestException('Operações concluídas não podem ser canceladas. As informações ficam mantidas para consulta.');
    }

    this.logger.log(`Tentativa de cancelamento da operação ${operationId} por usuário ${userId}`);
    this.logger.log(`Status da operação: ${operation.status}`);
    
    // Cancelar definitivamente (deletar mensagem)
    const updatedOperation = await this.operationsRepository.cancelOperation(operationId);
    this.logger.log(`Operation ${operationId} cancelled by user ${userId}`);
    
    // Sempre deletar a mensagem do grupo quando cancelar
    await this.broadcastService.deleteOperationMessage(operation);

    if (!updatedOperation) {
      throw new BadRequestException('Erro ao cancelar operação');
    }

    return updatedOperation;
  }

  async adminCancelOperation(
    operationId: Types.ObjectId,
    admin: { telegramId: number; username?: string; firstName?: string },
    reason?: string
  ): Promise<Operation> {
    const operation = await this.getOperationById(operationId);
    const updatedOperation = await this.operationsRepository.cancelOperation(operationId);
    if (!updatedOperation) {
      throw new BadRequestException('Erro ao cancelar operação (admin)');
    }
    await this.broadcastService.deleteOperationMessage(operation);
    const adminName = admin.username ? `@${admin.username}` : admin.firstName || 'Administrador';
    await this.broadcastService.notifyOperationAdminCancelled(updatedOperation as Operation, adminName, reason);
    return updatedOperation as Operation;
  }

  async adminClearDispute(
    operationId: Types.ObjectId,
    admin: { telegramId: number; username?: string; firstName?: string },
    reason?: string
  ): Promise<Operation> {
    const operation = await this.getOperationById(operationId);
    const statusToRestore = operation.previousStatus || OperationStatus.ACCEPTED;
    const updatedOperation = await this.operationsRepository.updateOperation(operationId, { 
      status: statusToRestore,
      previousStatus: undefined,
      disputedBy: undefined,
      disputedAt: undefined,
      disputeReason: undefined
    });
    if (!updatedOperation) {
      throw new BadRequestException('Erro ao remover disputa (admin)');
    }
    const adminName = admin.username ? `@${admin.username}` : admin.firstName || 'Administrador';
    await this.broadcastService.notifyOperationAdminDisputeCleared(updatedOperation as Operation, adminName, reason);
    return updatedOperation as Operation;
  }

  async adminFlagFraud(
    operationId: Types.ObjectId,
    admin: { telegramId: number; username?: string; firstName?: string },
    reason?: string
  ): Promise<Operation> {
    const operation = await this.getOperationById(operationId);
    const updatedOperation = await this.operationsRepository.updateOperation(operationId, { status: OperationStatus.FRAUD_REPORTED });
    if (!updatedOperation) {
      throw new BadRequestException('Erro ao marcar fraude (admin)');
    }
    const adminName = admin.username ? `@${admin.username}` : admin.firstName || 'Administrador';
    await this.broadcastService.notifyOperationAdminFlagged(updatedOperation as Operation, adminName, reason);
    return updatedOperation as Operation;
  }

  async adminPenalizeAccuser(
    operationId: Types.ObjectId,
    admin: { telegramId: number; username?: string; firstName?: string },
    reason?: string
  ): Promise<void> {
    const operation = await this.getOperationById(operationId);
    if (!operation || !operation.disputedBy) return;
    const accuserUser = await this.usersService.findById(operation.disputedBy.toString());
    if (!accuserUser) return;
    try {
      await this.karmaService.updateKarma(
        { id: 0, first_name: admin.firstName || 'Admin', username: admin.username },
        { id: accuserUser.userId, first_name: accuserUser.firstName || 'Usuário', username: accuserUser.userName },
        { id: (await this.groupsService.getDefaultGroupId()) || 0 },
        -1
      );
    } catch {}
    await this.broadcastService.notifyAdminPenalizedAccuser(operation, admin.username || admin.firstName || 'Administrador', reason);
  }

  async revertOperation(
    operationId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<Operation> {
    const operation = await this.getOperationById(operationId);

    // Permitir reversão apenas pelo criador ou aceitador
    const isCreator = operation.creator.toString() === userId.toString();
    const isAcceptor = operation.acceptor?.toString() === userId.toString();
    
    if (!isCreator && !isAcceptor) {
      throw new ForbiddenException('Você só pode reverter operações que criou ou aceitou');
    }

    // Bloquear reversão de operações concluídas
    if (operation.status === OperationStatus.COMPLETED) {
      throw new BadRequestException('Operações concluídas não podem ser revertidas');
    }
    
    // Permitir reversão apenas de operações aceitas
    if (operation.status !== OperationStatus.ACCEPTED) {
      throw new BadRequestException('Apenas operações aceitas podem ser revertidas');
    }

    // Reverter operação aceita para status pendente e remover o aceitador
    const updatedOperation = await this.operationsRepository.revertAcceptedOperation(operationId);
    
    if (!updatedOperation) {
      throw new BadRequestException('Erro ao reverter operação');
    }
    
    this.logger.log(`Operation ${operationId} reverted to pending by user ${userId}`);
    
    // Buscar a operação novamente para garantir que temos todos os campos, incluindo privateEvaluationMessageId
    const fullOperation = await this.getOperationById(operationId);
    
    // Excluir avaliações pendentes relacionadas a esta operação
    try {
      const deletedCount = await this.pendingEvaluationRepository.deletePendingEvaluationsByOperation(operationId);
      this.logger.log(`Removed ${deletedCount} pending evaluations for reverted operation ${operationId}`);
    } catch (error) {
      this.logger.warn(`Could not remove pending evaluations for operation ${operationId}:`, error);
    }
    
    // Notificar o grupo sobre a reversão usando a operação completa
    await this.broadcastService.notifyOperationReverted(fullOperation, operation.acceptor);

    return updatedOperation;
  }

  async completeOperation(
    operationId: Types.ObjectId,
    userId: Types.ObjectId,
    transactionDetails?: string,
  ): Promise<Operation> {
    const operation = await this.getOperationById(operationId);

    // Log para debug
    this.logger.log(`Tentativa de conclusão - OperationId: ${operationId}, UserId: ${userId}`);
    this.logger.log(`Operation Creator: ${operation.creator}, Acceptor: ${operation.acceptor}`);
    this.logger.log(`UserId type: ${typeof userId}, Creator type: ${typeof operation.creator}`);

    if (
      operation.creator.toString() !== userId.toString() &&
      operation.acceptor?.toString() !== userId.toString()
    ) {
      this.logger.error(`Validação falhou - Creator: ${operation.creator.toString()}, Acceptor: ${operation.acceptor?.toString()}, UserId: ${userId.toString()}`);
      throw new ForbiddenException(
        'Apenas os participantes da operação podem marcá-la como concluída',
      );
    }

    if (operation.status === OperationStatus.COMPLETED) {
      throw new BadRequestException('Esta operação já foi concluída anteriormente');
    }
    
    if (operation.status !== OperationStatus.ACCEPTED && operation.status !== OperationStatus.PENDING_COMPLETION) {
      throw new BadRequestException('Esta operação não pode ser concluída. Status atual: ' + operation.status);
    }

    // Se já há uma solicitação de conclusão pendente
    if (operation.status === OperationStatus.PENDING_COMPLETION) {
      // Verificar se é a outra parte confirmando
      if (operation.completionRequestedBy?.toString() === userId.toString()) {
        throw new BadRequestException('Você já solicitou a conclusão. Aguarde a confirmação da outra parte.');
      }

      // A outra parte está confirmando - concluir definitivamente com transação
      const updatedOperation = await this.transactionService.withTransaction(async (session) => {
        // 1. Atualizar status da operação para COMPLETED
        const completed = await this.operationsRepository.completeOperation(
          operationId,
          session ? { session } : undefined
        );

        if (!completed) {
          throw new BadRequestException('Erro ao concluir operação');
        }

        this.logger.log(`Operation ${operationId} completed by confirmation from user ${userId}`);

        // As notificações são enviadas fora da transação para não bloquear
        // Se falharem, a operação já está marcada como completa no banco

        return completed;
      });

      // Notificações enviadas após commit da transação
      if (operation.completionRequestedBy) {
        await this.broadcastService.notifyCompletionAccepted(updatedOperation, operation.completionRequestedBy);
      }

      await this.broadcastService.notifyOperationCompleted(updatedOperation);

      return updatedOperation;
    }

    // Primeira solicitação de conclusão - marcar como pendente com transparência
    const otherPartyId = operation.creator.toString() === userId.toString() ? 
      operation.acceptor : operation.creator;
    
    const updatedOperation = await this.operationsRepository.updateOperation(operationId, {
      status: OperationStatus.PENDING_COMPLETION,
      completionRequestedBy: userId,
      completionRequestedAt: new Date(),
      awaitingConfirmationFrom: otherPartyId,
      awaitingConfirmationSince: new Date(),
      transactionDetails: transactionDetails,
    });

    if (!updatedOperation) {
      throw new BadRequestException('Erro ao solicitar conclusão da operação');
    }

    this.logger.log(`Operation ${operationId} completion requested by user ${userId}`);
    
    // Notify the other party about the completion request
    await this.broadcastService.notifyCompletionRequested(updatedOperation, userId);
    
    return updatedOperation;
  }

  async closeOperation(
    operationId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<Operation> {
    const operation = await this.getOperationById(operationId);

    // Verificar se o usuário é o criador da operação
    if (operation.creator.toString() !== userId.toString()) {
      throw new ForbiddenException('Apenas o criador da operação pode fechá-la');
    }

    // Verificar se a operação está em status válido para fechamento
    if (operation.status !== OperationStatus.PENDING) {
      throw new BadRequestException('Apenas operações pendentes podem ser fechadas');
    }

    const updatedOperation = await this.operationsRepository.closeOperation(
      operationId,
    );

    if (!updatedOperation) {
      throw new BadRequestException('Erro ao fechar operação');
    }

    this.logger.log(`Operation ${operationId} closed by creator ${userId}`);
    
    return updatedOperation;
  }

  async cleanupExpiredOperations(): Promise<void> {
    const expiredOperations =
      await this.operationsRepository.findExpiredOperations();

    for (const operation of expiredOperations) {
      await this.operationsRepository.cancelOperation(operation._id);
      this.logger.log(`Expired operation ${operation._id} cancelled`);
    }
  }

  async deletePendingOperations(userId: Types.ObjectId): Promise<number> {
    const deletedCount = await this.operationsRepository.deletePendingOperations(userId);
    this.logger.log(`${deletedCount} pending operations deleted for user ${userId}`);
    return deletedCount;
  }

  formatOperationMessage(operation: Operation): string {
    let typeEmoji = '🟢';
    let typeText = 'COMPRA';
    
    switch (operation.type) {
      case OperationType.BUY:
        typeEmoji = '🟢';
        typeText = 'COMPRA';
        break;
      case OperationType.SELL:
        typeEmoji = '🔴';
        typeText = 'VENDA';
        break;
      case OperationType.ANNOUNCEMENT:
        typeEmoji = '📰';
        typeText = 'ANÚNCIO';
        break;
      case OperationType.EXCHANGE:
        typeEmoji = '🔁';
        typeText = 'TROCA';
        break;
    }
    
    const total = operation.amount * operation.price;
    
    const assetsText = operation.assets.join(', ');
    const networksText = operation.networks.map(n => n.toUpperCase()).join(', ');
    
    return (
      `${typeEmoji} **${typeText} ${assetsText}**\n\n` +
      `💰 **Valor:** ${operation.amount} (total)\n` +
      `💵 **Preço:** R$ ${operation.price.toFixed(2)}\n` +
      `📊 **Total:** R$ ${total.toFixed(2)}\n` +
      `🌐 **Redes:** ${networksText}\n` +
      `📈 **Cotação:** ${operation.quotationType}\n` +
      (operation.description ? `📝 **Descrição:** ${operation.description}\n` : '') +
      `⏰ **Expira:** ${operation.expiresAt.toLocaleString('pt-BR')}\n\n` +
      `Para aceitar esta operação, use: \`/aceitaroperacao ${operation._id}\``
    );
  }
}
