import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { KarmaService } from '../../../karma/karma.service';
import { UsersService } from '../../../users/users.service';
import { PendingEvaluationService } from '../../../operations/pending-evaluation.service';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { getReputationInfo } from '../../../shared/reputation.utils';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class AvaliarCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(AvaliarCommandHandler.name);
  command = /^\/avaliar(?:@\w+)?\s+([1-5])\s+(.+)$/;

  constructor(
    private readonly karmaService: KarmaService,
    private readonly usersService: UsersService,
    private readonly pendingEvaluationService: PendingEvaluationService,
    private readonly keyboardService: TelegramKeyboardService,
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
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

    const pontos = tipo === 'positiva' ? 2 : -1;

    try {
      await this.karmaService.registerEvaluation(
        avaliador,
        avaliado,
        ctx.chat,
        pontos,
        comentario
      );

      await ctx.reply(
        `✅ Avaliação registrada!\n` +
        `Usuário: @${avaliado.username || avaliado.first_name}\n` +
        `Pontos: ${pontos > 0 ? '+' : ''}${pontos}\n` +
        `Comentário: ${comentario}`
      );
    } catch (error) {
      this.logger.error('Error registering evaluation:', error);
      await ctx.reply('▼ Erro ao registrar avaliação. Tente novamente.');
    }
  }

  async handleCallback(ctx: any): Promise<boolean> {
    const data = ctx.callbackQuery.data;
    
    if (!data.startsWith('eval_')) {
      return false;
    }

    // Avaliação é obrigatória - não há mais opção de pular

    try {
      if (data.startsWith('eval_star_')) {
        return await this.processStarEvaluationCallback(ctx, data);
      } else if (data.startsWith('eval_positive_') || data.startsWith('eval_negative_')) {
        return await this.processEvaluationCallback(ctx, data);
      }

      // Esta validação será feita nos métodos específicos
       // Remover validação genérica aqui

      const userId = new Types.ObjectId(ctx.from.id.toString());
      const hasPendingEvaluations = await this.pendingEvaluationService.hasPendingEvaluations(userId);
      
      if (!hasPendingEvaluations) {
        try {
          await ctx.answerCbQuery('❌ Não há avaliações pendentes', { show_alert: true });
        } catch (cbError: any) {
          if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
            this.logger.warn('Callback query expirado - sem avaliações:', cbError.description);
          } else {
            this.logger.error('Erro ao responder callback - sem avaliações:', cbError);
          }
        }
        return true;
      }

      // Buscar avaliações pendentes específicas
      const pendingEvaluations = await this.pendingEvaluationService.getPendingEvaluations(userId);
      
      if (pendingEvaluations.length === 0) {
        try {
          await ctx.answerCbQuery('❌ Nenhuma avaliação pendente encontrada', { show_alert: true });
        } catch (cbError: any) {
          if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
            this.logger.warn('Callback query expirado - lista vazia:', cbError.description);
          } else {
            this.logger.error('Erro ao responder callback - lista vazia:', cbError);
          }
        }
        return true;
      }

      // Mostrar lista de avaliações pendentes
       let message = '⭐ **Avaliações Pendentes:**\n\n';
       const keyboard: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } = {
         inline_keyboard: []
       };

       pendingEvaluations.forEach((evaluation, index) => {
         const targetName = 'Usuário'; // Simplificado já que targetName não existe no schema
         message += `${index + 1}. Avaliar operação\n`;
         
         keyboard.inline_keyboard.push([
           {
             text: `👍 Positiva`,
             callback_data: `eval_positive_${evaluation.operation}`
           },
           {
             text: `👎 Negativa`,
             callback_data: `eval_negative_${evaluation.operation}`
           }
         ]);
       });

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      
      return true;
      
    } catch (error) {
      this.logger.error('❌ Erro ao processar callback de avaliação:', error);
      
      try {
        await ctx.answerCbQuery('❌ Erro ao processar avaliação', { show_alert: true });
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado no tratamento de erro:', cbError.description);
        }
      }
      
      return false;
    }
  }

  private async processStarEvaluationCallback(ctx: any, data: string): Promise<boolean> {
    try {
      // Extrair estrelas e operationId do callback data
      const parts = data.replace('eval_star_', '').split('_');
      const starRating = parseInt(parts[0]);
      const operationId = parts[1];
      
      this.logger.log(`📞 Processando avaliação ${starRating} estrelas para operação: ${operationId}`);
      
      // Validar se é um ObjectId válido
      if (!Types.ObjectId.isValid(operationId)) {
        try {
          await ctx.answerCbQuery('❌ ID de operação inválido', { show_alert: true });
        } catch (cbError: any) {
          if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
            this.logger.warn('Callback query expirado - ID inválido (processStar):', cbError.description);
          } else {
            this.logger.error('Erro ao responder callback - ID inválido (processStar):', cbError);
          }
        }
        return true;
      }
      
      // Converter userId do Telegram para ObjectId do banco
      const userData = {
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name
      };
      
      const user = await this.usersService.findOrCreate(userData);
      const userId = user._id;
      const operationObjectId = new Types.ObjectId(operationId);
      
      // Verificar se há avaliações pendentes
      const hasPendingEvaluations = await this.pendingEvaluationService.hasPendingEvaluations(userId);
      
      if (!hasPendingEvaluations) {
        try {
          await ctx.answerCbQuery('❌ Não há avaliações pendentes', { show_alert: true });
        } catch (cbError: any) {
          if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
            this.logger.warn('Callback query expirado - sem avaliações (processStar):', cbError.description);
          } else {
            this.logger.error('Erro ao responder callback - sem avaliações (processStar):', cbError);
          }
        }
        return true;
      }
      
      // Buscar avaliações pendentes específicas
      const pendingEvaluations = await this.pendingEvaluationService.getPendingEvaluations(userId);
      const pendingEvaluation = pendingEvaluations.find(evaluation => evaluation.operation.toString() === operationId);
      
      if (!pendingEvaluation) {
        try {
          await ctx.answerCbQuery('❌ Não há avaliação pendente para esta operação', { show_alert: true });
        } catch (cbError: any) {
          if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
            this.logger.warn('Callback query expirado - sem avaliação para operação (processStar):', cbError.description);
          } else {
            this.logger.error('Erro ao responder callback - sem avaliação para operação (processStar):', cbError);
          }
        }
        return true;
      }
      
      // Usar comentário genérico
      const comentario = `Avaliação ${starRating} estrelas via sistema P2P`;
      
      // Buscar usuário avaliado
      const evaluatedUser = await this.usersService.findById(pendingEvaluation.target.toString());
      if (!evaluatedUser) {
        try {
          await ctx.answerCbQuery('❌ Usuário avaliado não encontrado', { show_alert: true });
        } catch (cbError: any) {
          if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
            this.logger.warn('Callback query expirado - usuário não encontrado (processStar):', cbError.description);
          } else {
            this.logger.error('Erro ao responder callback - usuário não encontrado (processStar):', cbError);
          }
        }
        return true;
      }
      
      // Criar objetos de usuário para o serviço
      const evaluator = {
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name
      };
      
      const evaluated = {
        id: evaluatedUser.userId,
        username: evaluatedUser.userName,
        first_name: evaluatedUser.firstName
      };
      
      // Usar o ID do grupo correto para registrar a avaliação
      const chatId = ctx.chat?.id || -1002907400287; // ID do grupo principal como fallback
      
      await this.karmaService.registerStarEvaluation(
        evaluator,
        evaluated,
        { id: chatId },
        starRating,
        comentario
      );
      
      // Completar avaliação pendente
      await this.pendingEvaluationService.completePendingEvaluation(
        operationObjectId,
        userId
      );
      
      const starEmojis = '⭐'.repeat(starRating);
      const ratingText = this.getStarRatingText(starRating);
      const nomeAvaliado = evaluated.username ? `@${evaluated.username}` : evaluated.first_name;
      
      await ctx.editMessageText(
        `${starEmojis} **Avaliação ${ratingText} Registrada**\n\n` +
        `✅ **Usuário**: ${nomeAvaliado}\n` +
        `⭐ **Avaliação**: ${starRating} estrelas\n` +
        `💬 **Comentário**: ${comentario}\n\n` +
        `🎯 Avaliação P2P concluída com sucesso!`,
        { parse_mode: 'Markdown' }
      );
      
      try {
        await ctx.answerCbQuery(`✅ Avaliação ${starRating} estrelas registrada!`);
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado - avaliação registrada:', cbError.description);
        } else {
          this.logger.error('Erro ao responder callback - avaliação registrada:', cbError);
        }
      }
      
      this.logger.log(`✅ Avaliação ${starRating} estrelas registrada para operação ${operationId}`);
      
      // Enviar notificação no PV para o usuário avaliado
      await this.sendEvaluationNotification(
        evaluated.id,
        evaluator,
        starRating,
        comentario
      );
      
      return true;
      
    } catch (error) {
      this.logger.error('❌ Erro ao processar avaliação com estrelas:', error);
      
      try {
        await ctx.answerCbQuery('❌ Erro ao registrar avaliação', { show_alert: true });
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado no tratamento de erro (processStar):', cbError.description);
        } else {
          this.logger.error('Erro ao responder callback de erro (processStar):', cbError);
        }
      }
      
      return true;
    }
  }

  private getStarRatingText(stars: number): string {
    switch (stars) {
      case 5: return 'Excelente';
      case 4: return 'Muito Boa';
      case 3: return 'Regular';
      case 2: return 'Ruim';
      case 1: return 'Péssima';
      default: return 'Indefinida';
    }
  }

  private async processEvaluationCallback(ctx: any, data: string): Promise<boolean> {
    try {
      const isPositive = data.startsWith('eval_positive_');
      const operationId = data.replace(isPositive ? 'eval_positive_' : 'eval_negative_', '');

      this.logger.log(`📞 Processando avaliação ${isPositive ? 'positiva' : 'negativa'} para operação: ${operationId}`);
      
      // Validar se é um ObjectId válido
      if (!Types.ObjectId.isValid(operationId)) {
        await ctx.answerCbQuery('❌ ID de operação inválido', { show_alert: true });
        return true;
      }
      
      const userId = new Types.ObjectId(ctx.from.id.toString());
      const operationObjectId = new Types.ObjectId(operationId);
      
      // Verificar se há avaliações pendentes
      const hasPendingEvaluations = await this.pendingEvaluationService.hasPendingEvaluations(userId);
      
      if (!hasPendingEvaluations) {
        await ctx.answerCbQuery('❌ Não há avaliações pendentes', { show_alert: true });
        return true;
      }
      
      // Buscar avaliações pendentes específicas
      const pendingEvaluations = await this.pendingEvaluationService.getPendingEvaluations(userId);
      const pendingEvaluation = pendingEvaluations.find(evaluation => evaluation.operation.toString() === operationId);

      if (!pendingEvaluation) {
        await ctx.answerCbQuery('❌ Não há avaliação pendente para esta operação', { show_alert: true });
        return true;
      }
      
      const pontos = isPositive ? 2 : -1;
      const starRating = isPositive ? 5 : 1; // Converter para sistema de estrelas
      const comentario = 'Avaliação via sistema P2P';
      
      // Buscar usuário avaliado
      const evaluatedUser = await this.usersService.findById(pendingEvaluation.target.toString());
      if (!evaluatedUser) {
        await ctx.answerCbQuery('❌ Usuário avaliado não encontrado', { show_alert: true });
        return true;
      }
      
      // Criar objetos de usuário para o serviço
      const evaluator = {
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name
      };
      
      const evaluated = {
        id: evaluatedUser.userId,
        username: evaluatedUser.userName,
        first_name: evaluatedUser.firstName
      };
      
      // Usar o ID do grupo correto para registrar a avaliação
      const chatId = ctx.chat?.id || -1002907400287; // ID do grupo principal como fallback
      
      await this.karmaService.registerEvaluation(
        evaluator,
        evaluated,
        { id: chatId },
        pontos,
        comentario
      );
      
      // Completar avaliação pendente
      await this.pendingEvaluationService.completePendingEvaluation(
        operationObjectId,
        userId
      );
      
      const emoji = isPositive ? '⭐' : '❌';
      const tipoText = isPositive ? 'Positiva' : 'Negativa';
      const nomeAvaliado = evaluated.username ? `@${evaluated.username}` : evaluated.first_name;
      
      await ctx.editMessageText(
        `${emoji} **Avaliação ${tipoText} Registrada**\n\n` +
        `✅ **Usuário**: ${nomeAvaliado}\n` +
        `📊 **Pontos**: ${pontos > 0 ? '+' : ''}${pontos}\n` +
        `💬 **Comentário**: ${comentario}\n\n` +
        `🎯 Avaliação P2P concluída com sucesso!`,
        { parse_mode: 'Markdown' }
      );
      
      try {
        await ctx.answerCbQuery(`✅ Avaliação ${tipoText.toLowerCase()} registrada!`);
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado - avaliação registrada:', cbError.description);
        }
      }
      
      this.logger.log(`✅ Avaliação ${tipoText.toLowerCase()} registrada para operação ${operationId}`);
      
      // Enviar notificação no PV para o usuário avaliado
      await this.sendEvaluationNotification(
        evaluated.id,
        evaluator,
        starRating,
        comentario
      );
      
      return true;
      
    } catch (error) {
      this.logger.error('❌ Erro ao processar avaliação:', error);
      
      try {
        await ctx.answerCbQuery('❌ Erro ao registrar avaliação', { show_alert: true });
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado no tratamento de erro:', cbError.description);
        }
      }
      
      return true;
    }
  }

  private async sendEvaluationNotification(
    evaluatedUserId: number,
    evaluator: any,
    starRating: number,
    comment: string
  ): Promise<void> {
    try {
      // Buscar dados atualizados do usuário avaliado para mostrar pontuação atual
      const evaluatedUser = await this.usersService.findOneByUserId(evaluatedUserId);
      if (!evaluatedUser) {
        this.logger.warn(`Usuário ${evaluatedUserId} não encontrado para notificação`);
        return;
      }

      // Buscar karma atual do usuário no grupo principal
      const karmaDoc = await this.karmaService.getTotalKarmaForUser(evaluatedUser.userName || evaluatedUser.firstName);
      
      const evaluatorName = evaluator.username ? `@${evaluator.username}` : evaluator.first_name;
      const starEmojis = '⭐'.repeat(starRating);
      const ratingText = this.getStarRatingText(starRating);
      
      // Calcular pontuação atual
      let currentScore = 0;
      let starDistribution = '';
      
      if (karmaDoc && karmaDoc.totalKarma) {
        currentScore = karmaDoc.totalKarma;
        
        // Para distribuição de estrelas, precisamos buscar dados específicos do grupo
        // Por enquanto, mostrar apenas a pontuação total
        starDistribution = '';
      }
      
      // Obter informações de reputação baseadas na pontuação
      const reputationInfo = getReputationInfo({ karma: currentScore });
      
      const notificationMessage = 
        `🎉 **Você Recebeu uma Nova Avaliação!**\n\n` +
        `👤 **De:** ${evaluatorName}\n` +
        `${starEmojis} **Avaliação:** ${ratingText}\n` +
        `💬 **Comentário:** "${comment}"\n\n` +
        `${reputationInfo.icone} **Nível:** ${reputationInfo.nivel}\n` +
        `🏆 **Sua Pontuação Atual:** ${currentScore} pts${starDistribution}\n\n` +
        `✨ Continue assim! Cada avaliação positiva fortalece sua reputação na comunidade.`;
      
      // Criar botão para ver reputação completa
      const keyboard = {
        inline_keyboard: [
          [
            {
              text: '📊 Ver Minha Reputação Completa',
              callback_data: `reputation_main_${evaluatedUserId}`
            }
          ]
        ]
      };
      
      // Enviar mensagem privada
      await this.bot.telegram.sendMessage(
        evaluatedUserId,
        notificationMessage,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
      
      this.logger.log(`📨 Notificação de avaliação enviada para usuário ${evaluatedUserId}`);
      
    } catch (error) {
      this.logger.error('❌ Erro ao enviar notificação de avaliação:', error);
      // Não falhar a avaliação se a notificação falhar
    }
  }
}