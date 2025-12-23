import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { Types } from 'mongoose';
import { Operation } from './schemas/operation.schema';
import { GroupsService } from '../groups/groups.service';
import { UsersService } from '../users/users.service';
import { KarmaService } from '../karma/karma.service';
import { OperationsRepository } from './operations.repository';
import { PendingEvaluationRepository } from './pending-evaluation.repository';
import { PendingEvaluationService } from './pending-evaluation.service';
import { getReputationInfo } from '../shared/reputation.utils';
import { TelegramRetryService } from '../shared/telegram-retry.service';

@Injectable()
export class OperationsBroadcastService {
  private readonly logger = new Logger(OperationsBroadcastService.name);

  constructor(
    @InjectBot('DEFAULT_BOT_NAME') private readonly bot: Telegraf,
    private readonly groupsService: GroupsService,
    private readonly usersService: UsersService,
    private readonly karmaService: KarmaService,
    private readonly operationsRepository: OperationsRepository,
    private readonly pendingEvaluationRepository: PendingEvaluationRepository,
    private readonly pendingEvaluationService: PendingEvaluationService,
    private readonly configService: ConfigService,
    private readonly retryService: TelegramRetryService,
  ) {}

  private async getKarmaForUserWithFallback(user: any, chatId: number): Promise<any> {
    try {
      // Buscar karma total consolidado (única fonte para exibição)
      const totalKarma = await this.karmaService.getTotalKarmaForUser(user.userName || user.firstName);
      if (totalKarma) {
        return {
          karma: totalKarma.totalKarma,
          givenKarma: totalKarma.totalGiven,
          givenHate: totalKarma.totalHate,
          user: totalKarma.user,
          history: []
        };
      }
      // Fallback para karma do grupo se não houver consolidado
      const groupKarma = await this.karmaService.getKarmaForUser(user.userId, chatId);
      if (groupKarma && groupKarma.karma !== undefined) {
        return groupKarma;
      }
      return null;
    } catch (error) {
      this.logger.error('Erro ao buscar karma com fallback:', error);
      return null;
    }
  }

  private getThreadOptions(groupId: number): any {
    const configuredGroupId = parseInt(this.configService.get<string>('TELEGRAM_GROUP_ID') || '0');
    const threadId = parseInt(this.configService.get<string>('TELEGRAM_THREAD_ID') || '0');
    const opt: any = {};
    if (groupId === configuredGroupId && threadId > 0) {
      opt.message_thread_id = threadId;
    }
    return opt;
  }

  private getBotUsername(): string {
    return this.configService.get<string>('TELEGRAM_BOT_USERNAME') || 'p2pscorebot';
  }

  private getReputationUrlForUser(user: any): string {
    const idRef = user?.userName || user?.firstName || user?.userId;
    return `https://t.me/${this.getBotUsername()}?start=reputacao_${idRef}`;
  }

  /**
   * Executa uma chamada da API do Telegram com retry automático
   * @deprecated Use retryService.executeWithRetry() diretamente para maior flexibilidade
   */
  private async sendWithBackoff<T>(fn: () => Promise<T>, maxRetries?: number): Promise<T> {
    return this.retryService.executeWithRetry(fn, { maxRetries });
  }

  private buildBroadcastInlineKeyboard(operation: Operation, creator: any, acceptText: string, acceptData: string): any {
    return {
      inline_keyboard: [
        [
          { text: acceptText, callback_data: acceptData },
          { text: '📊 Ver Reputação', url: this.getReputationUrlForUser(creator) }
        ]
      ]
    };
  }

  private buildContactButtons(creator: any, acceptor: any): any[] {
    return [
      { text: '💬 Criador', url: `https://t.me/${creator.userName || creator.firstName}` },
      { text: '💬 Negociador', url: `https://t.me/${acceptor.userName || acceptor.firstName}` }
    ];
  }

  private buildInlineKeyboardByStatus(operation: Operation, creator: any, acceptor: any): any {
    if (operation.status === 'pending_completion') {
      return {
        inline_keyboard: [
          this.buildContactButtons(creator, acceptor),
          [{ text: '🔙 Desistir da Operação', callback_data: `revert_operation_${operation._id}` }]
        ]
      };
    }
    if (operation.status === 'accepted') {
      return {
        inline_keyboard: [
          this.buildContactButtons(creator, acceptor)
        ]
      };
    }
    return {
      inline_keyboard: [
        this.buildContactButtons(creator, acceptor),
        [{ text: '🔙 Desistir da Negociação', callback_data: `revert_operation_${operation._id}` }],
        [{ text: '✅ Solicitar Conclusão', callback_data: `complete_operation_${operation._id}` }],
        [{ text: '⚠️ Contestar Operação', callback_data: `dispute_operation_${operation._id}` }]
      ]
    };
  }
  private isEuroOperation(operation: Operation): boolean {
    return operation.assets.includes('EURO' as any);
  }

  private formatPriceAndQuotation(operation: Operation): { priceFormatted: string; quotationFormatted: string } {
    if (this.isEuroOperation(operation)) {
      const priceFormatted = (operation.quotationType === 'google' || operation.quotationType === 'binance') ? 'Calculado na Transação' : `€ ${(operation.amount * operation.price).toFixed(4)}`;
      const quotationFormatted = (operation.quotationType === 'google') ? 'Google' : (operation.quotationType === 'binance') ? 'Binance' : `€ ${operation.price.toFixed(4)}`;
      return { priceFormatted, quotationFormatted };
    }
    const priceFormatted = (operation.quotationType === 'google' || operation.quotationType === 'binance') ? 'Calculado na Transação' : `R$ ${(operation.amount * operation.price).toFixed(2)}`;
    const quotationFormatted = (operation.quotationType === 'google') ? 'Google' : (operation.quotationType === 'binance') ? 'Binance' : `R$ ${operation.price.toFixed(2)}`;
    return { priceFormatted, quotationFormatted };
  }

  private formatCompletionValues(operation: Operation, total: number): { priceFormatted: string; totalFormatted: string } {
    if (this.isEuroOperation(operation)) {
      const priceFormatted = operation.quotationType === 'google' ? 'Google (calculada na transação)' : `€ ${operation.price.toFixed(4)}`;
      const totalFormatted = `€ ${total.toFixed(2)}`;
      return { priceFormatted, totalFormatted };
    }
    const priceFormatted = (operation.quotationType === 'google') ? 'Google (calculada na transação)' : (operation.quotationType === 'binance') ? 'Binance (calculada na transação)' : `R$ ${operation.price.toFixed(2)}`;
    const totalFormatted = `R$ ${total.toFixed(2)}`;
    return { priceFormatted, totalFormatted };
  }

  private getTypeEmojiAndText(type: string): { emoji: string; text: string } {
    switch (type) {
      case 'buy':
        return { emoji: '🟢', text: 'COMPRA' }
      case 'sell':
        return { emoji: '🔴', text: 'VENDA' }
      case 'announcement':
        return { emoji: '📰', text: 'ANÚNCIO' }
      case 'exchange':
        return { emoji: '🔁', text: 'TROCA' }
      default:
        return { emoji: '🟢', text: 'COMPRA' }
    }
  }

  private getArrowsForType(type: string): { actionArrow: string; paymentArrow: string } {
    const isBuy = type === 'buy'
    return { actionArrow: isBuy ? '⬅️' : '➡️', paymentArrow: isBuy ? '➡️' : '⬅️' }
  }

  private formatAssets(operation: Operation): string {
    return operation.assets.join(', ')
  }

  private formatNetworks(operation: Operation): string {
    return operation.networks.map(n => n.toUpperCase()).join(', ')
  }

  async deleteOperationMessage(operation: Operation): Promise<void> {
    try {
      this.logger.log(`Attempting to delete operation message for operation ${operation._id}`);
      this.logger.log(`Operation messageId: ${operation.messageId}, group: ${operation.group}`);
      
      if (!operation.messageId) {
        this.logger.warn(`Operation ${operation._id} has no messageId - cannot delete message`);
        return;
      }
      
      if (!operation.group) {
        this.logger.warn(`Operation ${operation._id} has no group - cannot delete message`);
        return;
      }
      
      // Buscar o grupo para obter o groupId
      const group = await this.groupsService.findById(operation.group.toString());
      const msgId = typeof operation.messageId === 'number' ? operation.messageId : undefined;
      if (group && typeof msgId === 'number') {
        this.logger.log(`Found group ${group.groupId}, attempting to delete message ${operation.messageId}`);
        await this.sendWithBackoff(() => this.bot.telegram.deleteMessage(group.groupId, msgId));
        this.logger.log(`Successfully deleted operation message ${operation.messageId} from group ${group.groupId}`);
      } else {
        this.logger.warn(`Group ${operation.group} not found - cannot delete message`);
      }
    } catch (error) {
      this.logger.error(`Failed to delete operation message for operation ${operation._id}: ${error.message}`);
      // Não lançar erro pois a deleção da mensagem é opcional
    }
  }

  async broadcastOperationToAllGroups(operation: Operation): Promise<void> {
    try {
      const groups = await this.groupsService.getDistinctGroupIds();
      
      // Filtrar apenas grupos reais (IDs negativos) e excluir chats privados (IDs positivos)
      const realGroups = groups.filter(groupId => groupId < 0);
      
      // Usar apenas os grupos reais do banco de dados
      const allGroupIds = [...new Set(realGroups)];
      
      const concurrency = parseInt(this.configService.get<string>('BROADCAST_CONCURRENCY') || '3');
      let index = 0;
      const worker = async () => {
        while (index < allGroupIds.length) {
          const current = index++;
          const groupId = allGroupIds[current];
          try {
            await this.broadcastOperationToSpecificGroup(operation, groupId);
          } catch (err) {
            this.logger.warn(`Falha ao enviar para grupo ${groupId}: ${ (err as any)?.message }`);
            await new Promise(r => setTimeout(r, 500));
          }
          const delayMs = parseInt(this.configService.get<string>('BROADCAST_DELAY_MS') || '150');
          await new Promise(r => setTimeout(r, delayMs));
        }
      };
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      
      this.logger.log(
        `Operation ${operation._id} broadcasted to ${allGroupIds.length} groups`
      );
    } catch (error) {
      this.logger.error(
        `Failed to broadcast operation ${operation._id} to all groups:`,
        error
      );
    }
  }

