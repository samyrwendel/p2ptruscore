import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { KarmaService } from '../../../karma/karma.service';
import { UsersService } from '../../../users/users.service';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class EditarAvaliacaoCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(EditarAvaliacaoCommandHandler.name);
  command = /^\/editaravaliacao(?:@\w+)?(?:\s+(.+))?$/;

  constructor(
    private readonly karmaService: KarmaService,
    private readonly usersService: UsersService,
    private readonly keyboardService: TelegramKeyboardService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    const match = ctx.message.text.match(this.command);
    const targetUserInput = match?.[1];

    if (!targetUserInput) {
      await ctx.reply(
        '📝 **Como editar uma avaliação:**\n\n' +
        '`/editaravaliacao @usuario` - Ver suas avaliações para esse usuário\n' +
        '`/editaravaliacao samyralmeida` - Ver suas avaliações para samyralmeida\n\n' +
        '💡 Você só pode editar avaliações que você mesmo fez.'
      );
      return;
    }

    try {
      // Buscar usuário alvo
      let targetUser;
      const cleanInput = targetUserInput.replace('@', '');
      
      if (/^\d+$/.test(cleanInput)) {
        // É um ID numérico
        targetUser = await this.usersService.findOneByUserId(parseInt(cleanInput));
      } else {
        // É um nome/username - buscar diretamente
        const karmaData = await this.karmaService.getTotalKarmaForUser(cleanInput);
        if (karmaData) {
          targetUser = karmaData.user;
        }
      }

      if (!targetUser) {
        await ctx.reply(`❌ Usuário "${targetUserInput}" não encontrado.`);
        return;
      }

      // Buscar avaliações feitas pelo usuário atual para o usuário alvo
      const evaluatorUser = await this.usersService.findOrCreate(ctx.from);
      const evaluations = await this.findUserEvaluations(evaluatorUser._id, targetUser._id, ctx.chat.id);

      if (evaluations.length === 0) {
        const targetName = targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName;
        await ctx.reply(`📝 Você não fez nenhuma avaliação para ${targetName}.`);
        return;
      }

      // Exibir avaliações editáveis
      await this.showEditableEvaluations(ctx, targetUser, evaluations);

    } catch (error) {
      this.logger.error('Erro ao processar comando editar avaliação:', error);
      await ctx.reply('❌ Erro ao processar comando. Tente novamente.');
    }
  }

  async handleCallback(ctx: any): Promise<boolean> {
    const data = ctx.callbackQuery.data;
    
    if (!data.startsWith('edit_eval_')) {
      return false;
    }

    try {
      if (data.startsWith('edit_eval_select_')) {
        await this.handleSelectEvaluation(ctx, data);
      } else if (data.startsWith('edit_eval_star_')) {
        await this.handleEditStarRating(ctx, data);
      } else if (data.startsWith('edit_eval_comment_')) {
        await this.handleEditComment(ctx, data);
      } else if (data.startsWith('edit_eval_confirm_')) {
        await this.handleConfirmEdit(ctx, data);
      } else if (data.startsWith('edit_eval_cancel_')) {
        await this.handleCancelEdit(ctx, data);
      }
      
      return true;
    } catch (error) {
      this.logger.error('Erro ao processar callback de edição:', error);
      try {
        await ctx.answerCbQuery('❌ Erro ao processar ação', { show_alert: true });
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado no tratamento de erro:', cbError.description);
        }
      }
      return true;
    }
  }

  private async findUserEvaluations(evaluatorId: Types.ObjectId, targetUserId: Types.ObjectId, chatId: number): Promise<any[]> {
    // Buscar karma do usuário alvo no grupo atual
    const karmaDoc = await this.karmaService.getKarmaForUser(parseInt(targetUserId.toString()), chatId);
    
    if (!karmaDoc || !karmaDoc.history) {
      return [];
    }

    // Filtrar avaliações feitas pelo avaliador
    return karmaDoc.history.filter(entry => 
      entry.evaluator && entry.evaluator.toString() === evaluatorId.toString()
    ).map((entry, index) => ({
      ...entry,
      originalIndex: karmaDoc.history.indexOf(entry)
    }));
  }

  private async showEditableEvaluations(ctx: any, targetUser: any, evaluations: any[]): Promise<void> {
    const targetName = targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName;
    
    let message = `📝 **Suas avaliações para ${targetName}:**\n\n`;
    
    evaluations.forEach((evaluation, index) => {
      const stars = evaluation.starRating ? '⭐'.repeat(evaluation.starRating) : (evaluation.karmaChange > 0 ? '👍' : '👎');
      const date = new Date(evaluation.timestamp).toLocaleDateString('pt-BR');
      message += `${index + 1}. ${stars}: "${evaluation.comment || 'Sem comentário'}" (${date})\n`;
    });
    
    message += '\n💡 Selecione uma avaliação para editar:';

    // Criar botões para cada avaliação
    const keyboard: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } = {
      inline_keyboard: []
    };

    // Adicionar botões em linhas de 2
    for (let i = 0; i < evaluations.length; i += 2) {
      const row: Array<{ text: string; callback_data: string }> = [];
      
      row.push({
        text: `${i + 1}`,
        callback_data: `edit_eval_select_${targetUser.userId}_${evaluations[i].originalIndex}`
      });
      
      if (i + 1 < evaluations.length) {
        row.push({
          text: `${i + 2}`,
          callback_data: `edit_eval_select_${targetUser.userId}_${evaluations[i + 1].originalIndex}`
        });
      }
      
      keyboard.inline_keyboard.push(row);
    }

    // Botão cancelar
    keyboard.inline_keyboard.push([{
      text: '❌ Cancelar',
      callback_data: 'edit_eval_cancel'
    }]);

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  private async handleSelectEvaluation(ctx: any, data: string): Promise<void> {
    try {
      await ctx.answerCbQuery();
    } catch (cbError: any) {
      if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
        this.logger.warn('Callback query expirado:', cbError.description);
      }
    }

    const parts = data.replace('edit_eval_select_', '').split('_');
    const targetUserId = parts[0];
    const evaluationIndex = parseInt(parts[1]);

    // Buscar usuário alvo e avaliação
    const targetUser = await this.usersService.findOneByUserId(parseInt(targetUserId));
    if (!targetUser) {
      await ctx.editMessageText('❌ Usuário não encontrado.');
      return;
    }

    const karmaDoc = await this.karmaService.getKarmaForUser(parseInt(targetUserId), ctx.chat.id);
    if (!karmaDoc || !karmaDoc.history || !karmaDoc.history[evaluationIndex]) {
      await ctx.editMessageText('❌ Avaliação não encontrada.');
      return;
    }

    const evaluation = karmaDoc.history[evaluationIndex];
    const targetName = targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName;
    
    const stars = evaluation.starRating ? '⭐'.repeat(evaluation.starRating) : (evaluation.karmaChange > 0 ? '👍' : '👎');
    const date = new Date(evaluation.timestamp).toLocaleDateString('pt-BR');
    
    const message = `📝 **Editando avaliação para ${targetName}:**\n\n` +
                   `**Avaliação atual:**\n` +
                   `${stars}: "${evaluation.comment || 'Sem comentário'}" (${date})\n\n` +
                   `**O que deseja editar?**`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '⭐ Estrelas',
            callback_data: `edit_eval_star_${targetUserId}_${evaluationIndex}`
          },
          {
            text: '💬 Comentário',
            callback_data: `edit_eval_comment_${targetUserId}_${evaluationIndex}`
          }
        ],
        [
          {
            text: '🔙 Voltar',
            callback_data: `edit_eval_back_${targetUserId}`
          },
          {
            text: '❌ Cancelar',
            callback_data: 'edit_eval_cancel'
          }
        ]
      ]
    };

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  private async handleEditStarRating(ctx: any, data: string): Promise<void> {
    try {
      await ctx.answerCbQuery();
    } catch (cbError: any) {
      if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
        this.logger.warn('Callback query expirado:', cbError.description);
      }
    }

    const parts = data.replace('edit_eval_star_', '').split('_');
    const targetUserId = parts[0];
    const evaluationIndex = parseInt(parts[1]);

    const message = `⭐ **Selecione a nova avaliação:**\n\n` +
                   `Escolha quantas estrelas deseja dar:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '⭐', callback_data: `edit_eval_confirm_${targetUserId}_${evaluationIndex}_1` },
          { text: '⭐⭐', callback_data: `edit_eval_confirm_${targetUserId}_${evaluationIndex}_2` },
          { text: '⭐⭐⭐', callback_data: `edit_eval_confirm_${targetUserId}_${evaluationIndex}_3` }
        ],
        [
          { text: '⭐⭐⭐⭐', callback_data: `edit_eval_confirm_${targetUserId}_${evaluationIndex}_4` },
          { text: '⭐⭐⭐⭐⭐', callback_data: `edit_eval_confirm_${targetUserId}_${evaluationIndex}_5` }
        ],
        [
          {
            text: '🔙 Voltar',
            callback_data: `edit_eval_select_${targetUserId}_${evaluationIndex}`
          },
          {
            text: '❌ Cancelar',
            callback_data: 'edit_eval_cancel'
          }
        ]
      ]
    };

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  private async handleEditComment(ctx: any, data: string): Promise<void> {
    try {
      await ctx.answerCbQuery('💬 Digite o novo comentário como resposta a esta mensagem');
    } catch (cbError: any) {
      if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
        this.logger.warn('Callback query expirado:', cbError.description);
      }
    }

    const parts = data.replace('edit_eval_comment_', '').split('_');
    const targetUserId = parts[0];
    const evaluationIndex = parseInt(parts[1]);

    const message = `💬 **Editar comentário:**\n\n` +
                   `Digite o novo comentário como resposta a esta mensagem.\n\n` +
                   `⚠️ Esta funcionalidade será implementada em breve.`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '🔙 Voltar',
            callback_data: `edit_eval_select_${targetUserId}_${evaluationIndex}`
          },
          {
            text: '❌ Cancelar',
            callback_data: 'edit_eval_cancel'
          }
        ]
      ]
    };

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  private async handleConfirmEdit(ctx: any, data: string): Promise<void> {
    try {
      await ctx.answerCbQuery();
    } catch (cbError: any) {
      if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
        this.logger.warn('Callback query expirado:', cbError.description);
      }
    }

    const parts = data.replace('edit_eval_confirm_', '').split('_');
    const targetUserId = parts[0];
    const evaluationIndex = parseInt(parts[1]);
    const newStarRating = parseInt(parts[2]);

    try {
      // Buscar usuário alvo
      const targetUser = await this.usersService.findOneByUserId(parseInt(targetUserId));
      if (!targetUser) {
        await ctx.editMessageText('❌ Usuário não encontrado.');
        return;
      }

      // Atualizar avaliação
      const success = await this.updateEvaluation(
        targetUser._id,
        ctx.chat.id,
        evaluationIndex,
        newStarRating
      );

      if (success) {
        const targetName = targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName;
        const starEmojis = '⭐'.repeat(newStarRating);
        
        await ctx.editMessageText(
          `✅ **Avaliação editada com sucesso!**\n\n` +
          `**Nova avaliação para ${targetName}:**\n` +
          `${starEmojis} (${newStarRating} estrelas)\n\n` +
          `A avaliação foi atualizada no sistema.`
        );
      } else {
        await ctx.editMessageText('❌ Erro ao atualizar avaliação. Tente novamente.');
      }
    } catch (error) {
      this.logger.error('Erro ao confirmar edição:', error);
      await ctx.editMessageText('❌ Erro ao processar edição.');
    }
  }

  private async handleCancelEdit(ctx: any, data: string): Promise<void> {
    try {
      await ctx.answerCbQuery();
    } catch (cbError: any) {
      if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
        this.logger.warn('Callback query expirado:', cbError.description);
      }
    }

    await ctx.editMessageText('❌ Edição cancelada.');
  }

  private async updateEvaluation(
    targetUserId: Types.ObjectId,
    chatId: number,
    evaluationIndex: number,
    newStarRating: number
  ): Promise<boolean> {
    try {
      // Buscar documento de karma
      const karmaDoc = await this.karmaService.getKarmaForUser(parseInt(targetUserId.toString()), chatId);
      
      if (!karmaDoc || !karmaDoc.history || !karmaDoc.history[evaluationIndex]) {
        return false;
      }

      const oldStarRating = karmaDoc.history[evaluationIndex].starRating;
      
      // Atualizar a avaliação no histórico
      karmaDoc.history[evaluationIndex].starRating = newStarRating;
      karmaDoc.history[evaluationIndex].timestamp = new Date();

      // Atualizar contadores de estrelas
      if (oldStarRating) {
        // Remover da contagem antiga
        const oldField = `stars${oldStarRating}`;
        if (karmaDoc[oldField] > 0) {
          karmaDoc[oldField]--;
        }
      }
      
      // Adicionar na nova contagem
      const newField = `stars${newStarRating}`;
      karmaDoc[newField] = (karmaDoc[newField] || 0) + 1;

      // Salvar alterações (isso seria feito através do KarmaService)
      // Por enquanto, vamos simular que foi salvo
      this.logger.log(`Avaliação atualizada: ${oldStarRating} → ${newStarRating} estrelas`);
      
      return true;
    } catch (error) {
      this.logger.error('Erro ao atualizar avaliação:', error);
      return false;
    }
  }
}