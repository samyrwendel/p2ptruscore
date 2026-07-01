import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { TermsAcceptanceService } from '../../users/terms-acceptance.service';
import { UsersService } from '../../users/users.service';
import { ConfigService } from '@nestjs/config';
import { TelegramRetryService } from '../../shared/telegram-retry.service';
import { approvedUsersSet } from './new-member.handler';

interface JoinRequest {
  userId: number;
  userName: string;
  requestedAt: Date;
  termsAccepted: boolean;
  termsAcceptedAt?: Date;
  status: 'pending_terms' | 'pending_approval' | 'approved' | 'rejected';
  adminMessageId?: number;
  adminMessageIds?: Map<number, number>; // IDs das mensagens enviadas para cada admin (adminId -> messageId)
  approvalMessageId?: number; // ID da mensagem de aprovação enviada ao usuário
}

@Injectable()
export class JoinRequestHandler {
  private readonly logger = new Logger(JoinRequestHandler.name);

  // Armazena solicitações pendentes em memória (pode ser migrado para MongoDB depois)
  private readonly pendingRequests = new Map<number, JoinRequest>();

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
    private readonly termsAcceptanceService: TermsAcceptanceService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly retryService: TelegramRetryService,
  ) {}

  // Verificar se usuário é membro do grupo
  async isUserMemberOfGroup(userId: number): Promise<boolean> {
    try {
      const groupId = this.getGroupId();
      if (!groupId) return false;

      const member = await this.bot.telegram.getChatMember(groupId, userId);
      const activeStatuses = ['member', 'administrator', 'creator'];
      return activeStatuses.includes(member.status);
    } catch (error) {
      // Usuário não é membro
      return false;
    }
  }

  // Verificar se usuário já aceitou termos
  async hasAcceptedTerms(userId: number): Promise<boolean> {
    const groupId = this.getGroupId();
    if (!groupId) return false;
    return this.termsAcceptanceService.hasUserAcceptedCurrentTerms(userId, groupId);
  }

  // Obter ID do grupo configurado
  private getGroupId(): number | null {
    const groupId = this.configService.get<string>('TELEGRAM_GROUP_ID');
    return groupId ? parseInt(groupId) : null;
  }

  // Obter ID do canal admin
  private getAdminChannelId(): string | null {
    return this.configService.get<string>('TELEGRAM_ADMIN_CHANNEL_ID') || null;
  }

  // Iniciar processo de solicitação de entrada
  async startJoinRequest(ctx: any): Promise<void> {
    const userId = ctx.from.id;
    const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

    // Verificar se já é membro
    const isMember = await this.isUserMemberOfGroup(userId);
    if (isMember) {
      // Já é membro, verificar se precisa aceitar termos
      const hasTerms = await this.hasAcceptedTerms(userId);
      if (!hasTerms) {
        await this.showTermsForExistingMember(ctx);
        return;
      }
      // Já é membro com termos aceitos
      return;
    }

    // Verificar se já tem solicitação pendente
    const existingRequest = this.pendingRequests.get(userId);
    if (existingRequest) {
      if (existingRequest.status === 'pending_approval') {
        await ctx.reply(
          `⏳ **Solicitação Pendente**\n\n` +
          `Sua solicitação de entrada já foi enviada e está aguardando aprovação de um administrador.\n\n` +
          `📅 **Enviada em:** ${existingRequest.requestedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
          `💡 Por favor, aguarde. Você será notificado quando um admin aprovar ou recusar sua entrada.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
    }

    // Criar nova solicitação e mostrar termos
    this.pendingRequests.set(userId, {
      userId,
      userName,
      requestedAt: new Date(),
      termsAccepted: false,
      status: 'pending_terms'
    });

    await this.showTermsForJoinRequest(ctx);
  }

  // Mostrar termos para solicitação de entrada
  private async showTermsForJoinRequest(ctx: any): Promise<void> {
    const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const termsText = this.termsAcceptanceService.getTermsText();
    const groupId = this.getGroupId();

    // Tentar obter nome do grupo
    let groupName = 'TrustScore P2P';
    try {
      if (groupId) {
        const chat = await this.bot.telegram.getChat(groupId);
        if ('title' in chat && chat.title) {
          groupName = chat.title;
        }
      }
    } catch (error) {
      this.logger.warn('Não foi possível obter nome do grupo');
    }

    const message = (
      `🎉 **Bem-vindo(a), ${userName}!**\n\n` +
      `📋 **Para solicitar entrada no grupo ${groupName}**, você precisa aceitar os termos de responsabilidade.\n\n` +
      termsText + `\n\n` +
      `👤 **Usuário:** ${userName}\n` +
      `🆔 **ID:** \`${ctx.from.id}\`\n` +
      `📅 **Data:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
      `⚠️ **Ao aceitar, sua solicitação será enviada para aprovação de um administrador.**`
    );

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '✅ ACEITO E SOLICITO ENTRADA',
            callback_data: `join_accept_terms_${ctx.from.id}`
          }
        ],
        [
          {
            text: '❌ NÃO ACEITO',
            callback_data: `join_reject_terms_${ctx.from.id}`
          }
        ]
      ]
    };

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  // Mostrar termos para membro existente que precisa aceitar
  private async showTermsForExistingMember(ctx: any): Promise<void> {
    const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const termsText = this.termsAcceptanceService.getTermsText();
    const groupId = this.getGroupId();

    const message = (
      `👋 **Olá, ${userName}!**\n\n` +
      `📋 **Você já é membro do grupo**, mas precisa aceitar os termos de responsabilidade atuais para continuar usando o bot.\n\n` +
      termsText + `\n\n` +
      `👤 **Usuário:** ${userName}\n` +
      `🆔 **ID:** \`${ctx.from.id}\`\n` +
      `📅 **Data:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
    );

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '✅ ACEITO OS TERMOS',
            callback_data: `accept_terms_${ctx.from.id}_${groupId}`
          },
          {
            text: '❌ NÃO ACEITO',
            callback_data: `reject_terms_${ctx.from.id}_${groupId}`
          }
        ]
      ]
    };

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  // Processar aceitação de termos e enviar para aprovação
  async processJoinTermsAcceptance(ctx: any, odId: number): Promise<void> {
    if (ctx.from.id !== odId) {
      await ctx.answerCbQuery('❌ Você não pode aceitar por outro usuário', { show_alert: true });
      return;
    }

    const request = this.pendingRequests.get(odId);
    if (!request || request.status !== 'pending_terms') {
      await ctx.answerCbQuery('❌ Solicitação não encontrada ou já processada', { show_alert: true });
      return;
    }

    // Atualizar status
    request.termsAccepted = true;
    request.termsAcceptedAt = new Date();
    request.status = 'pending_approval';
    this.pendingRequests.set(odId, request);

    // Atualizar mensagem do usuário
    await ctx.editMessageText(
      `✅ **Termos Aceitos!**\n\n` +
      `🎉 Sua solicitação foi enviada para aprovação.\n\n` +
      `⏳ **Status:** Aguardando aprovação de um administrador\n` +
      `📅 **Enviado em:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
      `💡 Você será notificado quando sua solicitação for analisada.`,
      { parse_mode: 'Markdown' }
    );

    await ctx.answerCbQuery('✅ Solicitação enviada para aprovação!');

    // Enviar para canal admin
    await this.sendJoinRequestToAdmins(odId, request);
  }

  // Processar rejeição de termos
  async processJoinTermsRejection(ctx: any, odId: number): Promise<void> {
    if (ctx.from.id !== odId) {
      await ctx.answerCbQuery('❌ Você não pode responder por outro usuário', { show_alert: true });
      return;
    }

    // Remover solicitação
    this.pendingRequests.delete(odId);

    await ctx.editMessageText(
      `❌ **Termos Não Aceitos**\n\n` +
      `Você optou por não aceitar os termos de responsabilidade.\n\n` +
      `Sem aceitar os termos, não é possível entrar no grupo.\n\n` +
      `💡 Se mudar de ideia, use /start para iniciar novamente.`,
      { parse_mode: 'Markdown' }
    );

    await ctx.answerCbQuery('❌ Termos não aceitos');
  }

  // Obter lista de admins humanos do grupo (excluindo bots)
  private async getGroupAdmins(): Promise<number[]> {
    const groupId = this.getGroupId();
    if (!groupId) return [];

    try {
      const admins = await this.bot.telegram.getChatAdministrators(groupId);
      // Filtrar apenas admins humanos (excluindo bots)
      const humanAdmins = admins
        .filter(admin => !admin.user.is_bot)
        .map(admin => admin.user.id);

      this.logger.log(`📋 Admins humanos encontrados: ${humanAdmins.length}`);
      return humanAdmins;
    } catch (error) {
      this.logger.error('Erro ao obter admins do grupo:', error);
      return [];
    }
  }

  // Enviar solicitação para admins do grupo (direto no privado de cada admin)
  private async sendJoinRequestToAdmins(userId: number, request: JoinRequest): Promise<void> {
    // Envia diretamente para os admins humanos do grupo
    await this.sendJoinRequestToIndividualAdmins(userId, request);
  }

  // Construir mensagem de solicitação de entrada
  private buildJoinRequestMessage(userId: number, request: JoinRequest): string {
    return (
      `🆕 **Nova Solicitação de Entrada**\n\n` +
      `👤 **Usuário:** ${request.userName}\n` +
      `🆔 **ID:** \`${userId}\`\n` +
      `📅 **Solicitado em:** ${request.requestedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n` +
      `✅ **Termos aceitos em:** ${request.termsAcceptedAt?.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
      `⚠️ **Ação necessária:** Aprovar ou recusar entrada no grupo.`
    );
  }

  // Construir teclado de solicitação de entrada
  private buildJoinRequestKeyboard(userId: number) {
    return {
      inline_keyboard: [
        [
          {
            text: '✅ APROVAR',
            callback_data: `admin_approve_join_${userId}`
          },
          {
            text: '❌ RECUSAR',
            callback_data: `admin_reject_join_${userId}`
          }
        ],
        [
          {
            text: '👤 Ver Perfil',
            url: `tg://user?id=${userId}`
          }
        ]
      ]
    };
  }

  // Enviar solicitação para cada admin individualmente
  private async sendJoinRequestToIndividualAdmins(userId: number, request: JoinRequest): Promise<void> {
    const admins = await this.getGroupAdmins();

    if (admins.length === 0) {
      this.logger.error('Nenhum admin encontrado para enviar solicitação!');
      return;
    }

    const message = this.buildJoinRequestMessage(userId, request);
    const keyboard = this.buildJoinRequestKeyboard(userId);

    let sentCount = 0;
    const adminMessageIds: Map<number, number> = new Map();

    for (const adminId of admins) {
      try {
        const sentMessage = await this.retryService.executeWithRetry(() =>
          this.bot.telegram.sendMessage(adminId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
          })
        );
        adminMessageIds.set(adminId, sentMessage.message_id);
        sentCount++;
        this.logger.log(`✅ Solicitação enviada para admin ${adminId}`);
      } catch (error: any) {
        // Admin pode ter bloqueado o bot ou nunca iniciou conversa
        this.logger.warn(`⚠️ Não foi possível enviar para admin ${adminId}: ${error.description || error.message}`);
      }
    }

    // Salvar IDs das mensagens para atualizar depois
    request.adminMessageIds = adminMessageIds;
    this.pendingRequests.set(userId, request);

    this.logger.log(`✅ Solicitação de entrada enviada para ${sentCount}/${admins.length} admins: ${userId}`);
  }

  // Atualizar mensagens de outros admins quando um admin aprova/recusa
  private async updateOtherAdminMessages(request: JoinRequest, newText: string, actionAdminId: number): Promise<void> {
    if (!request.adminMessageIds || request.adminMessageIds.size === 0) {
      return; // Não foi enviado individualmente
    }

    for (const [adminId, messageId] of request.adminMessageIds) {
      if (adminId === actionAdminId) {
        continue; // Pular o admin que já teve sua mensagem atualizada via ctx.editMessageText
      }

      try {
        await this.bot.telegram.editMessageText(
          adminId,
          messageId,
          undefined,
          newText,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        // Ignorar erros (mensagem pode ter sido deletada, etc)
        this.logger.warn(`Não foi possível atualizar mensagem para admin ${adminId}`);
      }
    }
  }

  // Processar aprovação do admin
  async processAdminApproval(ctx: any, userId: number): Promise<void> {
    // SEGURANÇA: só admin ATUAL do grupo pode aprovar. Não confiar na posse do botão (ex-admin, callback
    // encaminhada/forjada). getGroupAdmins() retorna [] em erro de API → fail-CLOSED (nega). (audit CRÍTICO)
    const admins = await this.getGroupAdmins();
    if (!ctx.from || !admins.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Sem permissão — apenas admins do grupo podem aprovar', { show_alert: true });
      return;
    }
    const request = this.pendingRequests.get(userId);
    if (!request || request.status !== 'pending_approval') {
      await ctx.answerCbQuery('❌ Solicitação não encontrada ou já processada', { show_alert: true });
      return;
    }

    const adminName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const groupId = this.getGroupId();

    if (!groupId) {
      await ctx.answerCbQuery('❌ Grupo não configurado', { show_alert: true });
      return;
    }

    try {
      // Obter nome do grupo
      let groupName = 'TrustScore P2P';
      try {
        const chat = await this.bot.telegram.getChat(groupId);
        if ('title' in chat && chat.title) {
          groupName = chat.title;
        }
      } catch (error) {
        this.logger.warn('Não foi possível obter nome do grupo');
      }

      // Primeiro, garantir que o usuário não está banido
      try {
        await this.bot.telegram.unbanChatMember(groupId, userId, { only_if_banned: true });
      } catch (unbanError) {
        // Ignorar erro se não estava banido
      }

      // Registrar aceitação de termos
      await this.termsAcceptanceService.recordUserAcceptance(userId, groupId);

      // Atualizar status
      request.status = 'approved';
      this.pendingRequests.set(userId, request);

      // Mensagem de aprovação
      const approvalText = (
        `✅ **Solicitação APROVADA**\n\n` +
        `👤 **Usuário:** ${request.userName}\n` +
        `🆔 **ID:** \`${userId}\`\n` +
        `📅 **Solicitado em:** ${request.requestedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
        `✅ **Aprovado por:** ${adminName}\n` +
        `📅 **Aprovado em:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n` +
        `⏳ **Aguardando usuário clicar para entrar**`
      );

      // Atualizar mensagem do admin que clicou
      await ctx.editMessageText(approvalText, { parse_mode: 'Markdown' });

      // Atualizar mensagens de outros admins (se enviado individualmente)
      await this.updateOtherAdminMessages(request, approvalText, ctx.from.id);

      await ctx.answerCbQuery('✅ Usuário aprovado!');

      // Notificar usuário com botão para gerar link (não gera link ainda)
      const userMessage = (
        `🎉 **Solicitação Aprovada!**\n\n` +
        `Sua solicitação de entrada no grupo **${groupName}** foi **APROVADA**!\n\n` +
        `👇 **Clique no botão abaixo para entrar no grupo:**\n\n` +
        `⚠️ _O botão só pode ser usado uma vez._`
      );

      const userKeyboard = {
        inline_keyboard: [
          [
            {
              text: '🚀 ENTRAR NO GRUPO',
              callback_data: `join_enter_group_${userId}`
            }
          ]
        ]
      };

      const approvalMsg = await this.retryService.executeWithRetry(() =>
        this.bot.telegram.sendMessage(userId, userMessage, {
          parse_mode: 'Markdown',
          reply_markup: userKeyboard
        })
      );

      // Salvar ID da mensagem para deletar depois
      request.approvalMessageId = approvalMsg.message_id;
      this.pendingRequests.set(userId, request);

      this.logger.log(`✅ Usuário ${userId} aprovado por ${adminName} - Aguardando clique`);

    } catch (error: any) {
      this.logger.error(`Erro ao aprovar usuário ${userId}:`, error);
      await ctx.answerCbQuery(`❌ Erro: ${error.description || error.message}`, { show_alert: true });
    }
  }

  // Processar clique do usuário para entrar no grupo
  async processEnterGroup(ctx: any, userId: number): Promise<void> {
    if (ctx.from.id !== userId) {
      await ctx.answerCbQuery('❌ Este botão não é para você', { show_alert: true });
      return;
    }

    const request = this.pendingRequests.get(userId);
    if (!request || request.status !== 'approved') {
      await ctx.answerCbQuery('❌ Solicitação não encontrada ou já utilizada', { show_alert: true });
      return;
    }

    const groupId = this.getGroupId();
    if (!groupId) {
      await ctx.answerCbQuery('❌ Grupo não configurado', { show_alert: true });
      return;
    }

    try {
      // Obter nome do grupo
      let groupName = 'TrustScore P2P';
      try {
        const chat = await this.bot.telegram.getChat(groupId);
        if ('title' in chat && chat.title) {
          groupName = chat.title;
        }
      } catch (error) {
        this.logger.warn('Não foi possível obter nome do grupo');
      }

      // Gerar link de convite único AGORA
      let inviteLink = '';
      try {
        const link = await this.bot.telegram.createChatInviteLink(groupId, {
          member_limit: 1,
          expire_date: Math.floor(Date.now() / 1000) + 120, // Expira em 2 minutos
          creates_join_request: false
        });
        inviteLink = link.invite_link;
        this.logger.log(`✅ Link de convite criado para ${userId}: ${inviteLink}`);

        // Adicionar usuário à lista de aprovados para que o NewMemberHandler permita a entrada
        approvedUsersSet.add(userId);
        this.logger.log(`✅ Usuário ${userId} adicionado à lista de aprovados`);

        // Limpar da lista após 5 minutos (tempo suficiente para entrar)
        setTimeout(() => {
          approvedUsersSet.delete(userId);
          this.logger.log(`🧹 Usuário ${userId} removido da lista de aprovados (timeout)`);
        }, 5 * 60 * 1000);

      } catch (linkError: any) {
        this.logger.error('Erro ao criar link de convite:', linkError);
        await ctx.answerCbQuery(`❌ Erro ao criar link. Tente novamente.`, { show_alert: true });
        return;
      }

      // Atualizar mensagem com o link direto
      await ctx.editMessageText(
        `🎉 **Bem-vindo ao ${groupName}!**\n\n` +
        `✅ Seu acesso foi liberado.\n\n` +
        `👇 **Clique no botão abaixo para entrar:**\n\n` +
        `⚠️ _Este link expira em 2 minutos._`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🚀 ENTRAR AGORA',
                  url: inviteLink
                }
              ]
            ]
          }
        }
      );

      await ctx.answerCbQuery('✅ Link gerado! Clique para entrar.');

      // Marcar como usado para não gerar mais links
      request.status = 'approved'; // Manter approved mas vamos deletar em breve
      this.pendingRequests.set(userId, request);

      this.logger.log(`✅ Link de entrada gerado para ${userId}`);

      // Agendar verificação se entrou e deletar mensagem
      setTimeout(async () => {
        await this.checkAndCleanupAfterJoin(userId, groupId, request.approvalMessageId);
      }, 30000); // Verificar após 30 segundos

    } catch (error: any) {
      this.logger.error(`Erro ao processar entrada do usuário ${userId}:`, error);
      await ctx.answerCbQuery(`❌ Erro: ${error.description || error.message}`, { show_alert: true });
    }
  }

  // Verificar se usuário entrou e limpar mensagem
  private async checkAndCleanupAfterJoin(userId: number, groupId: number, messageId?: number): Promise<void> {
    try {
      // Verificar se usuário agora é membro do grupo
      const member = await this.bot.telegram.getChatMember(groupId, userId);
      const isNowMember = ['member', 'administrator', 'creator'].includes(member.status);

      if (isNowMember && messageId) {
        // Usuário entrou! Deletar a mensagem de aprovação
        try {
          await this.bot.telegram.deleteMessage(userId, messageId);
          this.logger.log(`✅ Mensagem de aprovação deletada para ${userId} - usuário entrou no grupo`);
        } catch (deleteError) {
          this.logger.warn(`Não foi possível deletar mensagem de aprovação para ${userId}`);
        }

        // Enviar mensagem de boas-vindas
        await this.retryService.executeWithRetry(() =>
          this.bot.telegram.sendMessage(
            userId,
            `🎉 **Bem-vindo ao grupo!**\n\n` +
            `Você agora faz parte da comunidade. Use /help para ver os comandos disponíveis.`,
            { parse_mode: 'Markdown' }
          )
        );
      }

      // Limpar da lista de pendentes
      this.pendingRequests.delete(userId);

    } catch (error) {
      this.logger.warn(`Erro ao verificar entrada do usuário ${userId}:`, error);
      // Limpar mesmo assim após um tempo
      setTimeout(() => this.pendingRequests.delete(userId), 60000);
    }
  }

  // Processar recusa do admin
  async processAdminRejection(ctx: any, userId: number): Promise<void> {
    // SEGURANÇA: só admin ATUAL do grupo pode recusar (mesmo guard da aprovação). Fail-closed. (audit CRÍTICO)
    const admins = await this.getGroupAdmins();
    if (!ctx.from || !admins.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Sem permissão — apenas admins do grupo podem recusar', { show_alert: true });
      return;
    }
    const request = this.pendingRequests.get(userId);
    if (!request || request.status !== 'pending_approval') {
      await ctx.answerCbQuery('❌ Solicitação não encontrada ou já processada', { show_alert: true });
      return;
    }

    const adminName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

    // Atualizar status
    request.status = 'rejected';
    this.pendingRequests.set(userId, request);

    // Mensagem de rejeição
    const rejectionText = (
      `❌ **Solicitação RECUSADA**\n\n` +
      `👤 **Usuário:** ${request.userName}\n` +
      `🆔 **ID:** \`${userId}\`\n` +
      `📅 **Solicitado em:** ${request.requestedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
      `❌ **Recusado por:** ${adminName}\n` +
      `📅 **Recusado em:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
    );

    // Atualizar mensagem do admin que clicou
    await ctx.editMessageText(rejectionText, { parse_mode: 'Markdown' });

    // Atualizar mensagens de outros admins (se enviado individualmente)
    await this.updateOtherAdminMessages(request, rejectionText, ctx.from.id);

    await ctx.answerCbQuery('❌ Solicitação recusada');

    // Notificar usuário
    try {
      await this.retryService.executeWithRetry(() =>
        this.bot.telegram.sendMessage(
          userId,
          `❌ **Solicitação Recusada**\n\n` +
          `Infelizmente, sua solicitação de entrada no grupo foi **RECUSADA**.\n\n` +
          `📅 **Data:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
          `💡 Se você acredita que isso foi um erro, entre em contato com um administrador.`,
          { parse_mode: 'Markdown' }
        )
      );
    } catch (error) {
      this.logger.warn(`Não foi possível notificar usuário ${userId} sobre recusa`);
    }

    this.logger.log(`❌ Usuário ${userId} recusado por ${adminName}`);

    // Limpar solicitação após um tempo
    setTimeout(() => this.pendingRequests.delete(userId), 60000);
  }

  // Handler de callbacks
  async handleCallback(ctx: any): Promise<boolean> {
    const data = ctx.callbackQuery?.data;
    if (!data) return false;

    // Callbacks de solicitação de entrada (usuário)
    if (data.startsWith('join_accept_terms_')) {
      const userId = parseInt(data.replace('join_accept_terms_', ''));
      await this.processJoinTermsAcceptance(ctx, userId);
      return true;
    }

    if (data.startsWith('join_reject_terms_')) {
      const userId = parseInt(data.replace('join_reject_terms_', ''));
      await this.processJoinTermsRejection(ctx, userId);
      return true;
    }

    // Callback para entrar no grupo (após aprovação)
    if (data.startsWith('join_enter_group_')) {
      const userId = parseInt(data.replace('join_enter_group_', ''));
      await this.processEnterGroup(ctx, userId);
      return true;
    }

    // Callbacks de admin
    if (data.startsWith('admin_approve_join_')) {
      const userId = parseInt(data.replace('admin_approve_join_', ''));
      await this.processAdminApproval(ctx, userId);
      return true;
    }

    if (data.startsWith('admin_reject_join_')) {
      const userId = parseInt(data.replace('admin_reject_join_', ''));
      await this.processAdminRejection(ctx, userId);
      return true;
    }

    return false;
  }

  // Verificar se usuário tem solicitação pendente
  hasPendingRequest(userId: number): boolean {
    const request = this.pendingRequests.get(userId);
    return request?.status === 'pending_approval';
  }

  // Obter estatísticas
  getPendingRequestsCount(): number {
    return Array.from(this.pendingRequests.values())
      .filter(r => r.status === 'pending_approval').length;
  }
}
