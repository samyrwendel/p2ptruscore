import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { createHash } from 'crypto';
import { OperationsService } from '../../../operations/operations.service';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class FecharOperacaoCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(FecharOperacaoCommandHandler.name);
  command = /^\/fecharoperacao(?:@\w+)?\s+([a-f0-9]{24})$/;

  constructor(
    private readonly operationsService: OperationsService,
    private readonly keyboardService: TelegramKeyboardService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    const match = ctx.message.text.match(this.command);
    if (!match) {
      await ctx.reply(
        '▼ Formato incorreto. Use:\n' +
        '`/fecharoperacao [ID_DA_OPERACAO]`\n\n' +
        'Exemplo: `/fecharoperacao 507f1f77bcf86cd799439011`\n\n' +
        'Este comando só pode ser usado pelo criador da operação.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const [, operationId] = match;
    
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
      const closedOperation = await this.operationsService.closeOperation(
        new Types.ObjectId(operationId),
        userId,
      );

      const typeText = closedOperation.type === 'buy' ? 'COMPRA' : 'VENDA';
      const total = closedOperation.amount * closedOperation.price;
      const userMention = `@${ctx.from.username || ctx.from.first_name}`;
      
      // Criar mensagem temporária que se auto-deleta
      const tempMessage = await ctx.reply(
        `🔒 **Operação Fechada!**\n\n` +
        `${userMention} fechou a operação:\n\n` +
        `${typeText}\n` +
        `Ativos: ${closedOperation.assets.join(', ')}\n` +
        `Quantidade: ${closedOperation.amount}\n` +
        `Preço: R$ ${total.toFixed(2)}\n` +

        `Redes: ${closedOperation.networks.map(n => n.toUpperCase()).join(', ')}\n\n` +
        `📝 **Status:** Operação fechada pelo criador\n\n` +
        `💡 Esta mensagem será removida em 5 segundos.`,
        { parse_mode: 'Markdown' }
      );

      // Auto-deletar mensagem após 5 segundos
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(tempMessage.message_id);
        } catch (deleteError) {
          // Ignorar erro se não conseguir deletar
        }
      }, 5000);

      this.logger.log(
        `Operation ${operationId} closed by creator ${userId}`,
      );
      
    } catch (error) {
      this.logger.error('Error closing operation:', error);
      
      if (error instanceof Error) {
        await ctx.reply(`▼ ${error.message}`);
      } else {
        await ctx.reply('▼ Erro ao fechar operação. Tente novamente.');
      }
    }
  }
}