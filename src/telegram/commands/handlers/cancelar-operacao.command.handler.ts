import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { OperationsService } from '../../../operations/operations.service';
import { UsersService } from '../../../users/users.service';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import { TermsAcceptanceService } from '../../../users/terms-acceptance.service';
import { validateUserTermsForCallback } from '../../../shared/terms-validation.utils';
import { formatTotalBRL, formatUnitPriceBRL } from '../../../shared/operation-value.utils';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class CancelarOperacaoCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(CancelarOperacaoCommandHandler.name);
  command = /^\/cancelaroperacao(?:@\w+)?\s+([a-f0-9]{24})$/;

  constructor(
    private readonly operationsService: OperationsService,
    private readonly usersService: UsersService,
    private readonly keyboardService: TelegramKeyboardService,
    private readonly termsAcceptanceService: TermsAcceptanceService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    const match = ctx.message.text.match(this.command);
    if (!match) {
      await ctx.reply(
        '▼ Formato incorreto. Use:\n' +
        '`/cancelaroperacao [ID_DA_OPERACAO]`\n\n' +
        'Exemplo: `/cancelaroperacao 507f1f77bcf86cd799439011`\n\n' +
        'Use `/minhasoperacoes` para ver o ID das suas operações.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const [, operationId] = match;
    
    // Buscar o usuário no banco de dados
    const userData = {
      id: ctx.from.id,
      username: ctx.from.username,
      first_name: ctx.from.first_name,
      last_name: ctx.from.last_name
    };
    
    let user;
    try {
      user = await this.usersService.findOrCreate(userData);
      this.logger.log(`Usuário encontrado para cancelamento: ${user._id}`);
    } catch (error) {
      this.logger.error(`Erro ao buscar usuário:`, error);
      await ctx.reply('▼ Erro interno ao processar usuário.');
      return;
    }
    
    const userId = user._id;

    try {
      const cancelledOperation = await this.operationsService.cancelOperation(
        new Types.ObjectId(operationId),
        userId,
      );

      const typeText = cancelledOperation.type === 'buy' ? 'COMPRA' : 'VENDA';
      const total = cancelledOperation.amount * cancelledOperation.price;
      
      // Enviar notificação popup temporária
      const popupMessage = `❌ Operação ${typeText} cancelada com sucesso!\n` +
        `💰 ${cancelledOperation.assets.join(', ')} - R$ ${total.toFixed(2)}`;
      
      // Criar uma mensagem temporária que será deletada automaticamente
      const tempMessage = await ctx.reply(
        `❌ **Operação Cancelada**\n\n` +
        `${typeText}\n` +
        `💰 **Ativos:** ${cancelledOperation.assets.join(', ')}\n` +
        `📊 **Quantidade:** ${cancelledOperation.amount}\n` +
        `💵 **Total:** ${formatTotalBRL(cancelledOperation)}\n` +

        `Redes: ${cancelledOperation.networks.map(n => n.toUpperCase()).join(', ')}\n\n` +
        `✅ A operação foi cancelada com sucesso.\n\n` +
        `_Esta mensagem será removida em 5 segundos..._`,
        { parse_mode: 'Markdown' }
      );
      
      // Deletar a mensagem após 5 segundos
      setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(ctx.chat.id, tempMessage.message_id);
        } catch (error) {
          // Ignora erro se a mensagem já foi deletada
          this.logger.warn('Could not delete temporary cancellation message:', error.message);
        }
      }, 5000);

      this.logger.log(
        `Operation ${operationId} cancelled by user ${userId}`,
      );
      
    } catch (error) {
      this.logger.error('Error cancelling operation:', error);
      
      if (error instanceof Error) {
        await ctx.reply(`▼ ${error.message}`);
      } else {
        await ctx.reply('▼ Erro ao cancelar operação. Tente novamente.');
      }
    }
  }

  async handleCallback(ctx: any): Promise<boolean> {
    const data = ctx.callbackQuery.data;
    
    if (!data.startsWith('cancel_operation_')) {
      return false;
    }

    try {
      // ✅ VALIDAÇÃO CRÍTICA: Verificar se usuário aceitou os termos ANTES de cancelar operação
      const hasValidTerms = await validateUserTermsForCallback(ctx, this.termsAcceptanceService, 'cancelar');
      if (!hasValidTerms) {
        this.logger.warn(`❌ CANCELAMENTO BLOQUEADO - Usuário ${ctx.from.id} não aceitou os termos`);
        return true; // validateUserTermsForCallback já envia o popup
      }

      // Tentar responder ao callback, mas ignorar se expirado
      try {
        await ctx.answerCbQuery();
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado no cancelar operação:', cbError.description);
        } else {
          throw cbError;
        }
      }

      const operationId = data.replace('cancel_operation_', '');
      
      // Buscar o usuário no banco de dados
      const userData = {
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name
      };
      
      let user;
      try {
        user = await this.usersService.findOrCreate(userData);
      } catch (error) {
        this.logger.error(`Erro ao buscar usuário:`, error);
        await ctx.editMessageText('❌ Erro interno ao processar usuário.');
        return true;
      }
      
      const userId = user._id;

      try {
        const cancelledOperation = await this.operationsService.cancelOperation(
          new Types.ObjectId(operationId),
          userId,
        );

        const typeText = cancelledOperation.type === 'buy' ? 'COMPRA' : 'VENDA';
        const total = cancelledOperation.amount * cancelledOperation.price;
        
        await ctx.editMessageText(
          `❌ **Operação Cancelada**\n\n` +
          `${typeText}\n` +
          `💰 **Ativos:** ${cancelledOperation.assets.join(', ')}\n` +
          `📊 **Quantidade:** ${cancelledOperation.amount}\n` +
          `💵 **Total:** ${formatTotalBRL(cancelledOperation)}\n` +
          `🌐 **Redes:** ${cancelledOperation.networks.map(n => n.toUpperCase()).join(', ')}\n` +
          `🆔 **ID:** \`${cancelledOperation._id}\`\n\n` +
          `✅ A operação foi cancelada com sucesso.`,
          { parse_mode: 'Markdown' }
        );

        this.logger.log(
          `Operation ${operationId} cancelled via callback by user ${userId}`,
        );
        
      } catch (error) {
        this.logger.error('Error cancelling operation via callback:', error);
        
        if (error instanceof Error) {
          await ctx.editMessageText(`❌ ${error.message}`);
        } else {
          await ctx.editMessageText('❌ Erro ao cancelar operação. Tente novamente.');
        }
      }
      
      return true;
    } catch (error) {
      this.logger.error('Erro ao processar callback de cancelamento:', error);
      try {
        await ctx.answerCbQuery('❌ Erro ao processar cancelamento', { show_alert: true });
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado no tratamento de erro:', cbError.description);
        }
      }
      return true;
    }
  }
}