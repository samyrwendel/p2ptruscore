import { Injectable, Logger } from '@nestjs/common';
import { KarmaService } from '../../../karma/karma.service';
import { UsersService } from '../../../users/users.service';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class MeCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(MeCommandHandler.name);
  // Aceita: /me, /meu, /meuscore
  readonly command = /^\/(me|meu|meuscore)$/;

  constructor(
    private readonly karmaService: KarmaService,
    private readonly usersService: UsersService,
    private readonly keyboardService: TelegramKeyboardService,
  ) {}

  private async getKarmaForUserWithFallback(user: any, chatId: number): Promise<any> {
    try {
      // Primeiro tentar buscar karma no grupo atual
      const groupKarma = await this.karmaService.getKarmaForUser(user.userId, chatId);
      
      if (groupKarma && groupKarma.karma !== undefined) {
        return groupKarma;
      }
      
      // Se não encontrar no grupo atual, buscar karma total
      const totalKarma = await this.karmaService.getTotalKarmaForUser(user.userName || user.firstName);
      
      if (totalKarma) {
        // Simular estrutura de karma do grupo para compatibilidade
        return {
          karma: totalKarma.totalKarma,
          givenKarma: totalKarma.totalGiven,
          givenHate: totalKarma.totalHate,
          user: totalKarma.user,
          history: [] // Histórico vazio para karma total
        };
      }
      
      return null;
    } catch (error) {
      this.logger.error('Erro ao buscar karma com fallback:', error);
      return null;
    }
  }

  async handle(ctx: TextCommandContext): Promise<void> {
    const user = ctx.from;
    const chat = ctx.chat;

    try {
      const userDoc = await this.usersService.findOneByUserId(user.id);
      const karmaDoc = await this.getKarmaForUserWithFallback(userDoc, chat.id);
      const userName = user.username ? `@${user.username}` : user.first_name;

      const keyboard = this.keyboardService.getGroupWebAppKeyboard(ctx.chat);

      const extra: ExtraReplyMessage = {};
      if (keyboard) {
        extra.reply_markup = keyboard.reply_markup;
      }

      let message: string;
      const karma = karmaDoc?.karma || 0;
      const givenKarma = karmaDoc?.givenKarma || 0;
      const givenHate = karmaDoc?.givenHate || 0;
      
      message = `● Olá ${userName}, sua reputação é ${karma} neste grupo.\n\n▲ Pontos dados: ${givenKarma}.\n▼ Pontos negativos dados: ${givenHate}.`;

      await ctx.reply(message, extra);
    } catch (error) {
      this.logger.error(
        `Error handling /me command for user ${user.id}`,
        error,
      );
    }
  }
}
