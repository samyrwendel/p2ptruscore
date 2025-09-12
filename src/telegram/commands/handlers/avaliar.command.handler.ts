import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { KarmaService } from '../../../karma/karma.service';
import { UsersService } from '../../../users/users.service';
import { PendingEvaluationService } from '../../../operations/pending-evaluation.service';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class AvaliarCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(AvaliarCommandHandler.name);
  command = /^\/avaliar(?:@\w+)?\s+(positiva|negativa)\s+(.+)$/;

  constructor(
    private readonly karmaService: KarmaService,
    private readonly usersService: UsersService,
    private readonly pendingEvaluationService: PendingEvaluationService,
    private readonly keyboardService: TelegramKeyboardService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    if (!ctx.message.reply_to_message || !ctx.message.reply_to_message.from) {
      await ctx.reply(
        '■ Para avaliar uma transação, responda à mensagem do usuário com:\n\n' +
        '`/avaliar positiva Transação rápida e confiável`\n' +
        '`/avaliar negativa Não cumpriu o combinado`'
      );
      return;
    }

    const match = ctx.message.text.match(this.command);
    if (!match) {
      await ctx.reply(
        '▼ Formato incorreto. Use:\n' +
        '`/avaliar positiva [comentário]` ou\n' +
        '`/avaliar negativa [comentário]`'
      );
      return;
    }

    const [, tipo, comentario] = match;
    const avaliador = ctx.from;
    const avaliado = ctx.message.reply_to_message.from;
    
    if (avaliado.id === avaliador.id) {
      await ctx.reply('▼ Você não pode avaliar a si mesmo!');
      return;
    }

    if (avaliado.is_bot) {
      await ctx.reply('▼ Você não pode avaliar bots!');
      return;
    }

    try {
      // Registrar avaliação P2P com comentário
      const pontos = tipo === 'positiva' ? 2 : -1;
      await this.karmaService.registerEvaluation(
        avaliador,
        avaliado,
        ctx.chat,
        pontos,
        comentario
      );

      const nomeAvaliado = avaliado.username ? `@${avaliado.username}` : avaliado.first_name;
      const emoji = tipo === 'positiva' ? '▲' : '▼';
      
      await ctx.reply(
        `${emoji} **Avaliação P2P Registrada**\n\n` +
        `■ **Usuário**: ${nomeAvaliado}\n` +
        `● **Pontos**: ${pontos > 0 ? '+' : ''}${pontos}\n` +
        `■ **Comentário**: ${comentario}`
      );
    } catch (error) {
      this.logger.error('Erro ao registrar avaliação P2P', error);
      await ctx.reply('▼ Erro ao registrar avaliação. Tente novamente.');
    }
  }
}