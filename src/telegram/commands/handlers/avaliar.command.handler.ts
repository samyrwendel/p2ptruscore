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
  private tempSuggestions: Map<string, string[]> = new Map();
  private pendingCustomComments: Map<string, { operationId: string, starRating: number, userId: string }> = new Map();

  constructor(
    private readonly karmaService: KarmaService,
    private readonly usersService: UsersService,
    private readonly pendingEvaluationService: PendingEvaluationService,
    private readonly keyboardService: TelegramKeyboardService,
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    // Verificar se é um comentário personalizado pendente
    const userId = ctx.from.id.toString();
    const pendingComment = this.pendingCustomComments.get(userId);
    
    this.logger.log(`📝 [DEBUG] Handle chamado - userId: ${userId}, texto: "${ctx.message.text}", pendingComment: ${!!pendingComment}`);
    
    if (pendingComment) {
      this.logger.log(`💬 [DEBUG] Processando comentário personalizado para operação: ${pendingComment.operationId}`);
      // Processar comentário personalizado
      await this.processCustomComment(ctx, pendingComment, ctx.message.text);
      return;
    }
    
    const match = ctx.message.text.match(this.command);
    if (!match) {
      await ctx.reply(
        '❌ Formato inválido. Use: /avaliar [1-5] [comentário]'
      );
      return;
    }

    const [, pontosStr, comentario] = match;
    const pontos = parseInt(pontosStr);

    if (pontos < 1 || pontos > 5) {
      await ctx.reply(
        '❌ A pontuação deve ser entre 1 e 5 estrelas.'
      );
      return;
    }

    if (!ctx.message.reply_to_message) {
      await ctx.reply(
        '❌ Você deve responder à mensagem do usuário que deseja avaliar.'
      );
      return;
    }

    const targetUserId = ctx.message.reply_to_message.from?.id;
    if (!targetUserId) {
      await ctx.reply('❌ Não foi possível identificar o usuário.');
      return;
    }

    if (targetUserId === ctx.from.id) {
      await ctx.reply('❌ Você não pode avaliar a si mesmo.');
      return;
    }

    const evaluator = {
      id: ctx.from.id,
      username: ctx.from.username,
      first_name: ctx.from.first_name,
    };

    const evaluated = {
      id: targetUserId,
      username: ctx.message.reply_to_message.from?.username,
      first_name: ctx.message.reply_to_message.from?.first_name,
    };

    const group = {
      id: ctx.chat.id,
    };

    try {
      await this.karmaService.registerStarEvaluation(
        evaluator,
        evaluated,
        group,
        pontos,
        comentario,
      );

      const starEmojis = '⭐'.repeat(pontos);
      const ratingText = this.getStarRatingText(pontos);
      const nomeAvaliado = evaluated.username
        ? `@${evaluated.username}`
        : evaluated.first_name;

      await ctx.reply(
        `${starEmojis} **Avaliação ${ratingText} Registrada**\n\n` +
          `✅ **Usuário**: ${nomeAvaliado}\n` +
          `💬 **Comentário**: ${comentario}\n\n` +
          `🎯 Avaliação registrada com sucesso!`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      this.logger.error('Erro ao registrar avaliação:', error);
      await ctx.reply('❌ Erro ao registrar avaliação. Tente novamente.');
    }
  }

  async handleCallback(ctx: any): Promise<boolean> {
    const data = ctx.callbackQuery?.data;
    if (!data) return false;

    this.logger.log(`🔍 [DEBUG] AvaliarCommandHandler.handleCallback chamado com data: ${data}`);

    if (data.startsWith('eval_star_')) {
      this.logger.log(`⭐ [DEBUG] Processando callback de estrelas: ${data}`);
      return await this.processStarEvaluationCallback(ctx, data);
    } else if (data.startsWith('eval_comment_')) {
      this.logger.log(`💬 [DEBUG] Processando callback de comentário: ${data}`);
      return await this.processCommentCallback(ctx, data);
    } else if (data.startsWith('eval_suggestion_') || data.startsWith('eval_custom_')) {
      this.logger.log(`💡 [DEBUG] Processando callback de sugestão: ${data}`);
      return await this.processSuggestionCallback(ctx, data);
    } else if (data.startsWith('eval_positive_') || data.startsWith('eval_negative_')) {
      return await this.processEvaluationCallback(ctx, data);
    }

    this.logger.log(`❌ [DEBUG] Callback não reconhecido pelo AvaliarCommandHandler: ${data}`);
    return false;
  }

  private async processStarEvaluationCallback(ctx: any, data: string): Promise<boolean> {
    try {
      // Extrair dados do callback: eval_star_5_operationId
      const parts = data.replace('eval_star_', '').split('_');
      const starRating = parseInt(parts[0]);
      const operationId = parts.slice(1).join('_');
      
      this.logger.log(`📞 Processando avaliação ${starRating} estrelas para operação: ${operationId}`);
      
      // Validar ID da operação
      if (!Types.ObjectId.isValid(operationId)) {
        await ctx.answerCbQuery('❌ ID de operação inválido', { show_alert: true });
        return true;
      }
      
      const userId = ctx.from.id;
      
      // Verificar se há avaliações pendentes
      const user = await this.usersService.findOneByUserId(userId);
      if (!user) {
        await ctx.answerCbQuery('❌ Usuário não encontrado', { show_alert: true });
        return true;
      }
      
      const hasPendingEvaluations = await this.pendingEvaluationService.hasPendingEvaluations(user._id);
      
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
      
      // Buscar dados da avaliação pendente
      const pendingEvaluations = await this.pendingEvaluationService.getPendingEvaluations(user._id);
      const pendingEvaluation = pendingEvaluations.find(evaluation => evaluation.operation.toString() === operationId);
      
      if (!pendingEvaluation) {
        await ctx.answerCbQuery('❌ Avaliação não encontrada', { show_alert: true });
        return true;
      }
      
      // Buscar dados do usuário avaliado
      const evaluatedUser = await this.usersService.findById(pendingEvaluation.target.toString());
      if (!evaluatedUser) {
        await ctx.answerCbQuery('❌ Usuário não encontrado', { show_alert: true });
        return true;
      }
      
      const evaluated = {
        id: evaluatedUser.userId,
        username: evaluatedUser.userName,
        first_name: evaluatedUser.firstName
      };
      
      // Mostrar tela de comentário
      await this.showCommentScreen(ctx, operationId, starRating, evaluated);
      
      return true;
      
    } catch (error) {
      this.logger.error('Erro ao processar callback de estrelas:', error);
      await ctx.answerCbQuery('❌ Erro ao processar avaliação', { show_alert: true });
      return true;
    }
  }

  private async showCommentScreen(ctx: any, operationId: string, starRating: number, evaluated: any): Promise<void> {
    try {
      const starEmojis = '⭐'.repeat(starRating);
      const ratingText = this.getStarRatingText(starRating);
      const nomeAvaliado = evaluated.username ? `@${evaluated.username}` : evaluated.first_name;
      
      // Buscar informações de reputação do usuário avaliado
        let reputationInfo = '';
        try {
          const chatId = ctx.chat?.id || ctx.message?.chat?.id;
           if (chatId) {
             const karmaData = await this.karmaService.getKarmaForUser(evaluated.id, chatId);
             if (karmaData && karmaData.karma !== undefined) {
               const totalScore = karmaData.karma;
               const reputation = getReputationInfo(totalScore);
               reputationInfo = `\n📊 **Reputação Atual:** ${reputation.icone} ${reputation.nivel} (${totalScore} pts)\n`;
             }
           }
        } catch (error) {
          this.logger.warn('Erro ao buscar reputação do usuário:', error);
        }
      
      const message = (
        `${starEmojis} **Avaliação ${ratingText}**\n\n` +
        `👤 **Avaliando:** ${nomeAvaliado}${reputationInfo}\n` +
        `Gostaria de adicionar um comentário sobre a experiência?\n\n` +
        `💭 **Comentário (opcional):**`
      );
      
      const keyboard = {
        inline_keyboard: [
          [
            {
              text: '✍️ Escrever Comentário',
              callback_data: `eval_comment_write_${starRating}_${operationId}`
            },
            {
              text: '⏭️ Pular Comentário',
              callback_data: `eval_comment_skip_${starRating}_${operationId}`
            }
          ]
        ]
      };
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      
    } catch (error) {
      this.logger.error('Erro ao mostrar tela de comentário:', error);
      await ctx.answerCbQuery('❌ Erro ao processar avaliação', { show_alert: true });
    }
  }

   private async processCommentCallback(ctx: any, data: string): Promise<boolean> {
     try {
       // Extrair dados do callback: eval_comment_write_5_operationId ou eval_comment_skip_5_operationId
       const parts = data.replace('eval_comment_', '').split('_');
       const action = parts[0]; // 'write' ou 'skip'
       const starRating = parseInt(parts[1]);
       const operationId = parts.slice(2).join('_');
       
       this.logger.log(`💬 Processando comentário: action=${action}, stars=${starRating}, operation=${operationId}`);
       
       if (action === 'skip') {
         // Pular comentário - finalizar com comentário padrão
         const user = await this.usersService.findOneByUserId(ctx.from.id);
         if (!user) {
           await ctx.answerCbQuery('❌ Usuário não encontrado', { show_alert: true });
           return true;
         }
         
         const pendingEvaluations = await this.pendingEvaluationService.getPendingEvaluations(user._id);
         const pendingEvaluation = pendingEvaluations.find(evaluation => evaluation.operation.toString() === operationId);
         
         if (!pendingEvaluation) {
           await ctx.answerCbQuery('❌ Avaliação não encontrada', { show_alert: true });
           return true;
         }
         
         const evaluatedUser = await this.usersService.findById(pendingEvaluation.target.toString());
         if (!evaluatedUser) {
           await ctx.answerCbQuery('❌ Usuário não encontrado', { show_alert: true });
           return true;
         }
         
         const comentario = `Avaliação ${starRating} estrelas via sistema P2P`;
         await this.finalizeEvaluation(ctx, operationId, starRating, {
           id: evaluatedUser.userId,
           username: evaluatedUser.userName,
           first_name: evaluatedUser.firstName
         }, comentario);
         
       } else if (action === 'write') {
         // Mostrar tela de sugestões de comentário
         await this.showCommentSuggestions(ctx, operationId, starRating);
       }
       
       return true;
       
     } catch (error) {
       this.logger.error('Erro ao processar callback de comentário:', error);
       await ctx.answerCbQuery('❌ Erro ao processar comentário', { show_alert: true });
       return true;
     }
   }

   private async finalizeEvaluation(ctx: any, operationId: string, starRating: number, evaluated: any, comentario: string): Promise<void> {
     try {
       this.logger.log(`🔄 Iniciando finalização de avaliação: operação=${operationId}, estrelas=${starRating}`);
       
       const user = await this.usersService.findOneByUserId(ctx.from.id);
       if (!user) {
         throw new Error('Usuário não encontrado');
       }
       
       const userId = user._id;
       const operationObjectId = new Types.ObjectId(operationId);
       const chatId = ctx.chat?.id || ctx.message?.chat?.id;
       
       if (!chatId) {
         throw new Error('ID do chat não encontrado');
       }
       
       const evaluator = {
         id: ctx.from.id,
         username: ctx.from.username,
         first_name: ctx.from.first_name
       };
       
       this.logger.log(`📝 Registrando avaliação no KarmaService...`);
       
       // Registrar avaliação
        await this.karmaService.registerStarEvaluation(
          evaluator,
          evaluated,
          { id: chatId },
          starRating,
          comentario
        );
        
        this.logger.log(`✅ Avaliação registrada, marcando como concluída...`);
        
        // Marcar avaliação como concluída
        await this.pendingEvaluationService.completePendingEvaluation(
          operationObjectId,
          userId
        );
        
        const starEmojis = '⭐'.repeat(starRating);
        const ratingText = this.getStarRatingText(starRating);
        const nomeAvaliado = evaluated.username ? `@${evaluated.username}` : evaluated.first_name;
        
        this.logger.log(`📤 Enviando mensagem de confirmação...`);
        
        await ctx.editMessageText(
          `${starEmojis} **Avaliação ${ratingText} Registrada**\n\n` +
          `✅ **Usuário**: ${nomeAvaliado}\n` +
          `⭐ **Avaliação**: ${starRating} estrelas\n` +
          `💬 **Comentário**: ${comentario}\n\n` +
          `🎯 Avaliação P2P concluída com sucesso!`,
          { parse_mode: 'Markdown' }
        );
        
        try {
          await ctx.answerCbQuery(`✅ Avaliação ${ratingText} registrada!`);
        } catch (cbError: any) {
          if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
            this.logger.warn('Callback query expirado - sucesso:', cbError.description);
          } else {
            this.logger.error('Erro ao responder callback - sucesso:', cbError);
          }
        }
        
        this.logger.log(`✅ Avaliação ${starRating} estrelas registrada para operação ${operationId}`);
        
        // Enviar notificação para o usuário avaliado
        try {
          await this.sendEvaluationNotification(
            evaluated.id,
            evaluator,
            starRating,
            comentario
          );
          this.logger.log(`📬 Notificação enviada para usuário ${evaluated.id}`);
        } catch (notifError) {
          this.logger.error('Erro ao enviar notificação:', notifError);
          // Não falhar a avaliação por causa da notificação
        }
        
      } catch (error) {
        this.logger.error('❌ Erro ao finalizar avaliação:', error);
        
        try {
          await ctx.editMessageText(
            '❌ **Erro ao Processar Avaliação**\n\n' +
            'Houve um problema ao registrar sua avaliação. ' +
            'Detalhes: ' + (error.message || 'Erro desconhecido') + '\n\n' +
            'Tente novamente ou entre em contato com o suporte.',
            { parse_mode: 'Markdown' }
          );
          
          await ctx.answerCbQuery('❌ Erro ao processar avaliação', { show_alert: true });
        } catch (editError) {
          this.logger.error('Erro ao editar mensagem de erro:', editError);
          
          // Fallback: enviar nova mensagem se não conseguir editar
          try {
            await ctx.reply(
              '❌ **Erro ao Processar Avaliação**\n\n' +
              'Houve um problema ao registrar sua avaliação. Tente novamente.',
              { parse_mode: 'Markdown' }
            );
          } catch (replyError) {
            this.logger.error('Erro ao enviar mensagem de fallback:', replyError);
          }
        }
      }
    }

    private async showCommentSuggestions(ctx: any, operationId: string, starRating: number): Promise<void> {
      try {
        const starEmojis = '⭐'.repeat(starRating);
        const ratingText = this.getStarRatingText(starRating);
        
        // Sugestões baseadas na avaliação
        let suggestions: string[] = [];
        
        if (starRating >= 4) {
          suggestions = [
            'Excelente negociação! Muito confiável.',
            'Transação perfeita, recomendo!',
            'Pessoa séria e pontual.',
            'Comunicação clara e rápida.'
          ];
        } else if (starRating === 3) {
          suggestions = [
            'Transação ok, sem problemas.',
            'Negociação dentro do esperado.',
            'Comunicação adequada.',
            'Processo normal, sem intercorrências.'
          ];
        } else {
          suggestions = [
            'Experiência ruim.',
            'Problemas na transação.',
            'Comunicação deficiente.',
            'Não recomendo.'
          ];
        }
        
        // Armazenar sugestões temporariamente
        this.tempSuggestions.set(`${operationId}_${starRating}`, suggestions);
        
        const keyboard = {
          inline_keyboard: [
            ...suggestions.map((suggestion, index) => [{
              text: `💬 ${suggestion}`,
              callback_data: `eval_suggestion_${starRating}_${index}_${operationId}`
            }]),
            [{
              text: '✍️ Escrever Próprio',
              callback_data: `eval_custom_${starRating}_${operationId}`
            }]
          ]
        };
        
        await ctx.editMessageText(
          `${starEmojis} **Avaliação ${ratingText}**\n\n` +
          `Selecione uma das sugestões abaixo ou digite seu próprio comentário:`,
          {
            parse_mode: 'Markdown',
            reply_markup: keyboard
          }
        );
        
      } catch (error) {
        this.logger.error('Erro ao mostrar sugestões de comentário:', error);
        // Fallback: finalizar sem comentário
        const user = await this.usersService.findOneByUserId(ctx.from.id);
        if (!user) return;
        
        const pendingEvaluations = await this.pendingEvaluationService.getPendingEvaluations(user._id);
        const pendingEvaluation = pendingEvaluations.find(evaluation => evaluation.operation.toString() === operationId);
        
        if (pendingEvaluation) {
          const evaluatedUser = await this.usersService.findById(pendingEvaluation.target.toString());
          if (evaluatedUser) {
            await this.finalizeEvaluation(ctx, operationId, starRating, {
              id: evaluatedUser.userId,
              username: evaluatedUser.userName,
              first_name: evaluatedUser.firstName
            }, `Avaliação ${starRating} estrelas via sistema P2P`);
          }
        }
      }
     }

     private async processSuggestionCallback(ctx: any, data: string): Promise<boolean> {
       try {
         if (data.startsWith('eval_suggestion_')) {
           // Processar sugestão selecionada: eval_suggestion_5_0_operationId
           const parts = data.replace('eval_suggestion_', '').split('_');
           const starRating = parseInt(parts[0]);
           const suggestionIndex = parseInt(parts[1]);
           const operationId = parts.slice(2).join('_');
           
           // Recuperar sugestões armazenadas
           const suggestions = this.tempSuggestions.get(`${operationId}_${starRating}`);
           if (!suggestions || !suggestions[suggestionIndex]) {
             await ctx.answerCbQuery('❌ Sugestão não encontrada', { show_alert: true });
             return true;
           }
           
           const selectedComment = suggestions[suggestionIndex];
           
           // Finalizar avaliação com comentário selecionado
           // Buscar usuário no banco para obter o ObjectId correto
           const telegramUserId = ctx.from.id;
           const user = await this.usersService.findOneByUserId(telegramUserId);
           if (!user) {
             this.logger.error(`Usuário não encontrado para Telegram ID: ${telegramUserId}`);
             await ctx.answerCbQuery('❌ Usuário não encontrado', { show_alert: true });
             return true;
           }
           
           const userId = user._id;
           const pendingEvaluations = await this.pendingEvaluationService.getPendingEvaluations(userId);
           const pendingEvaluation = pendingEvaluations.find(evaluation => evaluation.operation.toString() === operationId);
           
           if (!pendingEvaluation) {
             await ctx.answerCbQuery('❌ Avaliação não encontrada', { show_alert: true });
             return true;
           }
           
           const evaluatedUser = await this.usersService.findById(pendingEvaluation.target.toString());
           if (!evaluatedUser) {
             await ctx.answerCbQuery('❌ Usuário não encontrado', { show_alert: true });
             return true;
           }
           
           await this.finalizeEvaluation(ctx, operationId, starRating, {
             id: evaluatedUser.userId,
             username: evaluatedUser.userName,
             first_name: evaluatedUser.firstName
           }, selectedComment);
           
           // Limpar sugestões temporárias
           this.tempSuggestions.delete(`${operationId}_${starRating}`);
           
         } else if (data.startsWith('eval_custom_')) {
           // Processar comentário personalizado: eval_custom_5_operationId
           const parts = data.replace('eval_custom_', '').split('_');
           const starRating = parseInt(parts[0]);
           const operationId = parts.slice(1).join('_');
           
           // Mostrar mensagem pedindo para digitar comentário
           await ctx.editMessageText(
             `✍️ **Comentário Personalizado**\n\n` +
             `Digite seu comentário sobre a experiência:\n\n` +
             `💡 **Dica:** Seja específico e construtivo em seu feedback.`,
             { parse_mode: 'Markdown' }
           );
           
           // Armazenar dados para captura de comentário personalizado
           this.pendingCustomComments.set(ctx.from.id.toString(), {
             operationId,
             starRating,
             userId: ctx.from.id.toString()
           });
           
           await ctx.answerCbQuery('✍️ Digite seu comentário personalizado...');
         }
       
       return true;
       
     } catch (error) {
       this.logger.error('Erro ao processar callback de sugestão:', error);
       await ctx.answerCbQuery('❌ Erro ao processar sugestão', { show_alert: true });
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
      
      // Validar ID da operação
      if (!Types.ObjectId.isValid(operationId)) {
        await ctx.answerCbQuery('❌ ID de operação inválido', { show_alert: true });
        return true;
      }
      
      const user = await this.usersService.findOneByUserId(ctx.from.id);
      if (!user) {
        await ctx.answerCbQuery('❌ Usuário não encontrado', { show_alert: true });
        return true;
      }
      
      const userId = user._id;
      const operationObjectId = new Types.ObjectId(operationId);
      
      // Verificar se há avaliações pendentes
      const hasPendingEvaluations = await this.pendingEvaluationService.hasPendingEvaluations(userId);
      
      if (!hasPendingEvaluations) {
        await ctx.answerCbQuery('❌ Não há avaliações pendentes', { show_alert: true });
        return true;
      }
      
      // Buscar dados da avaliação pendente
      const pendingEvaluations = await this.pendingEvaluationService.getPendingEvaluations(userId);
      const pendingEvaluation = pendingEvaluations.find(evaluation => evaluation.operation.toString() === operationId);
      
      if (!pendingEvaluation) {
        await ctx.answerCbQuery('❌ Avaliação não encontrada', { show_alert: true });
        return true;
      }
      
      const pontos = isPositive ? 2 : -1;
      const starRating = isPositive ? 5 : 1; // Converter para sistema de estrelas
      const comentario = 'Avaliação via sistema P2P';
      
      // Buscar usuário avaliado
      const evaluatedUser = await this.usersService.findById(pendingEvaluation.target.toString());
      if (!evaluatedUser) {
        await ctx.answerCbQuery('❌ Usuário não encontrado', { show_alert: true });
        return true;
      }
      
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
      
      const chatId = ctx.chat?.id || ctx.message?.chat?.id;
      if (!chatId) {
        await ctx.answerCbQuery('❌ Chat não encontrado', { show_alert: true });
        return true;
      }
      
      // Registrar avaliação
      await this.karmaService.registerStarEvaluation(
        evaluator,
        evaluated,
        { id: chatId },
        starRating,
        comentario
      );
      
      // Marcar avaliação como concluída
      await this.pendingEvaluationService.completePendingEvaluation(
        operationObjectId,
        userId
      );
      
      const emoji = isPositive ? '👍' : '👎';
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
      
      await ctx.answerCbQuery(`✅ Avaliação ${tipoText.toLowerCase()} registrada!`);
      
      this.logger.log(`✅ Avaliação ${tipoText.toLowerCase()} registrada para operação ${operationId}`);
      
      // Enviar notificação para o usuário avaliado
      await this.sendEvaluationNotification(
        evaluated.id,
        evaluator,
        starRating,
        comentario
      );
      
      return true;
      
    } catch (error) {
      this.logger.error('Erro ao processar avaliação:', error);
      await ctx.answerCbQuery('❌ Erro ao processar avaliação', { show_alert: true });
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
      const starEmojis = '⭐'.repeat(starRating);
      const ratingText = this.getStarRatingText(starRating);
      const evaluatorName = evaluator.username ? `@${evaluator.username}` : evaluator.first_name;
      
      // Buscar dados do usuário avaliado para obter sua reputação atual
      const evaluatedUser = await this.usersService.findOneByUserId(evaluatedUserId);
      if (!evaluatedUser) {
        this.logger.warn(`Usuário avaliado não encontrado: ${evaluatedUserId}`);
        return;
      }
      
      // Buscar karma atual do usuário (assumindo que temos o chatId do contexto)
      // Para notificação, vamos usar um valor genérico ou buscar de outra forma
      let currentScore = 0;
      let reputationInfo = { icone: '🌱', nivel: 'Iniciante' };
      
      try {
        // Aqui seria ideal ter o chatId, mas para notificação vamos simplificar
        // const karmaData = await this.karmaService.getKarmaForUser(evaluatedUserId, chatId);
        // currentScore = karmaData?.karma || 0;
        // reputationInfo = getReputationInfo(currentScore);
      } catch (error) {
        this.logger.warn('Erro ao buscar karma para notificação:', error);
      }
      
      const starDistribution = starRating >= 4 ? '\n\n⭐ Sua reputação está crescendo!' : '';
      
      const notificationMessage = 
        `🎉 **Nova Avaliação Recebida!**\n\n` +
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
              text: '📊 Ver Minha Reputação',
              callback_data: 'view_reputation'
            }
          ]
        ]
      };
      
      await this.bot.telegram.sendMessage(
        evaluatedUserId,
        notificationMessage,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
      
    } catch (error) {
      this.logger.error('Erro ao enviar notificação de avaliação:', error);
      // Não falhar o processo principal por causa da notificação
    }
  }
 
   private async processCustomComment(ctx: TextCommandContext, pendingData: { operationId: string, starRating: number, userId: string }, customComment: string): Promise<void> {
      try {
        const { operationId, starRating } = pendingData;
        
        this.logger.log(`🔄 [DEBUG] Iniciando processamento de comentário personalizado: operação=${operationId}, estrelas=${starRating}, comentário="${customComment}"`);
        
        // Remover dos comentários pendentes
        this.pendingCustomComments.delete(ctx.from.id.toString());
        this.logger.log(`🗑️ [DEBUG] Comentário pendente removido para usuário: ${ctx.from.id}`);
       
       // Buscar usuário no banco para obter o ObjectId correto
         const telegramUserId = ctx.from.id;
         const user = await this.usersService.findOneByUserId(telegramUserId);
         if (!user) {
           await ctx.reply('❌ Usuário não encontrado.');
           return;
         }
         
         // Validar operationId antes de usar
         if (!Types.ObjectId.isValid(operationId)) {
           this.logger.error(`ID de operação inválido: ${operationId}`);
           await ctx.reply('❌ ID de operação inválido.');
           return;
         }
         
         // Buscar dados da avaliação pendente
         const userId = user._id;
         const pendingEvaluations = await this.pendingEvaluationService.getPendingEvaluations(userId);
         const pendingEvaluation = pendingEvaluations.find(evaluation => evaluation.operation.toString() === operationId);
       
       if (!pendingEvaluation) {
         await ctx.reply('❌ Avaliação não encontrada ou já processada.');
         return;
       }
       
       const evaluatedUser = await this.usersService.findById(pendingEvaluation.target.toString());
       if (!evaluatedUser) {
         await ctx.reply('❌ Usuário não encontrado.');
         return;
       }
       
       // Finalizar avaliação com comentário personalizado
       await this.finalizeEvaluationFromText(ctx, operationId, starRating, {
         id: evaluatedUser.userId,
         username: evaluatedUser.userName,
         first_name: evaluatedUser.firstName
       }, customComment);
       
     } catch (error) {
       this.logger.error('Erro ao processar comentário personalizado:', error);
       await ctx.reply('❌ Erro ao processar comentário. Tente novamente.');
       
       // Remover dos comentários pendentes em caso de erro
       this.pendingCustomComments.delete(ctx.from.id.toString());
     }
   }
 
   private async finalizeEvaluationFromText(ctx: TextCommandContext, operationId: string, starRating: number, evaluated: any, comentario: string): Promise<void> {
      try {
        // Buscar usuário no banco para obter o ObjectId correto
        const telegramUserId = ctx.from.id;
        const user = await this.usersService.findOneByUserId(telegramUserId);
        if (!user) {
          await ctx.reply('❌ Usuário não encontrado.');
          return;
        }
        
        // Validar operationId antes de usar
         if (!Types.ObjectId.isValid(operationId)) {
           this.logger.error(`ID de operação inválido: ${operationId}`);
           await ctx.reply('❌ ID de operação inválido.');
           return;
         }
         
         const userId = user._id;
         const operationObjectId = new Types.ObjectId(operationId);
         const chatId = ctx.chat.id;
       
       const evaluator = {
         id: ctx.from.id,
         username: ctx.from.username,
         first_name: ctx.from.first_name
       };
       
       // Registrar avaliação
       await this.karmaService.registerStarEvaluation(
         evaluator,
         evaluated,
         { id: chatId },
         starRating,
         comentario
       );
       
       // Marcar avaliação como concluída
       await this.pendingEvaluationService.completePendingEvaluation(
         operationObjectId,
         userId
       );
       
       const starEmojis = '⭐'.repeat(starRating);
       const ratingText = this.getStarRatingText(starRating);
       const nomeAvaliado = evaluated.username ? `@${evaluated.username}` : evaluated.first_name;
       
       await ctx.reply(
         `${starEmojis} **Avaliação ${ratingText} Registrada**\n\n` +
         `✅ **Usuário**: ${nomeAvaliado}\n` +
         `⭐ **Avaliação**: ${starRating} estrelas\n` +
         `💬 **Comentário**: ${comentario}\n\n` +
         `🎯 Avaliação P2P concluída com sucesso!`,
         { parse_mode: 'Markdown' }
       );
       
       this.logger.log(`✅ Avaliação ${starRating} estrelas registrada para operação ${operationId}`);
       
       // Enviar notificação para o usuário avaliado
       await this.sendEvaluationNotification(
         evaluated.id,
         evaluator,
         starRating,
         comentario
       );
       
     } catch (error) {
       this.logger.error('❌ Erro ao finalizar avaliação:', error);
       await ctx.reply('❌ Erro ao processar avaliação. Tente novamente.');
     }
   }
 }
