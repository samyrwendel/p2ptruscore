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
          await ctx.reply(`❌ Usuário "${userQuery}" não encontrado neste grupo.`);
          return;
        }
        
        targetUserName = karmaDoc.user?.firstName || userQuery;
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
      
      const historyMessage = formatKarmaHistory(karmaDoc?.history);
      const message = userQuery 
        ? `■ Reputação de ${targetUserName} (últimas 10 mudanças):\n\n${historyMessage}`
        : `■ ${targetUserName} reputação (últimas 10 mudanças):\n\n${historyMessage}`;

      await ctx.reply(message, extra);
    } catch (error) {
      this.logger.error(`Error handling /history`, error);
      await ctx.reply("Desculpe, não consegui recuperar a reputação.");
    }
  }
}
