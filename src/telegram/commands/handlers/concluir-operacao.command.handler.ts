import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { Types } from 'mongoose';
import { OperationsService } from '../../../operations/operations.service';
import { UsersService } from '../../../users/users.service';
import { PendingEvaluationService } from '../../../operations/pending-evaluation.service';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import { TermsAcceptanceService } from '../../../users/terms-acceptance.service';
import { validateActiveMembershipForCallback } from '../../../shared/group-membership.utils';
import { validateUserTermsForCallback } from '../../../shared/terms-validation.utils';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class ConcluirOperacaoCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(ConcluirOperacaoCommandHandler.name);
  command = /^\/concluiroperacao(?:@\w+)?\s+([a-f0-9]{24})$/;

  constructor(
    private readonly operationsService: OperationsService,
    private readonly usersService: UsersService,
    private readonly pendingEvaluationService: PendingEvaluationService,
    private readonly keyboardService: TelegramKeyboardService,
    private readonly termsAcceptanceService: TermsAcceptanceService,
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    const match = ctx.message.text.match(this.command);
    if (!match) {
      await ctx.reply(
        '▼ Formato incorreto. Use:\n' +
        '`/concluiroperacao [ID_DA_OPERACAO]`\n\n' +
        'Exemplo: `/concluiroperacao 507f1f77bcf86cd799439011`\n\n' +
        'Este comando só pode ser usado pelos participantes da operação.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const [, operationId] = match;
    const userId = new Types.ObjectId(ctx.from.id.toString());

    try {
      const completedOperation = await this.operationsService.completeOperation(
        new Types.ObjectId(operationId),
        userId,
      );

      const typeText = completedOperation.type === 'buy' ? 'COMPRA' : 'VENDA';
      const total = completedOperation.amount * completedOperation.price;
      const userMention = `@${ctx.from.username || ctx.from.first_name}`;
      
      await ctx.reply(
        `✅ **Operação Concluída!**\n\n` +
        `${userMention} marcou a operação como concluída:\n\n` +
        `${typeText}\n` +
        `Ativos: ${completedOperation.assets.join(', ')}\n` +
        `Quantidade: ${completedOperation.amount}\n` +
        `Preço: R$ ${total.toFixed(2)}\n` +

        `Redes: ${completedOperation.networks.map(n => n.toUpperCase()).join(', ')}\n\n` +
        `🎉 **Parabéns pela transação bem-sucedida!**\n\n` +
        `💡 **Lembrete:** Não se esqueçam de se avaliarem mutuamente usando:\n` +
        `\`/avaliar positiva Transação rápida e confiável\`\n` +
        `(respondam à mensagem um do outro)`,
        { parse_mode: 'Markdown' }
      );

      this.logger.log(
        `Operation ${operationId} completed by user ${userId}`,
      );
      
    } catch (error) {
      this.logger.error('Error completing operation:', error);
      
      if (error instanceof Error) {
        await ctx.reply(`▼ ${error.message}`);
      } else {
        await ctx.reply('▼ Erro ao concluir operação. Tente novamente.');
      }
    }
  }

  async handleCallback(ctx: any): Promise<boolean> {
    const data = ctx.callbackQuery.data;
    
    if (!data.startsWith('complete_operation_')) {
      return false;
    }

    try {
      // ✅ VALIDAÇÃO CRÍTICA: Verificar se usuário aceitou os termos ANTES de concluir operação
      const hasValidTerms = await validateUserTermsForCallback(ctx, this.termsAcceptanceService, 'concluir');
      if (!hasValidTerms) {
        this.logger.warn(`❌ CONCLUSÃO BLOQUEADA - Usuário ${ctx.from.id} não aceitou os termos`);
        return true; // validateUserTermsForCallback já envia o popup
      }

      // ✅ VALIDAÇÃO CRÍTICA: Verificar se usuário é membro ativo
      const isActiveMember = await validateActiveMembershipForCallback(ctx, this.bot, 'concluir');
      if (!isActiveMember) {
        return true; // validateActiveMembershipForCallback já envia o popup
      }

      const operationId = data.replace('complete_operation_', '');
      
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
        this.logger.log(`Usuário encontrado para conclusão via callback: ${user._id}`);
      } catch (error) {
        this.logger.error(`Erro ao buscar usuário:`, error);
        await ctx.editMessageText('❌ Erro interno ao processar usuário.');
        return true;
      }
      
      const userId = user._id;

      try {
        const completedOperation = await this.operationsService.completeOperation(
          new Types.ObjectId(operationId),
          userId,
        );

        const typeText = completedOperation.type === 'buy' ? 'COMPRA' : 'VENDA';
        const total = completedOperation.amount * completedOperation.price;
        
        // Para operações com EUR, ajustar a moeda do total
        let totalFormatted = '';
        if (completedOperation.assets.includes('EURO' as any)) {
          totalFormatted = `€ ${total.toFixed(2)}`;
        } else {
          totalFormatted = `R$ ${total.toFixed(2)}`;
        }
        
        // Verificar se foi uma solicitação de conclusão ou confirmação final
        if (completedOperation.status === 'pending_completion') {
          // Primeira solicitação - aguardando confirmação da outra parte
          await ctx.editMessageText(
            `⏳ **Solicitação de Conclusão Enviada**\n\n` +
            `${typeText}\n` +
            `💰 **Ativos:** ${completedOperation.assets.join(', ')}\n` +
            `📊 **Quantidade:** ${completedOperation.amount}\n` +
            `💵 **Total:** ${totalFormatted}\n` +
            `🆔 **ID:** \`${completedOperation._id}\`\n\n` +
            `🤝 **Aguardando confirmação** da outra parte.\n\n` +
            `💡 A operação será concluída quando ambas as partes confirmarem.`,
            { parse_mode: 'Markdown' }
          );
        } else {
          // Confirmação final - operação concluída
          await ctx.editMessageText(
            `✅ **Operação Concluída com Sucesso!**\n\n` +
            `${typeText}\n` +
            `💰 **Ativos:** ${completedOperation.assets.join(', ')}\n` +
            `📊 **Quantidade:** ${completedOperation.amount}\n` +
            `💵 **Total:** ${totalFormatted}\n` +
            `🌐 **Redes:** ${completedOperation.networks.map(n => n.toUpperCase()).join(', ')}\n` +
            `🆔 **ID:** \`${completedOperation._id}\`\n\n` +
            `🎉 **Parabéns pela transação bem-sucedida!**\n\n` +
            `⏳ **Redirecionando para avaliação...**`,
            { parse_mode: 'Markdown' }
          );

          // Aguardar um momento para o usuário ler
           setTimeout(async () => {
             try {
               // As mensagens de avaliação bidirecional são enviadas automaticamente
               // pelo operations-broadcast.service.ts quando a operação é concluída
               // Não precisamos enviar mensagens aqui para evitar duplicação
               
               if (completedOperation.acceptor) {
                 // Apenas mostrar conclusão - as mensagens de avaliação serão enviadas pelo broadcast service
                 await ctx.editMessageText(
                   `✅ **Operação Concluída!**\n\n` +
                   `A operação foi marcada como concluída com sucesso.\n\n` +
                   `📨 **Avaliações:** Mensagens de avaliação foram enviadas para ambos os participantes.`,
                   { parse_mode: 'Markdown' }
                 );
               } else {
                 // Se não há aceitador, apenas mostrar conclusão
                 await ctx.editMessageText(
                   `✅ **Operação Concluída!**\n\n` +
                   `A operação foi marcada como concluída com sucesso.`,
                   { parse_mode: 'Markdown' }
                 );
               }
             } catch (evalError) {
               this.logger.error('Erro ao criar avaliação pendente:', evalError);
               await ctx.editMessageText(
                 `✅ **Operação Concluída!**\n\n` +
                 `A operação foi concluída, mas houve um problema ao configurar a avaliação.\n` +
                 `Você pode avaliar manualmente usando o comando /avaliar.`
               );
             }
           }, 2000); // 2 segundos de delay
         }

        this.logger.log(
          `Operation ${operationId} completed via callback by user ${userId}`,
        );
        
        // Responder ao callback com sucesso
        try {
          await ctx.answerCbQuery('✅ Operação concluída com sucesso!');
        } catch (cbError: any) {
          if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
            this.logger.warn('Callback query expirado após conclusão bem-sucedida:', cbError.description);
          }
        }
        
      } catch (error) {
        this.logger.error('Error completing operation via callback:', error);
        
        // Não alterar a mensagem da operação, apenas mostrar popup de erro
        let errorMessage = '❌ Erro ao concluir operação. Tente novamente.';
        if (error instanceof Error) {
          if (error.message.includes('só pode ser concluída')) {
            errorMessage = '⚠️ Esta operação ainda não foi aceita por outro usuário. Aguarde alguém aceitar a operação antes de tentar concluí-la.';
          } else if (error.message.includes('já foi concluída anteriormente')) {
            errorMessage = '✅ Esta operação já foi concluída anteriormente. Não é possível concluir novamente.';
          } else if (error.message.includes('não pode ser concluída')) {
            errorMessage = '⚠️ Esta operação não pode ser concluída no momento. Verifique se ela foi aceita por outro usuário.';
          } else {
            errorMessage = `❌ ${error.message}`;
          }
        }
        
        // Mostrar apenas popup de erro, sem alterar a mensagem da operação
        try {
          await ctx.answerCbQuery(errorMessage, { show_alert: true });
        } catch (cbError: any) {
          if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
            this.logger.warn('Callback query expirado no tratamento de erro de conclusão:', cbError.description);
          }
        }
      }
      
      return true;
    } catch (error) {
      this.logger.error('Erro ao processar callback de conclusão:', error);
      try {
        await ctx.answerCbQuery('❌ Erro ao processar conclusão', { show_alert: true });
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado no tratamento de erro:', cbError.description);
        }
      }
      return true;
    }
  }
}