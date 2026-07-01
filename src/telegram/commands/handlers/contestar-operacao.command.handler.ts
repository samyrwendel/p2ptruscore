import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { OperationsService } from '../../../operations/operations.service';
import { UsersService } from '../../../users/users.service';
import { TermsAcceptanceService } from '../../../users/terms-acceptance.service';
import { OperationStatus } from '../../../operations/schemas/operation.schema';
import { DisputeType } from '../../../operations/schemas/dispute.schema';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';
import { formatTotalBRL, formatUnitPriceBRL } from '../../../shared/operation-value.utils';

@Injectable()
export class ContestarOperacaoCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(ContestarOperacaoCommandHandler.name);
  command = /^\/contestar(?:@\w+)?\s+([a-f0-9]{24})\s+(.+)$/;

  constructor(
    private readonly operationsService: OperationsService,
    private readonly usersService: UsersService,
    private readonly termsAcceptanceService: TermsAcceptanceService,
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    const match = ctx.message.text.match(this.command);
    if (!match) {
      await ctx.reply(
        '⚖️ **Como Contestar uma Operação**\n\n' +
        '**Formato:** `/contestar [ID_DA_OPERACAO] [MOTIVO]`\n\n' +
        '**Exemplo:** `/contestar 507f1f77bcf86cd799439011 Não recebi o pagamento conforme combinado`\n\n' +
        '**Motivos válidos:**\n' +
        '• `nao_pagou` - A outra parte não efetuou o pagamento\n' +
        '• `nao_entregou` - Não entregou os ativos/serviços\n' +
        '• `valor_incorreto` - Valor diferente do acordado\n' +
        '• `tentativa_fraude` - Suspeita de tentativa de golpe\n' +
        '• `problema_comunicacao` - Problemas de comunicação\n' +
        '• `violacao_termos` - Violação dos termos acordados\n\n' +
        '⚠️ **Importante:** Contestações falsas podem resultar em penalidades!',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const [, operationId, reason] = match;
    
    // Validar tamanho do motivo
    if (reason.length < 10) {
      await ctx.reply(
        '❌ **Motivo muito curto**\n\n' +
        'O motivo da contestação deve ter pelo menos 10 caracteres.\n' +
        'Seja específico sobre o problema ocorrido.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (reason.length > 500) {
      await ctx.reply(
        '❌ **Motivo muito longo**\n\n' +
        'O motivo da contestação deve ter no máximo 500 caracteres.\n' +
        'Seja conciso e objetivo.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Buscar o usuário no banco de dados
    const userData = {
      id: ctx.from.id,
      username: ctx.from.username,
      first_name: ctx.from.first_name,
      last_name: ctx.from.last_name
    };
    
    let user;
    try {
      user = await this.usersService.findOrCreate(userData);
      this.logger.log(`Usuário encontrado para contestação: ${user._id}`);
    } catch (error) {
      this.logger.error(`Erro ao buscar usuário:`, error);
      await ctx.reply('❌ Erro interno ao processar usuário.');
      return;
    }
    
    const userId = user._id;

    try {
      // Buscar a operação
      const operation = await this.operationsService.getOperationById(new Types.ObjectId(operationId));
      
      // Verificar se o usuário é participante da operação
      const isCreator = operation.creator.toString() === userId.toString();
      const isAcceptor = operation.acceptor?.toString() === userId.toString();
      
      if (!isCreator && !isAcceptor) {
        await ctx.reply(
          '❌ **Acesso Negado**\n\n' +
          'Você só pode contestar operações das quais participa.\n' +
          'Esta operação não foi criada nem aceita por você.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Verificar se a operação pode ser contestada
      const contestableStatuses = [OperationStatus.ACCEPTED, OperationStatus.PENDING_COMPLETION];
      if (!contestableStatuses.includes(operation.status)) {
        let statusMessage = '';
        switch (operation.status) {
          case OperationStatus.PENDING:
            statusMessage = 'Operações pendentes podem ser canceladas diretamente com `/cancelaroperacao`.';
            break;
          case OperationStatus.COMPLETED:
            statusMessage = 'Operações concluídas não podem ser contestadas. Use `/avaliar` para dar feedback.';
            break;
          case OperationStatus.CANCELLED:
            statusMessage = 'Esta operação já foi cancelada.';
            break;
          case OperationStatus.DISPUTED:
            statusMessage = 'Esta operação já está em disputa.';
            break;
          case OperationStatus.UNDER_REVIEW:
            statusMessage = 'Esta operação já está sob análise de um administrador.';
            break;
          case OperationStatus.FRAUD_REPORTED:
            statusMessage = 'Esta operação já foi reportada como fraude e está suspensa.';
            break;
          default:
            statusMessage = 'Status atual não permite contestação.';
        }
        
        await ctx.reply(
          `❌ **Contestação Não Permitida**\n\n` +
          `Status atual: **${operation.status.toUpperCase()}**\n\n` +
          statusMessage,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Verificar se o usuário já contestou esta operação
      if (operation.disputedBy?.toString() === userId.toString()) {
        await ctx.reply(
          '⚠️ **Contestação Duplicada**\n\n' +
          'Você já contestou esta operação anteriormente.\n' +
          'Aguarde a análise do administrador.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Determinar o tipo de disputa baseado no motivo
      const disputeType = this.categorizeDispute(reason);
      
      // Determinar a contraparte
      const defendant = isCreator ? operation.acceptor : operation.creator;
      
      // Criar a contestação
      await this.operationsService.disputeOperation(
        new Types.ObjectId(operationId),
        userId,
        defendant!,
        disputeType,
        reason
      );

      // Buscar informações da contraparte para notificação
      const defendantUser = await this.usersService.findById(defendant!.toString());
      const defendantName = defendantUser?.userName || defendantUser?.firstName || 'Usuário';
      
      const typeText = operation.type === 'buy' ? 'COMPRA' : 'VENDA';
      const total = operation.amount * operation.price;
      
      // Mensagem de confirmação
      await ctx.reply(
        `⚖️ **Contestação Registrada**\n\n` +
        `**Operação:** ${typeText} ${operation.assets.join(', ')}\n` +
        `**Valor:** ${formatTotalBRL(operation)}\n` +
        `**Contraparte:** ${defendantName}\n` +
        `**Motivo:** ${reason}\n\n` +
        `🔍 **Próximos passos:**\n` +
        `• A operação foi suspensa temporariamente\n` +
        `• Um administrador analisará o caso\n` +
        `• Ambas as partes serão notificadas\n` +
        `• Você pode adicionar evidências com \`/adicionarevidencia ${operationId}\`\n\n` +
        `⏰ **Prazo:** Análise em até 24-48 horas\n\n` +
        `⚠️ **Lembrete:** Contestações falsas podem resultar em penalidades!`,
        { parse_mode: 'Markdown' }
      );

      // Notificar a contraparte
      try {
        await this.bot.telegram.sendMessage(
          defendantUser?.userId || 0,
          `⚖️ **Operação Contestada**\n\n` +
          `Uma operação sua foi contestada:\n\n` +
          `**Operação:** ${typeText} ${operation.assets.join(', ')}\n` +
          `**Valor:** ${formatTotalBRL(operation)}\n` +
          `**Motivo:** ${reason}\n\n` +
          `🔍 **O que fazer:**\n` +
          `• A operação foi suspensa temporariamente\n` +
          `• Um administrador analisará o caso\n` +
          `• Você pode adicionar sua versão com \`/adicionarevidencia ${operationId}\`\n\n` +
          `📞 **Suporte:** Entre em contato com os administradores se necessário.`,
          { parse_mode: 'Markdown' }
        );
      } catch (notifyError) {
        this.logger.warn('Não foi possível notificar a contraparte:', notifyError);
      }

      this.logger.log(`Operation ${operationId} disputed by user ${userId} against ${defendant}`);
      
    } catch (error) {
      this.logger.error('Error disputing operation:', error);
      
      if (error instanceof Error) {
        await ctx.reply(`❌ ${error.message}`);
      } else {
        await ctx.reply('❌ Erro ao contestar operação. Tente novamente.');
      }
    }
  }

  private categorizeDispute(reason: string): DisputeType {
    const reasonLower = reason.toLowerCase();
    
    if (reasonLower.includes('não pagou') || reasonLower.includes('nao pagou') || reasonLower.includes('pagamento')) {
      return DisputeType.NON_PAYMENT;
    }
    
    if (reasonLower.includes('não entregou') || reasonLower.includes('nao entregou') || reasonLower.includes('entrega')) {
      return DisputeType.NON_DELIVERY;
    }
    
    if (reasonLower.includes('valor') || reasonLower.includes('quantidade') || reasonLower.includes('incorreto')) {
      return DisputeType.WRONG_AMOUNT;
    }
    
    if (reasonLower.includes('fraude') || reasonLower.includes('golpe') || reasonLower.includes('enganou')) {
      return DisputeType.FRAUD_ATTEMPT;
    }
    
    if (reasonLower.includes('comunicação') || reasonLower.includes('comunicacao') || reasonLower.includes('contato')) {
      return DisputeType.COMMUNICATION_ISSUE;
    }
    
    if (reasonLower.includes('termos') || reasonLower.includes('acordo') || reasonLower.includes('combinado')) {
      return DisputeType.TERMS_VIOLATION;
    }
    
    return DisputeType.OTHER;
  }
}