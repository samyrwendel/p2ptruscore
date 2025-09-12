import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { createHash } from 'crypto';
import { OperationsService } from '../../../operations/operations.service';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class ApagarOperacoesPendentesCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(ApagarOperacoesPendentesCommandHandler.name);
  command = /^\/(?:apagaroperacoes|deletaroperacoes|limparoperacoes)(?:@\w+)?$/;

  constructor(
    private readonly operationsService: OperationsService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    // Validar e criar userId de forma segura
    if (!ctx.from?.id) {
      await ctx.reply('▼ Erro: ID do usuário não encontrado.');
      return;
    }

    let userId: Types.ObjectId;
    const userIdStr = ctx.from.id.toString();
    
    try {
      // Tentar criar ObjectId diretamente se for um ID válido
      if (/^[0-9a-fA-F]{24}$/.test(userIdStr)) {
        userId = new Types.ObjectId(userIdStr);
      } else {
        // Se não for válido, criar hash MD5 do ID do usuário
        const hash = createHash('md5').update(userIdStr).digest('hex');
        userId = new Types.ObjectId(hash.substring(0, 24));
      }
    } catch (error) {
      this.logger.error('Error creating userId ObjectId:', error);
      await ctx.reply('▼ Erro interno ao processar ID do usuário.');
      return;
    }

    try {
      // Primeiro, verificar quantas operações pendentes o usuário tem
      const userOperations = await this.operationsService.getUserOperations(userId);
      const pendingOperations = userOperations.filter(op => op.status === 'pending');
      
      if (pendingOperations.length === 0) {
        await ctx.reply(
          '📋 **Apagar Operações Pendentes**\n\n' +
          'Você não possui operações pendentes para apagar.\n\n' +
          'Use `/minhasoperacoes` para ver suas operações.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Deletar as operações pendentes
      const deletedCount = await this.operationsService.deletePendingOperations(userId);
      
      // Criar uma mensagem temporária que será deletada automaticamente
      const tempMessage = await ctx.reply(
        `🗑️ **Operações Pendentes Apagadas**\n\n` +
        `✅ ${deletedCount} operação${deletedCount > 1 ? 'ões' : ''} pendente${deletedCount > 1 ? 's' : ''} ${deletedCount > 1 ? 'foram' : 'foi'} apagada${deletedCount > 1 ? 's' : ''} permanentemente.\n\n` +
        `⚠️ **Atenção:** Esta ação não pode ser desfeita.\n\n` +
        `_Esta mensagem será removida em 8 segundos..._`,
        { parse_mode: 'Markdown' }
      );
      
      // Deletar a mensagem após 8 segundos
      setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(ctx.chat.id, tempMessage.message_id);
        } catch (error) {
          // Ignora erro se a mensagem já foi deletada
          this.logger.warn('Could not delete temporary deletion message:', error.message);
        }
      }, 8000);

      this.logger.log(
        `${deletedCount} pending operations deleted by user ${userId}`,
      );
      
    } catch (error) {
      this.logger.error('Error deleting pending operations:', error);
      
      if (error instanceof Error) {
        await ctx.reply(`▼ ${error.message}`);
      } else {
        await ctx.reply('▼ Erro ao apagar operações pendentes. Tente novamente.');
      }
    }
  }
}