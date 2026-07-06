import { Injectable, Logger } from '@nestjs/common';
import { safeEditMessageText } from '../../shared/callback.utils';
import { Types } from 'mongoose';
import { KarmaService } from '../../../karma/karma.service';
import { UsersService } from '../../../users/users.service';
import { PendingEvaluationService } from '../../../operations/pending-evaluation.service';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import { TermsAcceptanceService } from '../../../users/terms-acceptance.service';
import { RateLimiterService } from '../../../shared/rate-limiter.service';
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { getReputationInfo } from '../../../shared/reputation.utils';
import { validateUserTermsForCallback } from '../../../shared/terms-validation.utils';
import { convertStarsToKarma } from '../../../shared/karma-config.utils';
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
    private readonly termsAcceptanceService: TermsAcceptanceService,
    private readonly rateLimiterService: RateLimiterService,
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
        '❌ Você deve responder a uma mensagem do usuário que deseja avaliar.'
      );
      return;
    }

    const targetUser = ctx.message.reply_to_message.from;
    if (!targetUser || targetUser.is_bot) {
      await ctx.reply('❌ Não é possível avaliar bots ou usuários inválidos.');
      return;
    }

    // Rate limiting: 10 avaliações por hora
    const rateLimit = this.rateLimiterService.checkLimit(ctx.from.id, 'evaluate_user', {
      maxRequests: 10,
      windowMs: 60 * 60 * 1000, // 1 hora
    });

    if (!rateLimit.allowed) {
      const resetTime = this.rateLimiterService.formatResetTime(rateLimit.resetIn);
      await ctx.reply(
        `⏰ **Limite de Avaliações Atingido**\n\n` +
        `Você pode fazer no máximo **10 avaliações por hora**.\n\n` +
        `⏱️ **Tente novamente em:** ${resetTime}\n\n` +
        `💡 **Dica:** Avaliações de qualidade são mais importantes que quantidade!`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // SEGURANÇA (audit ALTO): só avaliar quem foi sua CONTRAPARTE numa operação CONCLUÍDA e ainda não avaliada.
    // Acha a pendência (evaluator=você, target=alvo, completed=false); aplica o karma PRIMEIRO e só CONSOME a
    // pendência DEPOIS do sucesso — MESMA ordem de finalizeEvaluation/processEvaluationCallback. Consumir antes
    // perderia a avaliação de vez se o karma falhasse (regressão pega na revisão pré-deploy).
    const [evaluatorDoc, targetDoc] = await Promise.all([
      this.usersService.findOrCreate(ctx.from),
      this.usersService.findOrCreate(targetUser),
    ]);
    const pendings = await this.pendingEvaluationService.getPendingEvaluations(evaluatorDoc._id);
    const pending = pendings.find((p) => String(p.target) === String(targetDoc._id));
    if (!pending) {
      await ctx.reply('❌ Você só pode avaliar quem foi sua contraparte numa operação concluída — e que ainda não avaliou.');
      return;
    }

    // RESERVA atômica → karma → reverte em falha (choke point único: anti dupla-contagem e anti perda de avaliação).
    const outcome = await this.applyEvaluationAtomically(
      pending.operation,
      evaluatorDoc._id,
      () => this.karmaService.registerEvaluation(ctx.from, targetUser, ctx.chat, pontos, comentario),
    );
    if (outcome === 'already') {
      await ctx.reply('❌ Esta avaliação já foi registrada.');
      return;
    }
    if (outcome === 'error') {
      await ctx.reply('❌ Erro ao registrar avaliação. Tente novamente.');
      return;
    }

    // Mostrar quantas avaliações restam
    const remaining = rateLimit.remaining;
    const limitInfo = remaining > 0
      ? `\n💫 **Você ainda pode fazer ${remaining} avaliação${remaining !== 1 ? 'ões' : ''} nesta hora.**`
      : '';

    await ctx.reply(
      `✅ Avaliação registrada: ${pontos} estrelas para @${targetUser.username || targetUser.first_name}${limitInfo}`,
      { parse_mode: 'Markdown' }
    );
  }

  async handleCallback(ctx: any): Promise<boolean> {
    const data = ctx.callbackQuery?.data;
    this.logger.log(`🔍 [DEBUG] AvaliarCommandHandler.handleCallback chamado com data: ${data}`);
    
    if (!data) {
      this.logger.warn(`⚠️ [DEBUG] Callback data está vazio ou undefined`);
      return false;
    }

    if (data.startsWith('eval_star_')) {
      this.logger.log(`⭐ [DEBUG] Processando callback de estrelas: ${data}`);
      return await this.processStarEvaluationCallback(ctx, data);
    } else if (data.startsWith('eval_comment_')) {
      this.logger.log(`💬 [DEBUG] Processando callback de comentário: ${data}`);
      return await this.processCommentCallback(ctx, data);
    } else if (data.startsWith('eval_suggestion_') || data.startsWith('eval_custom_')) {
      this.logger.log(`💡 [DEBUG] Processando callback de sugestão: ${data}`);
      return await this.processSuggestionCallback(ctx, data);
    } else if (data.startsWith('eval_')) {
      this.logger.log(`📝 [DEBUG] Processando callback de avaliação: ${data}`);
      return await this.processEvaluationCallback(ctx, data);
    }

    this.logger.log(`❌ [DEBUG] Callback não reconhecido pelo AvaliarCommandHandler: ${data}`);
    return false;
  }

  private async processStarEvaluationCallback(ctx: any, data: string): Promise<boolean> {
    try {
      // ✅ VALIDAÇÃO CRÍTICA: Verificar se usuário aceitou os termos ANTES de avaliar
      const hasValidTerms = await validateUserTermsForCallback(ctx, this.termsAcceptanceService, 'avaliar');
      if (!hasValidTerms) {
        this.logger.warn(`❌ AVALIAÇÃO BLOQUEADA - Usuário ${ctx.from.id} não aceitou os termos`);
        return true; // validateUserTermsForCallback já envia o popup
      }

      // Extrair dados do callback
      const parts = data.replace('eval_star_', '').split('_');
      const starRating = parseInt(parts[0]);
      const operationId = parts[1];
      
      this.logger.log(`📞 Processando avaliação ${starRating} estrelas para operação: ${operationId}`);
      
      // Validar ID da operação
      if (!Types.ObjectId.isValid(operationId)) {
        try {
          await ctx.answerCbQuery('❌ ID de operação inválido', { show_alert: true });
        } catch (cbError: any) {
          if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
            this.logger.warn('Callback query expirado - ID inválido:', cbError.description);
          } else {
            this.logger.error('Erro ao responder callback - ID inválido:', cbError);
          }
        }
        return true;
      }
      
      // Buscar usuário
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
            this.logger.warn('Callback query expirado - sem avaliações:', cbError.description);
          } else {
            this.logger.error('Erro ao responder callback - sem avaliações:', cbError);
          }
        }
        return true;
      }
      
      // Buscar avaliações pendentes específicas
      const pendingEvaluations = await this.pendingEvaluationService.getPendingEvaluations(userId);
      const pendingEvaluation = pendingEvaluations.find(evaluation => evaluation.operation.toString() === operationId);
      
      if (!pendingEvaluation) {
        try {
          await ctx.answerCbQuery('❌ Avaliação não encontrada ou já processada', { show_alert: true });
        } catch (cbError: any) {
          if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
            this.logger.warn('Callback query expirado - não encontrada:', cbError.description);
          } else {
            this.logger.error('Erro ao responder callback - não encontrada:', cbError);
          }
        }
        return true;
      }
      
      // Buscar usuário avaliado
      const evaluatedUser = await this.usersService.findById(pendingEvaluation.target.toString());
      if (!evaluatedUser) {
        await ctx.answerCbQuery('❌ Usuário avaliado não encontrado', { show_alert: true });
        return true;
      }
      
      const evaluated = {
        id: evaluatedUser.userId,
        username: evaluatedUser.userName,
        first_name: evaluatedUser.firstName
      };
      
      // Ir direto para sugestões de comentário (unificando as telas)
       await this.showCommentSuggestions(ctx, operationId, starRating);
      return true;
    } catch (error) {
      this.logger.error('❌ Erro ao processar seleção de estrelas:', error);
      
      try {
        await ctx.answerCbQuery('❌ Erro ao processar seleção', { show_alert: true });
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado - erro:', cbError.description);
        } else {
          this.logger.error('Erro ao responder callback - erro:', cbError);
        }
      }
      
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
            }
          ],
          [
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
       // Fallback: finalizar sem comentário
       await this.finalizeEvaluation(ctx, operationId, starRating, evaluated, `Avaliação ${starRating} estrelas via sistema P2P`);
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

  /**
   * Aplica uma avaliação à prova de corrida (audit HIGH — anti dupla-contagem de karma).
   * 1) RESERVA a pendência via completePendingEvaluation: findOneAndUpdate atômico {completed:false}→{completed:true}.
   *    Só UMA execução concorrente vence (double-tap no botão inline, /avaliar + callback simultâneos); as demais
   *    recebem NotFoundException e retornam 'already' SEM aplicar karma. Atomicidade de doc único vale em Mongo standalone.
   * 2) Aplica o karma. Se falhar, REVERTE a reserva (reopenPendingEvaluation) para o usuário poder tentar de novo —
   *    senão a avaliação legítima se perderia.
   * Cobre os 4 fluxos de avaliação por CONTRAPARTE (comando + callbacks). A auto-avaliação por timeout reserva por
   *    conta própria (sem karma). Revisão via botão (eval_review_) e ajustes de admin gravam karma por caminhos
   *    próprios, FORA deste choke point — superfície residual conhecida.
   * LIMITAÇÃO (audit MEDIUM): registerEvaluation faz 2 gravações não-transacionais (Mongo standalone não tem
   *    transação multi-doc). Falha ENTRE elas + retry pode inflar o givenKarma do avaliador (contador, não a
   *    reputação do alvo). Aceito: reverter e permitir retry é melhor que perder a avaliação legítima.
   */
  private async applyEvaluationAtomically(
    operationId: Types.ObjectId,
    evaluatorId: Types.ObjectId,
    applyKarma: () => Promise<unknown>,
  ): Promise<'ok' | 'already' | 'error'> {
    try {
      await this.pendingEvaluationService.completePendingEvaluation(operationId, evaluatorId);
    } catch {
      return 'already'; // pendência já reservada por chamada concorrente / retry → não aplicar karma
    }
    try {
      await applyKarma();
      return 'ok';
    } catch (err) {
      this.logger.error('Erro ao aplicar karma; revertendo reserva da pendência:', err);
      try {
        await this.pendingEvaluationService.reopenPendingEvaluation(operationId, evaluatorId);
      } catch (revertErr) {
        this.logger.error('Falha ao reverter pendência após erro de karma:', revertErr);
      }
      return 'error';
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
        // RESERVA atômica → karma → reverte em falha (anti dupla-contagem: double-tap no botão / corrida com /avaliar)
        const outcome = await this.applyEvaluationAtomically(
          operationObjectId,
          userId,
          () => this.karmaService.registerStarEvaluation(evaluator, evaluated, { id: chatId }, starRating, comentario),
        );
        if (outcome === 'already') {
          try { await ctx.answerCbQuery('❌ Esta avaliação já foi registrada.', { show_alert: true }); } catch {}
          return;
        }
        if (outcome === 'error') {
          try { await ctx.answerCbQuery('❌ Erro ao registrar avaliação. Tente novamente.', { show_alert: true }); } catch {}
          return;
        }

        this.logger.log(`✅ Avaliação registrada com sucesso.`);

        const starEmojis = '⭐'.repeat(starRating);
        const ratingText = this.getStarRatingText(starRating);
        const nomeAvaliado = evaluated.username ? `@${evaluated.username}` : evaluated.first_name;
        
        this.logger.log(`📤 Enviando mensagem de confirmação...`);
        
        // NÃO-FATAL: o karma JÁ foi aplicado (outcome 'ok'). Se a edição de confirmação
        // falhar (msg antiga/não editável), NÃO cair no catch que mostra "Erro ao Processar
        // Avaliação" — seria um falso negativo sobre uma avaliação que deu certo.
        await safeEditMessageText(ctx,
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
        
        // Buscar dados do usuário avaliado para o cabeçalho
        let headerInfo = '';
        try {
          const user = await this.usersService.findOneByUserId(ctx.from.id);
          if (user) {
            const pendingEvaluations = await this.pendingEvaluationService.getPendingEvaluations(user._id);
            const pendingEvaluation = pendingEvaluations.find(evaluation => evaluation.operation.toString() === operationId);
            
            if (pendingEvaluation) {
              const evaluatedUser = await this.usersService.findById(pendingEvaluation.target.toString());
              if (evaluatedUser) {
                const nomeAvaliado = evaluatedUser.userName ? `@${evaluatedUser.userName}` : evaluatedUser.firstName;
                
                // Buscar reputação
                const chatId = ctx.chat?.id || ctx.message?.chat?.id;
                if (chatId) {
                  const karmaData = await this.karmaService.getKarmaForUser(evaluatedUser.userId, chatId);
                  if (karmaData && karmaData.karma !== undefined) {
                    const reputation = getReputationInfo(karmaData.karma);
                    headerInfo = `👤 **Avaliando:** ${nomeAvaliado}\n📊 **Reputação Atual:** ${reputation.icone} ${reputation.nivel} (${karmaData.karma} pts)\n\n`;
                  } else {
                    headerInfo = `👤 **Avaliando:** ${nomeAvaliado}\n\n`;
                  }
                }
              }
            }
          }
        } catch (error) {
          this.logger.warn('Erro ao buscar informações do cabeçalho:', error);
        }
        
        // Sugestões baseadas na avaliação
        let suggestions: string[] = [];
        
        switch (starRating) {
          case 5:
            suggestions = [
              'Excelente negociação! Muito confiável.',
              'Transação perfeita, recomendo!',
              'Pessoa séria e pontual.',
              'Comunicação clara e rápida.'
            ];
            break;
          case 4:
            suggestions = [
              'Boa experiência, recomendo.',
              'Transação tranquila.',
              'Pessoa confiável.',
              'Tudo ocorreu bem.'
            ];
            break;
          case 3:
            suggestions = [
              'Experiência regular.',
              'Transação ok, sem problemas.',
              'Atendeu as expectativas.',
              'Negociação normal.'
            ];
            break;
          case 2:
            suggestions = [
              'Experiência abaixo do esperado.',
              'Alguns problemas na comunicação.',
              'Transação demorada.',
              'Poderia ter sido melhor.'
            ];
            break;
          case 1:
            suggestions = [
              'Experiência ruim.',
              'Problemas na transação.',
              'Comunicação deficiente.',
              'Não recomendo.'
            ];
            break;
        }
        
        const message = (
          `${starEmojis} **Avaliação ${ratingText}**\n\n` +
          `${headerInfo}` +
          `💭 **Escolha um comentário ou escreva o seu:**\n\n` +
          `Selecione uma das sugestões abaixo ou digite seu próprio comentário:`
        );
        
        // Criar botões com sugestões
        const keyboard = {
          inline_keyboard: [
            ...suggestions.map((suggestion, index) => [{
              text: `💬 ${suggestion}`,
              callback_data: `eval_suggestion_${starRating}_${index}_${operationId}`
            }]),
            [
              {
                text: '✍️ Escrever Próprio',
                callback_data: `eval_custom_${starRating}_${operationId}`
              }
            ],
            [
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
        
        // Armazenar sugestões temporariamente para uso posterior
        this.tempSuggestions = this.tempSuggestions || new Map();
        this.tempSuggestions.set(`${operationId}_${starRating}`, suggestions);
        
      } catch (error) {
        this.logger.error('Erro ao mostrar sugestões de comentário:', error);
        // Fallback: finalizar sem comentário
        const user = await this.usersService.findOneByUserId(ctx.from.id);
        if (!user) {
          this.logger.error('Usuário não encontrado para fallback');
          return;
        }
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

           // Usar sugestões fixas baseadas no rating (não depende de memória)
           const suggestions = this.getSuggestionsForRating(starRating);
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
      
      const pendingEvaluations = await this.pendingEvaluationService.getPendingEvaluations(userId);
      const pendingEvaluation = pendingEvaluations.find(evaluation => evaluation.operation.toString() === operationId);

      if (!pendingEvaluation) {
        await ctx.answerCbQuery('❌ Avaliação não encontrada', { show_alert: true });
        return true;
      }
      
      const starRating = isPositive ? 5 : 1; // Converter para sistema de estrelas
      const comentario = 'Avaliação via sistema P2P';
      
      // Calcular pontos baseado na conversão correta de estrelas
      const pontos = convertStarsToKarma(starRating);
      
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
      
      // Registrar avaliação
      const chatId = ctx.chat?.id || -1002907400287; // ID do grupo principal como fallback
      
      // RESERVA atômica → karma → reverte em falha (anti dupla-contagem: double-tap no botão / corrida com /avaliar)
      const outcome = await this.applyEvaluationAtomically(
        operationObjectId,
        userId,
        () => this.karmaService.registerEvaluation(evaluator, evaluated, { id: chatId }, pontos, comentario),
      );
      if (outcome === 'already') {
        try { await ctx.answerCbQuery('❌ Esta avaliação já foi registrada.', { show_alert: true }); } catch {}
        return true;
      }
      if (outcome === 'error') {
        try { await ctx.answerCbQuery('❌ Erro ao registrar avaliação. Tente novamente.', { show_alert: true }); } catch {}
        return true;
      }
      
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
      this.logger.error('❌ Erro ao processar avaliação:', error);
      
      try {
        await ctx.answerCbQuery('❌ Erro ao processar avaliação', { show_alert: true });
      } catch (cbError) {
        this.logger.error('Erro ao responder callback de erro:', cbError);
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
      // Buscar dados de karma do usuário avaliado APÓS a avaliação ser registrada
      const evaluatedUser = await this.usersService.findOneByUserId(evaluatedUserId);
      if (!evaluatedUser) {
        this.logger.warn(`Usuário ${evaluatedUserId} não encontrado para notificação`);
        return;
      }
      
      // Buscar karma atualizado após a avaliação
      const karmaDoc = await this.karmaService.getTotalKarmaForUser(evaluatedUser.userName || evaluatedUser.firstName);
      
      const evaluatorName = evaluator.username ? `@${evaluator.username}` : evaluator.first_name;
      const starEmojis = '⭐'.repeat(starRating);
      const ratingText = this.getStarRatingText(starRating);
      
      // Calcular pontuação atual (APÓS a avaliação)
      let currentScore = 0;
      let starDistribution = '';
      
      if (karmaDoc && karmaDoc.totalKarma !== undefined) {
        currentScore = karmaDoc.totalKarma;
        
        // Para distribuição de estrelas, precisamos buscar dados específicos do grupo
        // Por enquanto, mostrar apenas a pontuação total
        starDistribution = '';
      }
      
      // Obter informações de reputação baseadas na pontuação ATUALIZADA
      const reputationInfo = getReputationInfo({ karma: currentScore });
      
      const notificationMessage = 
        `🎉 **Você Recebeu uma Nova Avaliação!**\n\n` +
        `👤 **De:** ${evaluatorName}\n` +
        `${starEmojis} **Avaliação:** ${ratingText}\n` +
        `💬 **Comentário:** "${comment}"\n\n` +
        `${reputationInfo.icone} **Nível:** ${reputationInfo.nivel}\n` +
        `⭐️ **Sua Pontuação Atual:** ${currentScore} pts${starDistribution}\n\n` +
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
      // RESERVA atômica → karma → reverte em falha (anti dupla-contagem: double-tap / corrida com callback)
      const outcome = await this.applyEvaluationAtomically(
        operationObjectId,
        userId,
        () => this.karmaService.registerStarEvaluation(evaluator, evaluated, { id: chatId }, starRating, comentario),
      );
      if (outcome === 'already') {
        await ctx.reply('❌ Esta avaliação já foi registrada.');
        return;
      }
      if (outcome === 'error') {
        await ctx.reply('❌ Erro ao registrar avaliação. Tente novamente.');
        return;
      }
      
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

  // Método para processar entrada de texto (comentários personalizados)
  async handleTextInput(ctx: TextCommandContext): Promise<void> {
    try {
      const userId = ctx.from.id.toString();
      const pendingData = this.pendingCustomComments.get(userId);
      
      if (!pendingData) {
        // Não há comentário personalizado pendente para este usuário
        return;
      }
      
      const customComment = ctx.message.text.trim();
      
      // Validar comentário
      if (customComment.length === 0) {
        await ctx.reply('❌ Comentário não pode estar vazio. Digite um comentário válido:');
        return;
      }
      
      if (customComment.length > 500) {
        await ctx.reply('❌ Comentário muito longo. Máximo 500 caracteres. Digite um comentário mais curto:');
        return;
      }
      
      this.logger.log(`💬 [DEBUG] Processando comentário personalizado: "${customComment}"`);
      
      // Processar o comentário personalizado
      await this.processCustomComment(ctx, pendingData, customComment);
      
    } catch (error) {
      this.logger.error('❌ Erro ao processar entrada de texto (comentário personalizado):', error);
      await ctx.reply('❌ Erro ao processar comentário. Tente novamente.');
    }
  }

  // Método para verificar se há sessão ativa (comentário personalizado pendente)
  hasActiveSession(sessionKey: string): boolean {
    const userId = sessionKey.split('_')[0];
    return this.pendingCustomComments.has(userId);
  }

  // Retorna sugestões fixas de comentários baseado no rating (não depende de memória)
  private getSuggestionsForRating(starRating: number): string[] {
    switch (starRating) {
      case 5:
        return [
          'Excelente negociação! Muito confiável.',
          'Transação perfeita, recomendo!',
          'Pessoa séria e pontual.',
          'Comunicação clara e rápida.'
        ];
      case 4:
        return [
          'Boa experiência, recomendo.',
          'Transação tranquila.',
          'Pessoa confiável.',
          'Tudo ocorreu bem.'
        ];
      case 3:
        return [
          'Experiência regular.',
          'Transação ok, sem problemas.',
          'Atendeu as expectativas.',
          'Negociação normal.'
        ];
      case 2:
        return [
          'Experiência abaixo do esperado.',
          'Alguns problemas na comunicação.',
          'Transação demorada.',
          'Poderia ter sido melhor.'
        ];
      case 1:
        return [
          'Experiência ruim.',
          'Problemas na transação.',
          'Comunicação deficiente.',
          'Não recomendo.'
        ];
      default:
        return [];
    }
  }
}