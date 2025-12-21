import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { TermsAcceptanceService } from '../../users/terms-acceptance.service';
import { UsersService } from '../../users/users.service';
import { GroupsService } from '../../groups/groups.service';
import { ConfigService } from '@nestjs/config';
import { TelegramRetryService } from '../../shared/telegram-retry.service';

// Set de usuários aprovados pelo sistema de join request (preenchido pelo JoinRequestHandler)
// Usado para verificar se o usuário pode entrar via link de convite
export const approvedUsersSet = new Set<number>();

@Injectable()
export class NewMemberHandler implements OnModuleDestroy {
  private readonly logger = new Logger(NewMemberHandler.name);
  private readonly pendingAcceptances = new Map<string, {
    userId: number;
    groupId: number;
    messageId: number;
    timestamp: number;
    userName: string;
    reminderCount: number;
  }>();
  private cleanupTimer: NodeJS.Timeout;
  private readonly removalTimers = new Map<string, NodeJS.Timeout>();
  private readonly reminderTimers = new Map<string, NodeJS.Timeout>();

  // Configuração de lembretes (em minutos)
  private readonly REMINDER_INTERVAL_MINUTES = 5;
  private readonly TOTAL_TIME_MINUTES = 20;

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
    private readonly termsAcceptanceService: TermsAcceptanceService,
    private readonly usersService: UsersService,
    private readonly groupsService: GroupsService,
    private readonly configService: ConfigService,
    private readonly retryService: TelegramRetryService,
  ) {
    // Limpar pendências antigas a cada 5 minutos
    this.cleanupTimer = setInterval(() => this.cleanupExpiredPendencies(), 5 * 60 * 1000);
  }

  onModuleDestroy() {
    // Limpar interval de cleanup
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.logger.log('Cleanup timer cleared');
    }

    // Limpar todos os timeouts de remoção pendentes
    for (const [key, timeout] of this.removalTimers.entries()) {
      clearTimeout(timeout);
      this.logger.log(`Removal timer cleared for ${key}`);
    }
    this.removalTimers.clear();

    // Limpar todos os timers de lembretes pendentes
    for (const [key, timeout] of this.reminderTimers.entries()) {
      clearTimeout(timeout);
      this.logger.log(`Reminder timer cleared for ${key}`);
    }
    this.reminderTimers.clear();
  }

  private async notifyAdminChannel(message: string): Promise<void> {
    try {
      const adminChannelId = this.configService.get<string>('TELEGRAM_ADMIN_CHANNEL_ID');
      if (!adminChannelId) {
        this.logger.warn('TELEGRAM_ADMIN_CHANNEL_ID não configurado, notificação não enviada');
        return;
      }

      await this.retryService.executeWithRetry(() =>
        this.bot.telegram.sendMessage(
          adminChannelId,
          message,
          { parse_mode: 'Markdown' }
        )
      );
    } catch (error) {
      this.logger.error('Erro ao notificar canal admin:', error);
    }
  }

  private async getGroupInfo(chatId: number): Promise<string> {
    try {
      const chat = await this.bot.telegram.getChat(chatId);
      if ('title' in chat && chat.title) {
        return `${chat.title} (\`${chatId}\`)`;
      }
      return `\`${chatId}\``;
    } catch (error) {
      this.logger.warn(`Não foi possível obter info do grupo ${chatId}:`, error);
      return `\`${chatId}\``;
    }
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
      const userName = member.username ? `@${member.username}` : member.first_name;
      const mainGroupId = this.configService.get<string>('TELEGRAM_GROUP_ID');

      this.logger.log(`Novo membro detectado: ${userId} (${userName}) no grupo ${chatId}`);

      // Verificar se é o grupo principal configurado
      const isMainGroup = mainGroupId && parseInt(mainGroupId) === chatId;

      // Se for o grupo principal, verificar se usuário foi aprovado pelo sistema de join request
      if (isMainGroup) {
        // Verificar se o usuário está na lista de aprovados
        const isApproved = approvedUsersSet.has(userId);

        // Verificar se já tem termos aceitos (significa que foi aprovado anteriormente)
        const hasTerms = await this.termsAcceptanceService.hasUserAcceptedCurrentTerms(userId, chatId);

        if (!isApproved && !hasTerms) {
          // Usuário NÃO foi aprovado pelo sistema! Entrou via link não autorizado
          this.logger.warn(`🚫 ENTRADA NÃO AUTORIZADA: ${userName} (${userId}) - Removendo do grupo!`);

          const botUsername = this.configService.get<string>('TELEGRAM_BOT_USERNAME') || 'p2pscorebot';

          // Enviar mensagem NO GRUPO mencionando o usuário (ele vai ver antes de ser removido)
          try {
            const groupMessage = await this.retryService.executeWithRetry(() =>
              this.bot.telegram.sendMessage(
                chatId,
                `🚫 ${userName}, entrada não autorizada!\n\n` +
                `Para entrar neste grupo, você deve:\n` +
                `1️⃣ Clicar no botão abaixo\n` +
                `2️⃣ Aceitar os termos de responsabilidade\n` +
                `3️⃣ Aguardar aprovação de um admin\n\n` +
                `⚠️ Você será removido automaticamente.`,
                {
                  parse_mode: 'Markdown',
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: '📝 Solicitar Entrada Corretamente',
                          url: `https://t.me/${botUsername}?start=join`
                        }
                      ]
                    ]
                  }
                }
              )
            );

            // Apagar mensagem do grupo após 30 segundos
            setTimeout(async () => {
              try {
                await this.bot.telegram.deleteMessage(chatId, groupMessage.message_id);
              } catch (e) {
                // Ignorar erro ao deletar
              }
            }, 30000);

          } catch (groupMsgError) {
            this.logger.warn(`Não foi possível enviar mensagem no grupo para ${userId}`);
          }

          // Notificar admin
          await this.notifyAdminChannel(
            `🚫 **Entrada Não Autorizada Bloqueada**\n\n` +
            `👤 **Usuário:** ${userName}\n` +
            `🆔 **ID:** \`${userId}\`\n` +
            `📅 **Data:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
            `⚠️ **Motivo:** Usuário tentou entrar via link de convite sem passar pelo sistema de aprovação\n` +
            `🚫 **Ação:** Removido automaticamente do grupo`
          );

          // Remover usuário do grupo (com pequeno delay para ele ver a mensagem)
          setTimeout(async () => {
            await this.removeUserFromGroup(userId, chatId, 'Entrada não autorizada via link de convite');
          }, 2000);

          return; // Não continuar processamento
        }

        // Se foi aprovado pelo sistema, remover da lista (já usou o link)
        if (isApproved) {
          approvedUsersSet.delete(userId);
          this.logger.log(`✅ Usuário ${userId} entrou via aprovação do sistema - OK`);

          // Notificar admin sobre entrada bem-sucedida
          await this.notifyAdminChannel(
            `✅ **Entrada Autorizada**\n\n` +
            `👤 **Usuário:** ${userName}\n` +
            `🆔 **ID:** \`${userId}\`\n` +
            `📅 **Data:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
            `🎉 **Status:** Usuário aprovado entrou no grupo com sucesso`
          );

          return; // Usuário já tem termos aceitos do processo de aprovação
        }

        // Se tem termos aceitos mas não está na lista, pode ser admin adicionando manualmente
        if (hasTerms) {
          this.logger.log(`✅ Usuário ${userId} tem termos aceitos anteriormente - permitindo entrada`);
          return;
        }
      }

      // Para outros grupos ou membros adicionados por admin, seguir fluxo normal
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
      const botUsername = this.configService.get<string>('TELEGRAM_BOT_USERNAME') || 'p2pscorebot';
      const deepLink = `https://t.me/${botUsername}?start=terms_${chatId}`;

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
        `⏰ **Você tem 20 minutos para aceitar os termos, caso contrário será removido(a) automaticamente.**\n\n` +
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

      // Enviar mensagem discreta no grupo (membro adicionado por admin)
      try {
        const welcomeGroupMessage =
          `👋 ${userName} foi adicionado ao grupo.\n\n` +
          `📋 Por favor, aceite os termos de responsabilidade no privado do bot para participar.`;

        const welcomeGroupKeyboard = {
          inline_keyboard: [
            [
              {
                text: '📲 Aceitar Termos',
                url: deepLink
              }
            ]
          ]
        };

        await this.retryService.executeWithRetry(() =>
          this.bot.telegram.sendMessage(
            chatId,
            welcomeGroupMessage,
            {
              parse_mode: 'Markdown',
              reply_markup: welcomeGroupKeyboard
            }
          )
        );

        this.logger.log(`✅ Mensagem de boas-vindas enviada no GRUPO para ${userName} (${userId})`);
      } catch (groupMsgError) {
        this.logger.warn(`Não foi possível enviar boas-vindas no grupo para ${userId}:`, groupMsgError);
      }

      // Também tentar enviar no privado (pode falhar se usuário nunca iniciou conversa)
      let privateMessageSent = false;
      try {
        const privateMessage = await this.retryService.executeWithRetry(() =>
          this.bot.telegram.sendMessage(
            userId,
            message,
            {
              parse_mode: 'Markdown',
              reply_markup: keyboard
            }
          )
        );

        privateMessageSent = true;

        // Registrar pendência
        this.pendingAcceptances.set(`${userId}_${chatId}`, {
          userId,
          groupId: chatId,
          messageId: privateMessage.message_id,
          timestamp: Date.now(),
          userName,
          reminderCount: 0
        });

        // Log da ação
        this.logger.log(`✅ Termos enviados no privado para ${userName} (${userId}) no grupo ${chatId}`);

        // Notificar canal admin
        const groupInfo = await this.getGroupInfo(chatId);
        await this.notifyAdminChannel(
          `📋 **Termos Enviados**\n\n` +
          `👤 **Usuário:** ${userName}\n` +
          `🆔 **ID:** \`${userId}\`\n` +
          `🏢 **Grupo:** ${groupInfo}\n` +
          `📅 **Data:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n` +
          `✅ **Status:** Enviado no privado com sucesso`
        );

      } catch (privateError) {
        // Se não conseguir enviar no privado, já enviamos no grupo
        this.logger.warn(
          `⚠️ Não foi possível enviar termos no privado para ${userId}. ` +
          `Mensagem de boas-vindas já enviada no grupo. ` +
          `Usuário deve clicar no botão ou usar /termos.`
        );

        // Registrar pendência mesmo sem enviar mensagem no privado
        this.pendingAcceptances.set(`${userId}_${chatId}`, {
          userId,
          groupId: chatId,
          messageId: 0, // Sem mensagem enviada no privado
          timestamp: Date.now(),
          userName,
          reminderCount: 0
        });

        // Notificar canal admin sobre falha no privado
        const groupInfo = await this.getGroupInfo(chatId);
        await this.notifyAdminChannel(
          `⚠️ **Termos Enviados (apenas no grupo)**\n\n` +
          `👤 **Usuário:** ${userName}\n` +
          `🆔 **ID:** \`${userId}\`\n` +
          `🏢 **Grupo:** ${groupInfo}\n` +
          `📅 **Data:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n` +
          `⚠️ **Status:** Mensagem no grupo OK, privado bloqueado\n` +
          `⏰ **Ação:** Será removido em ${this.TOTAL_TIME_MINUTES} minutos se não aceitar\n\n` +
          `🔗 **Deep Link:** ${deepLink}`
        );
      }

      // Agendar remoção automática após 20 minutos
      const timerKey = `${userId}_${chatId}`;
      const removalTimer = setTimeout(() => {
        this.checkAndRemoveUser(userId, chatId);
        this.removalTimers.delete(timerKey); // Remover timer após execução
        // Limpar timer de lembretes também
        const reminderTimer = this.reminderTimers.get(timerKey);
        if (reminderTimer) {
          clearTimeout(reminderTimer);
          this.reminderTimers.delete(timerKey);
        }
      }, this.TOTAL_TIME_MINUTES * 60 * 1000); // 20 minutos

      // Armazenar referência do timer para cleanup
      this.removalTimers.set(timerKey, removalTimer);

      // Agendar primeiro lembrete após 5 minutos
      this.scheduleReminder(userId, chatId);

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

      // Cancelar lembretes e timer de remoção
      this.cancelReminders(userId, groupId);
      const removalTimer = this.removalTimers.get(`${userId}_${groupId}`);
      if (removalTimer) {
        clearTimeout(removalTimer);
        this.removalTimers.delete(`${userId}_${groupId}`);
      }

      // Obter informações do usuário
      const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

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

      // Notificar canal admin sobre aceitação
      const groupInfo = await this.getGroupInfo(groupId);
      await this.notifyAdminChannel(
        `✅ **Termos Aceitos**\n\n` +
        `👤 **Usuário:** ${userName}\n` +
        `🆔 **ID:** \`${userId}\`\n` +
        `🏢 **Grupo:** ${groupInfo}\n` +
        `📅 **Data:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n` +
        `🎉 **Status:** Usuário aceitou os termos e pode participar do grupo`
      );

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
      // Cancelar lembretes e timer de remoção
      this.cancelReminders(userId, groupId);
      const removalTimer = this.removalTimers.get(`${userId}_${groupId}`);
      if (removalTimer) {
        clearTimeout(removalTimer);
        this.removalTimers.delete(`${userId}_${groupId}`);
      }
      this.pendingAcceptances.delete(`${userId}_${groupId}`);

      // Obter informações do usuário
      const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

      // Atualizar mensagem
      await ctx.editMessageText(
        `❌ **Termos Não Aceitos**\n\n` +
        `Você optou por não aceitar os termos de responsabilidade.\n` +
        `Você será removido(a) do grupo automaticamente.\n\n` +
        `📅 **Rejeitado em:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        { parse_mode: 'Markdown' }
      );

      await ctx.answerCbQuery('❌ Termos rejeitados. Você será removido do grupo.');

      // Notificar canal admin sobre rejeição
      const groupInfo = await this.getGroupInfo(groupId);
      await this.notifyAdminChannel(
        `❌ **Termos Rejeitados**\n\n` +
        `👤 **Usuário:** ${userName}\n` +
        `🆔 **ID:** \`${userId}\`\n` +
        `🏢 **Grupo:** ${groupInfo}\n` +
        `📅 **Data:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n` +
        `🚫 **Status:** Usuário rejeitou os termos e será removido do grupo`
      );

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

        // Limpar timer de remoção já que usuário aceitou
        const timer = this.removalTimers.get(pendingKey);
        if (timer) {
          clearTimeout(timer);
          this.removalTimers.delete(pendingKey);
        }
        return;
      }

      // Usuário não respondeu no tempo limite, remover do grupo
      await this.removeUserFromGroup(userId, groupId, 'Tempo limite para aceitar os termos expirado');

      // Notificar canal admin sobre remoção por timeout
      const groupInfo = await this.getGroupInfo(groupId);
      await this.notifyAdminChannel(
        `⏰ **Usuário Removido por Timeout**\n\n` +
        `🆔 **ID:** \`${userId}\`\n` +
        `🏢 **Grupo:** ${groupInfo}\n` +
        `📅 **Data:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n` +
        `⚠️ **Motivo:** Não aceitou os termos em 20 minutos\n` +
        `🚫 **Status:** Removido automaticamente do grupo`
      );

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
      // Se messageId é 0, significa que não foi enviada mensagem (usuário bloqueou bot)
      if (messageId === 0) {
        this.logger.log(`Sem mensagem para limpar do usuário ${userId} (não foi enviada)`);
        return;
      }

      // Tentar apagar a mensagem de termos do privado
      await this.retryService.executeWithRetry(() =>
        this.bot.telegram.deleteMessage(userId, messageId)
      );
      this.logger.log(`Mensagem de termos removida do privado do usuário ${userId}`);
    } catch (error) {
      // Pode falhar se o usuário bloqueou o bot ou mensagem já foi deletada
      this.logger.warn(`Não foi possível remover mensagem de termos do usuário ${userId}:`, error.description || error.message);
    }
  }

  private scheduleReminder(userId: number, groupId: number): void {
    const timerKey = `${userId}_${groupId}`;

    // Agendar lembrete para daqui a 5 minutos
    const reminderTimer = setTimeout(() => {
      this.sendReminder(userId, groupId);
    }, this.REMINDER_INTERVAL_MINUTES * 60 * 1000);

    this.reminderTimers.set(timerKey, reminderTimer);
  }

  private async sendReminder(userId: number, groupId: number): Promise<void> {
    const timerKey = `${userId}_${groupId}`;
    const pending = this.pendingAcceptances.get(timerKey);

    if (!pending) {
      // Usuário já aceitou ou foi removido
      this.reminderTimers.delete(timerKey);
      return;
    }

    // Verificar se já aceitou os termos
    const hasAccepted = await this.termsAcceptanceService.hasUserAcceptedCurrentTerms(userId, groupId);
    if (hasAccepted) {
      this.pendingAcceptances.delete(timerKey);
      this.reminderTimers.delete(timerKey);
      return;
    }

    // Incrementar contador de lembretes
    pending.reminderCount++;
    this.pendingAcceptances.set(timerKey, pending);

    // Calcular tempo restante
    const elapsedMinutes = pending.reminderCount * this.REMINDER_INTERVAL_MINUTES;
    const remainingMinutes = this.TOTAL_TIME_MINUTES - elapsedMinutes;

    // Se ainda há tempo, enviar lembrete
    if (remainingMinutes > 0) {
      try {
        const reminderMessage =
          `⏰ **LEMBRETE - Termos de Responsabilidade**\n\n` +
          `👋 Olá ${pending.userName}!\n\n` +
          `📋 Você ainda **NÃO ACEITOU** os termos de responsabilidade do grupo.\n\n` +
          `⚠️ **ATENÇÃO:** Você será **REMOVIDO(A) automaticamente** em **${remainingMinutes} minutos** se não aceitar os termos!\n\n` +
          `📖 **Por favor, leia os termos acima e clique em "✅ ACEITO OS TERMOS" para permanecer no grupo.**\n\n` +
          `⏱️ **Tempo restante:** ${remainingMinutes} minutos`;

        await this.retryService.executeWithRetry(() =>
          this.bot.telegram.sendMessage(
            userId,
            reminderMessage,
            { parse_mode: 'Markdown' }
          )
        );

        this.logger.log(`📢 Lembrete ${pending.reminderCount} enviado para ${pending.userName} (${userId}) - ${remainingMinutes} min restantes`);

      } catch (error) {
        this.logger.warn(`Não foi possível enviar lembrete para ${userId}:`, error.description || error.message);
      }

      // Agendar próximo lembrete se ainda houver tempo
      if (remainingMinutes > this.REMINDER_INTERVAL_MINUTES) {
        this.scheduleReminder(userId, groupId);
      }
    }
  }

  private cancelReminders(userId: number, groupId: number): void {
    const timerKey = `${userId}_${groupId}`;
    const reminderTimer = this.reminderTimers.get(timerKey);
    if (reminderTimer) {
      clearTimeout(reminderTimer);
      this.reminderTimers.delete(timerKey);
      this.logger.log(`Lembretes cancelados para ${userId} no grupo ${groupId}`);
    }
  }

  private async removeUserFromGroup(userId: number, groupId: number, reason: string): Promise<void> {
    try {
      // Usar ban temporário que expira em 60 segundos - isso permite que a pessoa seja adicionada novamente
      // O parâmetro untilDate como timestamp Unix faz um "kick" efetivo
      const untilDate = Math.floor(Date.now() / 1000) + 60; // Expira em 60 segundos

      await this.bot.telegram.banChatMember(groupId, userId, untilDate);
      this.logger.log(`Usuário ${userId} removido do grupo ${groupId} com ban temporário (expira em 60s)`);

      // Também fazer unban imediato para garantir que pode ser adicionado de volta
      try {
        // Pequeno delay para evitar race condition
        await new Promise(resolve => setTimeout(resolve, 500));
        await this.bot.telegram.unbanChatMember(groupId, userId, { only_if_banned: true });
        this.logger.log(`Usuário ${userId} desbanido do grupo ${groupId} - pode ser adicionado novamente`);
      } catch (unbanError: any) {
        // Se falhar o unban, não é crítico pois o ban é temporário
        this.logger.warn(`Aviso ao desbanir usuário ${userId}:`, unbanError.description || unbanError.message);
      }

      // Remover registros de aceitação de termos
      await this.termsAcceptanceService.removeUserFromGroup(userId, groupId);

      this.logger.log(`Usuário ${userId} removido do grupo ${groupId}. Motivo: ${reason}`);

    } catch (error: any) {
      this.logger.error(`Erro ao remover usuário ${userId} do grupo ${groupId}:`, error.description || error.message);
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
      await this.retryService.executeWithRetry(() =>
        this.bot.telegram.sendMessage(
          userId,
          welcomeMessage,
          {
            parse_mode: 'Markdown',
            reply_markup: mainCommandsKeyboard
          }
        )
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
