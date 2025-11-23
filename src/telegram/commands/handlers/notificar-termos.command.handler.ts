import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { TermsNotificationService } from '../../../users/terms-notification.service';
import { TermsAcceptanceService } from '../../../users/terms-acceptance.service';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class NotificarTermosCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(NotificarTermosCommandHandler.name);

  command = '/notificar_termos';

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
    private readonly termsNotificationService: TermsNotificationService,
    private readonly termsAcceptanceService: TermsAcceptanceService,
  ) {}

  getDescription(): string {
    return 'Envia notificação sobre novos termos para todos os usuários que precisam aceitar';
  }

  async handle(ctx: TextCommandContext): Promise<void> {
    try {
      // Verificar se é um administrador ou dono de grupo
      const userId = ctx.from?.id;
      if (!userId || !(await this.isAdminOrOwner(userId, ctx))) {
        await ctx.reply(
          '❌ *Acesso Negado*\n\nApenas administradores ou donos de grupo podem usar este comando.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Enviar mensagem de confirmação inicial
      const initialMessage = await ctx.reply(
        '🔄 *Iniciando notificação em massa...*\n\nVerificando usuários que precisam aceitar os novos termos...',
        { parse_mode: 'Markdown' }
      );

      // Executar notificação em massa
      const stats = await this.termsNotificationService.notifyAllUsersAboutTermsUpdate();

      // Atualizar mensagem com resultados
      const resultMessage = 
        `✅ *Notificação em massa concluída!*\n\n` +
        `📊 *Estatísticas:*\n` +
        `• Grupos processados: ${stats.totalGroups}\n` +
        `• Total de usuários: ${stats.totalUsers}\n` +
        `• Notificações enviadas: ${stats.successfulNotifications}\n` +
        `• Falhas: ${stats.failedNotifications}\n\n` +
        `📅 *Data/Hora:* ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n` +
        `🔢 *Versão dos termos:* ${this.termsAcceptanceService.getCurrentTermsVersion()}`;

      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        initialMessage.message_id,
        undefined,
        resultMessage,
        { parse_mode: 'Markdown' }
      );

      this.logger.log(
        `Mass terms notification completed by admin ${userId}: ${JSON.stringify(stats)}`
      );

    } catch (error) {
      this.logger.error('Error in notificar_termos command:', error);
      
      await ctx.reply(
        '❌ *Erro ao enviar notificações*\n\nOcorreu um erro durante o processo. Verifique os logs para mais detalhes.',
        { parse_mode: 'Markdown' }
      );
    }
  }

  /**
   * Verifica se o usuário é administrador ou dono de grupo
   */
  private async isAdminOrOwner(userId: number, ctx: TextCommandContext): Promise<boolean> {
    // Verificar se é dono/admin do grupo configurado
    try {
      const configuredGroupId = parseInt(process.env.TELEGRAM_GROUP_ID || '0');
      if (configuredGroupId !== 0) {
        const member = await this.bot.telegram.getChatMember(configuredGroupId, userId);
        
        // Aceitar creator (dono) e administrator
        if (member.status === 'creator' || member.status === 'administrator') {
          this.logger.log(`User ${userId} is ${member.status} of group ${configuredGroupId}`);
          return true;
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to check user ${userId} status in group:`, error);
    }

    return false;
  }
}