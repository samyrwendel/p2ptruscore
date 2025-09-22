import { Injectable, Logger } from '@nestjs/common';
import { ITextCommandHandler, TextCommandContext } from '../../telegram.types';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import { KarmaService } from '../../../karma/karma.service';
import { UsersService } from '../../../users/users.service';
import { TermsAcceptanceService } from '../../../users/terms-acceptance.service';
import { getReputationInfo } from '../../../shared/reputation.utils';

@Injectable()
export class StartCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(StartCommandHandler.name);
  command = /^\/start(?:@\w+)?(?:\s+(.+))?$/;

  constructor(
    private readonly keyboardService: TelegramKeyboardService,
    private readonly karmaService: KarmaService,
    private readonly usersService: UsersService,
    private readonly termsAcceptanceService: TermsAcceptanceService,
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
        // Buscar histórico de qualquer grupo onde o usuário tenha dados
        let karmaWithHistory = await this.karmaService.getKarmaForUser(user.userId, -1002907400287);
        
        // Se não encontrar no grupo principal, buscar em qualquer grupo
         if (!karmaWithHistory || (!karmaWithHistory.history && (!karmaWithHistory.stars5 && !karmaWithHistory.stars4 && !karmaWithHistory.stars3 && !karmaWithHistory.stars2 && !karmaWithHistory.stars1))) {
           // Buscar todos os grupos onde o usuário tem karma usando o UsersService
           const userGroups = await this.karmaService.getGroupsForUser(user.userId);
           if (userGroups && userGroups.length > 0) {
             // Tentar buscar karma em cada grupo até encontrar um com histórico
             for (const group of userGroups) {
               const groupKarma = await this.karmaService.getKarmaForUser(user.userId, group.groupId);
               if (groupKarma && (groupKarma.history?.length > 0 || groupKarma.stars5 > 0)) {
                 karmaWithHistory = groupKarma;
                 break;
               }
             }
           }
         }
        
        // Simular estrutura de karma do grupo para compatibilidade
        return {
          karma: totalKarma.totalKarma,
          givenKarma: totalKarma.totalGiven,
          givenHate: totalKarma.totalHate,
          user: totalKarma.user,
          history: karmaWithHistory?.history || [],
          stars5: karmaWithHistory?.stars5 || 0,
          stars4: karmaWithHistory?.stars4 || 0,
          stars3: karmaWithHistory?.stars3 || 0,
          stars2: karmaWithHistory?.stars2 || 0,
          stars1: karmaWithHistory?.stars1 || 0
        };
      }
      
      return null;
    } catch (error) {
      console.error('Erro ao buscar karma com fallback:', error);
      return null;
    }
  }

  async handle(ctx: TextCommandContext): Promise<void> {
    // VERIFICAÇÃO PRIORITÁRIA: Se usuário não aceitou termos em grupos, apresentar termos primeiro
    if (ctx.chat.type !== 'private') {
      const hasAccepted = await this.termsAcceptanceService.hasUserAcceptedCurrentTerms(
        ctx.from.id,
        ctx.chat.id
      );

      if (!hasAccepted) {
        await this.presentTermsInStart(ctx);
        return;
      }
    }

    const match = ctx.message.text.match(this.command);
    const startParam = match?.[1];

    // Se há parâmetro de start e é relacionado à reputação
    if (startParam && startParam.startsWith('reputacao_')) {
      const userId = startParam.replace('reputacao_', '');
      
      try {
        let karmaData;
        let targetUser;
        
        // Verificar se userId é numérico (ID do Telegram) ou texto (nome/username)
        if (/^\d+$/.test(userId)) {
          // É um ID numérico, buscar usuário pelo ID primeiro
          const user = await this.usersService.findOneByUserId(parseInt(userId));
          if (!user) {
            // Verificar se estamos em um contexto de callback (refreshReputation)
            if (ctx.callbackQuery) {
              await ctx.answerCbQuery(`❌ Usuário não encontrado.`, { show_alert: true });
            } else {
              await ctx.reply(`❌ Usuário não encontrado.`);
            }
            return;
          }
          
          // Usar o nome de usuário ou firstName para buscar karma
          const userIdentifier = user.userName || user.firstName || userId;
          karmaData = await this.karmaService.getTotalKarmaForUser(userIdentifier);
          targetUser = user;
        } else {
          // É um nome/username, buscar diretamente
          karmaData = await this.karmaService.getTotalKarmaForUser(userId);
          if (!karmaData) {
            // Verificar se estamos em um contexto de callback (refreshReputation)
            if (ctx.callbackQuery) {
              await ctx.answerCbQuery(`❌ Usuário "${userId}" não encontrado.`, { show_alert: true });
            } else {
              await ctx.reply(`❌ Usuário "${userId}" não encontrado.`);
            }
            return;
          }
          targetUser = karmaData.user;
        }
        const karmaValue = karmaData.totalKarma;
        const avaliacoesPositivas = karmaData.totalGiven;
        const avaliacoesNegativas = karmaData.totalHate;

        // Determinar nível de confiança usando função utilitária
        const reputationInfo = getReputationInfo(karmaValue);
        const nivelConfianca = reputationInfo.nivel;
        const nivelIcon = reputationInfo.icone;

        const userName = targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName || 'Usuário';
        
        // Buscar histórico de avaliações do usuário
        const karmaDoc = await this.getKarmaForUserWithFallback(targetUser, ctx.chat.id);
        
        // Contadores de estrelas em formato de 2 colunas
        const stars5 = karmaDoc?.stars5 || 0;
        const stars4 = karmaDoc?.stars4 || 0;
        const stars3 = karmaDoc?.stars3 || 0;
        const stars2 = karmaDoc?.stars2 || 0;
        const stars1 = karmaDoc?.stars1 || 0;
        
        const starCounters = `5⭐️: ${stars5}      2⭐️: ${stars2}\n4⭐️: ${stars4}      1⭐️: ${stars1}\n3⭐️: ${stars3}`;
        
        let historyMessage = 'Nenhuma avaliação encontrada.';
        if (karmaDoc && karmaDoc.history && karmaDoc.history.length > 0) {
          const recentHistory = karmaDoc.history.slice(-10); // Últimas 10 avaliações
          historyMessage = recentHistory
            .reverse()
            .map((entry) => {
              let result = '';
              
              // Se tem starRating, mostrar estrelas
              if (entry.starRating) {
                const starEmojis = '⭐'.repeat(entry.starRating);
                const evaluatorName = entry.evaluatorName ? `@${entry.evaluatorName}` : 'Anônimo';
                result = `${starEmojis}: "${entry.comment || 'Sem comentário'}" - ${evaluatorName}`;
              } else {
                // Formato antigo (compatibilidade)
                const emoji = entry.karmaChange > 0 ? '👍' : '👎';
                const evaluatorName = entry.evaluatorName ? `@${entry.evaluatorName}` : 'Anônimo';
                result = `${emoji}: "${entry.comment || 'Avaliação P2P'}" - ${evaluatorName}`;
              }
              
              return result;
            })
            .join('\n\n');
        }
        
        const message = 
          `**Reputação P2P do Criador da Operação**\n` +
          `👤 **Usuário:** ${userName}\n\n` +
          `${nivelIcon} **Nível:** ${nivelConfianca}\n` +
          `⭐️ **Score Total:** ${karmaValue} pts\n\n` +
          `**Distribuição de Avaliações:**\n${starCounters}\n\n\n` +
          `📋 **Últimas 10 Avaliações Recebidas:**\n\n${historyMessage}`;
        
        // Criar botões de navegação melhorados
        const keyboard = {
          inline_keyboard: [
            [
              {
                text: '5⭐',
                callback_data: `reputation_filter_star_5_${targetUser.userId}`
              },
              {
                text: '4⭐',
                callback_data: `reputation_filter_star_4_${targetUser.userId}`
              },
              {
                text: '3⭐',
                callback_data: `reputation_filter_star_3_${targetUser.userId}`
              }
            ],
            [
              {
                text: '2⭐',
                callback_data: `reputation_filter_star_2_${targetUser.userId}`
              },
              {
                text: '1⭐',
                callback_data: `reputation_filter_star_1_${targetUser.userId}`
              },
              {
                text: '🔄️ Atualizar',
                callback_data: `reputation_refresh_${targetUser.userId}`
              }
            ],
            [
              {
                text: '❌',
                callback_data: `reputation_close_${targetUser.userId}`
              },
              {
                text: '➡️',
                callback_data: `reputation_more_${targetUser.userId}_10`
              }
            ]
          ]
        };
        
        await ctx.reply(message, { 
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        return;
        
      } catch (error) {
        this.logger.error('Erro ao buscar reputação via start:', error);
        await ctx.reply('❌ Erro ao buscar reputação. Tente novamente.');
        return;
      }
    }

    // Mensagem padrão de boas-vindas com botões principais
    const welcomeMessage = 
      '🎉 **Bem-vindo ao P2P Score Bot!**\n\n' +
      '🚀 **Principais funcionalidades:**\n' +
      '• 💰 Criar e gerenciar operações P2P\n' +
      '• ⭐ Ver reputação e histórico de usuários\n' +
      '• 📊 Avaliar transações e parceiros\n' +
      '• 💱 Consultar cotações atuais\n\n' +
      '👇 **Use os botões abaixo para navegar rapidamente:**';

    const mainCommandsKeyboard = {
      inline_keyboard: [
        [
          {
            text: '💰 Criar Operação',
            callback_data: 'start_create_operation'
          },
          {
            text: '📋 Minhas Operações',
            callback_data: 'start_my_operations'
          }
        ],
        [
          {
            text: '⭐ Minha Reputação',
            callback_data: 'start_my_reputation'
          },
          {
            text: '💱 Cotações',
            callback_data: 'start_quotes'
          }
        ],
        [
          {
            text: '📊 Ver Operações',
            callback_data: 'start_view_operations'
          },
          {
            text: '❓ Ajuda',
            callback_data: 'start_help'
          }
        ]
      ]
    };

    await ctx.reply(welcomeMessage, { 
      parse_mode: 'Markdown', 
      reply_markup: mainCommandsKeyboard 
    });
  }

  // Método para lidar com callbacks dos botões
  async handleCallback(ctx: any): Promise<boolean> {
    const data = ctx.callbackQuery.data;
    
    // Verificar se este callback pertence a este handler
    if (!data.startsWith('reputation_') && !data.startsWith('start_')) {
      return false;
    }
    
    // Handlers para botões do comando /start
    if (data.startsWith('start_')) {
      try {
        if (data === 'start_create_operation') {
          await ctx.answerCbQuery('💰 Criando operação...');
          await ctx.editMessageText(
            '💰 **Para criar uma operação P2P:**\n\n' +
            'Digite o comando: `/criaroperacao`\n\n' +
            'Ou use o comando diretamente no chat!',
            { parse_mode: 'Markdown' }
          );
        } else if (data === 'start_my_operations') {
          await ctx.answerCbQuery('📋 Buscando suas operações...');
          await ctx.editMessageText(
            '📋 **Para ver suas operações:**\n\n' +
            'Digite o comando: `/minhasoperacoes`\n\n' +
            'Você verá todas as suas operações ativas!',
            { parse_mode: 'Markdown' }
          );
        } else if (data === 'start_my_reputation') {
          await ctx.answerCbQuery('⭐ Carregando sua reputação...');
          const userId = ctx.from.id;
          await ctx.editMessageText(
            '⭐ **Para ver sua reputação:**\n\n' +
            'Digite o comando: `/reputacao`\n\n' +
            'Ou clique no botão abaixo para ver agora:',
            { 
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[
                  {
                    text: '⭐ Ver Minha Reputação Agora',
                    callback_data: `reputation_main_${userId}`
                  }
                ]]
              }
            }
          );
        } else if (data === 'start_quotes') {
          await ctx.answerCbQuery('💱 Buscando cotações...');
          await ctx.editMessageText(
            '💱 **Para ver cotações atuais:**\n\n' +
            'Digite o comando: `/cotacoes`\n\n' +
            'Você verá as cotações de BTC, ETH, SOL, USD e EUR!',
            { parse_mode: 'Markdown' }
          );
        } else if (data === 'start_view_operations') {
          await ctx.answerCbQuery('📊 Carregando operações...');
          await ctx.editMessageText(
            '📊 **Para ver operações disponíveis:**\n\n' +
            'Digite o comando: `/operacoes`\n\n' +
            'Você verá todas as operações ativas do grupo!',
            { parse_mode: 'Markdown' }
          );
        } else if (data === 'start_help') {
          await ctx.answerCbQuery('❓ Carregando ajuda...');
          await ctx.editMessageText(
            '❓ **Para ver todos os comandos:**\n\n' +
            'Digite o comando: `/help` ou `/comandos`\n\n' +
            'Você verá a lista completa de comandos disponíveis!',
            { parse_mode: 'Markdown' }
          );
        }
        return true;
      } catch (error) {
        this.logger.error('Erro ao processar callback do start:', error);
        await ctx.answerCbQuery('❌ Erro ao processar ação', { show_alert: true });
        return true;
      }
    }
    
    try {
      if (data.startsWith('reputation_filter_star_')) {
        const parts = data.replace('reputation_filter_star_', '').split('_');
        const starRating = parts[0];
        const userId = parts[1];
        await this.showFilteredStarReviews(ctx, userId, parseInt(starRating));
      } else if (data.startsWith('reputation_filter_positive_')) {
        const userId = data.replace('reputation_filter_positive_', '');
        await this.showFilteredReviews(ctx, userId, 'positive');
      } else if (data.startsWith('reputation_filter_negative_')) {
        const userId = data.replace('reputation_filter_negative_', '');
        await this.showFilteredReviews(ctx, userId, 'negative');
      } else if (data.startsWith('reputation_more_')) {
        const parts = data.replace('reputation_more_', '').split('_');
        const userId = parts[0];
        const currentOffset = parseInt(parts[1]) || 10;
        await this.showMoreReviews(ctx, userId, currentOffset);
      } else if (data.startsWith('reputation_refresh_')) {
        const userId = data.replace('reputation_refresh_', '');
        await this.refreshReputation(ctx, userId);
        return true; // ✅ Sair após processar para evitar answerCbQuery duplicado
      } else if (data.startsWith('reputation_close_')) {
        await ctx.deleteMessage();
        return true;
      }
      
      try {
        await ctx.answerCbQuery();
        return true; // Callback processado com sucesso
      } catch (cbError) {
        // Ignorar erro de callback expirado
        if (cbError.message && cbError.message.includes('query is too old')) {
          this.logger.warn('Callback query expirado - ignorando:', cbError.message);
          return true; // Ainda consideramos como processado
        } else {
          this.logger.error('Erro ao responder callback query:', cbError);
          return false; // Erro no processamento
        }
      }
    } catch (error) {
      this.logger.error('Erro ao processar callback de reputação no start handler:', error);
      try {
        await ctx.answerCbQuery('❌ Erro ao processar ação', { show_alert: true });
      } catch (cbError) {
        // Ignorar erro de callback expirado
        this.logger.warn('Callback query expirado no tratamento de erro:', cbError.message);
      }
      return false; // Erro no processamento
    }
  }

  private async showFilteredStarReviews(ctx: any, userId: string, starRating: number): Promise<void> {
    try {
      const user = await this.usersService.findOneByUserId(parseInt(userId));
      if (!user) return;
      
      const karmaDoc = await this.getKarmaForUserWithFallback(user, ctx.chat.id);
      const history = karmaDoc?.history || [];
      
      const filteredHistory = history.filter(entry => 
        entry.starRating === starRating
      ).slice(-10);
      
      const userName = user.userName ? `@${user.userName}` : user.firstName || 'Usuário';
      const scoreTotal = karmaDoc?.karma || 0;
      const reputationInfo = getReputationInfo(karmaDoc);
      const nivelConfianca = reputationInfo.nivel;
      const nivelIcon = reputationInfo.icone;
      
      const starEmojis = '⭐'.repeat(starRating);
      let message = `**Reputação P2P do Criador da Operação**\n` +
                   `👤 **Usuário:** ${userName}\n\n` +
                   `${nivelIcon} **Nível:** ${nivelConfianca}\n` +
                   `⭐️ **Score Total:** ${scoreTotal} pts\n\n` +
                   `${starEmojis} **Avaliações ${starRating} Estrelas:**\n\n`;
      
      if (filteredHistory.length === 0) {
        message += `Nenhuma avaliação ${starRating} estrelas encontrada.`;
      } else {
        message += filteredHistory
          .reverse()
          .map(entry => {
            const evaluatorName = entry.evaluatorName ? `@${entry.evaluatorName}` : 'Anônimo';
            return `${starEmojis}: "${entry.comment || 'Sem comentário'}" - ${evaluatorName}`;
          })
          .join('\n\n');
      }
      
      const keyboard = {
        inline_keyboard: [
          [
            {
              text: '🔙 Voltar',
              callback_data: `reputation_refresh_${userId}`
            }
          ]
        ]
      };
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      this.logger.error('Erro ao filtrar avaliações por estrelas no start handler:', error);
    }
  }

  private async showFilteredReviews(ctx: any, userId: string, filter: 'positive' | 'negative'): Promise<void> {
    try {
      const user = await this.usersService.findOneByUserId(parseInt(userId));
      if (!user) return;
      
      const karmaDoc = await this.getKarmaForUserWithFallback(user, ctx.chat.id);
      const history = karmaDoc?.history || [];
      
      const filteredHistory = history.filter(entry => 
        filter === 'positive' ? entry.karmaChange > 0 : entry.karmaChange < 0
      ).slice(-10);
      
      let message = `📋 **Avaliações ${filter === 'positive' ? 'Positivas' : 'Negativas'}:**\n\n`;
      
      if (filteredHistory.length === 0) {
        message += `Nenhuma avaliação ${filter === 'positive' ? 'positiva' : 'negativa'} encontrada.`;
      } else {
        message += filteredHistory
          .reverse()
          .map(entry => {
            const dateString = new Date(entry.timestamp).toLocaleDateString('pt-BR');
            let result = '';
            
            // Se tem starRating, mostrar estrelas
            if (entry.starRating) {
              const starEmojis = '⭐'.repeat(entry.starRating);
              result = `${starEmojis} ${entry.starRating}⭐`;
            } else {
              // Fallback para o formato antigo
              const sign = entry.karmaChange > 0 ? '+' : '';
              const emoji = entry.karmaChange > 0 ? '👍' : '👎';
              result = `${emoji} ${sign}${entry.karmaChange} pts`;
            }
            
            if (entry.evaluatorName) {
              result += ` (por ${entry.evaluatorName})`;
            }
            
            if (entry.comment) {
              result += `\n    💬 "${entry.comment}"`;
            }
            
            result += ` - ${dateString}`;
            
            return result;
          })
          .join('\n\n');
      }
      
      const keyboard = {
        inline_keyboard: [
          [
            {
              text: '🔙 Voltar',
              callback_data: `reputation_refresh_${userId}`
            }
          ]
        ]
      };
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      this.logger.error('Erro ao filtrar avaliações no start handler:', error);
    }
  }

  private async showMoreReviews(ctx: any, userId: string, currentOffset: number): Promise<void> {
    try {
      const user = await this.usersService.findOneByUserId(parseInt(userId));
      if (!user) return;
      
      const karmaDoc = await this.getKarmaForUserWithFallback(user, ctx.chat.id);
      const history = karmaDoc?.history || [];
      
      const nextBatch = history.slice(-(currentOffset + 10), -currentOffset);
      
      let message = `📋 **Avaliações Anteriores:**\n\n`;
      
      if (nextBatch.length === 0) {
        message += 'Não há mais avaliações para mostrar.';
      } else {
        message += nextBatch
          .reverse()
          .map(entry => {
            const dateString = new Date(entry.timestamp).toLocaleDateString('pt-BR');
            let result = '';
            
            // Se tem starRating, mostrar estrelas
            if (entry.starRating) {
              const starEmojis = '⭐'.repeat(entry.starRating);
              result = `${starEmojis} ${entry.starRating}⭐`;
            } else {
              // Fallback para o formato antigo
              const sign = entry.karmaChange > 0 ? '+' : '';
              const emoji = entry.karmaChange > 0 ? '👍' : '👎';
              result = `${emoji} ${sign}${entry.karmaChange} pts`;
            }
            
            if (entry.evaluatorName) {
              result += ` (por ${entry.evaluatorName})`;
            }
            
            if (entry.comment) {
              result += `\n    💬 "${entry.comment}"`;
            }
            
            result += ` - ${dateString}`;
            
            return result;
          })
          .join('\n\n');
      }
      
      const keyboard = {
        inline_keyboard: [
          [
            {
              text: '📋 Ver Mais',
              callback_data: `reputation_more_${userId}_${currentOffset + 10}`
            },
            {
              text: '🔙 Voltar',
              callback_data: `reputation_refresh_${userId}`
            }
          ]
        ]
      };
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      this.logger.error('Erro ao mostrar mais avaliações no start handler:', error);
    }
  }

  private async refreshReputation(ctx: any, userId: string): Promise<void> {
    try {
      // Tentar responder ao callback, mas ignorar se expirado
      try {
        await ctx.answerCbQuery();
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado no start refresh, continuando processamento:', cbError.description);
        } else {
          throw cbError; // Re-lançar outros erros
        }
      }
      
      let userIdentifier = userId;
      
      // Verificar se userId é numérico (ID do Telegram) ou texto (nome/username)
      if (/^\d+$/.test(userId)) {
        // É um ID numérico, buscar usuário pelo ID primeiro
        const user = await this.usersService.findOneByUserId(parseInt(userId));
        if (!user) {
          await ctx.answerCbQuery('❌ Usuário não encontrado', { show_alert: true });
          return;
        }
        
        // Usar o nome de usuário ou firstName para a busca
        userIdentifier = user.userName || user.firstName || userId;
      }
      
      // Simular o comando original para o usuário específico
      const fakeCtx = {
        ...ctx,
        message: {
          text: `/start reputacao_${userIdentifier}`,
          from: ctx.callbackQuery.from
        },
        from: ctx.callbackQuery.from,
        chat: ctx.callbackQuery.message.chat,
        callbackQuery: ctx.callbackQuery, // ✅ Preservar callbackQuery para detecção de contexto
        reply: async (text: string, options?: any) => {
          return ctx.editMessageText(text, {
            ...options,
            message_id: ctx.callbackQuery.message.message_id,
            chat_id: ctx.callbackQuery.message.chat.id
          });
        },
        answerCbQuery: ctx.answerCbQuery.bind(ctx) // ✅ Adicionar answerCbQuery ao fakeCtx
      };
      
      await this.handle(fakeCtx);
    } catch (error) {
      this.logger.error('Erro ao atualizar reputação no start handler:', error);
      try {
        await ctx.answerCbQuery('❌ Erro ao atualizar reputação', { show_alert: true });
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado no tratamento de erro do start:', cbError.description);
        } else {
          this.logger.error('Erro ao responder callback de erro:', cbError);
        }
      }
    }
  }

  private async presentTermsInStart(ctx: TextCommandContext): Promise<void> {
    const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const termsText = this.termsAcceptanceService.getTermsText();
    
    const message = (
      `🎉 **Bem-vindo(a) ao TrustScore P2P, ${userName}!**\n\n` +
      termsText + `\n\n` +
      `👤 **Usuário:** ${userName}\n` +
      `🆔 **ID:** \`${ctx.from.id}\`\n` +
      `📅 **Data:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
      `⚠️ **IMPORTANTE:** Você precisa aceitar estes termos para usar o bot no grupo.`
    );

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '✅ ACEITO OS TERMOS',
            callback_data: `accept_terms_${ctx.from.id}_${ctx.chat.id}`
          },
          {
            text: '❌ NÃO ACEITO',
            callback_data: `reject_terms_${ctx.from.id}_${ctx.chat.id}`
          }
        ],
        [
          {
            text: '📋 Ver Termos Detalhados',
            callback_data: `view_terms_detail_${ctx.from.id}_${ctx.chat.id}`
          }
        ]
      ]
    };

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }
}