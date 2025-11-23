import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { TermsAcceptanceService } from '../../users/terms-acceptance.service';
import { UsersService } from '../../users/users.service';
import { GroupsService } from '../../groups/groups.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NewMemberHandler {
  private readonly logger = new Logger(NewMemberHandler.name);
  private readonly pendingAcceptances = new Map<string, {
    userId: number;
    groupId: number;
    messageId: number;
    timestamp: number;
  }>();

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
    private readonly termsAcceptanceService: TermsAcceptanceService,
    private readonly usersService: UsersService,
    private readonly groupsService: GroupsService,
    private readonly configService: ConfigService,
  ) {
    // Limpar pendências antigas a cada 5 minutos
    setInterval(() => this.cleanupExpiredPendencies(), 5 * 60 * 1000);
  }

  async handleNewChatMembers(ctx: Context & { update: Update.MessageUpdate }): Promise<void> {
    try {
      const message = ctx.update.message;
      if (!('new_chat_members' in message) || !message.new_chat_members) {
        return;
      }

      const chatId = message.chat.id;
      const newMembers = message.new_chat_members;

      for (const member of newMembers) {
        // Ignorar bots
        if (member.is_bot) {
          continue;
        }

        await this.processNewMember(member, chatId);
      }
    } catch (error) {
      this.logger.error('Erro ao processar novos membros:', error);
    }
  }

  private async processNewMember(member: any, chatId: number): Promise<void> {
    try {
      const userId = member.id;
      
      this.logger.log(`Novo membro detectado: ${userId} no grupo ${chatId}`);

      // SEMPRE apresentar termos para quem entra/volta ao grupo
      // Isso garante que mesmo quem já aceitou antes precisa aceitar novamente
      // se saiu e voltou (política de segurança)
      
      // Verificar se havia aceite anterior (indica retorno ao grupo)
      const hadPreviousAcceptance = await this.termsAcceptanceService.hasUserAcceptedCurrentTerms(
        userId,
        chatId
      );
      
      if (hadPreviousAcceptance) {
        this.logger.log(`🔄 RETORNO ao grupo detectado: ${userId} - forçando novo aceite de termos`);
        // Remover aceite anterior (política de segurança para retornos)
        await this.termsAcceptanceService.removeUserFromGroup(userId, chatId);
      } else {
        this.logger.log(`🆕 NOVO membro detectado: ${userId} - apresentando termos obrigatórios`);
      }

      // Apresentar termos de responsabilidade
      await this.presentTermsToUser(userId, member, chatId);
    } catch (error) {
      this.logger.error(`Erro ao processar novo membro ${member.id}:`, error);
    }
  }

  private async presentTermsToUser(userId: number, member: any, chatId: number): Promise<void> {
    try {
      const userName = member.username ? `@${member.username}` : member.first_name;
      const termsText = this.termsAcceptanceService.getTermsText();
      
      const message = (
        `🎉 **Bem-vindo(a) ao grupo, ${userName}!**\n\n` +
        `🔒 **POLÍTICA DE SEGURANÇA:** Todos os membros (incluindo quem retorna) devem aceitar os termos atuais.\n\n` +
        `🔄 *Por que preciso aceitar novamente?*\n` +
        `Nossos termos foram modificados para melhor proteger você e a comunidade. Mesmo usuários que já estavam no grupo precisam aceitar as novas condições.\n\n` +
        termsText + `\n\n` +
        `👤 **Usuário:** ${userName}\n` +
        `🆔 **ID:** \`${userId}\`\n` +
        `📅 **Data:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
        `⏰ **Você tem 5 minutos para aceitar os termos, caso contrário será removido(a) automaticamente.**\n\n` +
        `💡 **Nota:** Se você já estava no grupo antes, precisa aceitar novamente por segurança.`
      );

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: '✅ ACEITO OS TERMOS',
              callback_data: `accept_terms_${userId}_${chatId}`
            },
            {
              text: '❌ NÃO ACEITO',
              callback_data: `reject_terms_${userId}_${chatId}`
            }
          ]
        ]
      };

      // Enviar mensagem privada primeiro (se possível)
      try {
        const privateMessage = await this.bot.telegram.sendMessage(
          userId,
          message,
          {
            parse_mode: 'Markdown',
            reply_markup: keyboard
          }
        );

        // Registrar pendência
        this.pendingAcceptances.set(`${userId}_${chatId}`, {
          userId,
          groupId: chatId,
          messageId: privateMessage.message_id,
          timestamp: Date.now()
        });

        // Log da ação sem poluir o grupo
        this.logger.log(`Termos enviados no privado para ${userName} (${userId}) no grupo ${chatId}`);

      } catch (privateError) {
        // Se não conseguir enviar no privado, orientar a abrir PV do bot e usar /termos
        this.logger.warn(`Não foi possível enviar mensagem privada para ${userId}, orientando abrir PV`);
        const botUsername = this.configService.get<string>('TELEGRAM_BOT_USERNAME') || 'p2pscorebot';
        const deepLink = `https://t.me/${botUsername}?start=terms_${chatId}`;
        const instruction = (
          `🔒 **Aceite de Termos no Privado**\n\n` +
          `Não foi possível enviar os termos no seu privado.\n` +
          `Por favor, abra o chat com o bot e envie o comando \`/termos\` para aceitar.\n\n` +
          `📩 Clique no botão abaixo para abrir o PV do bot.`
        );
        const groupMessage = await this.bot.telegram.sendMessage(
          chatId,
          instruction,
          {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '📩 Abrir PV do Bot', url: deepLink }]] }
          }
        );
        this.pendingAcceptances.set(`${userId}_${chatId}`, {
          userId,
          groupId: chatId,
          messageId: groupMessage.message_id,
          timestamp: Date.now()
        });
      }

      // Agendar remoção automática após 5 minutos
      setTimeout(() => {
        this.checkAndRemoveUser(userId, chatId);
      }, 5 * 60 * 1000); // 5 minutos

    } catch (error) {
      this.logger.error(`Erro ao apresentar termos para usuário ${userId}:`, error);
    }
  }

  async handleCallback(ctx: any): Promise<boolean> {
    try {
      const data = ctx.callbackQuery?.data;
      if (!data || (!data.startsWith('accept_terms_') && !data.startsWith('reject_terms_') && !data.startsWith('view_terms_detail_'))) {
        return false;
      }

      // Verificar se é callback de visualização detalhada
      if (data.startsWith('view_terms_detail_')) {
        const parts = data.replace('view_terms_detail_', '').split('_');
        const userId = parseInt(parts[0]);
        const groupId = parseInt(parts[1]);
        
        if (ctx.from.id !== userId) {
          await ctx.answerCbQuery('❌ Você não pode ver termos de outro usuário', { show_alert: true });
          return true;
        }
        
        await this.showDetailedTerms(ctx);
        return true;
      }

      const isAccept = data.startsWith('accept_terms_');
      const parts = data.replace(isAccept ? 'accept_terms_' : 'reject_terms_', '').split('_');
      const userId = parseInt(parts[0]);
      const groupId = parseInt(parts[1]);

      // Verificar se é o próprio usuário
      if (ctx.from.id !== userId) {
        await ctx.answerCbQuery('❌ Você não pode responder por outro usuário', { show_alert: true });
        return true;
      }

      // Garantir que aceite/rejeição ocorra APENAS no chat privado
      const chatType = ctx.callbackQuery?.message?.chat?.type;
      if (chatType !== 'private') {
        await ctx.answerCbQuery('🚫 Aceite apenas no chat privado com o bot. Abra o PV e envie /termos.', { show_alert: true });
        return true;
      }

      if (isAccept) {
        await this.processTermsAcceptance(ctx, userId, groupId);
      } else {
        await this.processTermsRejection(ctx, userId, groupId);
      }

      return true;
    } catch (error) {
      this.logger.error('Erro ao processar callback de termos:', error);
      await ctx.answerCbQuery('❌ Erro ao processar resposta', { show_alert: true });
      return true;
    }
  }

  private async processTermsAcceptance(ctx: any, userId: number, groupId: number): Promise<void> {
    try {
      // Registrar aceitação
      await this.termsAcceptanceService.recordUserAcceptance(
        userId,
        groupId,
        ctx.callbackQuery?.from?.language_code
      );

      // Remover da lista de pendências
      this.pendingAcceptances.delete(`${userId}_${groupId}`);

      // Atualizar mensagem
      await ctx.editMessageText(
        `✅ **Termos Aceitos com Sucesso!**\n\n` +
        `Obrigado por aceitar os termos de responsabilidade.\n` +
        `Você agora pode participar plenamente do grupo.\n\n` +
        `📅 **Aceito em:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n` +
        `🆔 **Versão dos Termos:** ${this.termsAcceptanceService.getCurrentTermsVersion()}`,
        { parse_mode: 'Markdown' }
      );

      await ctx.answerCbQuery('✅ Termos aceitos! Bem-vindo(a) ao grupo!');

      // Enviar mensagem de boas-vindas no privado
      try {
        const member = await this.bot.telegram.getChatMember(groupId, userId);
        await this.sendWelcomeMessagePrivate(userId, member.user, groupId);
      } catch (error) {
        this.logger.warn(`Erro ao enviar boas-vindas privada para ${userId}:`, error);
      }

    } catch (error) {
      this.logger.error(`Erro ao processar aceitação de termos para ${userId}:`, error);
      await ctx.answerCbQuery('❌ Erro ao processar aceitação', { show_alert: true });
    }
  }

  private async processTermsRejection(ctx: any, userId: number, groupId: number): Promise<void> {
    try {
      // Atualizar mensagem
      await ctx.editMessageText(
        `❌ **Termos Não Aceitos**\n\n` +
        `Você optou por não aceitar os termos de responsabilidade.\n` +
        `Você será removido(a) do grupo automaticamente.\n\n` +
        `📅 **Rejeitado em:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        { parse_mode: 'Markdown' }
      );

      await ctx.answerCbQuery('❌ Termos rejeitados. Você será removido do grupo.');

      // Remover usuário do grupo
      await this.removeUserFromGroup(userId, groupId, 'Termos de responsabilidade rejeitados');

    } catch (error) {
      this.logger.error(`Erro ao processar rejeição de termos para ${userId}:`, error);
      await ctx.answerCbQuery('❌ Erro ao processar rejeição', { show_alert: true });
    }
  }

  private async checkAndRemoveUser(userId: number, groupId: number): Promise<void> {
    try {
      const pendingKey = `${userId}_${groupId}`;
      const pending = this.pendingAcceptances.get(pendingKey);

      if (!pending) {
        // Usuário já respondeu ou foi removido
        return;
      }

      // Verificar se aceitou os termos
      const hasAccepted = await this.termsAcceptanceService.hasUserAcceptedCurrentTerms(
        userId,
        groupId
      );

      if (hasAccepted) {
        // Usuário aceitou, remover da lista de pendências e limpar mensagem
        this.pendingAcceptances.delete(pendingKey);
        await this.cleanupTermsMessage(userId, pending.messageId);
        return;
      }

      // Usuário não respondeu no tempo limite, remover do grupo
      await this.removeUserFromGroup(userId, groupId, 'Tempo limite para aceitar os termos expirado');
      
      // Limpar mensagem de termos do privado
      await this.cleanupTermsMessage(userId, pending.messageId);
      
      // Remover da lista de pendências
      this.pendingAcceptances.delete(pendingKey);

    } catch (error) {
      this.logger.error(`Erro ao verificar e remover usuário ${userId}:`, error);
    }
  }

  private async cleanupTermsMessage(userId: number, messageId: number): Promise<void> {
    try {
      // Tentar apagar a mensagem de termos do privado
      await this.bot.telegram.deleteMessage(userId, messageId);
      this.logger.log(`Mensagem de termos removida do privado do usuário ${userId}`);
    } catch (error) {
      // Pode falhar se o usuário bloqueou o bot ou mensagem já foi deletada
      this.logger.warn(`Não foi possível remover mensagem de termos do usuário ${userId}:`, error.description || error.message);
    }
  }

  private async removeUserFromGroup(userId: number, groupId: number, reason: string): Promise<void> {
    try {
      // Remover usuário do grupo
      await this.bot.telegram.banChatMember(groupId, userId);
      
      // Desbanir imediatamente para permitir que entre novamente no futuro
      setTimeout(async () => {
        try {
          await this.bot.telegram.unbanChatMember(groupId, userId);
        } catch (unbanError) {
          this.logger.warn(`Erro ao desbanir usuário ${userId}:`, unbanError);
        }
      }, 1000);

      // Remover registros de aceitação de termos
      await this.termsAcceptanceService.removeUserFromGroup(userId, groupId);

      this.logger.log(`Usuário ${userId} removido do grupo ${groupId}. Motivo: ${reason}`);

      // Log da remoção sem poluir o grupo
      this.logger.log(`Usuário ${userId} removido do grupo ${groupId} por não aceitar os termos`);

    } catch (error) {
      this.logger.error(`Erro ao remover usuário ${userId} do grupo ${groupId}:`, error);
    }
  }

  private async sendWelcomeMessagePrivate(userId: number, member: any, groupId: number): Promise<void> {
    try {
      const userName = member.username ? `@${member.username}` : member.first_name;
      
      // Usar a mesma mensagem de boas-vindas do comando /start com botões
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

      // Enviar no privado do usuário com botões
      await this.bot.telegram.sendMessage(
        userId,
        welcomeMessage,
        { 
          parse_mode: 'Markdown',
          reply_markup: mainCommandsKeyboard
        }
      );

    } catch (error) {
      this.logger.warn(`Erro ao enviar mensagem de boas-vindas privada para ${userId}:`, error);
    }
  }

  private async showDetailedTerms(ctx: any): Promise<void> {
    const termsText = this.termsAcceptanceService.getTermsText();
    const version = this.termsAcceptanceService.getCurrentTermsVersion();

    const detailedMessage = (
      `📋 **TERMOS DETALHADOS - TRUSTSCORE P2P**\n\n` +
      termsText + `\n\n` +
      `📊 **Informações Técnicas:**\n` +
      `🆔 **Versão dos Termos:** ${version}\n` +
      `📅 **Visualizado em:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n` +
      `👤 **Usuário:** ${ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name}\n\n` +
      `💡 **Após ler, volte à mensagem anterior para aceitar ou rejeitar os termos.**`
    );

    // Enviar em mensagem separada para não perder os botões originais
    await ctx.reply(detailedMessage, { parse_mode: 'Markdown' });
    await ctx.answerCbQuery('📋 Termos detalhados enviados acima');
  }

  private cleanupExpiredPendencies(): void {
    const now = Date.now();
    const expiredTime = 10 * 60 * 1000; // 10 minutos

    for (const [key, pending] of this.pendingAcceptances.entries()) {
      if (now - pending.timestamp > expiredTime) {
        this.pendingAcceptances.delete(key);
        this.logger.log(`Pendência expirada removida: ${key}`);
      }
    }
  }

  // Método para obter estatísticas
  getPendingAcceptancesCount(): number {
    return this.pendingAcceptances.size;
  }

  getPendingAcceptances(): Array<{ userId: number; groupId: number; timestamp: number }> {
    return Array.from(this.pendingAcceptances.values());
  }
}