  async broadcastOperationToGroup(operation: Operation): Promise<void> {
    // Se a operação tem um grupo específico, enviar apenas para esse grupo
    if (operation.group) {
      try {
        const group = await this.groupsService.findById(operation.group.toString());
        if (group) {
          await this.broadcastOperationToSpecificGroup(operation, group.groupId);
          this.logger.log(`📤 Operação ${operation._id} enviada para grupo ${group.groupId}`);
          return;
        } else {
          this.logger.warn(`❌ Grupo ${operation.group} não encontrado`);
        }
      } catch (error) {
        this.logger.error(`❌ Erro ao buscar grupo ${operation.group}:`, error);
      }
    }
    
    // Se não tem grupo específico ou grupo não encontrado, enviar para todos
    await this.broadcastOperationToAllGroups(operation);
    this.logger.log(`📡 Operação ${operation._id} enviada para todos os grupos`);
    
    // Código antigo comentado para referência
    // Tentar encontrar o grupo, se não existir, criar automaticamente
    /*
    let group;
    if (operation.group) {
      const groupId = operation.group;
      try {
        group = await this.groupsService.findById(groupId!.toString());
      } catch (error) {
        // Se o grupo não existir, criar automaticamente
        this.logger.warn(`Group ${groupId} not found, creating automatically`);
        const groupIdNumber = parseInt(groupId!.toString());
        group = await this.groupsService.findOrCreate({
          id: groupIdNumber,
          title: `Grupo ${groupIdNumber}`
        });
      }
    */
    
    // Código removido - não é mais necessário pois a lógica foi alterada
  }

