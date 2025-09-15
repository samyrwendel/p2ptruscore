import { Injectable, Logger } from '@nestjs/common';
import { KarmaService } from '../../../karma/karma.service';
import { formatKarmaHistory } from '../command.helpers';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class HistoryCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(HistoryCommandHandler.name);
  // Aceita: /history, /meuhistorico com parâmetro opcional
  readonly command = /^\/(history|meuhistorico)(?:\s+(.+))?$/;

  constructor(
    private readonly karmaService: KarmaService,
    private readonly keyboardService: TelegramKeyboardService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    const match = ctx.message.text.match(this.command);
    const userQuery = match?.[2]?.trim();
    
    try {
      let karmaDoc;
      let targetUserName;
      
      if (userQuery) {
        // Buscar histórico de usuário específico
        karmaDoc = await this.karmaService.findKarmaByUserQuery(
          userQuery,
          ctx.chat.id,
        );
        
        if (!karmaDoc) {
          // Se não encontrou no grupo, tentar buscar como usuário geral (mesmo comportamento do /reputacao)
          try {
            const totalKarma = await this.karmaService.getTotalKarmaForUser(userQuery);
            if (totalKarma) {
              // Buscar histórico de um grupo específico para chat privado
              karmaDoc = await this.karmaService.getKarmaForUser(totalKarma.user.userId, -1002907400287);
              targetUserName = totalKarma.user.firstName || userQuery;
            } else {
              await ctx.reply(`❌ Usuário "${userQuery}" não encontrado.`);
              return;
            }
          } catch (fallbackError) {
            await ctx.reply(`❌ Usuário "${userQuery}" não encontrado neste grupo.`);
            return;
          }
        } else {
          targetUserName = karmaDoc.user?.firstName || userQuery;
        }
      } else {
        // Buscar próprio histórico
        karmaDoc = await this.karmaService.getKarmaForUser(
          ctx.from.id,
          ctx.chat.id,
        );
        targetUserName = 'Sua';
      }
      
      const keyboard = this.keyboardService.getGroupWebAppKeyboard(ctx.chat);

      const extra: ExtraReplyMessage = {};
      if (keyboard) {
        extra.reply_markup = keyboard.reply_markup;
      }
      
      // Formatar histórico no mesmo formato da primeira imagem
      const recentHistory = karmaDoc?.history?.slice(-10) || [];
      let historyMessage = '';
      
      if (recentHistory.length === 0) {
        historyMessage = 'Nenhuma avaliação encontrada.';
      } else {
        historyMessage = recentHistory
          .reverse() // Mostrar mais recentes primeiro
          .map((entry, index) => {
            const dateString = new Date(entry.timestamp).toLocaleDateString('pt-BR');
            let result = '';
            
            // Se tem starRating, mostrar estrelas
            if (entry.starRating) {
              const starEmojis = '⭐'.repeat(entry.starRating);
              result = `${starEmojis}: "${entry.comment || 'Sem comentário'}" - ${entry.evaluatorName ? `@${entry.evaluatorName}` : 'Anônimo'}`;
            } else {
              // Fallback para o formato antigo
              const emoji = entry.karmaChange > 0 ? '👍' : '👎';
              result = `${emoji}: "${entry.comment || 'Avaliação P2P'}" - ${entry.evaluatorName ? `@${entry.evaluatorName}` : 'Anônimo'}`;
            }
            
            return result;
          })
          .join('\n\n');
      }
      
      const message = userQuery 
        ? `■ Sua reputação (últimas 10 mudanças):\n\n${historyMessage}`
        : `■ Sua reputação (últimas 10 mudanças):\n\n${historyMessage}`;

      await ctx.reply(message, extra);
    } catch (error) {
      this.logger.error(`Error handling /history`, error);
      await ctx.reply("Desculpe, não consegui recuperar a reputação.");
    }
  }
}
