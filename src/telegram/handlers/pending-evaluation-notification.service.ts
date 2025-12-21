import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { Types } from 'mongoose';
import { PendingEvaluationRepository } from '../../operations/pending-evaluation.repository';
import { OperationsRepository } from '../../operations/operations.repository';
import { UsersService } from '../../users/users.service';
import { KarmaService } from '../../karma/karma.service';
import { PendingEvaluation } from '../../operations/schemas/pending-evaluation.schema';
import { OperationStatus } from '../../operations/schemas/operation.schema';
import { ConfigService } from '@nestjs/config';

// Intervalos exponenciais em milissegundos (até 24h total)
// Notificação 1: 1 hora após operação
// Notificação 2: 2 horas após a anterior
// Notificação 3: 4 horas após a anterior
// Notificação 4: 8 horas após a anterior
// Notificação 5: 9 horas após a anterior (ÚLTIMO AVISO - auto-avaliação, total = 24h)
const NOTIFICATION_INTERVALS_MS = [
  1 * 60 * 60 * 1000,   // 1 hora (total: 1h)
  2 * 60 * 60 * 1000,   // 2 horas (total: 3h)
  4 * 60 * 60 * 1000,   // 4 horas (total: 7h)
  8 * 60 * 60 * 1000,   // 8 horas (total: 15h)
  9 * 60 * 60 * 1000,   // 9 horas (total: 24h - último aviso)
];

const MAX_NOTIFICATIONS = 5;

@Injectable()
export class PendingEvaluationNotificationService implements OnModuleInit {
  private readonly logger = new Logger(PendingEvaluationNotificationService.name);
  private isProcessing = false;

  constructor(
    private readonly pendingEvaluationRepository: PendingEvaluationRepository,
    private readonly operationsRepository: OperationsRepository,
    private readonly usersService: UsersService,
    private readonly karmaService: KarmaService,
    private readonly configService: ConfigService,
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
  ) {}

  async onModuleInit() {
    this.logger.log('PendingEvaluationNotificationService initialized');
    // Inicializar nextNotificationAt para pendentes sem valor
    await this.initializePendingNotifications();
  }

  /**
   * Inicializa nextNotificationAt para avaliações pendentes que ainda não têm
   */
  private async initializePendingNotifications(): Promise<void> {
    try {
      const pendingWithoutNext = await this.pendingEvaluationRepository.find({
        completed: false,
        autoEvaluated: { $ne: true },
        nextNotificationAt: { $exists: false }
      });

      for (const pending of pendingWithoutNext) {
        // Usar a data de criação do documento (fallback para agora se não existir)
        const createdAt = (pending as any).createdAt || new Date();
        const nextNotification = new Date(
          createdAt.getTime() + NOTIFICATION_INTERVALS_MS[0]
        );

        await this.pendingEvaluationRepository.findOneAndUpdate(
          { _id: pending._id },
          { nextNotificationAt: nextNotification }
        );
      }

      if (pendingWithoutNext.length > 0) {
        this.logger.log(`Initialized ${pendingWithoutNext.length} pending evaluations with nextNotificationAt`);
      }
    } catch (error) {
      this.logger.error('Error initializing pending notifications:', error);
    }
  }

