import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { Types } from 'mongoose';
import { OperationsService } from '../../../operations/operations.service';
import { PendingEvaluationService } from '../../../operations/pending-evaluation.service';
import { UsersService } from '../../../users/users.service';
import { validateActiveMembershipForCallback } from '../../../shared/group-membership.utils';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class ConfirmAcceptOperationCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(ConfirmAcceptOperationCommandHandler.name);
  command = /^$/; // Não processa comandos de texto, apenas callbacks

  constructor(
    private readonly operationsService: OperationsService,
    private readonly pendingEvaluationService: PendingEvaluationService,
    private readonly usersService: UsersService,
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    // Este handler só processa callbacks
  }

  async handleCallback(ctx: any): Promise<boolean> {
    const callbackData = ctx.callbackQuery?.data;
    
    if (!callbackData) {
      return false;
    }

    // Bloqueio: se houver avaliação pendente, mostrar popup e impedir quaisquer confirmações/finais
    try {
      const user = await this.usersService.findOrCreate({
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name
      });
      const hasPending = await this.pendingEvaluationService.hasPendingEvaluations(user._id);
      if (hasPending && (callbackData.startsWith('confirm_accept_') || callbackData.startsWith('final_accept_'))) {
        try {
          await ctx.answerCbQuery('❌ Você tem uma avaliação pendente. Conclua antes de aceitar novas operações.', { show_alert: true });
        } catch (cbError) {
          this.logger.warn('Falha ao exibir popup de avaliação pendente (confirm/final):', cbError);
        }
        return true;
      }
    } catch (err) {
      this.logger.error('Erro ao checar avaliações pendentes (confirm-accept handler):', err);
    }

    // Processar callback de confirmação de aceite
    if (callbackData.startsWith('confirm_accept_')) {
      return await this.handleConfirmAcceptCallback(ctx);
    }

    // Processar callback de aceite final após confirmação
    if (callbackData.startsWith('final_accept_')) {
      return await this.handleFinalAcceptCallback(ctx);
    }

    // Processar callback de cancelamento
    if (callbackData.startsWith('cancel_accept_')) {
      return await this.handleCancelAcceptCallback(ctx);
    }

    return false;
  }

  private async handleConfirmAcceptCallback(ctx: any): Promise<boolean> {
    try {
      await ctx.answerCbQuery();

      // Validar membro ativo
      const isActiveMember = await validateActiveMembershipForCallback(ctx, this.bot, 'aceitar');
      if (!isActiveMember) {
        return true;
      }

      const operationId = ctx.callbackQuery.data.replace('confirm_accept_', '');
      
      // Buscar operação e análise de disputas
      const [operation, userData] = await Promise.all([
        this.operationsService.getOperationById(new Types.ObjectId(operationId)),
        this.usersService.findOrCreate({
          id: ctx.from.id,
          username: ctx.from.username,
          first_name: ctx.from.first_name,
          last_name: ctx.from.last_name
        })
      ]);

      // Verificar se não está tentando aceitar própria operação
      if (operation.creator.toString() === userData._id.toString()) {
        await ctx.editMessageText('❌ Você não pode aceitar sua própria operação.');
        return true;
      }

      // Obter análise de disputas do criador
      const analysis = await this.pendingEvaluationService.getDisputeAnalysis(operation.creator);
      
      let confirmationMessage = `⚠️ **CONFIRMAÇÃO DE ACEITE**\n\n`;
      confirmationMessage += `🆔 **Operação:** ${operationId}\n`;
      confirmationMessage += `💰 **Valor:** ${operation.amount} ${operation.assets.join(', ')}\n\n`;

      if (analysis.asDefendant > 0) {
        confirmationMessage += `🚨 **ATENÇÃO - ALTO RISCO:**\n`;
        confirmationMessage += `• O criador está sendo contestado em ${analysis.asDefendant} operação(ões)\n`;
        if (analysis.asComplainant > 0) {
          confirmationMessage += `• Também contestou ${analysis.asComplainant} operação(ões)\n`;
        }
        confirmationMessage += `\n⚠️ **RISCOS:**\n`;
        confirmationMessage += `• Possível inadimplência ou problemas de entrega\n`;
        confirmationMessage += `• Você pode precisar contestar também\n`;
        confirmationMessage += `• Mantenha todas as evidências da transação\n\n`;
        confirmationMessage += `🔄 **IMPORTANTE:** Se aceitar, **VOCÊ TRANSFERE POR ÚLTIMO** - a outra parte transfere primeiro (por estar sendo contestada)\n\n`;
      } else if (analysis.asComplainant > 0) {
        confirmationMessage += `⚠️ **AVISO - RISCO MODERADO:**\n`;
        confirmationMessage += `• O criador contestou ${analysis.asComplainant} operação(ões)\n`;
        confirmationMessage += `• Pode indicar usuário exigente com qualidade\n`;
        confirmationMessage += `• Seja pontual e cumpra exatamente o combinado\n\n`;
      }

      confirmationMessage += `❓ **Deseja realmente aceitar esta operação?**`;

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: '✅ Sim, Aceitar',
              callback_data: `final_accept_${operationId}`
            },
            {
              text: '❌ Cancelar',
              callback_data: `cancel_accept_${operationId}`
            }
          ]
        ]
      };

      await ctx.editMessageText(confirmationMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

      return true;
    } catch (error) {
      this.logger.error('Erro ao processar confirmação de aceite:', error);
      await ctx.editMessageText('❌ Erro ao processar confirmação. Tente novamente.');
      return true;
    }
  }

  private async handleFinalAcceptCallback(ctx: any): Promise<boolean> {
    try {
      await ctx.answerCbQuery('Processando aceite...');

      const operationId = ctx.callbackQuery.data.replace('final_accept_', '');
      
      const userData = await this.usersService.findOrCreate({
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name
      });

      // Aceitar a operação
      await this.operationsService.acceptOperation(
        new Types.ObjectId(operationId), 
        userData._id
      );

      await ctx.editMessageText(
        `✅ **Operação Aceita com Sucesso!**\n\n` +
        `🆔 **ID:** ${operationId}\n\n` +
        `📞 **Próximos passos:**\n` +
        `• Entre em contato com o criador\n` +
        `• Siga as instruções de transferência\n` +
        `• Mantenha evidências da transação\n\n` +
        `🔔 **Você receberá notificações sobre o andamento da operação.**`,
        { parse_mode: 'Markdown' }
      );

      this.logger.log(`Operation ${operationId} accepted by user ${userData._id} after dispute confirmation`);
      return true;
    } catch (error) {
      this.logger.error('Erro ao aceitar operação:', error);
      
      if (error instanceof Error) {
        await ctx.editMessageText(`❌ ${error.message}`);
      } else {
        await ctx.editMessageText('❌ Erro ao aceitar operação. Tente novamente.');
      }
      return true;
    }
  }

  private async handleCancelAcceptCallback(ctx: any): Promise<boolean> {
    try {
      await ctx.answerCbQuery('Aceite cancelado');

      await ctx.editMessageText(
        `❌ **Aceite Cancelado**\n\n` +
        `Você decidiu não aceitar esta operação.\n\n` +
        `💡 **Dica:** Sempre avalie os riscos antes de aceitar operações.`,
        { parse_mode: 'Markdown' }
      );

      return true;
    } catch (error) {
      this.logger.error('Erro ao cancelar aceite:', error);
      return true;
    }
  }
}