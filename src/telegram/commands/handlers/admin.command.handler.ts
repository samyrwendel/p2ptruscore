import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { KarmaService } from '../../../karma/karma.service';
import { UsersService } from '../../../users/users.service';
import { GroupsService } from '../../../groups/groups.service';
import { OperationsService } from '../../../operations/operations.service';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

interface AdminAction {
  adminId: number;
  adminName: string;
  targetUserId: number;
  targetUserName: string;
  action: string;
  reason: string;
  timestamp: Date;
  groupId: number;
}

@Injectable()
export class AdminCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(AdminCommandHandler.name);
  command = /^\/admin(?:@\w+)?\s*(.*)$/;
  private adminLog: AdminAction[] = [];

  constructor(
    private readonly karmaService: KarmaService,
    private readonly usersService: UsersService,
    private readonly groupsService: GroupsService,
    private readonly operationsService: OperationsService,
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    // Verificar se é administrador
    const isAdmin = await this.isUserAdmin(ctx.from.id, ctx.chat.id);
    if (!isAdmin) {
      await ctx.reply('❌ Apenas administradores podem usar comandos administrativos.');
      return;
    }

    const match = ctx.message.text.match(this.command);
    const args = match?.[1]?.trim();

    if (!args) {
      await this.showAdminHelp(ctx);
      return;
    }

    const [subCommand, ...params] = args.split(' ');

    switch (subCommand.toLowerCase()) {
      case 'ban':
      case 'banir':
        await this.handleBan(ctx, params);
        break;
      case 'kick':
      case 'remover':
        await this.handleKick(ctx, params);
        break;
      case 'warn':
      case 'advertir':
        await this.handleWarn(ctx, params);
        break;
      case 'mute':
      case 'silenciar':
        await this.handleMute(ctx, params);
        break;
      case 'addkarma':
      case 'adicionarkarma':
        await this.handleAddKarma(ctx, params);
        break;
      case 'removekarma':
      case 'removerkarma':
        await this.handleRemoveKarma(ctx, params);
        break;
      case 'resetkarma':
      case 'zerarkarma':
        await this.handleResetKarma(ctx, params);
        break;
      case 'unban':
      case 'desbanir':
        await this.handleUnban(ctx, params);
        break;
      case 'log':
      case 'historico':
        await this.handleAdminLog(ctx, params);
        break;
      case 'info':
      case 'informacoes':
        await this.handleUserInfo(ctx, params);
        break;
      case 'cancelop':
      case 'cancelaroperacao':
        await this.handleCancelOperation(ctx, params);
        break;
      case 'ops':
      case 'operacoes':
        await this.handleListOperations(ctx, params);
        break;
      case 'cleanupops':
      case 'limparops':
        await this.handleCleanupOperations(ctx, params);
        break;
      case 'validitycheck':
      case 'verificarvalidade':
        await this.handleValidityCheck(ctx, params);
        break;
      default:
        await ctx.reply('❌ Subcomando não reconhecido. Use `/admin` para ver a ajuda.');
    }
  }

  private async showAdminHelp(ctx: TextCommandContext): Promise<void> {
    const message = `
🛡️ **Comandos Administrativos**

**📋 Moderação:**
• \`/admin ban @usuario [motivo]\` - Banir usuário permanentemente
• \`/admin kick @usuario [motivo]\` - Remover usuário temporariamente
• \`/admin warn @usuario [motivo]\` - Dar advertência oficial
• \`/admin mute @usuario [tempo]\` - Silenciar usuário (ex: 1h, 30m, 1d)
• \`/admin unban @usuario\` - Remover banimento

**💰 Karma:**
• \`/admin addkarma @usuario [quantidade]\` - Adicionar karma
• \`/admin removekarma @usuario [quantidade]\` - Remover karma
• \`/admin resetkarma @usuario\` - Zerar karma do usuário

**📊 Informações:**
• \`/admin info @usuario\` - Ver informações detalhadas
• \`/admin log [quantidade]\` - Ver log de ações (padrão: 10)

**💼 Operações:**
• \`/admin ops [@usuario]\` - Listar operações pendentes
• \`/admin cancelop [ID]\` - Cancelar operação pelo ID
• \`/admin cleanupops [dias]\` - Cancelar operações pendentes há X dias (padrão: 7)
• \`/admin validitycheck [dias]\` - Enviar verificação de validade para operações antigas (padrão: 1 dia)

**💡 Exemplos:**
\`/admin ban @spammer Spam excessivo no grupo\`
\`/admin addkarma @usuario_bom 50\`
\`/admin mute @usuario_problema 2h\`
\`/admin cancelop 697903582bcaf1da5ab7f8ae\`
    `;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  }

  private async handleBan(ctx: TextCommandContext, params: string[]): Promise<void> {
    if (params.length < 1) {
      await ctx.reply('❌ Uso: `/admin ban @usuario [motivo]`', { parse_mode: 'Markdown' });
      return;
    }

    const userInput = params[0];
    const reason = params.slice(1).join(' ') || 'Não especificado';

    try {
      const targetUser = await this.findUser(userInput);
      if (!targetUser) {
        await ctx.reply('❌ Usuário não encontrado.');
        return;
      }

      // Verificar se não está tentando banir outro admin
      const isTargetAdmin = await this.isUserAdmin(targetUser.userId, ctx.chat.id);
      if (isTargetAdmin) {
        await ctx.reply('❌ Não é possível banir outros administradores.');
        return;
      }

      // Banir usuário
      await this.bot.telegram.banChatMember(ctx.chat.id, targetUser.userId);

      // Registrar ação
      await this.logAdminAction(ctx, targetUser, 'BAN', reason);

      // Zerar karma como punição adicional
      await this.setUserKarma(targetUser, 0, 'Karma zerado por banimento administrativo');

      const targetName = targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName;
      await ctx.reply(
        `🔨 **Usuário Banido**\n\n` +
        `👤 **Usuário:** ${targetName}\n` +
        `📝 **Motivo:** ${reason}\n` +
        `👮 **Admin:** @${ctx.from.username || ctx.from.first_name}\n` +
        `⏰ **Data:** ${new Date().toLocaleString('pt-BR')}`,
        { parse_mode: 'Markdown' }
      );

      this.logger.log(`Admin ${ctx.from.id} baniu usuário ${targetUser.userId}: ${reason}`);
    } catch (error) {
      this.logger.error('Erro ao banir usuário:', error);
      await ctx.reply('❌ Erro ao banir usuário. Verifique se o bot tem permissões adequadas.');
    }
  }

  private async handleKick(ctx: TextCommandContext, params: string[]): Promise<void> {
    if (params.length < 1) {
      await ctx.reply('❌ Uso: `/admin kick @usuario [motivo]`', { parse_mode: 'Markdown' });
      return;
    }

    const userInput = params[0];
    const reason = params.slice(1).join(' ') || 'Não especificado';

    try {
      const targetUser = await this.findUser(userInput);
      if (!targetUser) {
        await ctx.reply('❌ Usuário não encontrado.');
        return;
      }

      const isTargetAdmin = await this.isUserAdmin(targetUser.userId, ctx.chat.id);
      if (isTargetAdmin) {
        await ctx.reply('❌ Não é possível remover outros administradores.');
        return;
      }

      // Kick (ban + unban imediato)
      await this.bot.telegram.banChatMember(ctx.chat.id, targetUser.userId);
      await this.bot.telegram.unbanChatMember(ctx.chat.id, targetUser.userId);

      await this.logAdminAction(ctx, targetUser, 'KICK', reason);

      const targetName = targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName;
      await ctx.reply(
        `👢 **Usuário Removido**\n\n` +
        `👤 **Usuário:** ${targetName}\n` +
        `📝 **Motivo:** ${reason}\n` +
        `👮 **Admin:** @${ctx.from.username || ctx.from.first_name}\n` +
        `💡 **Nota:** Usuário pode retornar ao grupo`,
        { parse_mode: 'Markdown' }
      );

      this.logger.log(`Admin ${ctx.from.id} removeu usuário ${targetUser.userId}: ${reason}`);
    } catch (error) {
      this.logger.error('Erro ao remover usuário:', error);
      await ctx.reply('❌ Erro ao remover usuário.');
    }
  }

  private async handleWarn(ctx: TextCommandContext, params: string[]): Promise<void> {
    if (params.length < 1) {
      await ctx.reply('❌ Uso: `/admin warn @usuario [motivo]`', { parse_mode: 'Markdown' });
      return;
    }

    const userInput = params[0];
    const reason = params.slice(1).join(' ') || 'Comportamento inadequado';

    try {
      const targetUser = await this.findUser(userInput);
      if (!targetUser) {
        await ctx.reply('❌ Usuário não encontrado.');
        return;
      }

      await this.logAdminAction(ctx, targetUser, 'WARN', reason);

      // Reduzir karma como punição leve
      const { getAdminPenalty } = require('../../../shared/karma-config.utils');
      const warningPenalty = getAdminPenalty('warning');
      await this.adjustUserKarma(targetUser, warningPenalty, `Advertência administrativa: ${reason}`);

      const targetName = targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName;
      
      // Notificar no grupo
      await ctx.reply(
        `⚠️ **Advertência Oficial**\n\n` +
        `👤 **Usuário:** ${targetName}\n` +
        `📝 **Motivo:** ${reason}\n` +
        `💰 **Penalidade:** ${Math.abs(warningPenalty)} pontos de karma\n` +
        `👮 **Admin:** @${ctx.from.username || ctx.from.first_name}`,
        { parse_mode: 'Markdown' }
      );

      // Notificar o usuário diretamente
      try {
        await this.bot.telegram.sendMessage(
          targetUser.userId,
          `⚠️ **Você recebeu uma advertência oficial**\n\n` +
          `**Grupo:** ${(ctx.chat as any).title || 'Trust P2P Group'}\n` +
          `**Motivo:** ${reason}\n` +
          `**Penalidade:** ${Math.abs(warningPenalty)} pontos de karma\n` +
          `Por favor, ajuste seu comportamento para evitar punições mais severas.`,
          { parse_mode: 'Markdown' }
        );
      } catch (dmError) {
        this.logger.warn(`Não foi possível enviar DM para usuário ${targetUser.userId}`);
      }

      this.logger.log(`Admin ${ctx.from.id} advertiu usuário ${targetUser.userId}: ${reason}`);
    } catch (error) {
      this.logger.error('Erro ao advertir usuário:', error);
      await ctx.reply('❌ Erro ao processar advertência.');
    }
  }

  private async handleMute(ctx: TextCommandContext, params: string[]): Promise<void> {
    if (params.length < 2) {
      await ctx.reply('❌ Uso: `/admin mute @usuario [tempo]`\nExemplo: `/admin mute @usuario 1h`', { parse_mode: 'Markdown' });
      return;
    }

    const userInput = params[0];
    const timeInput = params[1];
    const reason = params.slice(2).join(' ') || 'Comportamento inadequado';

    try {
      const targetUser = await this.findUser(userInput);
      if (!targetUser) {
        await ctx.reply('❌ Usuário não encontrado.');
        return;
      }

      const isTargetAdmin = await this.isUserAdmin(targetUser.userId, ctx.chat.id);
      if (isTargetAdmin) {
        await ctx.reply('❌ Não é possível silenciar outros administradores.');
        return;
      }

      const muteDuration = this.parseTimeInput(timeInput);
      if (!muteDuration) {
        await ctx.reply('❌ Formato de tempo inválido. Use: 30m, 1h, 2d, etc.');
        return;
      }

      const muteUntil = new Date(Date.now() + muteDuration);

      // Silenciar usuário
      await this.bot.telegram.restrictChatMember(ctx.chat.id, targetUser.userId, {
        permissions: {
          can_send_messages: false,
          can_send_polls: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false,
          can_change_info: false,
          can_invite_users: false,
          can_pin_messages: false,
          can_manage_topics: false
        },
        until_date: Math.floor(muteUntil.getTime() / 1000)
      });

      await this.logAdminAction(ctx, targetUser, 'MUTE', `${reason} (${timeInput})`);

      const targetName = targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName;
      await ctx.reply(
        `🔇 **Usuário Silenciado**\n\n` +
        `👤 **Usuário:** ${targetName}\n` +
        `⏰ **Duração:** ${timeInput}\n` +
        `📝 **Motivo:** ${reason}\n` +
        `🕐 **Até:** ${muteUntil.toLocaleString('pt-BR')}\n` +
        `👮 **Admin:** @${ctx.from.username || ctx.from.first_name}`,
        { parse_mode: 'Markdown' }
      );

      this.logger.log(`Admin ${ctx.from.id} silenciou usuário ${targetUser.userId} por ${timeInput}: ${reason}`);
    } catch (error) {
      this.logger.error('Erro ao silenciar usuário:', error);
      await ctx.reply('❌ Erro ao silenciar usuário.');
    }
  }

  private async handleAddKarma(ctx: TextCommandContext, params: string[]): Promise<void> {
    if (params.length < 2) {
      await ctx.reply('❌ Uso: `/admin addkarma @usuario [quantidade]`', { parse_mode: 'Markdown' });
      return;
    }

    const userInput = params[0];
    const amount = parseInt(params[1]);
    const reason = params.slice(2).join(' ') || 'Ajuste administrativo';

    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Quantidade deve ser um número positivo.');
      return;
    }

    try {
      const targetUser = await this.findUser(userInput);
      if (!targetUser) {
        await ctx.reply('❌ Usuário não encontrado.');
        return;
      }

      await this.adjustUserKarma(targetUser, amount, reason);
      await this.logAdminAction(ctx, targetUser, 'ADD_KARMA', `+${amount} - ${reason}`);

      const targetName = targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName;
      await ctx.reply(
        `💰 **Karma Adicionado**\n\n` +
        `👤 **Usuário:** ${targetName}\n` +
        `📈 **Quantidade:** +${amount} pontos\n` +
        `📝 **Motivo:** ${reason}\n` +
        `👮 **Admin:** @${ctx.from.username || ctx.from.first_name}`,
        { parse_mode: 'Markdown' }
      );

      this.logger.log(`Admin ${ctx.from.id} adicionou ${amount} karma para usuário ${targetUser.userId}`);
    } catch (error) {
      this.logger.error('Erro ao adicionar karma:', error);
      await ctx.reply('❌ Erro ao adicionar karma.');
    }
  }

  private async handleRemoveKarma(ctx: TextCommandContext, params: string[]): Promise<void> {
    if (params.length < 2) {
      await ctx.reply('❌ Uso: `/admin removekarma @usuario [quantidade]`', { parse_mode: 'Markdown' });
      return;
    }

    const userInput = params[0];
    const amount = parseInt(params[1]);
    const reason = params.slice(2).join(' ') || 'Penalidade administrativa';

    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Quantidade deve ser um número positivo.');
      return;
    }

    try {
      const targetUser = await this.findUser(userInput);
      if (!targetUser) {
        await ctx.reply('❌ Usuário não encontrado.');
        return;
      }

      await this.adjustUserKarma(targetUser, -amount, reason);
      await this.logAdminAction(ctx, targetUser, 'REMOVE_KARMA', `-${amount} - ${reason}`);

      const targetName = targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName;
      await ctx.reply(
        `💸 **Karma Removido**\n\n` +
        `👤 **Usuário:** ${targetName}\n` +
        `📉 **Quantidade:** -${amount} pontos\n` +
        `📝 **Motivo:** ${reason}\n` +
        `👮 **Admin:** @${ctx.from.username || ctx.from.first_name}`,
        { parse_mode: 'Markdown' }
      );

      this.logger.log(`Admin ${ctx.from.id} removeu ${amount} karma de usuário ${targetUser.userId}`);
    } catch (error) {
      this.logger.error('Erro ao remover karma:', error);
      await ctx.reply('❌ Erro ao remover karma.');
    }
  }

  private async handleResetKarma(ctx: TextCommandContext, params: string[]): Promise<void> {
    if (params.length < 1) {
      await ctx.reply('❌ Uso: `/admin resetkarma @usuario`', { parse_mode: 'Markdown' });
      return;
    }

    const userInput = params[0];
    const reason = params.slice(1).join(' ') || 'Reset administrativo';

    try {
      const targetUser = await this.findUser(userInput);
      if (!targetUser) {
        await ctx.reply('❌ Usuário não encontrado.');
        return;
      }

      await this.setUserKarma(targetUser, 0, reason);
      await this.logAdminAction(ctx, targetUser, 'RESET_KARMA', reason);

      const targetName = targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName;
      await ctx.reply(
        `🔄 **Karma Zerado**\n\n` +
        `👤 **Usuário:** ${targetName}\n` +
        `📊 **Novo karma:** 0 pontos\n` +
        `📝 **Motivo:** ${reason}\n` +
        `👮 **Admin:** @${ctx.from.username || ctx.from.first_name}`,
        { parse_mode: 'Markdown' }
      );

      this.logger.log(`Admin ${ctx.from.id} zerou karma de usuário ${targetUser.userId}`);
    } catch (error) {
      this.logger.error('Erro ao zerar karma:', error);
      await ctx.reply('❌ Erro ao zerar karma.');
    }
  }

  private async handleUnban(ctx: TextCommandContext, params: string[]): Promise<void> {
    if (params.length < 1) {
      await ctx.reply('❌ Uso: `/admin unban @usuario`', { parse_mode: 'Markdown' });
      return;
    }

    const userInput = params[0];

    try {
      // Tentar extrair ID do usuário do input
      let userId: number;
      if (userInput.startsWith('@')) {
        // Buscar por username
        const targetUser = await this.findUser(userInput);
        if (!targetUser) {
          await ctx.reply('❌ Usuário não encontrado. Para desbanir, use o ID numérico do usuário.');
          return;
        }
        userId = targetUser.userId;
      } else {
        userId = parseInt(userInput);
        if (isNaN(userId)) {
          await ctx.reply('❌ ID de usuário inválido.');
          return;
        }
      }

      await this.bot.telegram.unbanChatMember(ctx.chat.id, userId);

      await ctx.reply(
        `✅ **Usuário Desbanido**\n\n` +
        `👤 **ID:** ${userId}\n` +
        `👮 **Admin:** @${ctx.from.username || ctx.from.first_name}\n` +
        `💡 **Nota:** Usuário pode retornar ao grupo`,
        { parse_mode: 'Markdown' }
      );

      this.logger.log(`Admin ${ctx.from.id} desbaniu usuário ${userId}`);
    } catch (error) {
      this.logger.error('Erro ao desbanir usuário:', error);
      await ctx.reply('❌ Erro ao desbanir usuário.');
    }
  }

  private async handleUserInfo(ctx: TextCommandContext, params: string[]): Promise<void> {
    if (params.length < 1) {
      await ctx.reply('❌ Uso: `/admin info @usuario`', { parse_mode: 'Markdown' });
      return;
    }

    const userInput = params[0];

    try {
      const targetUser = await this.findUser(userInput);
      if (!targetUser) {
        await ctx.reply('❌ Usuário não encontrado.');
        return;
      }

      // Buscar karma do usuário
      const karmaData = await this.karmaService.getTotalKarmaForUser(targetUser.userName || targetUser.firstName);
      
      // Verificar status no grupo
      let memberStatus = 'Desconhecido';
      try {
        const member = await this.bot.telegram.getChatMember(ctx.chat.id, targetUser.userId);
        memberStatus = member.status;
      } catch (error) {
        memberStatus = 'Não é membro';
      }

      // Buscar ações administrativas recentes
      const recentActions = this.adminLog
        .filter(action => action.targetUserId === targetUser.userId)
        .slice(-3)
        .map(action => `• ${action.action}: ${action.reason} (${action.timestamp.toLocaleDateString('pt-BR')})`)
        .join('\n') || 'Nenhuma ação registrada';

      const targetName = targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName;
      
      await ctx.reply(
        `👤 **Informações do Usuário**\n\n` +
        `**Nome:** ${targetName}\n` +
        `**ID:** \`${targetUser.userId}\`\n` +
        `**Status:** ${memberStatus}\n` +
        `**Karma Total:** ${karmaData?.totalKarma || 0} pontos\n` +
        `**Avaliações Dadas:** ${karmaData?.totalGiven || 0}\n` +
        `**Avaliações Negativas:** ${karmaData?.totalHate || 0}\n\n` +
        `**📋 Ações Administrativas Recentes:**\n${recentActions}`,
        { parse_mode: 'Markdown' }
      );

    } catch (error) {
      this.logger.error('Erro ao buscar informações do usuário:', error);
      await ctx.reply('❌ Erro ao buscar informações do usuário.');
    }
  }

  private async handleCancelOperation(ctx: TextCommandContext, params: string[]): Promise<void> {
    if (params.length < 1) {
      await ctx.reply('❌ Uso: `/admin cancelop [ID_DA_OPERACAO] [motivo]`\n\nExemplo: `/admin cancelop 697903582bcaf1da5ab7f8ae Usuário inativo`', { parse_mode: 'Markdown' });
      return;
    }

    const operationId = params[0];
    const reason = params.slice(1).join(' ') || 'Cancelamento administrativo';

    // Validar se é um ObjectId válido
    if (!Types.ObjectId.isValid(operationId)) {
      await ctx.reply('❌ ID de operação inválido. O ID deve ter 24 caracteres hexadecimais.');
      return;
    }

    try {
      const adminInfo = {
        telegramId: ctx.from.id,
        username: ctx.from.username,
        firstName: ctx.from.first_name
      };

      const cancelledOp = await this.operationsService.adminCancelOperation(
        new Types.ObjectId(operationId),
        adminInfo,
        reason
      );

      const typeEmoji = cancelledOp.type === 'buy' ? '🟢' : '🔴';
      const typeText = cancelledOp.type === 'buy' ? 'COMPRA' : 'VENDA';

      // Buscar nome do criador
      let creatorName = 'Desconhecido';
      try {
        const creator = await this.usersService.findById(cancelledOp.creator.toString());
        if (creator) {
          creatorName = creator.userName ? `@${creator.userName}` : creator.firstName || 'Usuário';
        }
      } catch {}

      await ctx.reply(
        `🛑 **Operação Cancelada pelo Admin**\n\n` +
        `${typeEmoji} **${typeText}** ${cancelledOp.assets.join(', ')}\n` +
        `💰 **Quantidade:** ${cancelledOp.amount}\n` +
        `👤 **Criador:** ${creatorName}\n` +
        `📝 **Motivo:** ${reason}\n` +
        `🆔 **ID:** \`${operationId}\`\n\n` +
        `👮 **Admin:** @${ctx.from.username || ctx.from.first_name}`,
        { parse_mode: 'Markdown' }
      );

      this.logger.log(`Admin ${ctx.from.id} cancelou operação ${operationId}: ${reason}`);
    } catch (error: any) {
      this.logger.error('Erro ao cancelar operação:', error);

      let errorMsg = '❌ Erro ao cancelar operação.';
      if (error.message?.includes('não encontrada')) {
        errorMsg = '❌ Operação não encontrada.';
      } else if (error.message?.includes('já está')) {
        errorMsg = '❌ Esta operação já foi cancelada ou concluída.';
      }

      await ctx.reply(errorMsg);
    }
  }

  private async handleListOperations(ctx: TextCommandContext, params: string[]): Promise<void> {
    try {
      let operations;
      let filterText = '';

      if (params.length > 0 && params[0].startsWith('@')) {
        // Filtrar por usuário
        const targetUser = await this.findUser(params[0]);
        if (!targetUser) {
          await ctx.reply('❌ Usuário não encontrado.');
          return;
        }
        operations = await this.operationsService.getUserOperations(targetUser._id);
        filterText = ` de ${params[0]}`;
      } else {
        // Listar todas operações pendentes (limite de 10)
        operations = await this.operationsService.getPendingOperations();
        filterText = ' pendentes';
      }

      if (!operations || operations.length === 0) {
        await ctx.reply(`📋 Nenhuma operação${filterText} encontrada.`);
        return;
      }

      let message = `📋 **Operações${filterText}**\n\n`;

      for (const op of operations.slice(0, 10)) {
        const typeEmoji = op.type === 'buy' ? '🟢' : '🔴';
        const typeText = op.type === 'buy' ? 'COMPRA' : 'VENDA';
        const statusEmoji = op.status === 'pending' ? '⏳' :
                           op.status === 'accepted' ? '🤝' :
                           op.status === 'completed' ? '✅' : '❌';

        // Buscar nome do criador
        let creatorName = 'Desconhecido';
        try {
          const creator = await this.usersService.findById(op.creator.toString());
          if (creator) {
            creatorName = creator.userName ? `@${creator.userName}` : creator.firstName || 'Usuário';
          }
        } catch {}

        message += `${statusEmoji} ${typeEmoji} **${typeText}** ${op.assets.join(', ')}\n`;
        message += `   💰 ${op.amount} | 👤 ${creatorName}\n`;
        message += `   🆔 \`${op._id}\`\n\n`;
      }

      if (operations.length > 10) {
        message += `\n_... e mais ${operations.length - 10} operações_`;
      }

      message += `\n💡 Use \`/admin cancelop [ID]\` para cancelar`;

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      this.logger.error('Erro ao listar operações:', error);
      await ctx.reply('❌ Erro ao listar operações.');
    }
  }

  private async handleCleanupOperations(ctx: TextCommandContext, params: string[]): Promise<void> {
    const days = params.length > 0 ? parseInt(params[0]) : 7;

    if (isNaN(days) || days < 1) {
      await ctx.reply('❌ Número de dias inválido. Use um número positivo.');
      return;
    }

    try {
      await ctx.reply(`⏳ Procurando operações pendentes há mais de ${days} dias...`);

      const cancelledCount = await this.operationsService.cleanupStalePendingOperations(days);

      if (cancelledCount > 0) {
        await ctx.reply(
          `🧹 **Limpeza Concluída**\n\n` +
          `✅ **${cancelledCount}** operações pendentes canceladas\n` +
          `📅 Critério: pendentes há mais de **${days} dias**\n` +
          `👮 **Admin:** @${ctx.from.username || ctx.from.first_name}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(`✅ Nenhuma operação pendente há mais de ${days} dias encontrada.`);
      }

      this.logger.log(`Admin ${ctx.from.id} executou cleanup de operações antigas: ${cancelledCount} canceladas`);
    } catch (error) {
      this.logger.error('Erro ao limpar operações antigas:', error);
      await ctx.reply('❌ Erro ao limpar operações antigas.');
    }
  }

  private async handleValidityCheck(ctx: TextCommandContext, params: string[]): Promise<void> {
    const days = params.length > 0 ? parseInt(params[0]) : 1;

    if (isNaN(days) || days < 1) {
      await ctx.reply('❌ Número de dias inválido. Use um número positivo.');
      return;
    }

    try {
      await ctx.reply(`⏳ Enviando verificação de validade para operações pendentes há mais de ${days} dias...`);

      const sentCount = await this.operationsService.processValidityChecks(days);

      if (sentCount > 0) {
        await ctx.reply(
          `📩 **Verificações Enviadas**\n\n` +
          `✅ **${sentCount}** mensagens de verificação enviadas\n` +
          `📅 Critério: operações pendentes há mais de **${days} dias**\n` +
          `⏰ Prazo para resposta: **24 horas**\n\n` +
          `💡 Os criadores receberão uma mensagem perguntando se a operação ainda é válida. ` +
          `Se não responderem em 24h, a operação será cancelada automaticamente.\n\n` +
          `👮 **Admin:** @${ctx.from.username || ctx.from.first_name}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(`✅ Nenhuma operação pendente há mais de ${days} dias precisando de verificação.`);
      }

      this.logger.log(`Admin ${ctx.from.id} executou verificação de validade: ${sentCount} mensagens enviadas`);
    } catch (error) {
      this.logger.error('Erro ao enviar verificações de validade:', error);
      await ctx.reply('❌ Erro ao enviar verificações de validade.');
    }
  }

  private async handleAdminLog(ctx: TextCommandContext, params: string[]): Promise<void> {
    const limit = params.length > 0 ? parseInt(params[0]) || 10 : 10;
    const maxLimit = Math.min(limit, 50); // Máximo 50 entradas

    const recentActions = this.adminLog
      .filter(action => action.groupId === ctx.chat.id)
      .slice(-maxLimit)
      .reverse()
      .map((action, index) => 
        `${index + 1}. **${action.action}** - ${action.targetUserName}\n` +
        `   📝 ${action.reason}\n` +
        `   👮 ${action.adminName} • ${action.timestamp.toLocaleString('pt-BR')}`
      )
      .join('\n\n');

    if (!recentActions) {
      await ctx.reply('📋 Nenhuma ação administrativa registrada ainda.');
      return;
    }

    await ctx.reply(
      `📋 **Log de Ações Administrativas** (${maxLimit} mais recentes)\n\n${recentActions}`,
      { parse_mode: 'Markdown' }
    );
  }

  // Métodos auxiliares
  private async isUserAdmin(userId: number, chatId: number): Promise<boolean> {
    try {
      const member = await this.bot.telegram.getChatMember(chatId, userId);
      return member.status === 'administrator' || member.status === 'creator';
    } catch (error) {
      this.logger.error('Erro ao verificar se usuário é admin:', error);
      return false;
    }
  }

  private async findUser(userInput: string): Promise<any> {
    try {
      if (userInput.startsWith('@')) {
        const username = userInput.substring(1);
        return await this.usersService.findOneByUsernameOrName(username);
      } else {
        const userId = parseInt(userInput);
        if (!isNaN(userId)) {
          return await this.usersService.findOneByUserId(userId);
        }
        return await this.usersService.findOneByUsernameOrName(userInput);
      }
    } catch (error) {
      this.logger.error('Erro ao buscar usuário:', error);
      return null;
    }
  }

  private async adjustUserKarma(user: any, amount: number, reason: string): Promise<void> {
    try {
      // Simular dados do avaliador (admin)
      const adminData = {
        id: 0, // ID especial para admin
        username: 'admin',
        first_name: 'Sistema'
      };

      const userData = {
        id: user.userId,
        username: user.userName,
        first_name: user.firstName
      };

      const chatData = {
        id: -1002907400287 // ID do grupo principal
      };

      await this.karmaService.registerEvaluation(
        adminData,
        userData,
        chatData,
        amount,
        reason
      );
    } catch (error) {
      this.logger.error('Erro ao ajustar karma:', error);
      throw error;
    }
  }

  private async setUserKarma(user: any, newKarma: number, reason: string): Promise<void> {
    // Para zerar karma, precisamos calcular quanto remover
    const karmaData = await this.karmaService.getTotalKarmaForUser(user.userName || user.firstName);
    const currentKarma = karmaData?.totalKarma || 0;
    const adjustment = newKarma - currentKarma;
    
    if (adjustment !== 0) {
      await this.adjustUserKarma(user, adjustment, reason);
    }
  }

  private async logAdminAction(ctx: TextCommandContext, targetUser: any, action: string, reason: string): Promise<void> {
    const adminAction: AdminAction = {
      adminId: ctx.from.id,
      adminName: ctx.from.username || ctx.from.first_name,
      targetUserId: targetUser.userId,
      targetUserName: targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName,
      action,
      reason,
      timestamp: new Date(),
      groupId: ctx.chat.id
    };

    this.adminLog.push(adminAction);

    // Manter apenas as últimas 1000 ações para não consumir muita memória
    if (this.adminLog.length > 1000) {
      this.adminLog = this.adminLog.slice(-1000);
    }
  }

  private parseTimeInput(timeInput: string): number | null {
    const match = timeInput.match(/^(\d+)([smhd])$/);
    if (!match) return null;

    const amount = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return amount * 1000; // segundos
      case 'm': return amount * 60 * 1000; // minutos
      case 'h': return amount * 60 * 60 * 1000; // horas
      case 'd': return amount * 24 * 60 * 60 * 1000; // dias
      default: return null;
    }
  }
}