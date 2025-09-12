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
export class MinhasOperacoesCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(MinhasOperacoesCommandHandler.name);
  command = /^\/minhasoperacoes(?:@\w+)?$/;

  constructor(
    private readonly operationsService: OperationsService,
    private readonly keyboardService: TelegramKeyboardService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    // Validar se ctx.from e ctx.from.id existem
    if (!ctx.from || !ctx.from.id) {
      this.logger.error('ctx.from ou ctx.from.id não definido');
      await ctx.reply('❌ Erro interno: informações do usuário não disponíveis.');
      return;
    }

    // Validar se o ID do usuário é válido para ObjectId
    const userIdString = ctx.from.id.toString();
    if (!userIdString || userIdString.length === 0) {
      this.logger.error(`ID do usuário inválido: ${userIdString}`);
      await ctx.reply('❌ Erro interno: ID do usuário inválido.');
      return;
    }

    // Criar ObjectId válido - se o ID do Telegram não for válido para ObjectId, criar um baseado no hash
    let userId: Types.ObjectId;
    try {
      // Tentar criar ObjectId diretamente se for válido
      if (Types.ObjectId.isValid(userIdString)) {
        userId = new Types.ObjectId(userIdString);
      } else {
        // Se não for válido, criar um ObjectId baseado no hash do ID do usuário
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(userIdString).digest('hex');
        userId = new Types.ObjectId(hash.substring(0, 24));
      }
    } catch (error) {
      this.logger.error(`Erro ao criar ObjectId para usuário ${userIdString}:`, error);
      await ctx.reply('❌ Erro interno: não foi possível processar ID do usuário.');
      return;
    }

    try {
      const operations = await this.operationsService.getUserOperations(userId);

      if (operations.length === 0) {
        await ctx.reply(
          '📋 **Suas Operações**\n\n' +
          'Você ainda não criou nenhuma operação.\n\n' +
          'Use `/criaroperacao` para criar sua primeira operação P2P!',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      let message = '📋 **Suas Operações**\n\n';
      
      const pendingOps = operations.filter(op => op.status === OperationStatus.PENDING);
      const acceptedOps = operations.filter(op => op.status === OperationStatus.ACCEPTED);
      const completedOps = operations.filter(op => op.status === OperationStatus.COMPLETED);
      const cancelledOps = operations.filter(op => op.status === OperationStatus.CANCELLED);

      if (pendingOps.length > 0) {
        message += '🟡 **PENDENTES:**\n';
        for (const op of pendingOps.slice(0, 5)) {
          const typeEmoji = op.type === 'buy' ? '🟢' : '🔴';
          const typeText = op.type === 'buy' ? 'COMPRA' : 'VENDA';
          const total = op.amount * op.price;
          
          message += (
            `${typeEmoji} ${typeText} ${op.assets.join(', ')}\n` +
            `   💰 Quantidade: ${op.amount} (total)\n` +
            `   💵 Preço: R$ ${op.price.toFixed(2)}\n` +
            `   Redes: ${op.networks.map(n => n.toUpperCase()).join(', ')}\n` +
        `   Ativos: ${op.assets.join(', ')}\n` +
            `   🆔 \`${op._id}\`\n` +
            `   ⏰ Expira: ${op.expiresAt.toLocaleString('pt-BR')}\n\n`
          );
        }
        if (pendingOps.length > 5) {
          message += `   ... e mais ${pendingOps.length - 5} operações\n\n`;
        }
      }

      if (acceptedOps.length > 0) {
        message += '🟠 **ACEITAS:**\n';
        for (const op of acceptedOps.slice(0, 3)) {
          const typeEmoji = op.type === 'buy' ? '🟢' : '🔴';
          const typeText = op.type === 'buy' ? 'COMPRA' : 'VENDA';
          const total = op.amount * op.price;
          
          message += (
            `${typeEmoji} ${typeText} ${op.assets.join(', ')}\n` +
            `   💰 Quantidade: ${op.amount} (total)\n` +
            `   💵 Preço: R$ ${op.price.toFixed(2)}\n` +
            `   Redes: ${op.networks.map(n => n.toUpperCase()).join(', ')}\n` +
        `   Ativos: ${op.assets.join(', ')}\n` +
            `   🆔 \`${op._id}\`\n` +
            `   👤 Aceita por: ${op.acceptor}\n\n`
          );
        }
        if (acceptedOps.length > 3) {
          message += `   ... e mais ${acceptedOps.length - 3} operações\n\n`;
        }
      }

      if (completedOps.length > 0) {
        message += `✅ **CONCLUÍDAS:** ${completedOps.length}\n\n`;
      }

      if (cancelledOps.length > 0) {
        message += `❌ **CANCELADAS:** ${cancelledOps.length}\n\n`;
      }

      message += (
        '**Comandos úteis:**\n' +
        '• `/cancelaroperacao [ID]` - Cancelar operação pendente\n' +
        '• `/concluiroperacao [ID]` - Marcar como concluída\n' +
        '• `/criaroperacao` - Criar nova operação'
      );

      await ctx.reply(message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      this.logger.error('Error fetching user operations:', error);
      await ctx.reply('▼ Erro ao buscar suas operações. Tente novamente.');
    }
  }
}