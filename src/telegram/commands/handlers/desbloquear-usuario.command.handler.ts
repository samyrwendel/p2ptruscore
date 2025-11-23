import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { Types } from 'mongoose';
import { ITextCommandHandler, TextCommandContext } from '../../telegram.types';
import { UsersService } from '../../../users/users.service';
import { PendingEvaluationService } from '../../../operations/pending-evaluation.service';
import { OperationsService } from '../../../operations/operations.service';

@Injectable()
export class DesbloquearUsuarioCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(DesbloquearUsuarioCommandHandler.name);
  command = /^\/desbloquearusuario(?:@\w+)?\s*(.*)$/;

  constructor(
    private readonly usersService: UsersService,
    private readonly pendingEvaluationService: PendingEvaluationService,
    private readonly operationsService: OperationsService,
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
    private readonly configService: ConfigService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    // Restringir ao PV
    if (ctx.chat.type !== 'private') {
      await ctx.reply('❌ Use este comando no PV do bot.');
      return;
    }

    // Verificar se é administrador ou dono do grupo configurado
    const isAdmin = await this.isAdminOrOwner(ctx.from.id);
    if (!isAdmin) {
      await ctx.reply('❌ Acesso negado. Apenas administradores podem usar este comando.');
      return;
    }

    const match = ctx.message.text.match(this.command);
    const args = match?.[1]?.trim();
    if (!args) {
      await ctx.reply('❌ Uso: `/desbloquearusuario [@usuario|telegramId] [fix|force]`', { parse_mode: 'Markdown' });
      return;
    }

    const parts = args.split(/\s+/);
    const targetArg = parts[0];
    const modeArg = (parts[1] || 'fix').toLowerCase();
    const forceAll = modeArg === 'force';

    try {
      // Resolver usuário
      let targetUser: any = null;
      if (targetArg.startsWith('@')) {
        targetUser = await this.usersService.findOneByUsernameOrName(targetArg);
      } else {
        const numericId = parseInt(targetArg, 10);
        if (isNaN(numericId)) {
          await ctx.reply('❌ Parâmetro inválido. Informe @username ou ID numérico.');
          return;
        }
        targetUser = await this.usersService.findOneByUserId(numericId);
      }

      if (!targetUser) {
        await ctx.reply('❌ Usuário não encontrado.');
        return;
      }

      const evaluatorId = new Types.ObjectId(targetUser._id);
      const pendings = await this.pendingEvaluationService.getPendingEvaluations(evaluatorId);

      if (pendings.length === 0) {
        await ctx.reply('✅ Nenhuma avaliação pendente encontrada para este usuário.');
        return;
      }

      let fixed = 0;
      let skipped = 0;
      const details: string[] = [];

      for (const p of pendings) {
        const opId = new Types.ObjectId(p.operation);
        let status = 'unknown';
        try {
          const op = await this.operationsService.getOperationById(opId);
          if (op && typeof op.status === 'string') {
            status = op.status.toLowerCase();
          }
        } catch {
          // manter unknown
        }

        const isOrphanOrCompleted = ['completed', 'cancelled', 'canceled', 'expired'].includes(status);
        if (forceAll || isOrphanOrCompleted) {
          try {
            await this.pendingEvaluationService.completePendingEvaluation(opId, evaluatorId);
            fixed++;
            details.push(`✔ ${p._id.toString()} (op=${p.operation}, status=${status})`);
          } catch (err) {
            skipped++;
            details.push(`✖ ${p._id.toString()} (op=${p.operation}, status=${status})`);
          }
        } else {
          skipped++;
          details.push(`↪ ${p._id.toString()} (op=${p.operation}, status=${status})`);
        }
      }

      const header = forceAll
        ? '🧹 Desbloqueio forçado executado.'
        : '🧹 Desbloqueio (apenas concluídas/canceladas/expiradas) executado.';

      const summary = (
        `${header}\n\n` +
        `👤 Usuário: @${targetUser.userName || targetUser.firstName} (ID: ${targetUser.userId})\n` +
        `📌 Pendências encontradas: ${pendings.length}\n` +
        `✅ Marcadas como concluídas: ${fixed}\n` +
        `➖ Mantidas: ${skipped}`
      );

      // Limitar detalhes para não estourar PV
      const detailText = details.slice(0, 20).join('\n');
      const truncated = details.length > 20 ? `\n... (${details.length - 20} restantes)` : '';

      await ctx.reply(`${summary}\n\n${detailText}${truncated}`);
    } catch (error) {
      this.logger.error('Erro ao processar desbloqueio:', error);
      await ctx.reply('❌ Erro ao processar desbloqueio. Verifique os parâmetros e tente novamente.');
    }
  }

  private async isAdminOrOwner(userId: number): Promise<boolean> {
    try {
      const groupsEnv = this.configService.get<string>('TELEGRAM_GROUPS') || '';
      const singleGroup = this.configService.get<string>('TELEGRAM_GROUP_ID') || '';
      const ids = [] as number[];
      if (groupsEnv.trim()) {
        for (const g of groupsEnv.split(',').map(s => s.trim()).filter(Boolean)) {
          const v = parseInt(g, 10);
          if (!isNaN(v)) ids.push(v);
        }
      }
      const sg = parseInt(singleGroup || '0', 10);
      if (sg) ids.push(sg);
      const uniq = Array.from(new Set(ids));
      if (uniq.length === 0) return false;
      for (const gid of uniq) {
        try {
          const member = await this.bot.telegram.getChatMember(gid, userId);
          if (member.status === 'administrator' || member.status === 'creator') {
            return true;
          }
        } catch {}
      }
      return false;
    } catch (error) {
      this.logger.warn('Falha ao validar admin/owner:', error);
      return false;
    }
  }
}