  /**
   * Processa notificações pendentes a cada 10 minutos
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async processNotifications(): Promise<void> {
    if (this.isProcessing) {
      this.logger.debug('Already processing notifications, skipping...');
      return;
    }

    this.isProcessing = true;
    try {
      this.logger.log('Processing pending evaluation notifications...');

      const now = new Date();

      // Buscar avaliações pendentes que precisam de notificação
      const pendingToNotify = await this.pendingEvaluationRepository.find({
        completed: false,
        autoEvaluated: { $ne: true },
        nextNotificationAt: { $lte: now }
      });

      this.logger.log(`Found ${pendingToNotify.length} pending evaluations to notify`);

      for (const pending of pendingToNotify) {
        await this.processNotification(pending);
      }

      this.logger.log('Finished processing pending evaluation notifications');
    } catch (error) {
      this.logger.error('Error processing notifications:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Processa uma notificação individual
   */
  private async processNotification(pending: PendingEvaluation): Promise<void> {
    try {
      // Verificar se a operação existe e está completada
      const operation = await this.operationsRepository.findOne({ _id: pending.operation });
      if (!operation || operation.status !== OperationStatus.COMPLETED) {
        this.logger.warn(`Operation ${pending.operation} not found or not completed, skipping notification`);
        return;
      }

      // Buscar dados do avaliador e do alvo
      const evaluatorUser = await this.usersService.findById(pending.evaluator.toString());
      const targetUser = await this.usersService.findById(pending.target.toString());

      if (!evaluatorUser || !targetUser) {
        this.logger.warn(`User not found for pending evaluation ${pending._id}`);
        return;
      }

      const currentNotificationNumber = (pending.notificationCount || 0) + 1;
      const isLastNotification = currentNotificationNumber >= MAX_NOTIFICATIONS;

      if (isLastNotification) {
        // Último aviso: aplicar auto-avaliação positiva
        await this.applyAutoEvaluation(pending, evaluatorUser, targetUser, operation);
      } else {
        // Enviar notificação normal
        await this.sendNotification(pending, evaluatorUser, targetUser, operation, currentNotificationNumber);
      }
    } catch (error) {
      this.logger.error(`Error processing notification for pending ${pending._id}:`, error);
    }
  }