  private async broadcastOperationToSpecificGroup(operation: Operation, groupId: number): Promise<void> {
    try {
      const creator = await this.usersService.findById(operation.creator.toString());
      if (!creator) {
        this.logger.error(`❌ Criador não encontrado: ${operation.creator}`);
        return;
      }

      // Buscar reputação do criador (com fallback para karma total)
      let karmaInfo: any = null;
      try {
        karmaInfo = await this.getKarmaForUserWithFallback(creator, groupId);
      } catch (error) {
        this.logger.warn(`Could not fetch karma for user ${creator.userId}:`, error);
      }

      const { emoji: typeEmoji, text: typeText } = this.getTypeEmojiAndText(operation.type);
      // Calcular total corretamente baseado no tipo de operação
      const total = operation.amount * operation.price;
      const expiresIn = this.getTimeUntilExpiration(operation.expiresAt);

      const assetsText = this.formatAssets(operation);
      const networksText = this.formatNetworks(operation);
      
      // Formatação do nome do usuário
      const userName = creator.userName ? `@${creator.userName}` : creator.firstName || 'Usuário';
      
      // Verificar se o criador tem disputas ativas
      let disputeWarning = '';
      try {
        const analysis = await this.pendingEvaluationService.getDisputeAnalysis(operation.creator);
        if (analysis.total > 0) {
          // Usar emoji mais forte para quem está sendo contestado
          if (analysis.asDefendant > 0) {
            disputeWarning = ' 🚨';
          } else {
            disputeWarning = ' ⚠️';
          }
        }
      } catch (error) {
        this.logger.error('Erro ao verificar disputas do criador:', error);
      }
      
      // Informações de reputação usando função centralizada
      const reputationInfo = getReputationInfo(karmaInfo);
      const scoreTotal = reputationInfo.score;
      const nivelConfianca = reputationInfo.nivel;
      const reputationIcon = reputationInfo.icone;
      
      let message = (
          `${typeEmoji} **${typeText} ${assetsText}**\n` +
          `Redes: ${networksText}\n`
        );

      if (operation.quotationType === 'manual') {
          const assetsText = this.formatAssets(operation);
          const buyText = `${operation.amount} ${assetsText}`;
          const payText = `R$ ${total.toFixed(2)}`;
          const actionText = operation.type === 'buy' ? 'Quero comprar' : 'Quero vender';
          const { actionArrow: arrowIcon, paymentArrow } = this.getArrowsForType(operation.type);
          const paymentText = operation.type === 'buy' ? 'Quero pagar' : 'Quero receber';
          
          message += (
            `${arrowIcon} **${actionText}:** ${buyText}\n` +
            `${paymentArrow} **${paymentText}:** ${payText}\n` +
            `💱 **Cotação:** R$ ${operation.price.toFixed(2)}\n\n`
          );
        } else if (operation.quotationType === 'google' || operation.quotationType === 'binance') {
          const assetsText = this.formatAssets(operation);
          const actionText = operation.type === 'buy' ? 'Quero comprar' : 'Quero vender';
          const paymentText = operation.type === 'buy' ? 'Quero pagar' : 'Quero receber';
          const { actionArrow: arrowIcon, paymentArrow } = this.getArrowsForType(operation.type);
          const sourceIcon = operation.quotationType === 'google' ? '🌐 Google' : '🟡 Binance';
          
          message += (
            `${arrowIcon} **${actionText}:** ${operation.amount} ${assetsText}\n` +
            `${paymentArrow} **${paymentText}:** Calculado na hora\n` +
            `💱 **Cotação:** ${sourceIcon}\n\n`
          );
        }
        
        // Adicionar métodos de pagamento se disponíveis
        if (operation.paymentMethods && operation.paymentMethods.length > 0) {
          message += `💳 **Métodos de Pagamento:** ${operation.paymentMethods.join(', ')}\n\n`;
        }
        
        message += (
          `👤 **Criador:** ${userName}${disputeWarning}\n` +
          `${reputationIcon} ${nivelConfianca}: ${scoreTotal} pts\n\n`
        );

      if (operation.description) {
        message += `📝 **Descrição:** ${operation.description}\n\n`;
      }

      // Adicionar aviso de disputa se o criador tiver disputas ativas
      if (disputeWarning) {
        const analysis = await this.pendingEvaluationService.getDisputeAnalysis(operation.creator);
        let disputeMessage = '';
        
        if (analysis.asDefendant > 0) {
          disputeMessage = `🚨 **ATENÇÃO:** O criador está sendo contestado em ${analysis.asDefendant} operação(ões)`;
          if (analysis.asComplainant > 0) {
            disputeMessage += ` (e contestou ${analysis.asComplainant})`;
          }
          disputeMessage += `\n⚠️ **Cuidado ao aceitar:** Considere os riscos antes de prosseguir\n\n`;
        } else if (analysis.asComplainant > 0) {
          disputeMessage = `⚠️ **Aviso:** O criador contestou ${analysis.asComplainant} operação(ões)\n` +
            `💡 **Pode indicar:** Usuário exigente com qualidade das transações\n\n`;
        }
        
        message += disputeMessage;
      }

      message += (
        `⏰ **Expira em:** ${expiresIn}\n` +
        `🆔 **ID da Operação:** ${operation._id}`
      );

      // Criar botões inline com confirmação se houver disputas
      let acceptButtonText = '🚀 Aceitar Operação';
      let acceptCallbackData = `accept_operation_${operation._id}`;
      
      // Se o criador tem disputas ativas, usar botão de confirmação
      if (disputeWarning) {
        const analysis = await this.pendingEvaluationService.getDisputeAnalysis(operation.creator);
        if (analysis.asDefendant > 0) {
          acceptButtonText = '⚠️ Aceitar (Confirmar Risco)';
          acceptCallbackData = `confirm_accept_${operation._id}`;
        }
      }
      
      const inlineKeyboard = this.buildBroadcastInlineKeyboard(operation, creator, acceptButtonText, acceptCallbackData);

      // Configurar envio para tópico específico se for o grupo configurado
      const sendOptions: any = { 
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard,
        ...this.getThreadOptions(groupId)
      };

      const sentMessage = await this.sendWithBackoff(() => this.bot.telegram.sendMessage(
        groupId,
        message,
        sendOptions
      ));

      // Salvar o messageId na operação para poder deletar depois
      if (sentMessage && sentMessage.message_id) {
        operation.messageId = sentMessage.message_id;
        
        // Salvar apenas o messageId, sem modificar associação de grupo
        let updateData: any = { messageId: sentMessage.message_id };
        
        // Salvar no banco de dados
        try {
          await this.operationsRepository.updateOperation(
            operation._id,
            updateData
          );
          this.logger.log(`✅ MessageId ${sentMessage.message_id} salvo para operação ${operation._id}`);
        } catch (error) {
          this.logger.warn(`⚠️ Failed to save messageId for operation ${operation._id}: ${error.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`❌ ERRO ao enviar operação ${operation._id} para grupo ${groupId}:`);
      this.logger.error(`📋 Tipo do erro: ${error.constructor.name}`);
      this.logger.error(`💬 Mensagem: ${error.message}`);
      
      if (error.response) {
        this.logger.error(`🔍 Resposta da API Telegram:`, error.response.data || error.response);
      }
      
      if (error.code) {
        this.logger.error(`🏷️ Código do erro: ${error.code}`);
      }
      
      // Log completo do erro para debug
      this.logger.error(`🔧 Stack trace:`, error.stack);
    }
  }

  async notifyOperationAccepted(
    operation: Operation,
    acceptorId: Types.ObjectId
  ): Promise<void> {
    try {
      this.logger.log(`🔄 [DEBUG] notifyOperationAccepted iniciado para operação ${operation._id}`);
      this.logger.log(`🔍 [DEBUG] Operation messageId: ${operation.messageId}`);
      this.logger.log(`🔍 [DEBUG] Operation group: ${operation.group}`);
      this.logger.log(`🔍 [DEBUG] AcceptorId: ${acceptorId}`);
      
      if (!operation.group) {
        this.logger.warn('Operation has no associated group for acceptance notification');
        return;
      }
      
      // Tentar encontrar o grupo, se não existir, criar automaticamente
      let group;
      try {
        group = await this.groupsService.findById(operation.group.toString());
      } catch (error) {
        // Se o grupo não existir, criar automaticamente
        this.logger.warn(`Group ${operation.group} not found, creating automatically`);
        const groupIdNumber = parseInt(operation.group.toString());
        group = await this.groupsService.findOrCreate({
          id: groupIdNumber,
          title: `Grupo ${groupIdNumber}`
        });
      }
      
      const creator = await this.usersService.findById(operation.creator.toString());
      const acceptor = await this.usersService.findById(acceptorId.toString());

      if (!group || !creator || !acceptor) {
        this.logger.warn('Missing data for operation acceptance notification');
        return;
      }

      // Primeiro, notificar o criador no chat privado sobre a aceitação
      try {
        const acceptorName = acceptor.userName ? `@${acceptor.userName}` : acceptor.firstName || 'Usuário';
        
        // Enviar mensagem privada ao criador informando sobre a aceitação
         const creatorNotificationMessage = `✅ **Operação Aceita!**\n\n` +
           `${acceptorName} aceitou sua operação!\n\n` +
           `🟢 **COMPRA**\n` +
           `Ativos: ${operation.assets.join(', ')}\n` +
           `Redes: ${operation.networks.map(n => n.toUpperCase()).join(', ')}\n` +
           `Quantidade: ${operation.amount} (total)\n\n` +
           `👤 **Negociador:** ${acceptorName}\n` +
           `🆔 **ID:** \`${operation._id}\`\n\n` +
           `📞 **Próximos passos:**\n` +
           `1. Entrem em contato via DM\n` +
           `2. Combinem os detalhes da transação\n` +
           `3. Usem o botão "Concluir Operação" quando finalizada`;

        const sentDm = await this.bot.telegram.sendMessage(
          creator.userId,
          creatorNotificationMessage,
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Solicitar Conclusão', callback_data: `complete_operation_${operation._id}` }],
                [{ text: '⚠️ Contestar Operação', callback_data: `dispute_operation_${operation._id}` }],
                [{ text: '🔙 Voltar Operação', callback_data: `revert_operation_${operation._id}` }]
              ]
            }
          }
        );
        // Salvar o ID da mensagem privada enviada ao criador para poder remover o teclado depois
        if (sentDm && sentDm.message_id) {
          try {
            await this.operationsRepository.updateOperation(
              operation._id,
              { creatorAcceptanceDmMessageId: sentDm.message_id }
            );
            this.logger.log(`✅ creatorAcceptanceDmMessageId ${sentDm.message_id} salvo para operação ${operation._id}`);
          } catch (saveError: any) {
            this.logger.warn(`⚠️ Falha ao salvar creatorAcceptanceDmMessageId para operação ${operation._id}: ${saveError.message}`);
          }
        }
        this.logger.log(`Notificação de aceitação enviada ao criador ${creator.userId} para operação ${operation._id}`);
      } catch (error) {
        this.logger.warn('Erro ao notificar criador sobre aceitação:', error);
      }

      let typeEmoji = '🟢';
      let typeText = 'COMPRA';
      
      switch (operation.type) {
        case 'buy':
          typeEmoji = '🟢';
          typeText = 'COMPRA';
          break;
        case 'sell':
          typeEmoji = '🔴';
          typeText = 'VENDA';
          break;
        case 'announcement':
          typeEmoji = '📰';
          typeText = 'ANÚNCIO';
          break;
        case 'exchange':
          typeEmoji = '🔁';
          typeText = 'TROCA';
          break;
      }
      const total = operation.amount * operation.price;

          const assetsText = this.formatAssets(operation);
      const networksText = operation.networks.map(n => n.toUpperCase()).join(', ');
      
      // Buscar reputação dos usuários
      const creatorName = creator.userName ? `@${creator.userName}` : creator.firstName || 'Usuário';
      const acceptorName = acceptor.userName ? `@${acceptor.userName}` : acceptor.firstName || 'Usuário';
      
      // Buscar karma dos usuários com fallback usando o groupId real do Telegram
      const chatId = group.groupId;
      const creatorKarma = await this.getKarmaForUserWithFallback(creator, chatId);
      const acceptorKarma = await this.getKarmaForUserWithFallback(acceptor, chatId);
      
      // Calcular níveis de reputação usando função utilitária
      const creatorRep = getReputationInfo(creatorKarma);
      const acceptorRep = getReputationInfo(acceptorKarma);
      
      // Verificar disputas ativas para determinar ordem de transferência
      const [creatorDisputes, acceptorDisputes] = await Promise.all([
        this.pendingEvaluationService.getDisputeAnalysis(operation.creator),
        this.pendingEvaluationService.getDisputeAnalysis(acceptorId)
      ]);
      
      // Determinar ordem de transferência com prioridade para disputas
      const creatorScore = creatorRep.score;
      const acceptorScore = acceptorRep.score;
      
      let creatorTransfersFirst = creatorScore <= acceptorScore; // Lógica padrão
      let transferReason = 'menor reputação';
      
      // REGRA ESPECIAL: Quem está sendo contestado transfere primeiro (independente da reputação)
      if (creatorDisputes.asDefendant > 0 && acceptorDisputes.asDefendant === 0) {
        creatorTransfersFirst = true;
        transferReason = 'está sendo contestado';
      } else if (acceptorDisputes.asDefendant > 0 && creatorDisputes.asDefendant === 0) {
        creatorTransfersFirst = false;
        transferReason = 'está sendo contestado';
      } else if (creatorDisputes.asDefendant > 0 && acceptorDisputes.asDefendant > 0) {
        // Ambos sendo contestados - quem tem mais contestações transfere primeiro
        if (creatorDisputes.asDefendant > acceptorDisputes.asDefendant) {
          creatorTransfersFirst = true;
          transferReason = 'mais contestações ativas';
        } else if (acceptorDisputes.asDefendant > creatorDisputes.asDefendant) {
          creatorTransfersFirst = false;
          transferReason = 'mais contestações ativas';
        }
        // Se igual número de contestações, manter lógica de reputação
      }
      
      const firstTransferer = creatorTransfersFirst ? creatorName : acceptorName;
      const secondTransferer = creatorTransfersFirst ? acceptorName : creatorName;
      
      // Função para formatar unidade de ativo (stablecoins → USD)
      const formatAssetUnit = (assets: string[]) => {
        const stablecoins = ['USDT', 'USDC', 'USDE', 'DAI', 'BUSD', 'TUSD', 'FRAX', 'LUSD'];
        const hasOnlyStablecoins = assets.every(asset => stablecoins.includes(asset.toUpperCase()));
        return hasOnlyStablecoins ? 'USD' : assets.join(', ');
      };
      
      const assetUnit = formatAssetUnit(operation.assets);
      
      const { priceFormatted, quotationFormatted } = this.formatPriceAndQuotation(operation);
      
      const message = (
        `✅ **Operação Aceita!**\n\n` +
        `${acceptorName} aceitou a operação de ${typeText}\n\n` +
        `**Ativos:** ${assetsText}\n` +
        `**Quantidade:** ${operation.amount} ${assetUnit}\n` +
        `**Preço Total:** ${priceFormatted}\n` +
        `Cotação: ${quotationFormatted}\n` +
        `Redes: ${networksText}\n` +
        `🆔 **ID:** ${operation._id}\n\n` +
        `👥 **Partes Envolvidas:**\n` +
        `• **Criador:** ${creatorName} — ${creatorRep.icone} ${creatorRep.nivel} (${creatorRep.score} pts)\n` +
        `• **Negociador:** ${acceptorName} — ${acceptorRep.icone} ${acceptorRep.nivel} (${acceptorRep.score} pts)\n\n` +
        `🔄 **Ordem de Transferência:**\n` +
        `1️⃣ ${firstTransferer} transfere primeiro (${transferReason})\n` +
        `2️⃣ ${secondTransferer} transfere por último\n\n` +
        `🍀 **Próximos passos:**\n` +
        `1. Entrem em contato via DM\n` +
        `2. Combinem os detalhes da transação\n` +
        `3. Após concluir, registrem a conclusão no bot\n` +
        `4. Faça a avaliação da outra parte\n\n` +
        `⚠️ **Importante:** Sempre verifiquem a reputação antes de prosseguir!`
      );

      // Adicionar botões de ação baseados no status da operação
      let inlineKeyboard;
      
      inlineKeyboard = this.buildInlineKeyboardByStatus(operation, creator, acceptor);
      // Garantir botão "Voltar Operação" visível lado a lado com demais quando aceito
      if (operation.status === 'accepted' && inlineKeyboard && Array.isArray(inlineKeyboard.inline_keyboard)) {
        inlineKeyboard.inline_keyboard.push([{ text: '🔙 Voltar Operação', callback_data: `revert_operation_${operation._id}` }]);
      }

      // Configurar envio para tópico específico se for o grupo P2P configurado
      const sendOptions: any = { 
        parse_mode: 'Markdown'
      };
      
      const p2pGroupId = parseInt(this.configService.get<string>('TELEGRAM_GROUP_ID') || '0');
      const p2pThreadId = parseInt(this.configService.get<string>('TELEGRAM_THREAD_ID') || '0');
      
      if (group.groupId === p2pGroupId && p2pThreadId > 0) {
        sendOptions.message_thread_id = p2pThreadId;
      }

      // Editar a mensagem original em vez de deletar e criar nova
      if (operation.messageId) {
        try {
          this.logger.log(`🔄 Tentando editar mensagem ${operation.messageId} para operação ${operation._id}`);
          await this.sendWithBackoff(() => this.bot.telegram.editMessageText(
            group.groupId,
            operation.messageId,
            undefined,
            message,
            {
              parse_mode: 'Markdown'
            }
          ));
          // Remover qualquer teclado inline remanescente da mensagem de aceitação
          try {
            await this.sendWithBackoff(() => this.bot.telegram.editMessageReplyMarkup(
              group.groupId,
              operation.messageId,
              undefined,
              { inline_keyboard: [] }
            ));
          } catch (rmError: any) {
            this.logger.warn(`⚠️ Falha ao remover teclado após edição de aceitação: ${rmError.message}`);
          }
          this.logger.log(`✅ Mensagem ${operation.messageId} editada com sucesso para operação ${operation._id}`);
        } catch (editError: any) {
          this.logger.error(`❌ Falha ao editar mensagem ${operation.messageId} para operação ${operation._id}:`, editError);
          this.logger.warn(`🔄 Tentando deletar e enviar nova mensagem...`);
          
          // Se falhar ao editar, deletar e enviar nova
          try {
            await this.deleteOperationMessage(operation);
            const newMessage = await this.sendWithBackoff(() => this.bot.telegram.sendMessage(
              group.groupId,
              message,
              sendOptions
            ));
            
            // Atualizar messageId da operação
            await this.operationsRepository.updateOperation(operation._id, {
              messageId: newMessage.message_id
            });
            
            this.logger.log(`✅ Nova mensagem ${newMessage.message_id} enviada para operação ${operation._id}`);
          } catch (sendError: any) {
            this.logger.error(`❌ Falha ao enviar nova mensagem para operação ${operation._id}:`, sendError);
          }
        }
      } else {
        // Se não tem messageId, enviar nova mensagem
        this.logger.log(`📤 Enviando nova mensagem para operação ${operation._id} (sem messageId)`);
        try {
          const newMessage = await this.sendWithBackoff(() => this.bot.telegram.sendMessage(
            group.groupId,
            message,
            sendOptions
          ));
          
          // Atualizar messageId da operação
          await this.operationsRepository.updateOperation(operation._id, {
            messageId: newMessage.message_id
          });
          
          this.logger.log(`✅ Nova mensagem ${newMessage.message_id} enviada e salva para operação ${operation._id}`);
        } catch (sendError: any) {
          this.logger.error(`❌ Falha ao enviar mensagem para operação ${operation._id}:`, sendError);
        }
      }

      this.logger.log(
        `Operation acceptance ${operation._id} notified to group ${group.groupId}`
      );

      // Enviar mensagem privada ao negociador com botões de ação
      await this.sendPrivateEvaluationMessage(operation, acceptor, creator);
    } catch (error) {
      this.logger.error(
        `Failed to notify operation acceptance ${operation._id}:`,
        error
      );
    }
  }

  async notifyOperationCompleted(operation: Operation): Promise<void> {
    try {
      if (!operation.group) {
        this.logger.warn('Operation has no associated group for completion notification');
        return;
      }
      
      // Tentar encontrar o grupo, se não existir, criar automaticamente
      let group;
      try {
        group = await this.groupsService.findById(operation.group.toString());
      } catch (error) {
        // Se o grupo não existir, criar automaticamente
        this.logger.warn(`Group ${operation.group} not found, creating automatically`);
        const groupIdNumber = parseInt(operation.group.toString());
        group = await this.groupsService.findOrCreate({
          id: groupIdNumber,
          title: `Grupo ${groupIdNumber}`
        });
      }
      
      const creator = await this.usersService.findById(operation.creator.toString());
      
      let acceptor: any = null;
      if (operation.acceptor) {
        acceptor = await this.usersService.findById(operation.acceptor.toString());
      }
      
      this.logger.log(`Operation completion - Creator: ${creator?._id}, Acceptor: ${acceptor?._id}`);

      if (!group || !creator) {
        this.logger.warn('Missing data for operation completion notification');
        return;
      }

      const { emoji: typeEmoji, text: typeText } = this.getTypeEmojiAndText(operation.type);
      const total = operation.amount * operation.price;

      const assetsText = this.formatAssets(operation);
      const networksText = this.formatNetworks(operation);
      
      // Formatar nomes com @ quando disponível
      const creatorName = creator.userName ? `@${creator.userName}` : creator.firstName || 'Usuário';
      const acceptorName = acceptor?.userName ? `@${acceptor.userName}` : acceptor?.firstName || 'Usuário';

      let message = (
        `✅ **Operação Concluída!**\n\n` +
        `${typeEmoji} **${typeText} ${assetsText}**\n` +
        `🌐 **Redes:** ${networksText}\n` +
        `💰 **Quantidade:** ${operation.amount} (total)\n\n`
      );

      const { priceFormatted, totalFormatted } = this.formatCompletionValues(operation, total);
      
      if (operation.quotationType === 'google' || operation.quotationType === 'binance') {
        message += `💵 **Cotação:** ${priceFormatted}\n`;
      } else {
        message += `💵 **Preço:** ${priceFormatted}\n`;
      }
      
      message += `💸 **Total:** ${totalFormatted}\n\n`;

      // Informações dos participantes
      message += `👤 **Criador:** ${creatorName}\n`;
      if (acceptor) {
        message += `🤝 **Negociador:** ${acceptorName}\n`;
      }
      
      // Informações da operação para consulta futura
      message += (
        `\n📋 **Detalhes da Operação:**\n` +
        `🆔 **ID:** \`${operation._id}\`\n` +
        `⏰ **Concluída em:** ${new Date().toLocaleString('pt-BR')}\n`
      );
      
      // Adicionar detalhes da transação se fornecidos
      if (operation.transactionDetails) {
        message += `📝 **Detalhes:** ${operation.transactionDetails}\n`;
      }
      
      // Adicionar hash da transação se fornecido
      if (operation.transactionHash) {
        message += `🔗 **Hash:** \`${operation.transactionHash}\`\n`;
      }
      
      message += (
        `\n💡 **Não esqueçam de se avaliarem mutuamente!**\n` +
        `🚀 **Continuem negociando com segurança!**`
      );

      // Para operações concluídas, criar botões de reputação
      const creatorUserId = creator?.userName || creator?.firstName || creator?.userId;
      const acceptorUserId = acceptor?.userName || acceptor?.firstName || acceptor?.userId;
      
      const buttons = [
        {
          text: `📊 ${creatorName}`,
          url: this.getReputationUrlForUser(creator)
        }
      ];
      
      if (acceptor) {
        buttons.push({
          text: `📊 ${acceptorName}`,
          url: this.getReputationUrlForUser(acceptor)
        });
      }
      
      const inlineKeyboard = {
        inline_keyboard: [buttons]
      };

      // Configurar envio para tópico específico se for o grupo mencionado
      const sendOptions: any = { 
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
      };
      
      // Usar as variáveis de ambiente corretas
      const p2pGroupId = parseInt(this.configService.get<string>('TELEGRAM_GROUP_ID') || '0');
      const p2pThreadId = parseInt(this.configService.get<string>('TELEGRAM_THREAD_ID') || '0');
      
      if (group.groupId === p2pGroupId && p2pThreadId > 0) {
        sendOptions.message_thread_id = p2pThreadId;
      }

      // Editar a mensagem original em vez de criar nova
      if (operation.messageId) {
        try {
          await this.sendWithBackoff(() => this.bot.telegram.editMessageText(
            group.groupId,
            operation.messageId,
            undefined,
            message,
            {
              parse_mode: 'Markdown'
            }
          ));
          this.logger.log(`Edited original message ${operation.messageId} for completed operation ${operation._id} - buttons removed`);
        } catch (editError) {
          this.logger.warn(`Failed to edit message ${operation.messageId}, sending new message:`, editError);
          // Se falhar ao editar, enviar nova mensagem
          await this.sendWithBackoff(() => this.bot.telegram.sendMessage(
            group.groupId,
            message,
            {
              parse_mode: 'Markdown'
            }
          ));
        }
      } else {
        // Se não tem messageId, enviar nova mensagem
        await this.sendWithBackoff(() => this.bot.telegram.sendMessage(
          group.groupId,
          message,
          {
            parse_mode: 'Markdown'
          }
        ));
      }

      this.logger.log(
        `Operation completion ${operation._id} notified to group ${group.groupId}`
      );
      
      // Remover o teclado da DM enviada ao criador na aceitação, se existir
      try {
        if (operation.creatorAcceptanceDmMessageId && creator) {
          await this.sendWithBackoff(() => this.bot.telegram.editMessageReplyMarkup(
            creator.userId,
            operation.creatorAcceptanceDmMessageId,
            undefined,
            { inline_keyboard: [] }
          ));
          this.logger.log(`✅ Teclado removido da DM de aceitação do criador para operação ${operation._id}`);
        }
      } catch (dmError: any) {
        this.logger.warn(`⚠️ Não foi possível remover teclado da DM do criador: ${dmError.message}`);
      }

      // Enviar mensagens de avaliação bidirecional
      if (creator && acceptor) {
        await this.sendBidirectionalEvaluationMessages(operation, creator, acceptor);
      }
    } catch (error) {
      this.logger.error(
        `Failed to notify operation completion ${operation._id}:`,
        error
      );
    }
  }

  async notifyOperationAdminCancelled(operation: Operation, adminName: string, reason?: string): Promise<void> {
    try {
      if (operation.group && operation.messageId) {
        const group = await this.groupsService.findById(operation.group.toString());
        if (group) {
          const message = (
            `🛑 **Operação Cancelada (Admin)**\n\n` +
            `👤 **Decisão:** ${adminName}\n` +
            (reason ? `📝 **Motivo:** ${reason}\n` : '') +
            `🆔 **ID:** \`${operation._id}\``
          );
          await this.sendWithBackoff(() => this.bot.telegram.editMessageText(
            group.groupId,
            operation.messageId as number,
            undefined,
            message,
            { parse_mode: 'Markdown' }
          ));
        }
      }
      const creator = await this.usersService.findById(operation.creator.toString());
      const acceptor = operation.acceptor ? await this.usersService.findById(operation.acceptor.toString()) : null;
      const notify = async (user: any) => {
        if (!user) return;
        const msg = (
          `🛑 **Operação Cancelada pela Administração**\n\n` +
          `👤 **Administrador:** ${adminName}\n` +
          (reason ? `📝 **Motivo:** ${reason}\n` : '') +
          `🆔 **ID:** \`${operation._id}\``
        );
        await this.sendWithBackoff(() => this.bot.telegram.sendMessage(user.userId, msg, { parse_mode: 'Markdown' }));
      };
      await Promise.all([notify(creator), notify(acceptor)]);
    } catch (error) {
      this.logger.error('Failed to notify admin cancellation:', error);
    }
  }

  async notifyOperationAdminDisputeCleared(operation: Operation, adminName: string, reason?: string): Promise<void> {
    try {
      if (operation.group && operation.messageId) {
        const group = await this.groupsService.findById(operation.group.toString());
        if (group) {
          const message = (
            `✅ **Disputa Removida (Admin)**\n\n` +
            `👤 **Decisão:** ${adminName}\n` +
            (reason ? `📝 **Motivo:** ${reason}\n` : '') +
            `🆔 **ID:** \`${operation._id}\`\n\n` +
            `Status: Aceita`
          );
          await this.sendWithBackoff(() => this.bot.telegram.editMessageText(
            group.groupId,
            operation.messageId as number,
            undefined,
            message,
            { parse_mode: 'Markdown' }
          ));
        }
      }
      const creator = await this.usersService.findById(operation.creator.toString());
      const acceptor = operation.acceptor ? await this.usersService.findById(operation.acceptor.toString()) : null;
      const notify = async (user: any) => {
        if (!user) return;
        const msg = (
          `✅ **Disputa Removida pela Administração**\n\n` +
          `👤 **Administrador:** ${adminName}\n` +
          (reason ? `📝 **Motivo:** ${reason}\n` : '') +
          `🆔 **ID:** \`${operation._id}\`\n\n` +
          `A operação volta ao status Aceita.`
        );
        await this.sendWithBackoff(() => this.bot.telegram.sendMessage(user.userId, msg, { parse_mode: 'Markdown' }));
      };
      await Promise.all([notify(creator), notify(acceptor)]);
    } catch (error) {
      this.logger.error('Failed to notify admin dispute cleared:', error);
    }
  }

  async notifyOperationAdminFlagged(operation: Operation, adminName: string, reason?: string): Promise<void> {
    try {
      if (operation.group && operation.messageId) {
        const group = await this.groupsService.findById(operation.group.toString());
        if (group) {
          const message = (
            `🚨 **Operação Marcada como Fraude (Admin)**\n\n` +
            `👤 **Decisão:** ${adminName}\n` +
            (reason ? `📝 **Motivo:** ${reason}\n` : '') +
            `🆔 **ID:** \`${operation._id}\`\n\n` +
            `Status: Em investigação`
          );
          await this.sendWithBackoff(() => this.bot.telegram.editMessageText(
            group.groupId,
            operation.messageId as number,
            undefined,
            message,
            { parse_mode: 'Markdown' }
          ));
        }
      }
      const creator = await this.usersService.findById(operation.creator.toString());
      const acceptor = operation.acceptor ? await this.usersService.findById(operation.acceptor.toString()) : null;
      const notify = async (user: any) => {
        if (!user) return;
        const msg = (
          `🚨 **Operação Marcada como Fraude pela Administração**\n\n` +
          `👤 **Administrador:** ${adminName}\n` +
          (reason ? `📝 **Motivo:** ${reason}\n` : '') +
          `🆔 **ID:** \`${operation._id}\``
        );
        await this.sendWithBackoff(() => this.bot.telegram.sendMessage(user.userId, msg, { parse_mode: 'Markdown' }));
      };
      await Promise.all([notify(creator), notify(acceptor)]);
    } catch (error) {
      this.logger.error('Failed to notify admin flagged:', error);
    }
  }

  async notifyAdminPenalizedAccuser(operation: Operation, adminName: string, reason?: string): Promise<void> {
    try {
      const creator = await this.usersService.findById(operation.creator.toString());
      const acceptor = operation.acceptor ? await this.usersService.findById(operation.acceptor.toString()) : null;
      const accuser = operation.disputedBy ? await this.usersService.findById(operation.disputedBy.toString()) : null;
      const notify = async (user: any) => {
        if (!user) return;
        const msg = (
          `⚠️ **Penalidade por Falsa Acusação**\n\n` +
          `👤 **Administrador:** ${adminName}\n` +
          (reason ? `📝 **Motivo:** ${reason}\n` : '') +
          `🆔 **ID:** \`${operation._id}\`\n\n` +
          `Um ponto de reputação foi removido do acusador por contestação indevida.`
        );
        await this.sendWithBackoff(() => this.bot.telegram.sendMessage(user.userId, msg, { parse_mode: 'Markdown' }));
      };
      await Promise.all([notify(creator), notify(acceptor), notify(accuser)]);
    } catch (error) {
      this.logger.error('Failed to notify penalized accuser:', error);
    }
  }

  async notifyOperationReverted(
    operation: Operation,
    originalAcceptorId?: Types.ObjectId
  ): Promise<void> {
    try {
      if (!operation.group) {
        this.logger.warn('Operation has no associated group for revert notification');
        return;
      }
      
      // Remover avaliações pendentes e mensagens privadas quando operação é revertida
      await this.removePendingEvaluationMessages(operation, originalAcceptorId);
      
      // Tentar encontrar o grupo
      let group;
      try {
        group = await this.groupsService.findById(operation.group.toString());
      } catch (error) {
        this.logger.warn(`Group ${operation.group} not found for revert notification`);
        return;
      }
      
      if (!group) {
        this.logger.warn('Missing group data for operation revert notification');
        return;
      }

      let typeEmoji = '🟢';
      let typeText = 'COMPRA';
      
      switch (operation.type) {
        case 'buy':
          typeEmoji = '🟢';
          typeText = 'COMPRA';
          break;
        case 'sell':
          typeEmoji = '🔴';
          typeText = 'VENDA';
          break;
        case 'announcement':
          typeEmoji = '📰';
          typeText = 'ANÚNCIO';
          break;
        case 'exchange':
          typeEmoji = '🔁';
          typeText = 'TROCA';
          break;
      }
      
      const assetsText = this.formatAssets(operation);
      const networksText = operation.networks.map(n => n.toUpperCase()).join(', ');

      // Buscar dados do CRIADOR (não de quem reverteu)
      const creator = await this.usersService.findById(operation.creator.toString());
      const creatorName = creator?.userName ? `@${creator.userName}` : creator?.firstName || 'Usuário';

      // Buscar karma do criador com fallback
      const creatorKarma = await this.getKarmaForUserWithFallback(creator, group._id);

      // Calcular nível de reputação do criador usando função utilitária
      const creatorRep = getReputationInfo(creatorKarma);

      // Calcular tempo até expiração
      const expiresIn = this.getTimeUntilExpiration(operation.expiresAt);

      let message = `${typeEmoji} **${typeText} ${assetsText}**\n`;
      message += `Redes: ${networksText}\n`;

      // Formato baseado no tipo de cotação (igual ao broadcast original)
      if (operation.quotationType === 'manual') {
        const total = operation.amount * operation.price;
        const buyText = `${operation.amount} ${assetsText}`;
        const payText = `R$ ${total.toFixed(2)}`;
        const actionText = operation.type === 'buy' ? 'Quero comprar' : 'Quero vender';
        const { actionArrow: arrowIcon, paymentArrow } = this.getArrowsForType(operation.type);
        const paymentText = operation.type === 'buy' ? 'Quero pagar' : 'Quero receber';

        message += (
          `${arrowIcon} **${actionText}:** ${buyText}\n` +
          `${paymentArrow} **${paymentText}:** ${payText}\n` +
          `💱 **Cotação:** R$ ${operation.price.toFixed(2)}\n\n`
        );
      } else if (operation.quotationType === 'google' || operation.quotationType === 'binance') {
        const actionText = operation.type === 'buy' ? 'Quero comprar' : 'Quero vender';
        const paymentText = operation.type === 'buy' ? 'Quero pagar' : 'Quero receber';
        const { actionArrow: arrowIcon, paymentArrow } = this.getArrowsForType(operation.type);
        const sourceIcon = operation.quotationType === 'google' ? '🌐 Google' : '🟡 Binance';

        message += (
          `${arrowIcon} **${actionText}:** ${operation.amount} ${assetsText}\n` +
          `${paymentArrow} **${paymentText}:** Calculado na hora\n` +
          `💱 **Cotação:** ${sourceIcon}\n\n`
        );
      } else {
        message += `Quantidade: ${operation.amount} (total)\n\n`;
      }

      // Adicionar métodos de pagamento se disponíveis
      if (operation.paymentMethods && operation.paymentMethods.length > 0) {
        message += `💳 **Métodos de Pagamento:** ${operation.paymentMethods.join(', ')}\n\n`;
      }

      // Mostrar CRIADOR (não negociador) - igual ao broadcast original
      message += `👤 **Criador:** ${creatorName}\n`;
      message += `${creatorRep.icone} ${creatorRep.nivel}: ${creatorRep.score} pts\n\n`;

      if (operation.description) {
        message += `📝 **Descrição:** ${operation.description}\n\n`;
      }

      message += (
        `⏰ **Expira em:** ${expiresIn}\n` +
        `🆔 **ID da Operação:** ${operation._id}`
      );

      // Criar botões inline EXATAMENTE como no broadcast original
      const inlineKeyboard = this.buildBroadcastInlineKeyboard(operation, creator, '🚀 Aceitar Operação', `accept_operation_${operation._id}`);

      // Configurar envio para tópico específico se for o grupo mencionado
      const sendOptions: any = { 
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
      };
      const configuredGroupId = parseInt(this.configService.get<string>('TELEGRAM_GROUP_ID') || '0');
      const threadId = parseInt(this.configService.get<string>('TELEGRAM_THREAD_ID') || '0');
      if (group.groupId === configuredGroupId && threadId > 0) {
        sendOptions.message_thread_id = threadId;
      }

      // Editar a mensagem original em vez de criar nova
      if (operation.messageId) {
        try {
          await this.sendWithBackoff(() => this.bot.telegram.editMessageText(
            group.groupId,
            operation.messageId,
            undefined,
            message,
            {
              parse_mode: 'Markdown',
              reply_markup: inlineKeyboard
            }
          ));
          this.logger.log(`Edited original message ${operation.messageId} for reverted operation ${operation._id}`);
        } catch (editError) {
          this.logger.warn(`Failed to edit message ${operation.messageId}, sending new message:`, editError);
          // Se falhar ao editar, enviar nova mensagem
          await this.sendWithBackoff(() => this.bot.telegram.sendMessage(
            group.groupId,
            message,
            sendOptions
          ));
        }
      } else {
        // Se não tem messageId, enviar nova mensagem
        await this.sendWithBackoff(() => this.bot.telegram.sendMessage(
          group.groupId,
          message,
          sendOptions
        ));
      }

      this.logger.log(
        `Operation revert ${operation._id} notified to group ${group.groupId}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to notify operation revert ${operation._id}:`,
        error
      );
    }
  }

  private async sendPrivateEvaluationMessage(
    operation: Operation,
    acceptor: any,
    creator: any
  ): Promise<void> {
    try {
      const typeEmoji = operation.type === 'buy' ? '🟢' : '🔴';
      const typeText = operation.type === 'buy' ? 'COMPRA' : 'VENDA';
      const assetsText = operation.assets.join(', ');
      const networksText = operation.networks.map(n => n.toUpperCase()).join(', ');
      const creatorName = creator.userName ? `@${creator.userName}` : creator.firstName || 'Usuário';
      
      const message = (
        `✅ **Operação Aceita!**\n\n` +
        `Você aceitou uma operação P2P com sucesso.\n\n` +
        `**Detalhes da Operação:**\n` +
        `${typeEmoji} **${typeText} ${assetsText}**\n` +
        `🌐 **Redes:** ${networksText}\n` +
        `💰 **Quantidade:** ${operation.amount} ${assetsText}\n` +
        `💵 **Preço Total:** ${operation.quotationType === 'google' ? 'Calculado na Transação' : `R$ ${(operation.amount * operation.price).toFixed(2)}`}\n` +
        `👤 **Criador:** ${creatorName}\n\n` +
        `💬 **Próximos Passos:**\n` +
        `• Entre em contato com o criador via DM\n` +
        `• Combinem os detalhes da transação\n` +
        `• Realizem a operação conforme acordado\n\n` +
        `⚠️ **Problemas?** Use o botão abaixo para contestar se houver algum problema (ex: MED no Pix, não cumprimento do acordo, etc.)\n\n` +
        `🆔 **ID da Operação:** ${operation._id}`
      );

      const inlineKeyboard = {
        inline_keyboard: [
          [
            {
              text: '✅ Solicitar Conclusão',
              callback_data: `complete_operation_${operation._id}`
            }
          ],
          [
            {
              text: '↩️ Voltar Operação',
              callback_data: `revert_operation_${operation._id}`
            }
          ],
          [
            {
              text: '⚠️ Contestar Operação',
              callback_data: `dispute_operation_${operation._id}`
            }
          ]
        ]
      };

      const sentMessage = await this.sendWithBackoff(() => this.bot.telegram.sendMessage(
        acceptor.userId,
        message,
        {
          parse_mode: 'Markdown',
          reply_markup: inlineKeyboard
        }
      ));

      // Salvar o ID da mensagem privada para poder removê-la depois
      if (sentMessage && sentMessage.message_id) {
        try {
          await this.operationsRepository.findOneAndUpdate(
            { _id: operation._id },
            { privateEvaluationMessageId: sentMessage.message_id }
          );
          this.logger.log(`Private evaluation message ID ${sentMessage.message_id} saved for operation ${operation._id}`);
        } catch (error) {
          this.logger.warn(`Failed to save private evaluation message ID for operation ${operation._id}: ${error.message}`);
        }
      }

       this.logger.log(`Private evaluation message sent to acceptor ${acceptor.userId} for operation ${operation._id}`);
       // Nota: Avaliações pendentes serão criadas apenas quando a operação for concluída
     } catch (error) {
       this.logger.error(`Failed to send private evaluation message for operation ${operation._id}:`, error);
     }
  }

  private async sendBidirectionalEvaluationMessages(
    operation: Operation,
    creator: any,
    acceptor: any
  ): Promise<void> {
    try {
      const typeEmoji = operation.type === 'buy' ? '🟢' : '🔴';
      const typeText = operation.type === 'buy' ? 'COMPRA' : 'VENDA';
      const assetsText = operation.assets.join(', ');
      
      // Obter o groupId real do Telegram a partir do ObjectId salvo na operação
      let chatIdForReputation = 0;
      try {
        if (operation.group) {
          const groupDoc = await this.groupsService.findById(operation.group.toString());
          if (groupDoc && typeof groupDoc.groupId === 'number') {
            chatIdForReputation = groupDoc.groupId;
          }
        }
      } catch (error) {
        this.logger.warn('Não foi possível obter groupId para avaliação bidirecional:', error);
      }
      
      // Mensagem para o criador avaliar o aceitador
       const acceptorName = acceptor.userName ? `@${acceptor.userName}` : acceptor.firstName;
       
       // Buscar reputação do aceitador para o cabeçalho
         let acceptorReputationInfo = '';
         try {
           const acceptorKarma = await this.getKarmaForUserWithFallback(acceptor, chatIdForReputation);
           if (acceptorKarma && acceptorKarma.karma !== undefined) {
             const reputation = getReputationInfo(acceptorKarma.karma);
             acceptorReputationInfo = `\n📊 **Reputação Atual:** ${reputation.icone} ${reputation.nivel} (${acceptorKarma.karma} pts)\n`;
           }
         } catch (error) {
           this.logger.warn('Erro ao buscar reputação do aceitador:', error);
         }
       
       const creatorMessage = (
         `⭐ **Avaliação Obrigatória**\n\n` +
         `👤 **Avaliando:** ${acceptorName}${acceptorReputationInfo}\n` +
         `Você concluiu uma operação com sucesso!\n` +
         `Para finalizar, é obrigatório avaliar seu parceiro de negociação.\n\n` +
         `**Detalhes da Operação:**\n` +
         `${typeEmoji} **${typeText} ${assetsText}**\n` +
         `💰 **Quantidade:** ${operation.amount}\n` +
         `🆔 **ID:** \`${operation._id}\`\n\n` +
         `**Como foi a experiência?**\n` +
         `Escolha quantas estrelas você daria:`
       );
      
      // Mensagem para o aceitador avaliar o criador
       const creatorName = creator.userName ? `@${creator.userName}` : creator.firstName;
       
       // Buscar reputação do criador para o cabeçalho
         let creatorReputationInfo = '';
         try {
           const creatorKarma = await this.getKarmaForUserWithFallback(creator, chatIdForReputation);
           if (creatorKarma && creatorKarma.karma !== undefined) {
             const reputation = getReputationInfo(creatorKarma.karma);
             creatorReputationInfo = `\n📊 **Reputação Atual:** ${reputation.icone} ${reputation.nivel} (${creatorKarma.karma} pts)\n`;
           }
         } catch (error) {
           this.logger.warn('Erro ao buscar reputação do criador:', error);
         }
       
       const acceptorMessage = (
         `⭐ **Avaliação Obrigatória**\n\n` +
         `👤 **Avaliando:** ${creatorName}${creatorReputationInfo}\n` +
         `A operação foi concluída com sucesso!\n` +
         `Para finalizar, é obrigatório avaliar seu parceiro de negociação.\n\n` +
         `**Detalhes da Operação:**\n` +
         `${typeEmoji} **${typeText} ${assetsText}**\n` +
         `💰 **Quantidade:** ${operation.amount}\n` +
         `🆔 **ID:** \`${operation._id}\`\n\n` +
         `**Como foi a experiência?**\n` +
         `Escolha quantas estrelas você daria:`
       );
      
      const evaluationKeyboard = {
        inline_keyboard: [
          [
            {
              text: '⭐',
              callback_data: `eval_star_1_${operation._id}`
            },
            {
              text: '⭐⭐',
              callback_data: `eval_star_2_${operation._id}`
            },
            {
              text: '⭐⭐⭐',
              callback_data: `eval_star_3_${operation._id}`
            }
          ],
          [
            {
              text: '⭐⭐⭐⭐',
              callback_data: `eval_star_4_${operation._id}`
            },
            {
              text: '⭐⭐⭐⭐⭐',
              callback_data: `eval_star_5_${operation._id}`
            }
          ]
        ]
      };
      
      // Enviar para o criador
      await this.sendWithBackoff(() => this.bot.telegram.sendMessage(
        creator.userId,
        creatorMessage,
        {
          parse_mode: 'Markdown',
          reply_markup: evaluationKeyboard
        }
      ));
      
      // Enviar para o aceitador
      await this.sendWithBackoff(() => this.bot.telegram.sendMessage(
        acceptor.userId,
        acceptorMessage,
        {
          parse_mode: 'Markdown',
          reply_markup: evaluationKeyboard
        }
      ));
      
      // Criar avaliações pendentes bidirecionais no banco de dados
      try {
        // Criador avalia aceitador
        await this.pendingEvaluationRepository.createPendingEvaluation(
          operation._id,
          new Types.ObjectId(creator._id),
          new Types.ObjectId(acceptor._id)
        );
        
        // Aceitador avalia criador
        await this.pendingEvaluationRepository.createPendingEvaluation(
          operation._id,
          new Types.ObjectId(acceptor._id),
          new Types.ObjectId(creator._id)
        );
        
        this.logger.log(`Bidirectional pending evaluations created for operation ${operation._id}`);
      } catch (error) {
        this.logger.error(`Failed to create pending evaluations for operation ${operation._id}:`, error);
      }
      
      this.logger.log(`Bidirectional evaluation messages sent for operation ${operation._id}`);
    } catch (error) {
      this.logger.error(`Failed to send bidirectional evaluation messages for operation ${operation._id}:`, error);
    }
  }

  private async removePendingEvaluationMessages(operation: Operation, originalAcceptorId?: Types.ObjectId): Promise<void> {
    try {
      this.logger.log(`🔍 [DEBUG] removePendingEvaluationMessages called for operation ${operation._id}`);
      this.logger.log(`🔍 [DEBUG] Operation acceptor: ${operation.acceptor}`);
      this.logger.log(`🔍 [DEBUG] Operation privateEvaluationMessageId: ${operation.privateEvaluationMessageId}`);
      
      // Remover avaliações pendentes do banco de dados
      await this.pendingEvaluationRepository.deletePendingEvaluationsByOperation(operation._id);
      
      // Tentar remover mensagens privadas de avaliação se existirem
      const acceptorRef = operation.acceptor || originalAcceptorId;
      if (acceptorRef) {
        const acceptor = await this.usersService.findById(acceptorRef.toString());
        if (acceptor) {
          this.logger.log(`🔍 [DEBUG] Found acceptor: ${acceptor.userId}`);
          try {
            // Remover a mensagem de avaliação privada se existir
            if (operation.privateEvaluationMessageId) {
              this.logger.log(`🔍 [DEBUG] Attempting to delete private message ${operation.privateEvaluationMessageId} for user ${acceptor.userId}`);
              try {
                await this.bot.telegram.deleteMessage(acceptor.userId, operation.privateEvaluationMessageId);
                this.logger.log(`✅ Private evaluation message ${operation.privateEvaluationMessageId} deleted for operation ${operation._id}`);
              } catch (deleteError) {
                this.logger.warn(`❌ Could not delete private evaluation message ${operation.privateEvaluationMessageId}: ${deleteError.message}`);
              }
            } else {
              this.logger.warn(`⚠️ No privateEvaluationMessageId found for operation ${operation._id}`);
            }
            
            // Enviar mensagem detalhada informando que a operação foi revertida (para o negociador)
            const tEmoji = operation.type === 'buy' ? '🟢' : operation.type === 'sell' ? '🔴' : operation.type === 'announcement' ? '📰' : '🔁';
            const tText = operation.type === 'buy' ? 'COMPRA' : operation.type === 'sell' ? 'VENDA' : operation.type === 'announcement' ? 'ANÚNCIO' : 'TROCA';
            const aText = operation.assets.join(', ');
            const nText = operation.networks.map(n => n.toUpperCase()).join(', ');
            const creatorDoc = await this.usersService.findById(operation.creator.toString());
            const creatorName = creatorDoc?.userName ? `@${creatorDoc.userName}` : creatorDoc?.firstName || 'Usuário';
            const detailedAcceptorText = (
              `🔄 **Operação Revertida**\n\n` +
              `${tEmoji} **${tText} ${aText}**\n` +
              `Ativos: ${aText}\n` +
              `Redes: ${nText}\n` +
              `Quantidade: ${operation.amount} (total)\n\n` +
              `👤 Criador: ${creatorName}\n` +
              `🆔 **ID:** \`${operation._id}\`\n\n` +
              `⚠️ Você reverteu esta operação. Ela voltará a ficar disponível no grupo.`
            );
            await this.bot.telegram.sendMessage(acceptor.userId, detailedAcceptorText, { parse_mode: 'Markdown' });
          } catch (error) {
            this.logger.warn(`Could not notify acceptor about operation revert: ${error.message}`);
          }
        } else {
          this.logger.warn(`⚠️ Acceptor not found for operation ${operation._id}`);
        }
      } else {
        this.logger.warn(`⚠️ No acceptor found for operation ${operation._id}`);
      }

      // Remover teclado/botões da DM enviada ao criador na aceitação, se existir, e detalhar reversão
      try {
        if (operation.creator && operation.creatorAcceptanceDmMessageId) {
          const creator = await this.usersService.findById(operation.creator.toString());
          if (creator) {
            const tEmoji = operation.type === 'buy' ? '🟢' : operation.type === 'sell' ? '🔴' : operation.type === 'announcement' ? '📰' : '🔁';
            const tText = operation.type === 'buy' ? 'COMPRA' : operation.type === 'sell' ? 'VENDA' : operation.type === 'announcement' ? 'ANÚNCIO' : 'TROCA';
            const aText = operation.assets.join(', ');
            const nText = operation.networks.map(n => n.toUpperCase()).join(', ');
            const acceptorRef2 = operation.acceptor || originalAcceptorId;
            let negotiatorName = 'Usuário';
            if (acceptorRef2) {
              try {
                const acc2 = await this.usersService.findById(acceptorRef2.toString());
                if (acc2) negotiatorName = acc2.userName ? `@${acc2.userName}` : acc2.firstName || 'Usuário';
              } catch {}
            }
            const detailedText = (
              `🔄 **Operação Revertida**\n\n` +
              `${tEmoji} **${tText} ${aText}**\n` +
              `Ativos: ${aText}\n` +
              `Redes: ${nText}\n` +
              `Quantidade: ${operation.amount} (total)\n\n` +
              `👤 Negociador: ${negotiatorName}\n` +
              `⚠️ A operação anteriormente aceita foi revertida pelo negociador.\n\n` +
              `🆔 **ID:** \`${operation._id}\``
            );
            await this.sendWithBackoff(() => this.bot.telegram.editMessageText(
              creator.userId,
              operation.creatorAcceptanceDmMessageId as number,
              undefined,
              detailedText,
              { parse_mode: 'Markdown' }
            ));
            await this.sendWithBackoff(() => this.bot.telegram.editMessageReplyMarkup(
              creator.userId,
              operation.creatorAcceptanceDmMessageId as number,
              undefined,
              { inline_keyboard: [] }
            ));
            this.logger.log(`✅ Detailed revert DM updated for creator in operation ${operation._id}`);
          }
        }
      } catch (e: any) {
        this.logger.warn(`⚠️ Could not update creator revert DM: ${e.message}`);
      }
      
      this.logger.log(`Pending evaluation messages removed for operation ${operation._id}`);
    } catch (error) {
      this.logger.error(`Failed to remove pending evaluation messages for operation ${operation._id}:`, error);
    }
  }

  private getTimeUntilExpiration(expiresAt: Date): string {
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();
    
    if (diff <= 0) {
      return 'Expirada';
    }
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  async notifyCompletionRequested(operation: Operation, requesterId: Types.ObjectId): Promise<void> {
    try {
      if (!operation.group) {
        this.logger.warn('Operation has no associated group for completion request notification');
        return;
      }
      
      const creator = await this.usersService.findById(operation.creator.toString());
      const acceptor = operation.acceptor ? await this.usersService.findById(operation.acceptor.toString()) : null;
      const requester = await this.usersService.findById(requesterId.toString());
      
      if (!creator || !acceptor || !requester) {
        this.logger.warn('Missing user data for completion request notification');
        return;
      }

      // Determinar quem deve receber a notificação (a outra parte)
      const otherParty = requesterId.toString() === creator._id.toString() ? acceptor : creator;
      const requesterName = requester.userName ? `@${requester.userName}` : requester.firstName || 'Usuário';
      
      const typeEmoji = operation.type === 'buy' ? '🟢' : '🔴';
      const typeText = operation.type === 'buy' ? 'COMPRA' : 'VENDA';
      const assetsText = operation.assets.join(', ');

      const message = (
        `⏳ **Solicitação de Conclusão**\n\n` +
        `${typeEmoji} **${typeText} ${assetsText}**\n\n` +
        `👤 **${requesterName}** solicitou a conclusão desta operação.\n\n` +
        `🆔 **ID:** \`${operation._id}\`\n\n` +
        `🤝 **Você precisa confirmar** para finalizar a transação.\n\n` +
        `💡 Clique em "Aceitar Conclusão" se a operação foi realizada com sucesso.`
      );

      // Enviar notificação privada para a outra parte
      const sentMessage = await this.bot.telegram.sendMessage(
        otherParty.userId,
        message,
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Aceitar Conclusão', callback_data: `complete_operation_${operation._id}` }
            ]]
          }
        }
      );

      // Salvar o ID da DM de solicitação de conclusão para remover teclado após aceitação
      if (sentMessage && sentMessage.message_id) {
        try {
          await this.operationsRepository.updateOperation(
            operation._id,
            { completionRequestDmMessageId: sentMessage.message_id }
          );
          this.logger.log(`✅ completionRequestDmMessageId ${sentMessage.message_id} salvo para operação ${operation._id}`);
        } catch (saveError: any) {
          this.logger.warn(`⚠️ Falha ao salvar completionRequestDmMessageId para operação ${operation._id}: ${saveError.message}`);
        }
      }

      this.logger.log(`Completion request notification sent to user ${otherParty.userId} for operation ${operation._id}`);
      
    } catch (error) {
      this.logger.error('Error sending completion request notification:', error);
    }
  }

  async notifyCompletionAccepted(operation: Operation, requesterId: Types.ObjectId): Promise<void> {
    try {
      const requester = await this.usersService.findById(requesterId.toString());
      
      if (!requester) {
        this.logger.warn('Missing requester data for completion acceptance notification');
        return;
      }

      // Identificar a outra parte (quem recebeu a DM com "Aceitar Conclusão")
      const creator = await this.usersService.findById(operation.creator.toString());
      const acceptor = operation.acceptor ? await this.usersService.findById(operation.acceptor.toString()) : null;
      // Garantir que o criador exista antes de acessar propriedades
      if (!creator) {
        this.logger.warn('Creator not found for completion acceptance notification');
        return;
      }
      const otherParty = requesterId.toString() === creator._id.toString() ? acceptor : creator;

      const typeEmoji = operation.type === 'buy' ? '🟢' : '🔴';
      const typeText = operation.type === 'buy' ? 'COMPRA' : 'VENDA';
      const assetsText = operation.assets.join(', ');

      const message = (
        `✅ **Solicitação de Conclusão Aceita!**\n\n` +
        `${typeEmoji} **${typeText} ${assetsText}**\n\n` +
        `🎉 **Sua solicitação de conclusão foi aceita!**\n\n` +
        `🆔 **ID:** \`${operation._id}\`\n\n` +
        `✅ **A operação foi finalizada com sucesso.**\n\n` +
        `💡 **Não esqueçam de se avaliarem mutuamente!**`
      );

      // Enviar notificação privada para o solicitante original
      await this.bot.telegram.sendMessage(
        requester.userId,
        message,
        { 
          parse_mode: 'Markdown'
          // Sem botões pois a operação já foi concluída
        }
      );

      this.logger.log(`Completion acceptance notification sent to user ${requester.userId} for operation ${operation._id}`);
      
      // Remover o teclado da DM enviada à outra parte na solicitação de conclusão
      try {
        if (otherParty && operation.completionRequestDmMessageId) {
          await this.sendWithBackoff(() => this.bot.telegram.editMessageReplyMarkup(
            otherParty.userId,
            operation.completionRequestDmMessageId,
            undefined,
            { inline_keyboard: [] }
          ));
          this.logger.log(`✅ Teclado removido da DM de solicitação de conclusão para operação ${operation._id}`);
        }
      } catch (dmError: any) {
        this.logger.warn(`⚠️ Não foi possível remover teclado da DM de solicitação: ${dmError.message}`);
      }
      
    } catch (error) {
      this.logger.error('Error sending completion acceptance notification:', error);
    }
  }

  async notifyOperationDisputed(
    operation: Operation, 
    complainantId: Types.ObjectId, 
    defendantId: Types.ObjectId, 
    disputeReason: string
  ): Promise<void> {
    try {
      this.logger.log(`🚨 [DEBUG] notifyOperationDisputed iniciado para operação ${operation._id}`);
      
      const complainant = await this.usersService.findById(complainantId.toString());
      const defendant = await this.usersService.findById(defendantId.toString());

      if (!complainant || !defendant) {
        this.logger.warn('Missing user data for dispute notification');
        return;
      }

      const complainantName = complainant.userName ? `@${complainant.userName}` : complainant.firstName || 'Usuário';
      const defendantName = defendant.userName ? `@${defendant.userName}` : defendant.firstName || 'Usuário';

      // 1. Notificar a outra parte (defendente) via DM
      try {
        const defendantMessage = (
          `🚨 **Operação Contestada**\n\n` +
          `Sua operação foi contestada por ${complainantName}\n\n` +
          `**Motivo:** ${disputeReason}\n` +
          `**ID da Operação:** \`${operation._id}\`\n\n` +
          `📊 **Detalhes da Operação:**\n` +
          `• **Tipo:** ${operation.type === 'buy' ? 'Compra' : 'Venda'}\n` +
          `• **Ativos:** ${operation.assets.join(', ')}\n` +
          `• **Quantidade:** ${operation.amount}\n` +
          `• **Valor:** R$ ${operation.price.toFixed(2)}\n\n` +
          `⚠️ **A operação está suspensa** até resolução administrativa.\n\n` +
          `📞 **Próximos Passos:**\n` +
          `• Os administradores irão analisar a disputa\n` +
          `• Você pode ser contatado para esclarecimentos\n` +
          `• Aguarde a resolução oficial\n\n` +
          `🛡️ **Importante:** Mantenha evidências da transação (prints, comprovantes, etc.)`
        );

        await this.sendWithBackoff(() => this.bot.telegram.sendMessage(
          defendant.userId,
          defendantMessage,
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '📋 Ver Detalhes da Operação',
                    callback_data: `view_operation_${operation._id}`
                  }
                ]
              ]
            }
          }
        ));

        this.logger.log(`Defendant notification sent to user ${defendant.userId} for disputed operation ${operation._id}`);
      } catch (defendantError: any) {
        this.logger.error(`Failed to notify defendant ${defendant.userId}:`, defendantError);
      }

      // 2. Atualizar mensagem no grupo (se existir messageId)
      if (operation.group && operation.messageId) {
        try {
          const group = await this.groupsService.findById(operation.group.toString());
          if (group) {
            // Gerar mensagem consolidada com status de disputa
            const disputedMessage = await this.generateDisputedOperationMessage(operation, complainantName, disputeReason);
            
            await this.sendWithBackoff(() => this.bot.telegram.editMessageText(
              group.groupId,
              operation.messageId,
              undefined,
              disputedMessage,
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: '⚖️ Operação em Disputa',
                        callback_data: `dispute_info_${operation._id}`
                      }
                    ],
                    [
                      {
                        text: '🛠️ Painel Admin',
                        callback_data: `admin_analyze_dispute_${operation._id}`
                      }
                    ]
                  ]
                }
              }
            ));

            this.logger.log(`Group message updated for disputed operation ${operation._id}`);
          }
        } catch (groupError: any) {
          this.logger.error(`Failed to update group message for disputed operation ${operation._id}:`, groupError);
        }
      }

      // 3. Notificar administradores (se configurado)
      await this.notifyAdministratorsAboutDispute(operation, complainant, defendant, disputeReason);

      this.logger.log(`✅ Dispute notifications completed for operation ${operation._id}`);
      
    } catch (error) {
      this.logger.error(`Error sending dispute notifications for operation ${operation._id}:`, error);
    }
  }

  private async generateDisputedOperationMessage(
    operation: Operation, 
    complainantName: string, 
    disputeReason: string
  ): Promise<string> {
    const typeEmoji = operation.type === 'buy' ? '🟢' : '🔴';
    const typeText = operation.type === 'buy' ? 'COMPRA' : 'VENDA';
    const total = operation.amount * operation.price;
    
    return (
      `🚨 **OPERAÇÃO EM DISPUTA**\n\n` +
      `${typeEmoji} **${typeText}** - ${operation.assets.join(', ')}\n` +
      `🌐 ${operation.networks.map(n => n.toUpperCase()).join(', ')} | ` +
      `📊 ${operation.amount} | ` +
      `💵 R$ ${operation.price.toFixed(2)} | ` +
      `💸 Total: R$ ${total.toFixed(2)}\n` +
      `🆔 \`${operation._id}\`\n\n` +
      `🚨 **Status:** Em Disputa\n` +
      `⚖️ **Contestada por:** ${complainantName}\n` +
      `📝 **Motivo:** ${disputeReason}\n` +
      `🕐 **Contestada em:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
      `⏸️ **Operação suspensa** até resolução administrativa.\n\n` +
      `👥 **Administradores foram notificados** e irão analisar a disputa.`
    );
  }

  private async notifyAdministratorsAboutDispute(
    operation: Operation,
    complainant: any,
    defendant: any,
    disputeReason: string
  ): Promise<void> {
    try {
      // Verificar se há canal de administradores configurado
      const adminChannelId = this.configService.get<string>('TELEGRAM_ADMIN_CHANNEL_ID');
      const adminsEnv = this.configService.get<string>('TELEGRAM_ADMINS') || '';
      const adminUserIds = adminsEnv
        .split(',')
        .map(v => v.trim())
        .filter(v => v.length > 0)
        .map(v => parseInt(v))
        .filter(v => !isNaN(v));
      if (!adminChannelId && adminUserIds.length === 0) {
        this.logger.warn('TELEGRAM_ADMIN_CHANNEL_ID and TELEGRAM_ADMINS not configured - skipping admin notification');
        return;
      }

      const complainantName = complainant.userName ? `@${complainant.userName}` : complainant.firstName || 'Usuário';
      const defendantName = defendant.userName ? `@${defendant.userName}` : defendant.firstName || 'Usuário';

      const adminMessage = (
        `⚖️ **NOVA DISPUTA REGISTRADA**\n\n` +
        `🆔 **Operação:** \`${operation._id}\`\n` +
        `📊 **Tipo:** ${operation.type === 'buy' ? 'Compra' : 'Venda'} de ${operation.assets.join(', ')}\n` +
        `💰 **Valor:** ${operation.amount} por R$ ${operation.price.toFixed(2)}\n\n` +
        `👤 **Contestante:** ${complainantName} (ID: ${complainant.userId})\n` +
        `👤 **Contestado:** ${defendantName} (ID: ${defendant.userId})\n\n` +
        `📝 **Motivo:** ${disputeReason}\n` +
        `🕐 **Data:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
        `⚠️ **Ação Necessária:** Análise administrativa requerida\n\n` +
        `🔗 Abra o PV do bot e envie: /start admin_dispute_${operation._id}`
      );

      if (adminChannelId) {
        await this.sendWithBackoff(() => this.bot.telegram.sendMessage(
          parseInt(adminChannelId),
          adminMessage,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🔍 Analisar Disputa', callback_data: `admin_analyze_dispute_${operation._id}` },
                  { text: '📊 Ver Histórico', callback_data: `admin_dispute_history_${operation._id}` }
                ]
              ]
            }
          }
        ));
      }
      for (const adminId of adminUserIds) {
        try {
          await this.sendWithBackoff(() => this.bot.telegram.sendMessage(
            adminId,
            adminMessage,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '🔍 Analisar Disputa', callback_data: `admin_analyze_dispute_${operation._id}` },
                    { text: '📊 Ver Histórico', callback_data: `admin_dispute_history_${operation._id}` }
                  ]
                ]
              }
            }
          ));
        } catch (dmErr: any) {
          this.logger.warn(`Could not DM admin ${adminId}: ${dmErr.message}`);
        }
      }

      this.logger.log(`Admin notification sent for disputed operation ${operation._id}`);
    } catch (error) {
      this.logger.error('Failed to notify administrators about dispute:', error);
    }
  }
}
