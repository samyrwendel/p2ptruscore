import { Injectable, Logger } from '@nestjs/common';
import { ITextCommandHandler, TextCommandContext } from '../../telegram.types';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import { KarmaService } from '../../../karma/karma.service';
import { UsersService } from '../../../users/users.service';
import { getReputationInfo } from '../../../shared/reputation.utils';

@Injectable()
export class StartCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(StartCommandHandler.name);
  command = /^\/start(?:@\w+)?(?:\s+(.+))?$/;

  constructor(
    private readonly keyboardService: TelegramKeyboardService,
    private readonly karmaService: KarmaService,
    private readonly usersService: UsersService,
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
      console.error('Erro ao buscar karma com fallback:', error);
      return null;
    }
  }

  async handle(ctx: TextCommandContext): Promise<void> {
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
        let historyMessage = 'Nenhuma avaliação encontrada.';
        if (karmaDoc && karmaDoc.history && karmaDoc.history.length > 0) {
          const recentHistory = karmaDoc.history.slice(-5); // Últimas 5 avaliações
          historyMessage = recentHistory
            .reverse() // Mostrar mais recentes primeiro
            .map((entry, index) => {
              const sign = entry.karmaChange > 0 ? '+' : '';
              const emoji = entry.karmaChange > 0 ? '👍' : '👎';
              let result = `${emoji} ${sign}${entry.karmaChange} pts`;
              
              if (entry.evaluatorName) {
                result += ` - ${entry.evaluatorName}`;
              }
              
              if (entry.comment) {
                result += `\n    💬 \"${entry.comment}\"`;
              }
              
              return result;
            })
            .join('\n\n');
        }
        
        const message = 
          `**Reputação P2P do Criador da Operação**\n` +
          `👤 **Usuário:** ${userName}\n\n` +
          `${nivelIcon} **Nível**: ${nivelConfianca}\n` +
          `⭐ **Score Total**: ${karmaValue} pts\n\n` +
          `👍🏽 **Avaliações Positivas Dadas**: ${avaliacoesPositivas}\n` +
          `👎🏽 **Avaliações Negativas Dadas**: ${avaliacoesNegativas}\n\n` +
          `📋 **Últimas Avaliações Recebidas:**\n${historyMessage}`;
        
        // Criar botões de navegação e filtros
        const keyboard = {
          inline_keyboard: [
            [
              {
                 text: '👍 Positivas',
                 callback_data: `reputation_filter_positive_${targetUser.userId}`
               },
               {
                 text: '👎 Negativas', 
                 callback_data: `reputation_filter_negative_${targetUser.userId}`
               }
             ],
             [
               {
                 text: '📋 Ver Mais',
                 callback_data: `reputation_more_${targetUser.userId}_10`
               },
               {
                 text: '🔄 Atualizar',
                 callback_data: `reputation_refresh_${targetUser.userId}`
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

    // Mensagem padrão de boas-vindas
    const keyboard = this.keyboardService.getGroupWebAppKeyboard(ctx.chat);
    const extra: any = {};
    if (keyboard) {
      extra.reply_markup = keyboard.reply_markup;
    }

    const welcomeMessage = 
      '🎉 **Bem-vindo ao P2P Score Bot!**\n\n' +
      '🚀 Aqui você pode:\n' +
      '• Criar operações P2P\n' +
      '• Gerenciar suas operações\n' +
      '• Ver reputação de usuários\n' +
      '• Avaliar transações\n\n' +
      '💡 Use /help para ver todos os comandos disponíveis.';

    await ctx.reply(welcomeMessage, { parse_mode: 'Markdown', ...extra });
  }

  // Método para lidar com callbacks dos botões
  async handleCallback(ctx: any): Promise<boolean> {
    const data = ctx.callbackQuery.data;
    
    // Verificar se este callback pertence a este handler
    if (!data.startsWith('reputation_')) {
      return false;
    }
    
    try {
      if (data.startsWith('reputation_filter_positive_')) {
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
            const sign = entry.karmaChange > 0 ? '+' : '';
            const emoji = entry.karmaChange > 0 ? '👍' : '👎';
            let result = `${emoji} ${sign}${entry.karmaChange} pts`;
            
            if (entry.evaluatorName) {
              result += ` - ${entry.evaluatorName}`;
            }
            
            if (entry.comment) {
              result += `\n    💬 \"${entry.comment}\"`;
            }
            
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
            const sign = entry.karmaChange > 0 ? '+' : '';
            const emoji = entry.karmaChange > 0 ? '👍' : '👎';
            let result = `${emoji} ${sign}${entry.karmaChange} pts`;
            
            if (entry.evaluatorName) {
              result += ` - ${entry.evaluatorName}`;
            }
            
            if (entry.comment) {
              result += `\n    💬 \"${entry.comment}\"`;
            }
            
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
      await ctx.answerCbQuery(); // Responder ao callback primeiro
      
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
      } catch (cbError) {
        this.logger.error('Erro ao responder callback de erro:', cbError);
      }
    }
  }
}