  /**
   * Envia uma notificação ao usuário que precisa avaliar
   */
  private async sendNotification(
    pending: PendingEvaluation,
    evaluatorUser: any,
    targetUser: any,
    operation: any,
    notificationNumber: number
  ): Promise<void> {
    try {
      const targetName = targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName;
      const remainingNotifications = MAX_NOTIFICATIONS - notificationNumber;
      const nextIntervalHours = Math.round(NOTIFICATION_INTERVALS_MS[notificationNumber] / (60 * 60 * 1000));

      // Mensagem progressivamente mais urgente
      let urgencyEmoji = '🔔';
      let urgencyText = '';

      if (notificationNumber >= 5) {
        urgencyEmoji = '🚨';
        urgencyText = '\n\n⚠️ **URGENTE:** ';
      } else if (notificationNumber >= 3) {
        urgencyEmoji = '⚠️';
        urgencyText = '\n\n⏰ **ATENÇÃO:** ';
      }

      const message =
        `${urgencyEmoji} **Avaliação Pendente - Lembrete ${notificationNumber}/${MAX_NOTIFICATIONS}**\n\n` +
        `Você ainda não avaliou sua contraparte da operação concluída.\n\n` +
        `👤 **Avaliar:** ${targetName}\n` +
        `📦 **Operação:** ${operation.type === 'buy' ? 'Compra' : 'Venda'} de ${operation.amount} ${operation.assets?.[0] || 'USDT'}\n` +
        `📅 **Concluída em:** ${operation.updatedAt?.toLocaleDateString('pt-BR') || 'N/A'}\n` +
        `${urgencyText}${remainingNotifications === 1 ?
          'Este é o **PENÚLTIMO** aviso! No próximo, a avaliação será feita automaticamente.' :
          `Restam **${remainingNotifications}** avisos antes da avaliação automática.`
        }\n\n` +
        `⚡ **Importante:** Enquanto não avaliar, você está **BLOQUEADO** de criar ou aceitar novas operações!\n\n` +
        `⏰ **Próximo lembrete:** em ${nextIntervalHours} horas\n\n` +
        `👇 **Clique abaixo para avaliar agora:**`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '⭐ 5 - Excelente', callback_data: `eval_star_5_${pending.operation}` },
            { text: '⭐ 4 - Bom', callback_data: `eval_star_4_${pending.operation}` }
          ],
          [
            { text: '⭐ 3 - Regular', callback_data: `eval_star_3_${pending.operation}` },
            { text: '⭐ 2 - Ruim', callback_data: `eval_star_2_${pending.operation}` }
          ],
          [
            { text: '⭐ 1 - Péssimo', callback_data: `eval_star_1_${pending.operation}` }
          ]
        ]
      };

      await this.bot.telegram.sendMessage(
        evaluatorUser.userId,
        message,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );

      // Atualizar pending com informações da notificação
      const nextNotificationAt = new Date(
        Date.now() + NOTIFICATION_INTERVALS_MS[notificationNumber]
      );

      await this.pendingEvaluationRepository.findOneAndUpdate(
        { _id: pending._id },
        {
          notificationCount: notificationNumber,
          lastNotificationAt: new Date(),
          nextNotificationAt: nextNotificationAt
        }
      );

      this.logger.log(`Notification ${notificationNumber} sent to user ${evaluatorUser.userId} for pending ${pending._id}`);

    } catch (error) {
      this.logger.error(`Error sending notification to user ${evaluatorUser?.userId}:`, error);

      // Se falhou (usuário bloqueou o bot), ainda assim atualizar para não ficar em loop
      try {
        const nextNotificationAt = new Date(
          Date.now() + NOTIFICATION_INTERVALS_MS[pending.notificationCount || 0]
        );

        await this.pendingEvaluationRepository.findOneAndUpdate(
          { _id: pending._id },
          {
            notificationCount: (pending.notificationCount || 0) + 1,
            lastNotificationAt: new Date(),
            nextNotificationAt: nextNotificationAt
          }
        );
      } catch (updateError) {
        this.logger.error('Error updating notification count after failure:', updateError);
      }
    }
  }

  /**
   * Aplica avaliação automática positiva (5 estrelas) após último aviso
   */
  private async applyAutoEvaluation(
    pending: PendingEvaluation,
    evaluatorUser: any,
    targetUser: any,
    operation: any
  ): Promise<void> {
    try {
      const targetName = targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName;
      const evaluatorName = evaluatorUser.userName ? `@${evaluatorUser.userName}` : evaluatorUser.firstName;

      // Registrar avaliação automática de 5 estrelas
      const chatId = this.configService.get<string>('TELEGRAM_GROUP_ID') || operation.group?.toString();

      const evaluator = {
        id: evaluatorUser.userId,
        username: evaluatorUser.userName,
        first_name: evaluatorUser.firstName
      };

      const target = {
        id: targetUser.userId,
        username: targetUser.userName,
        first_name: targetUser.firstName
      };

      // Registrar a avaliação automática
      await this.karmaService.registerStarEvaluation(
        evaluator,
        target,
        { id: parseInt(chatId) || -1 },
        5, // 5 estrelas (máxima pontuação)
        `[Avaliação Automática] Usuário não avaliou após ${MAX_NOTIFICATIONS} lembretes`
      );

      // Marcar como auto-avaliado (mas NÃO como completed - permitir revisão)
      await this.pendingEvaluationRepository.findOneAndUpdate(
        { _id: pending._id },
        {
          notificationCount: MAX_NOTIFICATIONS,
          lastNotificationAt: new Date(),
          autoEvaluated: true,
          autoEvaluatedAt: new Date(),
          autoEvaluationReason: `Avaliação automática após ${MAX_NOTIFICATIONS} lembretes sem resposta`,
          // NÃO marca completed: true - permite revisão
        }
      );

      // Notificar o avaliador que a avaliação foi feita automaticamente
      const messageToEvaluator =
        `🤖 **Avaliação Automática Aplicada**\n\n` +
        `Você não respondeu aos ${MAX_NOTIFICATIONS} lembretes para avaliar ${targetName}.\n\n` +
        `✅ Uma **avaliação positiva (5 estrelas)** foi aplicada automaticamente para não prejudicar a contraparte.\n\n` +
        `📝 **Você pode revisar esta avaliação a qualquer momento** clicando no botão abaixo:\n\n` +
        `⚠️ Seus bloqueios foram removidos - você pode criar e aceitar operações novamente.`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✏️ Revisar Minha Avaliação', callback_data: `eval_review_${pending.operation}` }
          ]
        ]
      };

      try {
        await this.bot.telegram.sendMessage(
          evaluatorUser.userId,
          messageToEvaluator,
          {
            parse_mode: 'Markdown',
            reply_markup: keyboard
          }
        );
      } catch (msgError) {
        this.logger.warn(`Could not notify evaluator ${evaluatorUser.userId} about auto-evaluation:`, msgError);
      }

      // Notificar o avaliado que recebeu avaliação automática
      const messageToTarget =
        `🎉 **Você Recebeu uma Avaliação**\n\n` +
        `👤 **De:** ${evaluatorName}\n` +
        `⭐⭐⭐⭐⭐ **Avaliação:** Excelente\n` +
        `💬 **Comentário:** [Avaliação Automática]\n\n` +
        `ℹ️ Esta avaliação foi aplicada automaticamente pelo sistema após o prazo de avaliação ter expirado.\n\n` +
        `✨ Sua reputação foi atualizada!`;

      try {
        await this.bot.telegram.sendMessage(
          targetUser.userId,
          messageToTarget,
          { parse_mode: 'Markdown' }
        );
      } catch (msgError) {
        this.logger.warn(`Could not notify target ${targetUser.userId} about auto-evaluation:`, msgError);
      }

      // Notificar admin
      const adminChannel = this.configService.get<string>('TELEGRAM_ADMIN_CHANNEL');
      if (adminChannel) {
        try {
          await this.bot.telegram.sendMessage(
            adminChannel,
            `🤖 **Avaliação Automática Aplicada**\n\n` +
            `👤 **Avaliador:** ${evaluatorName} (ID: \`${evaluatorUser.userId}\`)\n` +
            `👤 **Avaliado:** ${targetName} (ID: \`${targetUser.userId}\`)\n` +
            `⭐ **Pontuação:** 5 estrelas\n` +
            `📝 **Motivo:** Não respondeu após ${MAX_NOTIFICATIONS} lembretes\n` +
            `📅 **Data:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
            { parse_mode: 'Markdown' }
          );
        } catch (adminError) {
          this.logger.warn('Could not notify admin channel:', adminError);
        }
      }

      this.logger.log(`Auto-evaluation applied for pending ${pending._id}: ${evaluatorUser.userId} -> ${targetUser.userId}`);

    } catch (error) {
      this.logger.error(`Error applying auto-evaluation for pending ${pending._id}:`, error);
    }
  }

  /**
   * Permite revisar uma avaliação automática
   */
  async handleReviewCallback(ctx: any, operationId: string): Promise<boolean> {
    try {
      const userId = ctx.from.id;
      const user = await this.usersService.findOneByUserId(userId);

      if (!user) {
        await ctx.answerCbQuery('❌ Usuário não encontrado', { show_alert: true });
        return true;
      }

      // Buscar a avaliação pendente auto-avaliada
      const pending = await this.pendingEvaluationRepository.findOne({
        operation: new Types.ObjectId(operationId),
        evaluator: user._id,
        autoEvaluated: true
      });

      if (!pending) {
        await ctx.answerCbQuery('❌ Avaliação não encontrada ou já revisada', { show_alert: true });
        return true;
      }

      // Buscar dados do alvo
      const targetUser = await this.usersService.findById(pending.target.toString());
      if (!targetUser) {
        await ctx.answerCbQuery('❌ Usuário avaliado não encontrado', { show_alert: true });
        return true;
      }

      const targetName = targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName;

      const message =
        `✏️ **Revisar Avaliação Automática**\n\n` +
        `Uma avaliação de 5 estrelas foi aplicada automaticamente para ${targetName}.\n\n` +
        `🔄 **Você pode alterar para qualquer outra nota:**\n\n` +
        `A nova avaliação substituirá a automática.`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '⭐ 5 - Manter Excelente', callback_data: `eval_revise_5_${operationId}` },
            { text: '⭐ 4 - Bom', callback_data: `eval_revise_4_${operationId}` }
          ],
          [
            { text: '⭐ 3 - Regular', callback_data: `eval_revise_3_${operationId}` },
            { text: '⭐ 2 - Ruim', callback_data: `eval_revise_2_${operationId}` }
          ],
          [
            { text: '⭐ 1 - Péssimo', callback_data: `eval_revise_1_${operationId}` }
          ],
          [
            { text: '❌ Cancelar', callback_data: `eval_revise_cancel_${operationId}` }
          ]
        ]
      };

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

      await ctx.answerCbQuery('✏️ Selecione a nova nota');
      return true;

    } catch (error) {
      this.logger.error('Error handling review callback:', error);
      await ctx.answerCbQuery('❌ Erro ao processar revisão', { show_alert: true });
      return true;
    }
  }

  /**
   * Processa a revisão de uma avaliação automática
   */
  async handleReviseCallback(ctx: any, data: string): Promise<boolean> {
    try {
      const parts = data.replace('eval_revise_', '').split('_');
      const action = parts[0];
      const operationId = parts.slice(1).join('_');

      if (action === 'cancel') {
        await ctx.editMessageText(
          '❌ **Revisão Cancelada**\n\n' +
          'A avaliação automática de 5 estrelas foi mantida.',
          { parse_mode: 'Markdown' }
        );
        await ctx.answerCbQuery('Revisão cancelada');
        return true;
      }

      const newRating = parseInt(action);
      if (isNaN(newRating) || newRating < 1 || newRating > 5) {
        await ctx.answerCbQuery('❌ Nota inválida', { show_alert: true });
        return true;
      }

      const userId = ctx.from.id;
      const user = await this.usersService.findOneByUserId(userId);

      if (!user) {
        await ctx.answerCbQuery('❌ Usuário não encontrado', { show_alert: true });
        return true;
      }

      // Buscar a avaliação pendente
      const pending = await this.pendingEvaluationRepository.findOne({
        operation: new Types.ObjectId(operationId),
        evaluator: user._id,
        autoEvaluated: true
      });

      if (!pending) {
        await ctx.answerCbQuery('❌ Avaliação não encontrada', { show_alert: true });
        return true;
      }

      // Buscar dados do alvo
      const targetUser = await this.usersService.findById(pending.target.toString());
      if (!targetUser) {
        await ctx.answerCbQuery('❌ Usuário não encontrado', { show_alert: true });
        return true;
      }

      const targetName = targetUser.userName ? `@${targetUser.userName}` : targetUser.firstName;
      const chatId = this.configService.get<string>('TELEGRAM_GROUP_ID');

      // Calcular diferença de karma (nova avaliação - 5 estrelas anteriores)
      // Como a avaliação anterior foi 5 estrelas, precisamos ajustar
      const karmaChange = newRating - 5; // Diferença de karma

      if (karmaChange !== 0) {
        // Aplicar ajuste de karma
        const evaluator = {
          id: userId,
          username: ctx.from.username,
          first_name: ctx.from.first_name
        };

        const target = {
          id: targetUser.userId,
          username: targetUser.userName,
          first_name: targetUser.firstName
        };

        // Registrar como revisão (ajuste de karma)
        await this.karmaService.registerStarEvaluation(
          evaluator,
          target,
          { id: parseInt(chatId || '-1') },
          newRating,
          `[Revisão] Alterado de 5 estrelas para ${newRating} estrelas`
        );
      }

      // Marcar como completada (revisão feita)
      await this.pendingEvaluationRepository.findOneAndUpdate(
        { _id: pending._id },
        {
          completed: true,
          completedAt: new Date(),
          autoEvaluationReason: `Revisado pelo usuário: ${newRating} estrelas`
        }
      );

      const starEmojis = '⭐'.repeat(newRating);
      const ratingText = ['Péssima', 'Ruim', 'Regular', 'Boa', 'Excelente'][newRating - 1];

      await ctx.editMessageText(
        `${starEmojis} **Avaliação Revisada com Sucesso!**\n\n` +
        `👤 **Usuário:** ${targetName}\n` +
        `⭐ **Nova Avaliação:** ${newRating} estrelas - ${ratingText}\n\n` +
        `✅ A avaliação automática foi substituída pela sua escolha.`,
        { parse_mode: 'Markdown' }
      );

      await ctx.answerCbQuery(`✅ Avaliação alterada para ${newRating} estrelas!`);

      this.logger.log(`Review completed for pending ${pending._id}: changed from 5 to ${newRating} stars`);
      return true;

    } catch (error) {
      this.logger.error('Error handling revise callback:', error);
      await ctx.answerCbQuery('❌ Erro ao revisar avaliação', { show_alert: true });
      return true;
    }
  }

  /**
   * Retorna estatísticas de avaliações pendentes
   */
  async getNotificationStats(): Promise<{
    totalPending: number;
    pendingNotifications: number;
    autoEvaluated: number;
  }> {
    try {
      const totalPending = await this.pendingEvaluationRepository.countPendingNotCompleted();
      const pendingNotifications = await this.pendingEvaluationRepository.countPendingToNotify();
      const autoEvaluated = await this.pendingEvaluationRepository.countAutoEvaluated();

      return { totalPending, pendingNotifications, autoEvaluated };
    } catch (error) {
      this.logger.error('Error getting notification stats:', error);
      return { totalPending: 0, pendingNotifications: 0, autoEvaluated: 0 };
    }
  }
}
