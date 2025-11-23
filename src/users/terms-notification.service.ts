import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { TermsAcceptanceService } from './terms-acceptance.service';

export interface NotificationStats {
  totalGroups?: number;
  totalUsers: number;
  successfulNotifications: number;
  failedNotifications: number;
  groupDetails?: Array<{
    groupId: number;
    userCount: number;
    successCount: number;
    failureCount: number;
  }>;
}

@Injectable()
export class TermsNotificationService {
  private readonly logger = new Logger(TermsNotificationService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
    private readonly termsAcceptanceService: TermsAcceptanceService,
  ) {}

  /**
   * Envia notificação sobre novos termos para um usuário específico
   * @param userTelegramId ID do usuário no Telegram
   * @param groupTelegramId ID do grupo no Telegram
   */
  async sendTermsUpdateNotification(
    userTelegramId: number,
    groupTelegramId: number
  ): Promise<void> {
    try {
      const currentVersion = this.termsAcceptanceService.getCurrentTermsVersion();
      
      const message = `🔔 *NOSSOS TERMOS MUDARAM!*\n\n` +
        `📢 Os Termos de Responsabilidade do TrustScore P2P foram atualizados para a versão ${currentVersion}.\n\n` +
        `🔄 *Por que estou recebendo esta mensagem?*\n` +
        `Nossos termos foram modificados para melhor proteger você e a comunidade. Como usuário ativo, você precisa aceitar as novas condições.\n\n` +
        `📋 *Principais mudanças incluem:*\n` +
        `• 🚨 Nova seção sobre ativos ilícitos e segurança\n` +
        `• 🏦 Recomendações de exchanges conhecidas e confiáveis\n` +
        `• ⚠️ Alertas sobre mixers e ativos suspeitos\n` +
        `• 🛡️ Medidas adicionais de proteção\n\n` +
        `⚠️ *AÇÃO NECESSÁRIA:* Você precisa aceitar os novos termos para continuar usando todos os recursos do bot.\n\n` +
        `👆 Clique no botão abaixo ou use o comando /termos para visualizar e aceitar.`;

      await this.bot.telegram.sendMessage(userTelegramId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '📋 Ver e Aceitar Novos Termos',
                callback_data: `show_terms_${groupTelegramId}`,
              },
            ],
          ],
        },
      });

      this.logger.log(
        `Terms update notification sent to user ${userTelegramId} for group ${groupTelegramId}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to send terms update notification to user ${userTelegramId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Envia notificação em massa para todos os usuários de um grupo específico
   * @param groupTelegramId ID do grupo no Telegram
   * @param userIds Array de IDs dos usuários (opcional, se não fornecido, busca automaticamente)
   */
  async sendMassTermsNotification(groupTelegramId: number, userIds?: number[]): Promise<NotificationStats> {
    this.logger.log(`Starting mass terms notification for group ${groupTelegramId}`);
    
    const stats: NotificationStats = {
      totalGroups: 1,
      totalUsers: 0,
      successfulNotifications: 0,
      failedNotifications: 0,
    };

    try {
      // Se userIds não foi fornecido, buscar automaticamente
      const usersToNotify = userIds || await this.termsAcceptanceService
        .getUsersNeedingCurrentTermsAcceptance(groupTelegramId);
      
      stats.totalUsers = usersToNotify.length;
      
      if (usersToNotify.length === 0) {
        this.logger.log(`No users need terms notification in group ${groupTelegramId}`);
        return stats;
      }

      this.logger.log(`Notifying ${usersToNotify.length} users in group ${groupTelegramId}`);

      // Enviar notificações para cada usuário
      for (const userTelegramId of usersToNotify) {
        try {
          await this.sendTermsUpdateNotification(userTelegramId, groupTelegramId);
          stats.successfulNotifications++;
          
          // Delay para evitar rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 segundo entre mensagens
        } catch (error) {
          this.logger.error(`Failed to notify user ${userTelegramId}:`, error);
          stats.failedNotifications++;
        }
      }

      this.logger.log(`Mass notification completed for group ${groupTelegramId}. Success: ${stats.successfulNotifications}, Failed: ${stats.failedNotifications}`);
      return stats;
      
    } catch (error) {
      this.logger.error(`Failed to send mass notification to group ${groupTelegramId}:`, error);
      throw error;
    }
  }

  /**
   * Utilitário para delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Envia notificação para TODOS os usuários sobre atualização dos termos
   * Quando admin executa este comando, significa que houve atualização nos termos
   * e TODOS os usuários devem ser notificados para aceitar novamente
   */
  async notifyAllUsersAboutTermsUpdate(): Promise<NotificationStats> {
    try {
      this.logger.log('Starting mass terms notification for ALL users (terms update scenario)...');
      
      // Buscar TODOS os usuários únicos de TODOS os grupos (evitar duplicatas)
      const uniqueUsers = await this.getAllUniqueUsersFromAllGroups();
      
      const globalStats: NotificationStats = {
        totalGroups: uniqueUsers.groupCount,
        totalUsers: uniqueUsers.users.length,
        successfulNotifications: 0,
        failedNotifications: 0,
        groupDetails: []
      };

      this.logger.log(`Notifying ALL unique users: ${globalStats.totalUsers} users across ${globalStats.totalGroups} groups`);

      // Enviar notificações para cada usuário único
      for (const user of uniqueUsers.users) {
        try {
          await this.sendTermsUpdateNotification(user.userId, user.groupId);
          globalStats.successfulNotifications++;
          
          // Delay para evitar rate limiting
          await this.delay(1000); // 1 segundo entre mensagens
        } catch (error) {
          this.logger.error(`Failed to notify user ${user.userId}:`, error);
          globalStats.failedNotifications++;
        }
      }

      this.logger.log(`Mass notification completed. Success: ${globalStats.successfulNotifications}, Failed: ${globalStats.failedNotifications}`);
      return globalStats;
      
    } catch (error) {
      this.logger.error('Failed to notify all users about terms update:', error);
      throw error;
    }
  }

  /**
   * Busca TODOS os usuários únicos de TODOS os grupos (sem duplicatas)
   * Para cenário de atualização de termos onde todos devem ser notificados
   */
  private async getAllUniqueUsersFromAllGroups(): Promise<{
    users: Array<{ userId: number; groupId: number }>;
    groupCount: number;
  }> {
    try {
      // Buscar todos os grupos distintos
      const distinctGroups = await this.termsAcceptanceService.getAllDistinctGroups();
      const uniqueUsersSet = new Set<number>();
      const usersWithGroups: Array<{ userId: number; groupId: number }> = [];

      // Para cada grupo, buscar TODOS os usuários
      for (const groupId of distinctGroups) {
        const allUsersInGroup = await this.termsAcceptanceService.getAllUsersInGroup(groupId);
        
        for (const userId of allUsersInGroup) {
          // Só adicionar se o usuário ainda não foi processado
          if (!uniqueUsersSet.has(userId)) {
            uniqueUsersSet.add(userId);
            usersWithGroups.push({ userId, groupId });
          }
        }
      }

      return {
        users: usersWithGroups,
        groupCount: distinctGroups.length
      };
    } catch (error) {
      this.logger.error('Failed to get unique users from all groups:', error);
      throw error;
    }
  }
}