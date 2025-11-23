import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { OperationsService } from '../../../operations/operations.service';
import { OperationsBroadcastService } from '../../../operations/operations-broadcast.service';
import { UsersService } from '../../../users/users.service';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class CancelarOrdemCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(CancelarOrdemCommandHandler.name);
  command = /^\/cancelarordem(?:@\w+)?\s+([a-f0-9]{24})$/;

  constructor(
    private readonly operationsService: OperationsService,
    private readonly broadcastService: OperationsBroadcastService,
    private readonly usersService: UsersService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    this.logger.log(`🔥 COMANDO /cancelarordem RECEBIDO: ${ctx.message.text}`);
    
    const match = ctx.message.text.match(this.command);
    if (!match) {
      this.logger.warn(`❌ Formato incorreto do comando: ${ctx.message.text}`);
      await ctx.reply(
        '▼ Formato incorreto. Use:\n' +
        '`/cancelarordem [ID_DA_OPERACAO]`\n\n' +
        'Exemplo: `/cancelarordem 68c07696dfc0d5b048172d20`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const [, operationId] = match;
    this.logger.log(`✅ ID da operação extraído: ${operationId}`);
    
    try {
      // Buscar a operação
      const operation = await this.operationsService.getOperationById(
        new Types.ObjectId(operationId)
      );
      
      this.logger.log(`🔍 Tentando deletar operação ${operationId}`);
      this.logger.log(`📋 Operação encontrada: messageId=${operation.messageId}, group=${operation.group}`);
      
      // Buscar o usuário
      const userData = {
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name
      };
      const user = await this.usersService.findOrCreate(userData);
      
      // Cancelar a operação
      await this.operationsService.cancelOperation(
        new Types.ObjectId(operationId),
        user._id
      );
      
      // Deletar a mensagem vinculada à operação (quando existir)
      await this.broadcastService.deleteOperationMessage(operation);
      
      await ctx.reply(
        `✅ **Ordem Cancelada e Deletada**\n\n` +
        `🆔 **ID:** ${operationId}\n` +
        `📱 **MessageId:** ${operation.messageId || 'N/A'}\n` +
        `👥 **Group:** ${operation.group || 'N/A'}\n\n` +
        `🗑️ Tentativa de deleção da mensagem do grupo executada.\n` +
        `⏰ **Timestamp:** ${new Date().toLocaleString('pt-BR')}`,
        { parse_mode: 'Markdown' }
      );
      
      this.logger.log(`✅ SUCESSO: Operação ${operationId} cancelada e deleção forçada`);
      this.logger.log(`📊 DETALHES: messageId=${operation.messageId}, group=${operation.group}`);
      
    } catch (error) {
      this.logger.error(`❌ Erro ao cancelar ordem ${operationId}:`, error);
      
      await ctx.reply(
        `❌ **Erro ao cancelar ordem**\n\n` +
        `🆔 **ID:** ${operationId}\n` +
        `📝 **Erro:** ${error.message || 'Erro desconhecido'}\n\n` +
        `💡 Verifique se o ID está correto e se você tem permissão.`,
        { parse_mode: 'Markdown' }
      );
    }
  }
}
