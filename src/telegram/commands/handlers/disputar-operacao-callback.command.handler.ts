import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { OperationsService } from '../../../operations/operations.service';
import { OperationHistoryService } from '../../../operations/operation-history.service';
import { UsersService } from '../../../users/users.service';
import { TermsAcceptanceService } from '../../../users/terms-acceptance.service';
import { OperationStatus } from '../../../operations/schemas/operation.schema';
import { DisputeType } from '../../../operations/schemas/dispute.schema';
import { validateUserTermsForCallback } from '../../../shared/terms-validation.utils';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

interface DisputeSession {
  operationId: string;
  userId: number;
  step: 'awaiting_reason';
  messageId?: number;
}

@Injectable()
export class DisputarOperacaoCallbackCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(DisputarOperacaoCallbackCommandHandler.name);
  command = /^$/; // Não processa comandos de texto, apenas callbacks
  
  private disputeSessions = new Map<string, DisputeSession>();

  constructor(
    private readonly operationsService: OperationsService,
    private readonly usersService: UsersService,
    private readonly termsAcceptanceService: TermsAcceptanceService,
    private readonly operationHistoryService: OperationHistoryService,
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    // Este handler não processa comandos de texto
    return;
  }

  async handleCallback(ctx: any): Promise<boolean> {
    const data = ctx.callbackQuery.data;
    
    // Processar callbacks de disputar operação
    if (data.startsWith('dispute_operation_')) {
      return await this.handleDisputeOperationCallback(ctx);
    }
    
    // Processar callbacks de seleção de motivo
    if (data.startsWith('dispute_reason_')) {
      return await this.handleDisputeReasonCallback(ctx);
    }
    
    // Processar callbacks de cancelar disputa
    if (data === 'dispute_cancel') {
      return await this.handleDisputeCancelCallback(ctx);
    }

    return false;
  }

  private async handleDisputeOperationCallback(ctx: any): Promise<boolean> {
    try {
      // ✅ VALIDAÇÃO CRÍTICA: Verificar se usuário aceitou os termos ANTES de contestar operação
      const hasValidTerms = await validateUserTermsForCallback(ctx, this.termsAcceptanceService, 'contestar');
      if (!hasValidTerms) {
        this.logger.warn(`❌ CONTESTAÇÃO BLOQUEADA - Usuário ${ctx.from.id} não aceitou os termos`);
        return true; // validateUserTermsForCallback já envia o popup
      }

      // Tentar responder ao callback, mas ignorar se expirado
      try {
        await ctx.answerCbQuery();
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado no disputar operação:', cbError.description);
        } else {
          throw cbError;
        }
      }

      const operationId = ctx.callbackQuery.data.replace('dispute_operation_', '');
      
      // Buscar o usuário no banco de dados
      const user = await this.usersService.findOneByUserId(ctx.from.id);
      if (!user) {
        await ctx.editMessageText('❌ Usuário não encontrado.');
        return true;
      }

      // Validar ObjectId
      if (!Types.ObjectId.isValid(operationId)) {
        await ctx.editMessageText('❌ ID de operação inválido.');
        return true;
      }

      // Buscar a operação
      const operation = await this.operationsService.getOperationById(new Types.ObjectId(operationId));
      if (!operation) {
        await ctx.editMessageText('❌ Operação não encontrada.');
        return true;
      }

      // Verificar se o usuário pode contestar esta operação
      const isCreator = operation.creator.toString() === user._id.toString();
      const isAcceptor = operation.acceptor?.toString() === user._id.toString();
      
      if (!isCreator && !isAcceptor) {
        await ctx.editMessageText('❌ Você só pode contestar operações das quais participa.');
        return true;
      }

      // Verificar se a operação pode ser contestada
      if (operation.status !== OperationStatus.ACCEPTED && operation.status !== OperationStatus.PENDING_COMPLETION) {
        await ctx.editMessageText('❌ Esta operação não pode ser contestada no status atual.');
        return true;
      }

      // Criar sessão de disputa
      const sessionKey = `${ctx.from.id}_${operationId}`;
      this.disputeSessions.set(sessionKey, {
        operationId,
        userId: ctx.from.id,
        step: 'awaiting_reason'
      });

      // Mostrar interface de seleção de motivo
      await this.showDisputeReasonSelection(ctx, operationId);
      
      return true;
    } catch (error) {
      this.logger.error('Erro ao processar callback de disputar operação:', error);
      await ctx.editMessageText('❌ Erro ao processar contestação. Tente novamente.');
      return true;
    }
  }

  private async showDisputeReasonSelection(ctx: any, operationId: string): Promise<void> {
    const message = (
      '⚖️ **Contestar Operação**\n\n' +
      '**Selecione o motivo da contestação:**\n\n' +
      '⚠️ **Importante:** Contestações falsas podem resultar em penalidades!'
    );

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '💰 Não efetuou pagamento',
            callback_data: `dispute_reason_nao_pagou_${operationId}`
          }
        ],
        [
          {
            text: '📦 Não entregou ativos/serviços',
            callback_data: `dispute_reason_nao_entregou_${operationId}`
          }
        ],
        [
          {
            text: '💸 Valor incorreto',
            callback_data: `dispute_reason_valor_incorreto_${operationId}`
          }
        ],
        [
          {
            text: '🚨 Tentativa de fraude',
            callback_data: `dispute_reason_tentativa_fraude_${operationId}`
          }
        ],
        [
          {
            text: '💬 Problema de comunicação',
            callback_data: `dispute_reason_problema_comunicacao_${operationId}`
          }
        ],
        [
          {
            text: '📋 Violação dos termos',
            callback_data: `dispute_reason_violacao_termos_${operationId}`
          }
        ],
        [
          {
            text: '❌ Cancelar',
            callback_data: 'dispute_cancel'
          }
        ]
      ]
    };

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  private async handleDisputeReasonCallback(ctx: any): Promise<boolean> {
    try {
      await ctx.answerCbQuery();

      const data = ctx.callbackQuery.data;
      const parts = data.split('_');
      const reason = parts.slice(2, -1).join('_'); // Extrair motivo (entre dispute_reason_ e _operationId)
      const operationId = parts[parts.length - 1]; // Último elemento é o operationId

      const sessionKey = `${ctx.from.id}_${operationId}`;
      const session = this.disputeSessions.get(sessionKey);

      if (!session) {
        await ctx.editMessageText('❌ Sessão de contestação expirada. Tente novamente.');
        return true;
      }

      // Buscar o usuário no banco de dados
      const user = await this.usersService.findOneByUserId(ctx.from.id);
      if (!user) {
        await ctx.editMessageText('❌ Usuário não encontrado.');
        return true;
      }

      // Processar a contestação
      const disputeType = this.categorizeDispute(reason);
      const reasonText = this.getReasonText(reason);

      try {
        // Buscar a operação novamente para garantir dados atualizados
        const operation = await this.operationsService.getOperationById(new Types.ObjectId(operationId));
        if (!operation) {
          await ctx.editMessageText('❌ Operação não encontrada.');
          return true;
        }

        // Determinar quem é o defendente (a outra parte)
        const isCreator = operation.creator.toString() === user._id.toString();
        const defendantId = isCreator ? operation.acceptor : operation.creator;

        if (!defendantId) {
          await ctx.editMessageText('❌ Não foi possível identificar a outra parte da operação.');
          return true;
        }

        // Contestar a operação usando o serviço existente
        await this.operationsService.disputeOperation(
          new Types.ObjectId(operationId),
          user._id,
          defendantId,
          disputeType,
          reasonText
        );

        // Limpar sessão
        this.disputeSessions.delete(sessionKey);

        // Confirmar contestação
        await ctx.editMessageText(
          `✅ **Operação Contestada com Sucesso!**\n\n` +
          `**Motivo:** ${reasonText}\n\n` +
          `🚨 **A operação foi marcada como em disputa** e será analisada pelos administradores.\n\n` +
          `📢 **Notificações enviadas:**\n` +
          `• A outra parte foi notificada sobre a contestação\n` +
          `• Administradores foram alertados para análise\n` +
          `• Mensagem do grupo foi atualizada\n\n` +
          `📞 **Próximos passos:**\n` +
          `• Aguarde contato dos administradores\n` +
          `• Mantenha evidências da transação\n` +
          `• Você receberá notificação da resolução`,
          { parse_mode: 'Markdown' }
        );

        this.logger.log(`Operação ${operationId} contestada por usuário ${ctx.from.id} - Motivo: ${reasonText} - Notificações enviadas`);

      } catch (error) {
        this.logger.error('Erro ao contestar operação:', error);
        
        // Mensagem de erro mais informativa
        const errorMessage = error.message.includes('não pode ser contestada') || 
                           error.message.includes('já está em disputa') 
          ? `❌ ${error.message}`
          : '❌ Erro ao processar contestação. Tente novamente ou entre em contato com os administradores.';
          
        await ctx.editMessageText(errorMessage);
      }

      return true;
    } catch (error) {
      this.logger.error('Erro ao processar seleção de motivo:', error);
      await ctx.editMessageText('❌ Erro ao processar contestação. Tente novamente.');
      return true;
    }
  }

  private async handleDisputeCancelCallback(ctx: any): Promise<boolean> {
    try {
      await ctx.answerCbQuery();

      // Encontrar sessão ativa deste usuário (para recuperar operationId)
      let currentSessionKey: string | null = null;
      let currentSession: DisputeSession | undefined;
      for (const [key, session] of this.disputeSessions.entries()) {
        if (session.userId === ctx.from.id) {
          currentSessionKey = key;
          currentSession = session;
          break;
        }
      }

      if (!currentSession || !currentSession.operationId) {
        // Fallback: apenas informar cancelamento
        await ctx.editMessageText('❌ Contestação cancelada.');
        return true;
      }

      const operationId = currentSession.operationId;
      // Limpar sessão específica
      if (currentSessionKey) this.disputeSessions.delete(currentSessionKey);

      // Buscar operação e restaurar botões conforme status
      const operation = await this.operationsService.getOperationById(new Types.ObjectId(operationId));
      if (!operation) {
        await ctx.editMessageText('❌ Contestação cancelada. Operação não encontrada.');
        return true;
      }

      const typeText = operation.type === 'buy' ? 'COMPRA' : 'VENDA';
      const assetsText = Array.isArray(operation.assets) ? operation.assets.join(', ') : '';
      const networksText = Array.isArray(operation.networks) ? operation.networks.map(n => n.toUpperCase()).join(', ') : '';

      // Instruções básicas por status
      let instructions = '';
      switch (operation.status) {
        case 'accepted':
          instructions = '👆 **Próximos passos:** Entrem em contato via DM, combinem os detalhes e usem o botão "Concluir Operação" quando finalizada.';
          break;
        case 'pending_completion':
          instructions = '👆 **Próximos passos:** Aceite a conclusão se tudo ocorreu bem, ou conteste se houver problemas.';
          break;
        default:
          instructions = '';
      }

      const restoreMessage = (
        `🤝 **Operação em andamento**\n\n` +
        `🔹 **Tipo:** ${typeText}\n` +
        (assetsText ? `💰 **Ativos:** ${assetsText}\n` : '') +
        (networksText ? `🌐 **Redes:** ${networksText}\n` : '') +
        `🆔 **ID:** \`${operation._id}\`\n\n` +
        (instructions ? `${instructions}` : '')
      );

      const keyboard = this.operationHistoryService.generateDynamicButtons(operation as any);

      await ctx.editMessageText(restoreMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard || undefined
      });
      return true;
    } catch (error) {
      this.logger.error('Erro ao cancelar contestação:', error);
      return true;
    }
  }

  private categorizeDispute(reason: string): DisputeType {
    switch (reason) {
      case 'nao_pagou':
        return DisputeType.NON_PAYMENT;
      case 'nao_entregou':
        return DisputeType.NON_DELIVERY;
      case 'valor_incorreto':
        return DisputeType.WRONG_AMOUNT;
      case 'tentativa_fraude':
        return DisputeType.FRAUD_ATTEMPT;
      case 'problema_comunicacao':
        return DisputeType.COMMUNICATION_ISSUE;
      case 'violacao_termos':
        return DisputeType.TERMS_VIOLATION;
      default:
        return DisputeType.OTHER;
    }
  }

  private getReasonText(reason: string): string {
    switch (reason) {
      case 'nao_pagou':
        return 'A outra parte não efetuou o pagamento';
      case 'nao_entregou':
        return 'Não entregou os ativos/serviços';
      case 'valor_incorreto':
        return 'Valor diferente do acordado';
      case 'tentativa_fraude':
        return 'Suspeita de tentativa de golpe';
      case 'problema_comunicacao':
        return 'Problemas de comunicação';
      case 'violacao_termos':
        return 'Violação dos termos acordados';
      default:
        return 'Outro motivo';
    }
  }

  // Método para limpar sessões expiradas (pode ser chamado periodicamente)
  public cleanExpiredSessions(): void {
    // Implementar limpeza de sessões antigas se necessário
    // Por enquanto, as sessões são limpas quando processadas ou canceladas
  }
}