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
export class GetKarmaCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(GetKarmaCommandHandler.name);
  // Aceita: /getkarma, /score
  readonly command = /^\/(getkarma|score)\s*(.*)$/;

  constructor(
    private readonly karmaService: KarmaService,
    private readonly keyboardService: TelegramKeyboardService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    const match = ctx.message.text.match(this.command);
    if (!match) return;

    const input = match[2].trim();

    const keyboard = this.keyboardService.getGroupWebAppKeyboard(ctx.chat);
    const extra: ExtraReplyMessage = {};
    if (keyboard) {
      extra.reply_markup = keyboard.reply_markup;
    }

    try {
      const karma = await this.karmaService.findKarmaByUserQuery(
        input,
        ctx.chat.id,
      );
      if (!karma) {
        await ctx.reply(
          `Nenhum score encontrado para o usuário "${input}" neste grupo.`,
          extra,
        );
        return;
      }

      const displayName = formatUsernameForDisplay(karma.user);
      const message = `■ Usuário: ${displayName}
● Score: ${karma.karma || 0} neste grupo

▲ Score dado: ${karma.givenKarma || 0}.
▼ Score negativo dado: ${karma.givenHate || 0}.`;
      await ctx.reply(message.trim(), extra);
    } catch (error) {
      this.logger.error(error);
      await ctx.reply('Desculpe, não consegui recuperar o score para "' + input + '".');
    }
  }
}
