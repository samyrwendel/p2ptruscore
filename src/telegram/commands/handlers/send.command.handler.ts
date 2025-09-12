import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { KarmaService } from '../../../karma/karma.service';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class SendCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(SendCommandHandler.name);
  // Aceita: /send, /transferir
  readonly command = /^\/(send|transferir)\s*(\d+)?$/;

  constructor(
    private readonly karmaService: KarmaService,
    private readonly keyboardService: TelegramKeyboardService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    if (
      !ctx.message ||
      !('text' in ctx.message) ||
      !ctx.from ||
      !ctx.chat ||
      !ctx.message.reply_to_message ||
      !ctx.message.reply_to_message.from
    ) {
      if (
        ctx.message &&
        'text' in ctx.message &&
        ctx.message.text.match(this.command)
      ) {
        await ctx.reply(
          'Você precisa responder à mensagem de um usuário para enviar pontos.',
        );
      }
      return;
    }

    const match = ctx.message.text.match(this.command);
    if (!match) {
      await ctx.reply('Você precisa especificar a quantidade a enviar. Ex: /transferir 10');
      return;
    }

    const sender = ctx.from;
    const receiver = ctx.message.reply_to_message.from;
    const quantity = parseInt(match[1], 10);

    if (receiver.id === sender.id) {
      await ctx.reply('Você não pode enviar pontos para si mesmo.');
      return;
    }
    if (receiver.is_bot) {
      await ctx.reply('Você não pode enviar pontos para bots.');
      return;
    }
    if (isNaN(quantity) || quantity <= 0) {
      await ctx.reply(
        'A quantidade deve ser um número inteiro positivo. Ex: /transferir 10',
      );
      return;
    }

    const keyboard = this.keyboardService.getGroupWebAppKeyboard(ctx.chat);

    const extra: ExtraReplyMessage = {};
    extra.reply_parameters = { message_id: ctx.message.message_id };
    if (keyboard) {
      extra.reply_markup = keyboard.reply_markup;
    }

    try {
      const result = await this.karmaService.transferKarma(
        sender,
        receiver,
        ctx.chat,
        quantity,
      );

      const senderName = result.senderKarma.user.userName
        ? `@${result.senderKarma.user.userName}`
        : result.senderKarma.user.firstName;
      const receiverName = result.receiverKarma.user.userName
        ? `@${result.receiverKarma.user.userName}`
        : result.receiverKarma.user.firstName;

      const message = `💸 ${senderName} enviou ${quantity} pontos para ${receiverName}!\n\n${senderName} novo score: ${result.senderKarma.karma}\n${receiverName} novo score: ${result.receiverKarma.karma}`;

      await ctx.telegram.sendMessage(ctx.chat.id, message, extra);
    } catch (error) {
      this.logger.error(
        `Error during /send command from ${sender.id} to ${receiver.id}`,
        error,
      );

      if (error instanceof BadRequestException) {
        await ctx.reply(error.message, extra);
      } else {
        await ctx.reply(
          'Ocorreu um erro crítico durante a transferência de pontos.',
          extra,
        );
      }
    }
  }
}
