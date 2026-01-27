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
export class ValidityCheckCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(ValidityCheckCommandHandler.name);
  // Não há comando de texto, apenas callbacks
  command = /^$/;

  constructor(
    private readonly operationsService: OperationsService,
    private readonly broadcastService: OperationsBroadcastService,
    private readonly usersService: UsersService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    // Este handler só processa callbacks, não comandos de texto
  }

  async handleCallback(ctx: any): Promise<boolean> {
    const data = ctx.callbackQuery?.data;

    if (!data || (!data.startsWith('validity_confirm_') && !data.startsWith('validity_cancel_'))) {
      return false;
    }

    try {
      // Tentar responder ao callback, mas ignorar se expirado
      try {
        await ctx.answerCbQuery();
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado:', cbError.description);
        } else {
          throw cbError;
        }
      }

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

      if (data.startsWith('validity_confirm_')) {
        return await this.handleValidityConfirm(ctx, data, userId);
      } else if (data.startsWith('validity_cancel_')) {
        return await this.handleValidityCancel(ctx, data, userId);
      }

      return false;
    } catch (error) {
      this.logger.error('Erro ao processar callback de verificação de validade:', error);
      try {
        await ctx.answerCbQuery('❌ Erro ao processar', { show_alert: true });
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado no tratamento de erro:', cbError.description);
        }
      }
      return true;
    }
  }

  private async handleValidityConfirm(ctx: any, data: string, userId: Types.ObjectId): Promise<boolean> {
    const operationId = data.replace('validity_confirm_', '');

    try {
      const confirmedOperation = await this.operationsService.confirmOperationValidity(
        new Types.ObjectId(operationId),
        userId,
      );

      await ctx.editMessageText(
        `✅ **Operação Confirmada!**\n\n` +
        `Sua operação foi confirmada como válida e continua disponível para aceitação.\n\n` +
        `🆔 \`${confirmedOperation._id}\`\n\n` +
        `💡 Você receberá uma notificação quando alguém aceitar sua operação.`,
        { parse_mode: 'Markdown' }
      );

      this.logger.log(`Operation ${operationId} validity confirmed by user ${userId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error confirming operation validity ${operationId}:`, error);

      if (error instanceof Error) {
        await ctx.editMessageText(`❌ ${error.message}`);
      } else {
        await ctx.editMessageText('❌ Erro ao confirmar validade. Tente novamente.');
      }
      return true;
    }
  }

  private async handleValidityCancel(ctx: any, data: string, userId: Types.ObjectId): Promise<boolean> {
    const operationId = data.replace('validity_cancel_', '');

    try {
      const cancelledOperation = await this.operationsService.cancelOperation(
        new Types.ObjectId(operationId),
        userId,
      );

      const typeText = cancelledOperation.type === 'buy' ? 'COMPRA' : 'VENDA';

      await ctx.editMessageText(
        `❌ **Operação Cancelada**\n\n` +
        `${typeText} ${cancelledOperation.assets.join(', ')}\n\n` +
        `🆔 \`${cancelledOperation._id}\`\n\n` +
        `✅ A operação foi cancelada com sucesso.\n\n` +
        `💡 Você pode criar uma nova operação quando quiser usando /criaroperacao`,
        { parse_mode: 'Markdown' }
      );

      this.logger.log(`Operation ${operationId} cancelled via validity check by user ${userId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error cancelling operation via validity check ${operationId}:`, error);

      if (error instanceof Error) {
        await ctx.editMessageText(`❌ ${error.message}`);
      } else {
        await ctx.editMessageText('❌ Erro ao cancelar operação. Tente novamente.');
      }
      return true;
    }
  }
}
