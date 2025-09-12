import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { OperationsService } from '../../../operations/operations.service';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class ConcluirOperacaoCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(ConcluirOperacaoCommandHandler.name);
  command = /^\/concluiroperacao(?:@\w+)?\s+([a-f0-9]{24})$/;

  constructor(
    private readonly operationsService: OperationsService,
    private readonly keyboardService: TelegramKeyboardService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    const match = ctx.message.text.match(this.command);
    if (!match) {
      await ctx.reply(
        '▼ Formato incorreto. Use:\n' +
        '`/concluiroperacao [ID_DA_OPERACAO]`\n\n' +
        'Exemplo: `/concluiroperacao 507f1f77bcf86cd799439011`\n\n' +
        'Este comando só pode ser usado pelos participantes da operação.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const [, operationId] = match;
    const userId = new Types.ObjectId(ctx.from.id.toString());

    try {
      const completedOperation = await this.operationsService.completeOperation(
        new Types.ObjectId(operationId),
        userId,
      );

      const typeText = completedOperation.type === 'buy' ? 'COMPRA' : 'VENDA';
      const total = completedOperation.amount * completedOperation.price;
      const userMention = `@${ctx.from.username || ctx.from.first_name}`;
      
      await ctx.reply(
        `✅ **Operação Concluída!**\n\n` +
        `${userMention} marcou a operação como concluída:\n\n` +
        `${typeText}\n` +
        `Ativos: ${completedOperation.assets.join(', ')}\n` +
        `Quantidade: ${completedOperation.amount}\n` +
        `Preço: R$ ${total.toFixed(2)}\n` +

        `Redes: ${completedOperation.networks.map(n => n.toUpperCase()).join(', ')}\n\n` +
        `🎉 **Parabéns pela transação bem-sucedida!**\n\n` +
        `💡 **Lembrete:** Não se esqueçam de se avaliarem mutuamente usando:\n` +
        `\`/avaliar positiva Transação rápida e confiável\`\n` +
        `(respondam à mensagem um do outro)`,
        { parse_mode: 'Markdown' }
      );

      this.logger.log(
        `Operation ${operationId} completed by user ${userId}`,
      );
      
    } catch (error) {
      this.logger.error('Error completing operation:', error);
      
      if (error instanceof Error) {
        await ctx.reply(`▼ ${error.message}`);
      } else {
        await ctx.reply('▼ Erro ao concluir operação. Tente novamente.');
      }
    }
  }
}