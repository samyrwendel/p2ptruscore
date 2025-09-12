import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { OperationsRepository } from './operations.repository';
import { OperationsBroadcastService } from './operations-broadcast.service';
import {
  Operation,
  OperationType,
  NetworkType,
  AssetType,
  OperationStatus,
  QuotationType,
} from './schemas/operation.schema';
import { UsersService } from '../users/users.service';
import { GroupsService } from '../groups/groups.service';

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
  description?: string;
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
      description: dto.description,
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
      throw new Error('Esta operação não está mais disponível');
    }

    if (operation.creator.toString() === acceptorId.toString()) {
      throw new Error('Você não pode aceitar sua própria operação');
    }

    if (new Date() > operation.expiresAt) {
      await this.operationsRepository.cancelOperation(operationId);
      throw new Error('Esta operação expirou');
    }

    const updatedOperation = await this.operationsRepository.acceptOperation(
      operationId,
      acceptorId,
    );

    if (!updatedOperation) {
      throw new Error('Erro ao aceitar operação');
    }

    this.logger.log(
      `Operation ${operationId} accepted by user ${acceptorId}`,
    );
    
    // Notify the group about the acceptance
    await this.broadcastService.notifyOperationAccepted(updatedOperation, acceptorId);
    
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
      throw new Error('Você só pode cancelar operações que criou ou aceitou');
    }

    this.logger.log(`Tentativa de cancelamento da operação ${operationId} por usuário ${userId}`);
    this.logger.log(`Status da operação: ${operation.status}`);
    
    // Cancelar definitivamente (deletar mensagem)
    const updatedOperation = await this.operationsRepository.cancelOperation(operationId);
    this.logger.log(`Operation ${operationId} cancelled by user ${userId}`);
    
    // Sempre deletar a mensagem do grupo quando cancelar
    await this.broadcastService.deleteOperationMessage(operation);

    if (!updatedOperation) {
      throw new Error('Erro ao cancelar operação');
    }

    return updatedOperation;
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
      throw new Error('Você só pode reverter operações que criou ou aceitou');
    }

    // Permitir reversão apenas de operações aceitas
    if (operation.status !== OperationStatus.ACCEPTED) {
      throw new Error('Apenas operações aceitas podem ser revertidas');
    }

    // Reverter operação aceita para status pendente e remover o aceitador
    const updatedOperation = await this.operationsRepository.revertAcceptedOperation(operationId);
    
    if (!updatedOperation) {
      throw new Error('Erro ao reverter operação');
    }
    
    this.logger.log(`Operation ${operationId} reverted to pending by user ${userId}`);
    
    // Notificar o grupo sobre a reversão
    await this.broadcastService.notifyOperationReverted(updatedOperation, userId);

    return updatedOperation;
  }

  async completeOperation(
    operationId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<Operation> {
    const operation = await this.getOperationById(operationId);

    if (
      operation.creator.toString() !== userId.toString() &&
      operation.acceptor?.toString() !== userId.toString()
    ) {
      throw new Error(
        'Apenas os participantes da operação podem marcá-la como concluída',
      );
    }

    if (operation.status !== OperationStatus.ACCEPTED) {
      throw new Error('Esta operação não pode ser concluída');
    }

    const updatedOperation = await this.operationsRepository.completeOperation(
      operationId,
    );

    if (!updatedOperation) {
      throw new Error('Erro ao concluir operação');
    }

    this.logger.log(`Operation ${operationId} completed by user ${userId}`);
    
    // Notify the group about the completion
    await this.broadcastService.notifyOperationCompleted(updatedOperation);
    
    return updatedOperation;
  }

  async closeOperation(
    operationId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<Operation> {
    const operation = await this.getOperationById(operationId);

    // Verificar se o usuário é o criador da operação
    if (operation.creator.toString() !== userId.toString()) {
      throw new Error('Apenas o criador da operação pode fechá-la');
    }

    // Verificar se a operação está em status válido para fechamento
    if (operation.status !== OperationStatus.PENDING) {
      throw new Error('Apenas operações pendentes podem ser fechadas');
    }

    const updatedOperation = await this.operationsRepository.closeOperation(
      operationId,
    );

    if (!updatedOperation) {
      throw new Error('Erro ao fechar operação');
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