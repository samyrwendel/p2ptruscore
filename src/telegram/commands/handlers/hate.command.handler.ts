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
export class HateCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(HateCommandHandler.name);
  // Aceita: /hate, /piorscore
  readonly command = /^\/(hate|piorscore)$/;

  constructor(
    private readonly karmaService: KarmaService,
    private readonly keyboardService: TelegramKeyboardService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    const hatedUsers = await this.karmaService.getTopKarma(
      ctx.chat.id,
      true,
      10,
    );

    const keyboard = this.keyboardService.getGroupWebAppKeyboard(ctx.chat);
    const extra: ExtraReplyMessage = {};
    if (keyboard) {
      extra.reply_markup = keyboard.reply_markup;
    }

    if (hatedUsers.length === 0) {
      await ctx.reply('Ainda não há dados de score disponíveis para este grupo.', extra);
      return;
    }

    let message = '▼ Top 10 Usuários com Pior Score:\n\n';
    hatedUsers.forEach((userKarma, index) => {
      const name = formatUsernameForDisplay(userKarma.user);
      message += `${index + 1}. ${name} tem ${userKarma.karma} de reputação\n`;
    });

    await ctx.reply(message, extra);
  }
}
