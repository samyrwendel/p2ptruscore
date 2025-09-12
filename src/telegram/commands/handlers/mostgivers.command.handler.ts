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
export class MostGiversCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(MostGiversCommandHandler.name);
  // Aceita: /mostgivers, /doadorscore
  readonly command = /^\/(mostgivers|doadorscore)$/;

  constructor(
    private readonly karmaService: KarmaService,
    private readonly keyboardService: TelegramKeyboardService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    const { topGivenKarma, topGivenHate } = await this.karmaService.getTopGiven(
      ctx.chat.id,
      10,
    );
    const keyboard = this.keyboardService.getGroupWebAppKeyboard(ctx.chat);

    const extra: ExtraReplyMessage = {};
    if (keyboard) {
      extra.reply_markup = keyboard.reply_markup;
    }

    let message = '';
    if (topGivenKarma.length > 0) {
      message += '▲ Top 10 Doadores de Score:\n\n';
      topGivenKarma.forEach((userKarma, index) => {
        const name = userKarma.user.userName
          ? `@${userKarma.user.userName}`
          : userKarma.user.firstName;
        message += `${index + 1}. ${name} deu ${userKarma.givenKarma} reputação positiva\n`;
      });
    } else {
      message += '▲ Nenhum usuário deu pontos positivos ainda.\n';
    }

    message += '\n'; // Separador

    if (topGivenHate.length > 0) {
      message += '▼ Top 10 Doadores de Pontos Negativos:\n\n';
      topGivenHate.forEach((userKarma, index) => {
        const name = formatUsernameForDisplay(userKarma.user);
        message += `${index + 1}. ${name} deu ${userKarma.givenHate} reputação negativa\n`;
      });
    } else {
      message += '▼ Nenhum usuário deu pontos negativos ainda.\n';
    }

    await ctx.reply(message.trim(), extra);
  }
}
