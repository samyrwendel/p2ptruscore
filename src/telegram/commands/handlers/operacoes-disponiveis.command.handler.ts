import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { OperationsService } from '../../../operations/operations.service';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';
import { OperationStatus } from '../../../operations/schemas/operation.schema';

@Injectable()
export class OperacoesDisponiveisCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(OperacoesDisponiveisCommandHandler.name);
  command = /^\/operacoes(?:@\w+)?$/;

  constructor(
    private readonly operationsService: OperationsService,
    private readonly keyboardService: TelegramKeyboardService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    if (ctx.chat.type === 'private') {
      await ctx.reply(
        '▼ Este comando só pode ser usado em grupos onde o bot está ativo.',
      );
      return;
    }

    const groupId = new Types.ObjectId(ctx.chat.id.toString());

    try {
      const pendingOperations = await this.operationsService.getGroupOperations(
        groupId,
        OperationStatus.PENDING,
      );

      if (pendingOperations.length === 0) {
        await ctx.reply(
          '📋 **Operações Disponíveis**\n\n' +
          'Não há operações pendentes neste grupo no momento.\n\n' +
          'Use `/criaroperacao` para criar uma nova operação P2P!',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      let message = '📋 **Operações Disponíveis**\n\n';
      
      for (const [index, operation] of pendingOperations.slice(0, 10).entries()) {
        const typeEmoji = operation.type === 'buy' ? '🟢' : '🔴';
        const typeText = operation.type === 'buy' ? 'COMPRA' : 'VENDA';
        const total = operation.amount * operation.price;

        message += (
          `**${index + 1}.** ${typeEmoji} **${typeText} ${operation.assets.join(', ')}**\n` +
          `💰 Quantidade: ${operation.amount} (total)\n` +
          `💵 Preço: R$ ${total.toFixed(2)}\n` +
          `Redes: ${operation.networks.map(n => n.toUpperCase()).join(', ')}\n` +
          `Ativos: ${operation.assets.join(', ')}\n` +
          `Cotação: ${operation.quotationType}\n`
        );

        if (operation.description) {
          message += `📝 Descrição: ${operation.description}\n`;
        }

        message += (
          `🆔 ID: \`${operation._id}\`\n` +
          `📞 Para aceitar: \`/aceitaroperacao ${operation._id}\`\n\n`
        );
      }

      if (pendingOperations.length > 10) {
        message += `... e mais ${pendingOperations.length - 10} operações\n\n`;
      }

      message += (
        '**Comandos úteis:**\n' +
        '• `/aceitaroperacao [ID]` - Aceitar uma operação\n' +
        '• `/criaroperacao` - Criar nova operação\n' +
        '• `/minhasoperacoes` - Ver suas operações'
      );

      await ctx.reply(message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      this.logger.error('Error fetching available operations:', error);
      await ctx.reply('▼ Erro ao buscar operações disponíveis. Tente novamente.');
    }
  }

}