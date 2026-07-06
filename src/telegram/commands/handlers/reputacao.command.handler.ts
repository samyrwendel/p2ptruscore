import { Injectable, Logger } from '@nestjs/common';
import { safeAnswerCbQuery, safeDeleteMessage, safeEditMessageText } from '../../shared/callback.utils';
import { KarmaService } from '../../../karma/karma.service';
import { UsersService } from '../../../users/users.service';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import { formatKarmaHistory } from '../command.helpers';
import { getReputationInfo } from '../../../shared/reputation.utils';
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
       this.logger.log(`🔍 getKarmaForUserWithFallback - user: ${JSON.stringify({userId: user.userId, userName: user.userName, firstName: user.firstName})}, chatId: ${chatId}`);
       
       // Primeiro tentar buscar karma no grupo atual
       const groupKarma = await this.karmaService.getKarmaForUser(user.userId, chatId);
       this.logger.log(`📊 groupKarma no chat ${chatId}: ${JSON.stringify(groupKarma ? {karma: groupKarma.karma, historyLength: groupKarma.history?.length, stars5: groupKarma.stars5} : 'null')}`);
       
       if (groupKarma && groupKarma.karma !== undefined) {
         this.logger.log(`✅ Retornando groupKarma do chat atual`);
         return groupKarma;
       }
       
       // Se não encontrar no grupo atual, buscar karma total
       const totalKarma = await this.karmaService.getTotalKarmaForUser(user.userName || user.firstName);
       this.logger.log(`📈 totalKarma: ${JSON.stringify(totalKarma ? {totalKarma: totalKarma.totalKarma, user: totalKarma.user?.userName} : 'null')}`);
       
       if (totalKarma) {
         // Buscar histórico consolidado de TODOS os grupos onde o usuário tem karma
         let consolidatedHistory: any[] = [];
         let consolidatedStars = { stars5: 0, stars4: 0, stars3: 0, stars2: 0, stars1: 0 };
         
         // Primeiro tentar o grupo principal
         let karmaWithHistory = await this.karmaService.getKarmaForUser(user.userId, -1002907400287);
         this.logger.log(`🏠 karmaWithHistory grupo principal: ${JSON.stringify(karmaWithHistory ? {historyLength: karmaWithHistory.history?.length, stars5: karmaWithHistory.stars5} : 'null')}`);
         
         if (karmaWithHistory && karmaWithHistory.history?.length > 0) {
           consolidatedHistory = [...karmaWithHistory.history];
           consolidatedStars.stars5 += karmaWithHistory.stars5 || 0;
           consolidatedStars.stars4 += karmaWithHistory.stars4 || 0;
           consolidatedStars.stars3 += karmaWithHistory.stars3 || 0;
           consolidatedStars.stars2 += karmaWithHistory.stars2 || 0;
           consolidatedStars.stars1 += karmaWithHistory.stars1 || 0;
         }
         
         // Buscar em todos os outros grupos para consolidar o histórico completo
         const userGroups = await this.karmaService.getGroupsForUser(user.userId);
         this.logger.log(`👥 userGroups encontrados: ${userGroups?.length || 0}`);
         
         if (userGroups && userGroups.length > 0) {
           for (const group of userGroups) {
             // Pular o grupo principal se já foi processado
             if (group.groupId === -1002907400287) continue;
             
             const groupKarma = await this.karmaService.getKarmaForUser(user.userId, group.groupId);
             this.logger.log(`🔍 Grupo ${group.groupId}: ${JSON.stringify(groupKarma ? {historyLength: groupKarma.history?.length, stars3: groupKarma.stars3} : 'null')}`);
             
             if (groupKarma && groupKarma.history?.length > 0) {
               // Consolidar histórico (evitar duplicatas por timestamp)
               const existingTimestamps = new Set(consolidatedHistory.map((h: any) => h.timestamp));
               const newHistory = groupKarma.history.filter((h: any) => !existingTimestamps.has(h.timestamp));
               consolidatedHistory = [...consolidatedHistory, ...newHistory];
               
               // Consolidar contadores de estrelas
               consolidatedStars.stars5 += groupKarma.stars5 || 0;
               consolidatedStars.stars4 += groupKarma.stars4 || 0;
               consolidatedStars.stars3 += groupKarma.stars3 || 0;
               consolidatedStars.stars2 += groupKarma.stars2 || 0;
               consolidatedStars.stars1 += groupKarma.stars1 || 0;
               
               this.logger.log(`✅ Consolidado histórico do grupo ${group.groupId} - Total stars3: ${consolidatedStars.stars3}`);
             }
           }
         }
         
         // Ordenar histórico consolidado por timestamp
         consolidatedHistory.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
         
         const result = {
           karma: totalKarma.totalKarma,
           givenKarma: totalKarma.totalGiven,
           givenHate: totalKarma.totalHate,
           user: totalKarma.user,
           history: consolidatedHistory,
           stars5: consolidatedStars.stars5,
           stars4: consolidatedStars.stars4,
           stars3: consolidatedStars.stars3,
           stars2: consolidatedStars.stars2,
           stars1: consolidatedStars.stars1
         };
         
         this.logger.log(`📋 Resultado consolidado: historyLength=${result.history.length}, stars3=${result.stars3}, stars5=${result.stars5}, totalKarma=${result.karma}`);
         return result;
       }
       
       this.logger.log(`❌ Nenhum karma encontrado`);
       return null;
     } catch (error) {
       this.logger.error('Erro ao buscar karma com fallback:', error);
       return null;
     }
   }

  async handle(ctx: TextCommandContext): Promise<void> {
    const match = ctx.message.text.match(this.command);
    const input = match?.[1]?.trim();
    
    let targetUser;
    let karmaData;
    
    if (input) {
      // Usar exatamente a mesma lógica do start.command.handler.ts (botão Ver Reputação)
      
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
        karmaData = await this.karmaService.getTotalKarmaForUser(userIdentifier);
        targetUser = user;
      } else {
        // É um nome/username, buscar diretamente
        this.logger.log(`🔍 Buscando karma total para: ${input}`);
        karmaData = await this.karmaService.getTotalKarmaForUser(input);
        this.logger.log(`📊 Resultado getTotalKarmaForUser: ${karmaData ? 'encontrado' : 'não encontrado'}`);
        
        if (!karmaData) {
          // Se não encontrou, tentar buscar por username/nome nos grupos
          this.logger.log(`🔄 Tentando buscar usuário por nome/username: ${input}`);
          const userByName = await this.usersService.findOneByUsernameOrName(input);
          this.logger.log(`👤 Usuário encontrado por nome: ${userByName ? JSON.stringify({userId: userByName.userId, userName: userByName.userName, firstName: userByName.firstName}) : 'não encontrado'}`);
          
          if (userByName) {
            const userIdentifier = userByName.userName || userByName.firstName;
            this.logger.log(`🔍 Buscando karma com identificador: ${userIdentifier}`);
            karmaData = await this.karmaService.getTotalKarmaForUser(userIdentifier);
            this.logger.log(`📊 Resultado karma com identificador: ${karmaData ? 'encontrado' : 'não encontrado'}`);
            targetUser = userByName;
          }
          
          if (!karmaData) {
            this.logger.log(`❌ Nenhum karma encontrado para: ${input}`);
            // Verificar se estamos em um contexto de callback (refreshReputation)
            if (ctx.callbackQuery) {
              await ctx.answerCbQuery(`❌ Usuário "${input}" não encontrado.`, { show_alert: true });
            } else {
              await ctx.reply(`❌ Usuário "${input}" não encontrado.`);
            }
            return;
          }
        } else {
          targetUser = karmaData.user;
        }
      }
    } else {
      // Buscar próprio karma
      const userIdentifier = ctx.from.username || ctx.from.first_name;
      karmaData = await this.karmaService.getTotalKarmaForUser(userIdentifier);
      if (!karmaData) {
        await ctx.reply(`❌ Você ainda não possui reputação registrada.`);
        return;
      }
      targetUser = karmaData.user;
    }

    try {
      // Usar exatamente a mesma lógica do start.command.handler.ts
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
      

      
      // Formatar histórico das últimas 10 avaliações (igual ao start.command.handler.ts)
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
      
      // Contadores de estrelas em formato de 2 colunas
      const stars5 = karmaDoc?.stars5 || 0;
      const stars4 = karmaDoc?.stars4 || 0;
      const stars3 = karmaDoc?.stars3 || 0;
      const stars2 = karmaDoc?.stars2 || 0;
      const stars1 = karmaDoc?.stars1 || 0;
      
      const starCounters = `5⭐️: ${stars5}      2⭐️: ${stars2}\n4⭐️: ${stars4}      1⭐️: ${stars1}\n3⭐️: ${stars3}`;
      
      const message = 
        `**Reputação P2P do Criador da Operação**\n` +
        `👤 **Usuário:** ${userName}\n\n` +
        `${nivelIcon} **Nível:** ${nivelConfianca}\n` +
        `⭐️ **Score Total:** ${karmaValue} pts\n\n` +
        `**Distribuição de Avaliações:**\n${starCounters}\n\n\n` +
        `📋 **Últimas 10 Avaliações Recebidas:**\n\n${historyMessage}`;
      
      // Criar botões de navegação melhorados (igual ao botão Ver Reputação)
      const keyboard = {
        inline_keyboard: [
          [
            {
              text: '5⭐',
              callback_data: `reputation_filter_star_5_${targetUser.userId || targetUser.id}`
            },
            {
              text: '4⭐',
              callback_data: `reputation_filter_star_4_${targetUser.userId || targetUser.id}`
            },
            {
              text: '3⭐',
              callback_data: `reputation_filter_star_3_${targetUser.userId || targetUser.id}`
            }
          ],
          [
            {
              text: '2⭐',
              callback_data: `reputation_filter_star_2_${targetUser.userId || targetUser.id}`
            },
            {
              text: '1⭐',
              callback_data: `reputation_filter_star_1_${targetUser.userId || targetUser.id}`
            },
            {
              text: '🔄️ Atualizar',
              callback_data: `reputation_refresh_${targetUser.userId || targetUser.id}`
            }
          ],
          [
            {
              text: '❌',
              callback_data: `reputation_close_${targetUser.userId || targetUser.id}`
            },
            {
              text: '➡️',
              callback_data: `reputation_more_${targetUser.userId || targetUser.id}_10`
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
      } else if (data.startsWith('reputation_main_')) {
        const userId = data.replace('reputation_main_', '');
        await this.showMainReputation(ctx, userId);
        return true; // ✅ Sair após processar para evitar answerCbQuery duplicado
      } else if (data.startsWith('reputation_close_')) {
        // NÃO-FATAL: msg >48h ou não deletável não pode virar erro genérico.
        const deleted = await safeDeleteMessage(ctx);
        if (!deleted) {
          await safeEditMessageText(ctx, '✅ Reputação fechada.', {});
        }
        await safeAnswerCbQuery(ctx);
        return true;
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
      // callback reputation_* É deste handler: encerra o dispatch (não é "não processado")
      return true;
    }
  }

  private async showFilteredStarReviews(ctx: any, userId: string, starRating: number): Promise<void> {
    try {
      // Buscar informações do usuário
      let userName = 'Usuário';
      let karmaDoc;
      
      if (/^\d+$/.test(userId)) {
        // É um ID numérico, buscar usuário pelo ID
        const user = await this.usersService.findOneByUserId(parseInt(userId));
        if (user) {
          userName = user.userName ? `@${user.userName}` : user.firstName || 'Usuário';
        }
        
        // Determinar se é chat privado ou grupo
        if (ctx.chat.type === 'private') {
          // Chat privado - buscar karma total em todos os grupos COM histórico
          const userIdentifier = user?.userName || user?.firstName || '';
           if (userIdentifier) {
             const totalKarma = await this.karmaService.getTotalKarmaForUser(userIdentifier);
             if (totalKarma) {
               // Buscar histórico de um grupo específico (usar o primeiro grupo encontrado)
               const karmaWithHistory = await this.getKarmaForUserWithFallback(user, -1002907400287); // ID do grupo principal
               karmaDoc = {
                 karma: totalKarma.totalKarma,
                 givenKarma: totalKarma.totalGiven,
                 givenHate: totalKarma.totalHate,
                 history: karmaWithHistory?.history || [],
                 stars5: karmaWithHistory?.stars5 || 0,
                 stars4: karmaWithHistory?.stars4 || 0,
                 stars3: karmaWithHistory?.stars3 || 0,
                 stars2: karmaWithHistory?.stars2 || 0,
                 stars1: karmaWithHistory?.stars1 || 0
               };
             }
           }
        } else {
          // Grupo - buscar karma específico do grupo
          const user = await this.usersService.findOneByUserId(parseInt(userId));
          karmaDoc = user ? await this.getKarmaForUserWithFallback(user, ctx.chat.id) : null;
        }
      } else {
        // É um nome/username
        userName = userId.startsWith('@') ? userId : `@${userId}`;
      }
      
      const history = karmaDoc?.history || [];
      
      const filteredHistory = history.filter(entry => 
        entry.starRating === starRating
      ).slice(-10);
      
      // Calcular informações de reputação usando função centralizada
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
      
      // Criar botão de voltar
      const keyboard = {
        inline_keyboard: [
          [
            {
              text: '🔙 Voltar',
              callback_data: `reputation_main_${userId}`
            }
          ]
        ]
      };
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      this.logger.error('Erro ao filtrar avaliações por estrelas:', error);
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
        // Chat privado - buscar karma total em todos os grupos COM histórico
        const user = await this.usersService.findOneByUserId(parseInt(userId));
        if (user) {
          const totalKarma = await this.karmaService.getTotalKarmaForUser(user.userName || user.firstName);
          if (totalKarma) {
            // Buscar histórico de um grupo específico (usar o primeiro grupo encontrado)
            const karmaWithHistory = await this.getKarmaForUserWithFallback(user, -1002907400287); // ID do grupo principal
            karmaDoc = {
              karma: totalKarma.totalKarma,
              givenKarma: totalKarma.totalGiven,
              givenHate: totalKarma.totalHate,
              history: karmaWithHistory?.history || [],
              stars5: karmaWithHistory?.stars5 || 0,
              stars4: karmaWithHistory?.stars4 || 0,
              stars3: karmaWithHistory?.stars3 || 0,
              stars2: karmaWithHistory?.stars2 || 0,
              stars1: karmaWithHistory?.stars1 || 0
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
      
      // Calcular informações de reputação usando função centralizada
      const scoreTotal = karmaDoc?.karma || 0;
      const avaliacoesPositivas = karmaDoc?.givenKarma || 0;
      const avaliacoesNegativas = karmaDoc?.givenHate || 0;
      const reputationInfo = getReputationInfo(karmaDoc);
      const nivelConfianca = reputationInfo.nivel;
      const nivelIcon = reputationInfo.icone;
      
      let message = `**Reputação P2P do Criador da Operação**\n` +
                   `👤 **Usuário:** ${userName}\n\n` +
                   `${nivelIcon} **Nível**: ${nivelConfianca}\n` +
                   `⭐ **Score Total**: ${scoreTotal} pts\n\n` +
                   `👍🏽 **Avaliações Positivas Dadas**: ${avaliacoesPositivas}\n` +
                   `👎🏽 **Avaliações Negativas Dadas**: ${avaliacoesNegativas}\n\n` +
                   `${filter === 'positive' ? '👍' : '👎'} **Avaliações ${filter === 'positive' ? 'Positivas' : 'Negativas'} Recebidas:**\n\n`;
      
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
              callback_data: `reputation_main_${userId}`
            }
          ]
        ]
      };
      
      try {
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      } catch (editError) {
        if (editError.description && editError.description.includes('message is not modified')) {
          this.logger.log(`ℹ️ Mensagem de filtro já está atualizada, ignorando erro`);
          await ctx.answerCbQuery('✅ Filtro aplicado');
        } else {
          throw editError;
        }
      }
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
              callback_data: `reputation_main_${userId}`
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
      // Tentar responder ao callback, mas ignorar se expirado
      try {
        await ctx.answerCbQuery();
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado, continuando processamento:', cbError.description);
        } else {
          throw cbError; // Re-lançar outros erros
        }
      }
      
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
          // Chat privado - buscar karma total em todos os grupos COM histórico consolidado
          const totalKarma = await this.karmaService.getTotalKarmaForUser(user.userName || user.firstName);
          if (totalKarma) {
            // Usar a lógica de consolidação passando um chatId de grupo para forçar a busca consolidada
            const karmaWithHistory = await this.getKarmaForUserWithFallback(user, -1002907400287); // ID do grupo principal
            karmaDoc = karmaWithHistory;
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
          // Usar a lógica de consolidação para buscar histórico completo
          const karmaWithHistory = await this.getKarmaForUserWithFallback(totalKarma.user, -1002907400287);
          karmaDoc = karmaWithHistory;
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
      try {
        await ctx.answerCbQuery('❌ Erro ao carregar reputação', { show_alert: true });
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado no tratamento de erro:', cbError.description);
        } else {
          this.logger.error('Erro ao processar callback de reputação:', cbError);
        }
      }
    }
  }
  
  private async renderMainReputationScreen(ctx: any, targetUser: any, karmaDoc: any): Promise<void> {
    const nomeUsuario = targetUser.username ? `@${targetUser.username}` : (targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName);
    
    const scoreTotal = karmaDoc?.karma || 0;
    const avaliacoesPositivas = karmaDoc?.givenKarma || 0;
    const avaliacoesNegativas = karmaDoc?.givenHate || 0;
    
    // Calcular nível de confiança usando função centralizada
    const reputationInfo = getReputationInfo(karmaDoc);
    const nivelConfianca = reputationInfo.nivel;
    const nivelIcon = reputationInfo.icone;
    
    // Contadores de estrelas em formato de 2 colunas
     const stars5 = karmaDoc?.stars5 || 0;
     const stars4 = karmaDoc?.stars4 || 0;
     const stars3 = karmaDoc?.stars3 || 0;
     const stars2 = karmaDoc?.stars2 || 0;
     const stars1 = karmaDoc?.stars1 || 0;
     
     const starCounters = `5⭐️: ${stars5}      2⭐️: ${stars2}\n4⭐️: ${stars4}      1⭐️: ${stars1}\n3⭐️: ${stars3}`;
     
     // Processar histórico - formato simplificado
    const history = karmaDoc?.history || [];
    const recentHistory = history.slice(-10);
    let historyMessage = '';
    
    if (recentHistory.length === 0) {
      historyMessage = 'Nenhuma avaliação encontrada.';
    } else {
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
    
    const message = `**Reputação P2P do Criador da Operação**\n` +
       `👤 **Usuário:** ${nomeUsuario}\n\n` +
       `${nivelIcon} **Nível:** ${nivelConfianca}\n` +
       `⭐️ **Score Total:** ${scoreTotal} pts\n\n` +
       `**Distribuição de Avaliações:**\n${starCounters}\n\n\n` +
       `📋 **Últimas 10 Avaliações Recebidas:**\n\n${historyMessage}`;
    
    // Criar botões de navegação melhorados
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '5⭐',
            callback_data: `reputation_filter_star_5_${targetUser.userId || targetUser.id}`
          },
          {
            text: '4⭐',
            callback_data: `reputation_filter_star_4_${targetUser.userId || targetUser.id}`
          },
          {
            text: '3⭐',
            callback_data: `reputation_filter_star_3_${targetUser.userId || targetUser.id}`
          }
        ],
        [
          {
            text: '2⭐',
            callback_data: `reputation_filter_star_2_${targetUser.userId || targetUser.id}`
          },
          {
            text: '1⭐',
            callback_data: `reputation_filter_star_1_${targetUser.userId || targetUser.id}`
          },
          {
            text: '🔄️ Atualizar',
            callback_data: `reputation_refresh_${targetUser.userId || targetUser.id}`
          }
        ],
        [
          {
            text: '❌',
            callback_data: `reputation_close_${targetUser.userId || targetUser.id}`
          },
          {
            text: '➡️',
            callback_data: `reputation_more_${targetUser.userId || targetUser.id}_10`
          }
        ]
      ]
    };
    
    // NÃO-FATAL: se a mensagem for antiga/não editável, não estoura (viraria "Erro ao processar ação")
    const rendered = await safeEditMessageText(ctx, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    if (rendered) {
      this.logger.log(`✅ Tela principal renderizada com sucesso`);
    } else {
      this.logger.warn('Tela principal não pôde ser editada (mensagem antiga/não editável) — não-fatal');
    }
    await safeAnswerCbQuery(ctx, '✅ Dados atualizados');
  }

  private async refreshReputation(ctx: any, userId: string): Promise<void> {
    try {
      // Tentar responder ao callback, mas ignorar se expirado
      try {
        await ctx.answerCbQuery();
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado no refresh, continuando processamento:', cbError.description);
        } else {
          throw cbError; // Re-lançar outros erros
        }
      }
      
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
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado no tratamento de erro do refresh:', cbError.description);
        } else {
          this.logger.error('Erro ao responder callback de erro:', cbError);
        }
      }
    }
  }
}