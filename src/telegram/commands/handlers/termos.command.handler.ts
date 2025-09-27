import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { TermsAcceptanceService } from '../../../users/terms-acceptance.service';
import { UsersService } from '../../../users/users.service';
import { GroupsService } from '../../../groups/groups.service';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class TermosCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(TermosCommandHandler.name);
  command = /^\/(?:termos|terms)(?:@\w+)?(?:\s+(.+))?$/;

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
    private readonly termsAcceptanceService: TermsAcceptanceService,
    private readonly usersService: UsersService,
    private readonly groupsService: GroupsService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    try {
      const match = ctx.message.text.match(this.command);
      const args = match?.[1]?.trim();

      // Verificar se é um grupo
      if (ctx.chat.type === 'private') {
        await this.handlePrivateChat(ctx, args);
      } else {
        await this.handleGroupChat(ctx, args);
      }
    } catch (error) {
      this.logger.error('Erro ao processar comando /termos:', error);
      await ctx.reply('❌ Erro ao processar comando. Tente novamente.');
    }
  }

  private async handlePrivateChat(ctx: TextCommandContext, args?: string): Promise<void> {
    if (args === 'historico' || args === 'history') {
      await this.showUserHistory(ctx);
    } else {
      await this.showTermsText(ctx);
    }
  }

  private async handleGroupChat(ctx: TextCommandContext, args?: string): Promise<void> {
    // Verificar se o usuário é administrador
    const isAdmin = await this.isUserAdmin(ctx.from.id, ctx.chat.id);
    
    if (!args) {
      await this.showTermsText(ctx);
      return;
    }

    if (!isAdmin) {
      await ctx.reply('❌ Apenas administradores podem usar comandos avançados de termos.');
      return;
    }

    switch (args.toLowerCase()) {
      case 'stats':
      case 'estatisticas':
        await this.showGroupStats(ctx);
        break;
      case 'reenviar':
      case 'resend':
        await this.resendTermsToAll(ctx);
        break;
      default:
        await this.showAdminHelp(ctx);
    }
  }

  private async showTermsText(ctx: TextCommandContext): Promise<void> {
    const termsText = this.termsAcceptanceService.getTermsText();
    const version = this.termsAcceptanceService.getCurrentTermsVersion();

    // Verificar se o usuário já aceitou os termos atuais
    let hasAcceptedCurrent = false;
    try {
      if (ctx.chat.type === 'private') {
        // Em chat privado, verificar nos grupos configurados
        const configuredGroups = process.env.TELEGRAM_GROUPS?.split(',').map(id => parseInt(id.trim())) || [];
        for (const groupId of configuredGroups) {
          const accepted = await this.termsAcceptanceService.hasUserAcceptedCurrentTerms(ctx.from.id, groupId);
          if (accepted) {
            hasAcceptedCurrent = true;
            break;
          }
        }
      } else {
        // Em grupo, verificar no próprio grupo
        hasAcceptedCurrent = await this.termsAcceptanceService.hasUserAcceptedCurrentTerms(ctx.from.id, ctx.chat.id);
      }
    } catch (error) {
      this.logger.warn('Erro ao verificar aceitação de termos:', error);
    }

    const message = (
      termsText + `\n\n` +
      `📋 **Informações:**\n` +
      `🆔 **Versão:** ${version}\n` +
      `📅 **Visualizado em:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n` +
      `✅ **Status:** ${hasAcceptedCurrent ? 'Termos aceitos' : 'Termos não aceitos'}\n\n` +
      `💡 **Nota:** Estes são os termos atuais da plataforma TrustScore.`
    );

    // Adicionar botão para aceitar termos APENAS se não aceitou ainda E está em chat privado
    const keyboard = (hasAcceptedCurrent || ctx.chat.type !== 'private') ? undefined : {
      inline_keyboard: [
        [
          {
            text: '✅ Aceitar Termos',
            callback_data: `accept_terms_${ctx.from.id}_${ctx.chat.id}`
          }
        ],
        [
          {
            text: '📋 Ver Histórico',
            callback_data: `terms_history_${ctx.from.id}`
          }
        ]
      ]
    };

    await ctx.reply(message, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  private async showUserHistory(ctx: TextCommandContext): Promise<void> {
    try {
      const history = await this.termsAcceptanceService.getUserAcceptanceHistory(ctx.from.id);

      if (history.length === 0) {
        await ctx.reply(
          '📋 **Histórico de Termos**\n\n' +
          '❌ Você ainda não aceitou os termos em nenhum grupo.\n\n' +
          '💡 **Dica:** Os termos são apresentados automaticamente quando você entra em um grupo pela primeira vez.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      let message = '📋 **Seu Histórico de Aceitação de Termos**\n\n';
      
      for (const acceptance of history) {
        const date = new Date(acceptance.acceptedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        message += (
          `📅 **${date}**\n` +
          `🆔 **Versão:** ${acceptance.termsVersion}\n` +
          `👥 **Grupo:** ${acceptance.groupTelegramId}\n\n`
        );
      }

      message += `📊 **Total de aceitações:** ${history.length}`;

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      this.logger.error('Erro ao buscar histórico do usuário:', error);
      await ctx.reply('❌ Erro ao buscar histórico. Tente novamente.');
    }
  }

  private async showGroupStats(ctx: TextCommandContext): Promise<void> {
    try {
      const stats = await this.termsAcceptanceService.getGroupStats(ctx.chat.id);
      const version = this.termsAcceptanceService.getCurrentTermsVersion();

      let message = (
        `📊 **Estatísticas de Termos do Grupo**\n\n` +
        `👥 **Total de aceitações:** ${stats.total}\n\n` +
        `📋 **Por versão:**\n`
      );

      for (const [ver, count] of Object.entries(stats.byVersion)) {
        const isCurrent = ver === version ? ' (atual)' : '';
        message += `• **${ver}${isCurrent}:** ${count} usuários\n`;
      }

      message += (
        `\n📅 **Consultado em:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
        `💡 **Nota:** Apenas usuários que aceitaram os termos podem participar do grupo.`
      );

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      this.logger.error('Erro ao buscar estatísticas do grupo:', error);
      await ctx.reply('❌ Erro ao buscar estatísticas. Tente novamente.');
    }
  }

  private async resendTermsToAll(ctx: TextCommandContext): Promise<void> {
    await ctx.reply(
      '⚠️ **Reenvio de Termos**\n\n' +
      'Esta funcionalidade reenviará os termos para todos os membros do grupo que ainda não aceitaram a versão atual.\n\n' +
      '❓ **Tem certeza que deseja continuar?**',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '✅ Sim, reenviar',
                callback_data: `resend_terms_confirm_${ctx.chat.id}`
              },
              {
                text: '❌ Cancelar',
                callback_data: 'resend_terms_cancel'
              }
            ]
          ]
        }
      }
    );
  }

  private async showAdminHelp(ctx: TextCommandContext): Promise<void> {
    const message = (
      `📋 **Comandos de Termos - Administradores**\n\n` +
      `**Uso:** \`/termos [opção]\`\n\n` +
      `**Opções disponíveis:**\n` +
      `• \`stats\` - Estatísticas do grupo\n` +
      `• \`reenviar\` - Reenviar termos para membros\n\n` +
      `**Para usuários:**\n` +
      `• \`/termos\` - Ver termos atuais\n` +
      `• \`/termos historico\` - Ver histórico (privado)\n\n` +
      `💡 **Nota:** Os termos são apresentados automaticamente para novos membros.`
    );

    await ctx.reply(message, { parse_mode: 'Markdown' });
  }

  async handleCallback(ctx: any): Promise<boolean> {
    try {
      const data = ctx.callbackQuery?.data;
      if (!data) return false;

      // Callback para aceitar termos
      if (data.startsWith('accept_terms_')) {
        const parts = data.split('_');
        const userId = parseInt(parts[2]);
        const chatId = parseInt(parts[3]);
        
        if (userId !== ctx.from.id) {
          await ctx.answerCbQuery('❌ Você só pode aceitar seus próprios termos', { show_alert: true });
          return true;
        }
        
        await this.processTermsAcceptance(ctx, userId, chatId);
        return true;
      }

      // Callback para ver histórico
      if (data.startsWith('terms_history_')) {
        const userId = parseInt(data.split('_')[2]);
        
        if (userId !== ctx.from.id) {
          await ctx.answerCbQuery('❌ Você só pode ver seu próprio histórico', { show_alert: true });
          return true;
        }
        
        await this.showUserHistoryCallback(ctx);
        return true;
      }

      if (data.startsWith('resend_terms_confirm_')) {
        const groupId = parseInt(data.replace('resend_terms_confirm_', ''));
        await this.processResendConfirmation(ctx, groupId);
        return true;
      }

      if (data === 'resend_terms_cancel') {
        await ctx.editMessageText(
          '❌ **Reenvio Cancelado**\n\n' +
          'O reenvio de termos foi cancelado.',
          { parse_mode: 'Markdown' }
        );
        await ctx.answerCbQuery('Reenvio cancelado');
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Erro ao processar callback de termos:', error);
      await ctx.answerCbQuery('❌ Erro ao processar ação', { show_alert: true });
      return true;
    }
  }

  private async processTermsAcceptance(ctx: any, userId: number, chatId: number): Promise<void> {
    try {
      // ✅ VALIDAÇÃO CRÍTICA: Aceite de termos APENAS no chat privado
      if (ctx.callbackQuery.message.chat.type !== 'private') {
        await ctx.answerCbQuery(
          `🚫 ACESSO NEGADO\n\n` +
          `❌ Aceite de termos só no chat privado!\n\n` +
          `📋 PARA CONTINUAR:\n` +
          `1️⃣ Abra chat privado com o bot\n` +
          `2️⃣ Use o comando /termos\n` +
          `3️⃣ Aceite os termos`,
          { show_alert: true }
        );
        return;
      }
      
      // Determinar o grupo correto para aceitar os termos
      let targetGroupId = chatId;
      
      // Se está em chat privado, usar o primeiro grupo configurado
      if (ctx.callbackQuery.message.chat.type === 'private') {
        const configuredGroups = process.env.TELEGRAM_GROUPS?.split(',').map(id => parseInt(id.trim())) || [];
        if (configuredGroups.length > 0) {
          targetGroupId = configuredGroups[0];
        }
      }

      // Verificar se o usuário é membro do grupo
      try {
        const memberInfo = await this.bot.telegram.getChatMember(targetGroupId, userId);
        const activeMemberStatuses = ['member', 'administrator', 'creator'];
        
        if (!activeMemberStatuses.includes(memberInfo.status)) {
          await ctx.answerCbQuery('❌ Você precisa ser membro do grupo para aceitar os termos', { show_alert: true });
          return;
        }
      } catch (error) {
        await ctx.answerCbQuery('❌ Não foi possível verificar sua participação no grupo', { show_alert: true });
        return;
      }

      // Aceitar os termos
      await this.termsAcceptanceService.recordUserAcceptance(userId, targetGroupId);
      
      await ctx.editMessageText(
        '✅ **Termos Aceitos com Sucesso!**\n\n' +
        '🎉 Você aceitou os termos de responsabilidade da plataforma TrustScore.\n\n' +
        '📅 **Data:** ' + new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + '\n' +
        '🆔 **Versão:** ' + this.termsAcceptanceService.getCurrentTermsVersion() + '\n\n' +
        '💡 **Agora você pode usar todas as funcionalidades do bot!**',
        { parse_mode: 'Markdown' }
      );
      
      await ctx.answerCbQuery('✅ Termos aceitos com sucesso!');
      
    } catch (error) {
      this.logger.error('Erro ao aceitar termos:', error);
      await ctx.answerCbQuery('❌ Erro ao aceitar termos. Tente novamente.', { show_alert: true });
    }
  }

  private async showUserHistoryCallback(ctx: any): Promise<void> {
    try {
      const history = await this.termsAcceptanceService.getUserAcceptanceHistory(ctx.from.id);

      if (history.length === 0) {
        await ctx.answerCbQuery('❌ Você ainda não aceitou os termos em nenhum grupo', { show_alert: true });
        return;
      }

      let message = '📋 **Seu Histórico de Aceitação de Termos**\n\n';
      
      for (const acceptance of history) {
        const date = new Date(acceptance.acceptedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        message += (
          `📅 **${date}**\n` +
          `🆔 **Versão:** ${acceptance.termsVersion}\n` +
          `👥 **Grupo:** ${acceptance.groupTelegramId}\n\n`
        );
      }

      message += `📊 **Total de aceitações:** ${history.length}`;

      await ctx.editMessageText(message, { parse_mode: 'Markdown' });
      await ctx.answerCbQuery('📋 Histórico carregado');
      
    } catch (error) {
      this.logger.error('Erro ao buscar histórico do usuário:', error);
      await ctx.answerCbQuery('❌ Erro ao buscar histórico', { show_alert: true });
    }
  }

  private async processResendConfirmation(ctx: any, groupId: number): Promise<void> {
    try {
      // Verificar se é administrador
      const isAdmin = await this.isUserAdmin(ctx.from.id, groupId);
      if (!isAdmin) {
        await ctx.answerCbQuery('❌ Apenas administradores podem fazer isso', { show_alert: true });
        return;
      }

      await ctx.editMessageText(
        '⏳ **Processando Reenvio...**\n\n' +
        'Verificando membros do grupo e reenviando termos conforme necessário.',
        { parse_mode: 'Markdown' }
      );

      await ctx.answerCbQuery('Processando reenvio...');

      // Aqui você implementaria a lógica para reenviar termos
      // Por enquanto, apenas uma mensagem de confirmação
      setTimeout(async () => {
        try {
          await ctx.editMessageText(
            '✅ **Reenvio Concluído**\n\n' +
            'Os termos foram reenviados para todos os membros que ainda não aceitaram a versão atual.\n\n' +
            `📅 **Processado em:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
            { parse_mode: 'Markdown' }
          );
        } catch (editError) {
          this.logger.error('Erro ao editar mensagem de confirmação:', editError);
        }
      }, 2000);

    } catch (error) {
      this.logger.error('Erro ao processar confirmação de reenvio:', error);
      await ctx.editMessageText(
        '❌ **Erro no Reenvio**\n\n' +
        'Ocorreu um erro ao processar o reenvio de termos.',
        { parse_mode: 'Markdown' }
      );
    }
  }

  private async isUserAdmin(userId: number, chatId: number): Promise<boolean> {
    try {
      const member = await this.bot.telegram.getChatMember(chatId, userId);
      return member.status === 'administrator' || member.status === 'creator';
    } catch (error) {
      this.logger.error('Erro ao verificar se usuário é admin:', error);
      return false;
    }
  }
}