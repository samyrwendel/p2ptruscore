import { Injectable, Logger } from '@nestjs/common';
import { KarmaService } from '../../../karma/karma.service';
import { UsersService } from '../../../users/users.service';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import { formatKarmaHistory } from '../command.helpers';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class ReputacaoCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(ReputacaoCommandHandler.name);
  command = /^\/reputacao(?:@\w+)?(?:\s+(.+))?$/;

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
       console.error('Erro ao buscar karma com fallback:', error);
       return null;
     }
   }

  async handle(ctx: TextCommandContext): Promise<void> {
    const match = ctx.message.text.match(this.command);
    const input = match?.[1]?.trim();
    
    let targetUser;
    if (input) {
      // Buscar usuário específico
      let karma;
      
      // Verificar se input é numérico (ID do Telegram) ou texto (nome/username)
      if (/^\d+$/.test(input)) {
        // É um ID numérico, buscar usuário pelo ID primeiro
        const user = await this.usersService.findOneByUserId(parseInt(input));
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
        const userIdentifier = user.userName || user.firstName || input;
        karma = await this.karmaService.findKarmaByUserQuery(userIdentifier, ctx.chat.id);
        targetUser = user;
      } else {
        // É um nome/username, buscar diretamente
        karma = await this.karmaService.findKarmaByUserQuery(input, ctx.chat.id);
        if (karma) {
          targetUser = karma.user;
        }
      }
      
      if (!karma) {
        // Verificar se estamos em um contexto de callback (refreshReputation)
        if (ctx.callbackQuery) {
          await ctx.answerCbQuery(`❌ Usuário "${input}" não encontrado neste grupo.`, { show_alert: true });
        } else {
          await ctx.reply(`❌ Usuário "${input}" não encontrado neste grupo.`);
        }
        return;
      }
      
      if (!targetUser) {
        targetUser = karma.user;
      }
    } else {
      // Mostrar própria reputação
      targetUser = ctx.from;
    }

    try {
      let karmaDoc;
      if (input) {
        // Verificar se estamos em um chat privado (ID positivo) ou grupo (ID negativo)
        if (ctx.chat.id > 0) {
          // Chat privado - buscar karma total em todos os grupos
          const totalKarma = await this.karmaService.getTotalKarmaForUser(input);
          if (totalKarma) {
            // Simular estrutura de karmaDoc para compatibilidade
            karmaDoc = {
              karma: totalKarma.totalKarma,
              givenKarma: totalKarma.totalGiven,
              givenHate: totalKarma.totalHate,
              history: [] // Histórico vazio para chat privado
            };
            targetUser = totalKarma.user;
          }
        } else {
          // Grupo - buscar karma específico do grupo
          karmaDoc = await this.karmaService.findKarmaByUserQuery(input, ctx.chat.id);
        }
      } else {
        // Buscar próprio karma
        if (ctx.chat.id > 0) {
          // Chat privado - buscar karma total
          const totalKarma = await this.karmaService.getTotalKarmaForUser(targetUser.username || targetUser.firstName);
          if (totalKarma) {
            karmaDoc = {
              karma: totalKarma.totalKarma,
              givenKarma: totalKarma.totalGiven,
              givenHate: totalKarma.totalHate,
              history: []
            };
          }
        } else {
          // Grupo - buscar karma específico do grupo
          const userDoc = await this.usersService.findOneByUserId(targetUser.id);
      karmaDoc = userDoc ? await this.getKarmaForUserWithFallback(userDoc, ctx.chat.id) : null;
        }
      }
      
      const nomeUsuario = targetUser.username ? `@${targetUser.username}` : targetUser.firstName;
      
      const scoreTotal = karmaDoc?.karma || 0;
      const avaliacoesPositivas = karmaDoc?.givenKarma || 0;
      const avaliacoesNegativas = karmaDoc?.givenHate || 0;
      
      // Calcular nível de confiança com ícones de reputação
      let nivelConfianca = '';
      let nivelIcon = '';
      
      if (scoreTotal < 0) {
        nivelConfianca = 'Problemático';
        nivelIcon = '🔴';
      } else if (scoreTotal < 50) {
        nivelConfianca = 'Iniciante';
        nivelIcon = '🔰';
      } else if (scoreTotal < 100) {
        nivelConfianca = 'Bronze';
        nivelIcon = '🥉';
      } else if (scoreTotal < 200) {
        nivelConfianca = 'Prata';
        nivelIcon = '🥈';
      } else if (scoreTotal < 500) {
        nivelConfianca = 'Ouro';
        nivelIcon = '🥇';
      } else {
        nivelConfianca = 'Mestre P2P';
        nivelIcon = '🏆';
      }
      
      // Formatar histórico das últimas 10 avaliações
      const recentHistory = karmaDoc?.history?.slice(-10) || [];
      let historyMessage = '';
      
      if (recentHistory.length === 0) {
        historyMessage = 'Nenhuma avaliação encontrada.';
      } else {
        historyMessage = recentHistory
          .reverse() // Mostrar mais recentes primeiro
          .map((entry, index) => {
            const sign = entry.karmaChange > 0 ? '+' : '';
            const emoji = entry.karmaChange > 0 ? '👍' : '👎';
            const dateString = new Date(entry.timestamp).toLocaleDateString('pt-BR');
            let result = `${emoji} ${sign}${entry.karmaChange} pts`;
            
            if (entry.evaluatorName) {
              result += ` - ${entry.evaluatorName}`;
            }
            
            if (entry.comment) {
              result += `\n    💬 "${entry.comment}"`;
            }
            
            return result;
          })
          .join('\n\n');
      }
      
      const message = `**Reputação P2P de** ${nomeUsuario}\n\n` +
         `${nivelIcon} **Nível**: ${nivelConfianca}\n` +
         `⭐ **Score Total**: ${scoreTotal} pts\n\n` +
         `👍🏽 **Avaliações Positivas Dadas**: ${avaliacoesPositivas}\n` +
         `👎🏽 **Avaliações Negativas Dadas**: ${avaliacoesNegativas}\n\n` +
         `📋 **Últimas Avaliações Recebidas:**\n${historyMessage}`;
      
      // Criar botões de navegação e filtros
      const keyboard = {
        inline_keyboard: [
          [
            {
              text: '👍 Positivas',
              callback_data: `reputation_filter_positive_${targetUser.userId || targetUser.id}`
            },
            {
              text: '👎 Negativas', 
              callback_data: `reputation_filter_negative_${targetUser.userId || targetUser.id}`
            }
          ],
          [
            {
              text: '📋 Ver Mais',
              callback_data: `reputation_more_${targetUser.userId || targetUser.id}_10`
            },
            {
              text: '🔄 Atualizar',
              callback_data: `reputation_refresh_${targetUser.userId || targetUser.id}`
            }
          ]
        ]
      };
      
      await ctx.reply(message, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      this.logger.error('Erro ao buscar reputação', error);
      await ctx.reply('❌ Erro ao buscar reputação. Tente novamente.');
    }
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
        await this.showMainReputation(ctx, userId);
        return true; // ✅ Sair após processar para evitar answerCbQuery duplicado
      }
      
      try {
        await ctx.answerCbQuery();
      } catch (cbError) {
        // Ignorar erro de callback expirado
        if (cbError.message && cbError.message.includes('query is too old')) {
          this.logger.warn('Callback query expirado - ignorando:', cbError.message);
        } else {
          this.logger.error('Erro ao responder callback query:', cbError);
        }
      }
      return true; // Callback processado com sucesso
    } catch (error) {
      this.logger.error('Erro ao processar callback de reputação:', error);
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
      // Buscar informações do usuário
      let userName = 'Usuário';
      if (/^\d+$/.test(userId)) {
        // É um ID numérico, buscar usuário pelo ID
        const user = await this.usersService.findOneByUserId(parseInt(userId));
        if (user) {
          userName = user.userName ? `@${user.userName}` : user.firstName || 'Usuário';
        }
      } else {
        // É um nome/username
        userName = userId.startsWith('@') ? userId : `@${userId}`;
      }
      
      let karmaDoc;
      if (ctx.chat.id > 0) {
        // Chat privado - buscar karma total em todos os grupos
        const user = await this.usersService.findOneByUserId(parseInt(userId));
        if (user) {
          const totalKarma = await this.karmaService.getTotalKarmaForUser(user.userName || user.firstName);
          if (totalKarma) {
            karmaDoc = {
              karma: totalKarma.totalKarma,
              givenKarma: totalKarma.totalGiven,
              givenHate: totalKarma.totalHate,
              history: [] // Histórico vazio para chat privado
            };
          }
        }
      } else {
        // Grupo - buscar karma específico do grupo
        const user = await this.usersService.findOneByUserId(parseInt(userId));
        karmaDoc = user ? await this.getKarmaForUserWithFallback(user, ctx.chat.id) : null;
      }
      const history = karmaDoc?.history || [];
      
      const filteredHistory = history.filter(entry => 
        filter === 'positive' ? entry.karmaChange > 0 : entry.karmaChange < 0
      ).slice(-10);
      
      let message = `**Reputação P2P do Criador da Operação**\n` +
                   `👤 **Usuário:** ${userName}\n\n` +
                   `${filter === 'positive' ? '👍' : '👎'} **Avaliações ${filter === 'positive' ? 'Positivas' : 'Negativas'}:**\n\n`;
      
      if (filteredHistory.length === 0) {
        message += `Nenhuma avaliação ${filter === 'positive' ? 'positiva' : 'negativa'} encontrada.`;
      } else {
        message += filteredHistory
          .reverse()
          .map(entry => {
            const sign = entry.karmaChange > 0 ? '+' : '';
            const emoji = entry.karmaChange > 0 ? '👍' : '👎';
            const dateString = new Date(entry.timestamp).toLocaleDateString('pt-BR');
            let result = `${emoji} ${sign}${entry.karmaChange} pts`;
            
            if (entry.evaluatorName) {
              result += ` - ${entry.evaluatorName}`;
            }
            
            if (entry.comment) {
              result += `\n    💬 "${entry.comment}"`;
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
      this.logger.error('Erro ao filtrar avaliações:', error);
    }
  }

  private async showMoreReviews(ctx: any, userId: string, currentOffset: number): Promise<void> {
    try {
      // Buscar informações do usuário
      let userName = 'Usuário';
      if (/^\d+$/.test(userId)) {
        // É um ID numérico, buscar usuário pelo ID
        const user = await this.usersService.findOneByUserId(parseInt(userId));
        if (user) {
          userName = user.userName ? `@${user.userName}` : user.firstName || 'Usuário';
        }
      } else {
        // É um nome/username
        userName = userId.startsWith('@') ? userId : `@${userId}`;
      }
      
      let karmaDoc;
      if (ctx.chat.id > 0) {
        // Chat privado - buscar karma total em todos os grupos
        const user = await this.usersService.findOneByUserId(parseInt(userId));
        if (user) {
          const totalKarma = await this.karmaService.getTotalKarmaForUser(user.userName || user.firstName);
          if (totalKarma) {
            karmaDoc = {
              karma: totalKarma.totalKarma,
              givenKarma: totalKarma.totalGiven,
              givenHate: totalKarma.totalHate,
              history: [] // Histórico vazio para chat privado
            };
          }
        }
      } else {
        // Grupo - buscar karma específico do grupo
        const user2 = await this.usersService.findOneByUserId(parseInt(userId));
        karmaDoc = user2 ? await this.getKarmaForUserWithFallback(user2, ctx.chat.id) : null;
      }
      const history = karmaDoc?.history || [];
      
      const nextBatch = history.slice(-(currentOffset + 10), -currentOffset);
      
      let message = `**Reputação P2P do Criador da Operação**\n` +
                   `👤 **Usuário:** ${userName}\n\n` +
                   `📋 **Avaliações Anteriores:**\n\n`;
      
      if (nextBatch.length === 0) {
        message += 'Não há mais avaliações para mostrar.';
      } else {
        message += nextBatch
          .reverse()
          .map(entry => {
            const sign = entry.karmaChange > 0 ? '+' : '';
            const emoji = entry.karmaChange > 0 ? '👍' : '👎';
            const dateString = new Date(entry.timestamp).toLocaleDateString('pt-BR');
            let result = `${emoji} ${sign}${entry.karmaChange} pts`;
            
            if (entry.evaluatorName) {
              result += ` - ${entry.evaluatorName}`;
            }
            
            if (entry.comment) {
              result += `\n    💬 "${entry.comment}"`;
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
      this.logger.error('Erro ao mostrar mais avaliações:', error);
    }
  }

  private async showMainReputation(ctx: any, userId: string): Promise<void> {
    try {
      await ctx.answerCbQuery(); // Responder ao callback primeiro
      
      this.logger.log(`🔄 ShowMainReputation chamado para userId: ${userId}`);
      
      // Buscar dados do usuário
      let targetUser;
      let karmaDoc;
      
      // Verificar se userId é numérico (ID do Telegram) ou texto (nome/username)
      if (/^\d+$/.test(userId)) {
        // É um ID numérico, buscar usuário pelo ID primeiro
        const user = await this.usersService.findOneByUserId(parseInt(userId));
        if (!user) {
          this.logger.error(`❌ Usuário não encontrado para ID: ${userId}`);
          await ctx.answerCbQuery('❌ Usuário não encontrado', { show_alert: true });
          return;
        }
        
        targetUser = user;
        this.logger.log(`✅ Usuário encontrado: ${user.userName || user.firstName}`);
        
        // Buscar karma (sempre em chat privado quando vem de callback)
        if (ctx.chat.id > 0) {
          // Chat privado - buscar karma total em todos os grupos
          const totalKarma = await this.karmaService.getTotalKarmaForUser(user.userName || user.firstName);
          if (totalKarma) {
            karmaDoc = {
              karma: totalKarma.totalKarma,
              givenKarma: totalKarma.totalGiven,
              givenHate: totalKarma.totalHate,
              history: [] // Histórico vazio para chat privado
            };
          }
        } else {
          // Grupo - buscar karma específico do grupo
          const user3 = await this.usersService.findOneByUserId(parseInt(userId));
        karmaDoc = user3 ? await this.getKarmaForUserWithFallback(user3, ctx.chat.id) : null;
        }
      } else {
        // É um nome/username, buscar diretamente
        const totalKarma = await this.karmaService.getTotalKarmaForUser(userId);
        if (totalKarma) {
          targetUser = totalKarma.user;
          karmaDoc = {
            karma: totalKarma.totalKarma,
            givenKarma: totalKarma.totalGiven,
            givenHate: totalKarma.totalHate,
            history: []
          };
        }
      }
      
      if (!targetUser || !karmaDoc) {
        this.logger.error(`❌ Dados não encontrados para userId: ${userId}`);
        await ctx.answerCbQuery('❌ Dados não encontrados', { show_alert: true });
        return;
      }
      
      // Renderizar a tela principal
      await this.renderMainReputationScreen(ctx, targetUser, karmaDoc);
      
    } catch (error) {
      this.logger.error('Erro ao mostrar reputação principal:', error);
      await ctx.answerCbQuery('❌ Erro ao carregar reputação', { show_alert: true });
    }
  }
  
  private async renderMainReputationScreen(ctx: any, targetUser: any, karmaDoc: any): Promise<void> {
    const nomeUsuario = targetUser.username ? `@${targetUser.username}` : (targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName);
    
    const scoreTotal = karmaDoc?.karma || 0;
    const avaliacoesPositivas = karmaDoc?.givenKarma || 0;
    const avaliacoesNegativas = karmaDoc?.givenHate || 0;
    
    // Calcular nível de confiança com ícones de reputação
    let nivelConfianca = '';
    let nivelIcon = '';
    
    if (scoreTotal < 0) {
      nivelConfianca = 'Problemático';
      nivelIcon = '🔴';
    } else if (scoreTotal < 50) {
      nivelConfianca = 'Iniciante';
      nivelIcon = '🔰';
    } else if (scoreTotal < 100) {
      nivelConfianca = 'Bronze';
      nivelIcon = '🥉';
    } else if (scoreTotal < 200) {
      nivelConfianca = 'Prata';
      nivelIcon = '🥈';
    } else if (scoreTotal < 500) {
      nivelConfianca = 'Ouro';
      nivelIcon = '🥇';
    } else {
      nivelConfianca = 'Diamante';
      nivelIcon = '💎';
    }
    
    // Processar histórico
    const history = karmaDoc?.history || [];
    const recentHistory = history.slice(-5);
    let historyMessage = '';
    
    if (recentHistory.length === 0) {
      historyMessage = 'Nenhuma avaliação encontrada.';
    } else {
      historyMessage = recentHistory
        .reverse()
        .map((entry) => {
          const sign = entry.karmaChange > 0 ? '+' : '';
          const emoji = entry.karmaChange > 0 ? '👍' : '👎';
          let result = `${emoji} ${sign}${entry.karmaChange} pts`;
          
          if (entry.evaluatorName) {
            result += ` - ${entry.evaluatorName}`;
          }
          
          if (entry.comment) {
            result += `\n    💬 "${entry.comment}"`;
          }
          
          return result;
        })
        .join('\n\n');
    }
    
    const message = `**Reputação P2P do Criador da Operação**\n` +
       `👤 **Usuário:** ${nomeUsuario}\n\n` +
       `${nivelIcon} **Nível**: ${nivelConfianca}\n` +
       `⭐ **Score Total**: ${scoreTotal} pts\n\n` +
       `👍🏽 **Avaliações Positivas Dadas**: ${avaliacoesPositivas}\n` +
       `👎🏽 **Avaliações Negativas Dadas**: ${avaliacoesNegativas}\n\n` +
       `📋 **Últimas Avaliações Recebidas:**\n${historyMessage}`;
    
    // Criar botões de navegação e filtros
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '👍 Positivas',
            callback_data: `reputation_filter_positive_${targetUser.userId || targetUser.id}`
          },
          {
            text: '👎 Negativas', 
            callback_data: `reputation_filter_negative_${targetUser.userId || targetUser.id}`
          }
        ],
        [
          {
            text: '📋 Ver Mais',
            callback_data: `reputation_more_${targetUser.userId || targetUser.id}_10`
          },
          {
            text: '🔄 Atualizar',
            callback_data: `reputation_refresh_${targetUser.userId || targetUser.id}`
          }
        ]
      ]
    };
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
    this.logger.log(`✅ Tela principal renderizada com sucesso`);
  }

  private async refreshReputation(ctx: any, userId: string): Promise<void> {
    try {
      await ctx.answerCbQuery(); // Responder ao callback primeiro
      
      this.logger.log(`🔄 RefreshReputation chamado para userId: ${userId}`);
      
      let userIdentifier = userId;
      
      // Verificar se userId é numérico (ID do Telegram) ou texto (nome/username)
      if (/^\d+$/.test(userId)) {
        // É um ID numérico, buscar usuário pelo ID primeiro
        const user = await this.usersService.findOneByUserId(parseInt(userId));
        if (!user) {
          this.logger.error(`❌ Usuário não encontrado para ID: ${userId}`);
          await ctx.answerCbQuery('❌ Usuário não encontrado', { show_alert: true });
          return;
        }
        
        // Usar o nome de usuário ou firstName para a busca
        userIdentifier = user.userName || user.firstName || userId;
        this.logger.log(`✅ Usuário encontrado: ${userIdentifier}`);
      }
      
      // Simular o comando original para o usuário específico
      this.logger.log(`🎯 Criando fakeCtx para comando: /reputacao ${userIdentifier}`);
      
      const fakeCtx = {
        ...ctx,
        message: {
          text: `/reputacao ${userIdentifier}`,
          from: ctx.callbackQuery.from
        },
        from: ctx.callbackQuery.from,
        chat: ctx.callbackQuery.message.chat,
        callbackQuery: ctx.callbackQuery, // ✅ Preservar callbackQuery para detecção de contexto
        reply: async (text: string, options?: any) => {
          this.logger.log(`📝 FakeCtx.reply chamado - editando mensagem`);
          return ctx.editMessageText(text, {
            ...options,
            message_id: ctx.callbackQuery.message.message_id,
            chat_id: ctx.callbackQuery.message.chat.id
          });
        },
        answerCbQuery: ctx.answerCbQuery.bind(ctx) // ✅ Adicionar answerCbQuery ao fakeCtx
      };
      
      this.logger.log(`🚀 Executando handle() com fakeCtx`);
      await this.handle(fakeCtx);
      this.logger.log(`✅ Handle() executado com sucesso`);
    } catch (error) {
      this.logger.error('Erro ao atualizar reputação no reputacao handler:', error);
      try {
        await ctx.answerCbQuery('❌ Erro ao atualizar reputação', { show_alert: true });
      } catch (cbError) {
        this.logger.error('Erro ao responder callback de erro:', cbError);
      }
    }
  }
}