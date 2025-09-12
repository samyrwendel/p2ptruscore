import { Injectable } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';
import { KarmaService } from '../../../karma/karma.service';
import { UsersService } from '../../../users/users.service';
import { getReputationInfoColored } from '../../../shared/reputation.utils';

@Injectable()
export class HelloCommandHandler implements ITextCommandHandler {
  // Aceita: /hello, /ola
  command = /^\/(hello|ola)$/;

  constructor(
    @InjectBot('DEFAULT_BOT_NAME') private readonly bot: Telegraf,
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
    try {
      // Deletar a mensagem do comando imediatamente
      try {
        await ctx.deleteMessage(ctx.message.message_id);
      } catch (error) {
        // Ignora erro se não conseguir deletar (ex: mensagem muito antiga)
      }

      const targetGroupId = -1002907400287; // ID do grupo Trust P2P
      const sendOptions = {
        parse_mode: 'Markdown' as const,
        message_thread_id: 6, // Tópico específico
      };

      // Buscar reputação do usuário
      let karmaInfo: any = null;
      let reputationText = '';
      try {
        const user = await this.usersService.findOneByUserId(ctx.from.id);
        karmaInfo = await this.getKarmaForUserWithFallback(user, targetGroupId);
        if (karmaInfo) {
          const reputationInfo = getReputationInfoColored(karmaInfo);
          reputationText = `${reputationInfo.emoji} **Reputação:** ${reputationInfo.score} pts | ${reputationInfo.nivel}\n`;
        }
      } catch (error) {
        // Ignora erro se não conseguir buscar reputação
      }

      const userName = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || 'Usuário');
      
      // Enviar mensagem de ordem no tópico
      const orderMessage = (
        '📋 **ORDEM EXECUTADA**\n\n' +
        '🤖 **Comando:** `/hello`\n' +
        '👤 **Executado por:** ' + userName + '\n' +
        reputationText +
        '⏰ **Horário:** ' + new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + '\n' +
        '🎯 **Status:** Comando processado com sucesso\n\n' +
        '💡 **Mensagem:** Hello! Olá pessoal do grupo!\n\n' +
        '✅ **Sistema operacional e funcionando perfeitamente!**'
      );

      await this.bot.telegram.sendMessage(
        targetGroupId,
        orderMessage,
        sendOptions
      );

      // Criar notificação popup temporária
      const notification = await ctx.reply('✅ Ordem do comando /hello enviada para o tópico 6 do grupo Trust P2P!');
      
      // Deletar a notificação após 3 segundos
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(notification.message_id);
        } catch (error) {
          // Ignora erro se não conseguir deletar
        }
      }, 3000);
      
    } catch (error) {
      console.error('Erro ao executar comando hello:', error);
      await ctx.reply('Erro ao executar comando.');
    }
  }
}