import { Injectable, Logger } from '@nestjs/common';
import { KarmaService } from '../../../karma/karma.service';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';
import { formatUsernameForDisplay } from '../command.helpers';

@Injectable()
export class TopReceivedCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(TopReceivedCommandHandler.name);
  command = /^\/(today|month|year|hoje|mes|ano)$/;

  constructor(
    private readonly karmaService: KarmaService,
    private readonly keyboardService: TelegramKeyboardService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    const match = ctx.message.text.match(this.command);
    if (!match) return;

    const commandName = match[1];
    let daysBack: number;
    let periodName: string;

    switch (commandName) {
      case 'today':
      case 'hoje':
        daysBack = 1;
        periodName = 'últimas 24 horas';
        break;
      case 'month':
      case 'mes':
        daysBack = 30;
        periodName = 'últimos 30 dias';
        break;
      case 'year':
      case 'ano':
        daysBack = 365;
        periodName = 'últimos 365 dias';
        break;
      default:
        return;
    }

    try {
      const topUsers = await this.karmaService.getTopUsersByKarmaReceived(
        ctx.chat.id,
        daysBack,
        10,
      );
      const keyboard = this.keyboardService.getGroupWebAppKeyboard(ctx.chat);

      const extra: ExtraReplyMessage = {};
      if (keyboard) {
        extra.reply_markup = keyboard.reply_markup;
      }

      if (topUsers.length === 0) {
        await ctx.reply(
          `Nenhum usuário recebeu pontos nas ${periodName} neste grupo.`,
          extra,
        );
        return;
      }

      let message = `■ Top 10 usuários que mais receberam pontos nas ${periodName}:\n\n`;
      topUsers.forEach((user, index) => {
        const name = formatUsernameForDisplay(user);
        message += `${index + 1}. ${name} recebeu ${user.totalKarmaReceived} de reputação\n`;
      });

      await ctx.reply(message, extra);
    } catch (error) {
      this.logger.error(`Error handling /${commandName}`, error);
      await ctx.reply(
        `Desculpe, não consegui buscar os usuários do ranking das ${periodName}.`,
      );
    }
  }
}
