import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { Types } from 'mongoose';
import { createHash } from 'crypto';
import { OperationsService } from '../../../operations/operations.service';
import { UsersService } from '../../../users/users.service';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import { TermsAcceptanceService } from '../../../users/terms-acceptance.service';
import { validateActiveMembershipForCallback } from '../../../shared/group-membership.utils';
import { validateUserTermsForCallback } from '../../../shared/terms-validation.utils';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class ReverterOperacaoCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(ReverterOperacaoCommandHandler.name);
  command = /^\/reverteroperacao(?:@\w+)?\s+([a-f0-9]{24})$/;

  constructor(
    private readonly operationsService: OperationsService,
    private readonly usersService: UsersService,
    private readonly keyboardService: TelegramKeyboardService,
    private readonly termsAcceptanceService: TermsAcceptanceService,
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    const match = ctx.message.text.match(this.command);
    if (!match) {
      await ctx.reply(
        '▼ Formato incorreto. Use:\n' +
        '`/reverteroperacao [ID_DA_OPERACAO]`\n\n' +
        'Exemplo: `/reverteroperacao 507f1f77bcf86cd799439011`\n\n' +
        'Use `/minhasoperacoes` para ver o ID das suas operações.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const [, operationId] = match;
    
    // Buscar usuário pelo ID do Telegram
    if (!ctx.from?.id) {
      await ctx.reply('▼ Erro: ID do usuário não encontrado.');
      return;
    }

    const telegramUserId = ctx.from.id;
    const user = await this.usersService.findOneByUserId(telegramUserId);
    
    if (!user) {
      await ctx.reply('▼ Usuário não encontrado no sistema. Você precisa interagir com o bot primeiro.');
      return;
    }

    const userId = user._id;

    try {
      const operationObjectId = new Types.ObjectId(operationId);
      
      this.logger.log(
        `User ${userId} attempting to revert operation ${operationObjectId}`
      );
      
      const revertedOperation = await this.operationsService.revertOperation(
        operationObjectId,
        userId
      );

      const userName = ctx.from.first_name || ctx.from.username || 'Usuário';
      
      await ctx.reply(
        `🔄 **Operação Revertida com Sucesso!**\n\n` +
        `✅ A operação \`${operationId}\` foi revertida por ${userName}.\n\n` +
        `📋 **Status:** A operação voltou ao status **PENDENTE** e está novamente disponível para aceitação.\n\n` +
        `🔍 **Próximos passos:**\n` +
        `• A operação aparecerá novamente nos grupos\n` +
        `• Outros usuários podem aceitar a operação\n` +
        `• Use \`/minhasoperacoes\` para acompanhar`,
        { parse_mode: 'Markdown' }
      );

      this.logger.log(
        `Operation ${operationObjectId} successfully reverted by user ${userId}`
      );
    } catch (error) {
      this.logger.error(
        `Error reverting operation ${operationId} by user ${userId}:`,
        error
      );
      
      let errorMessage = '▼ Erro ao reverter operação.';
      
      if (error.message.includes('não encontrada')) {
        errorMessage = '▼ Operação não encontrada. Verifique o ID e tente novamente.';
      } else if (error.message.includes('só pode reverter')) {
        errorMessage = '▼ Você só pode reverter operações que criou ou aceitou.';
      } else if (error.message.includes('Apenas operações aceitas')) {
        errorMessage = '▼ Apenas operações aceitas podem ser revertidas.';
      } else if (error.message.includes('concluídas não podem ser revertidas')) {
        errorMessage = '▼ Operações concluídas não podem ser revertidas. A transação já foi finalizada.';
      }
      
      await ctx.reply(errorMessage);
    }
  }

  async handleCallback(ctx: any): Promise<boolean> {
    const data = ctx.callbackQuery?.data;
    
    if (!data || !data.startsWith('revert_operation_')) {
      return false;
    }

    try {
      // ✅ VALIDAÇÃO CRÍTICA: Verificar se usuário aceitou os termos ANTES de reverter operação
      const hasValidTerms = await validateUserTermsForCallback(ctx, this.termsAcceptanceService, 'reverter');
      if (!hasValidTerms) {
        this.logger.warn(`❌ REVERSÃO BLOQUEADA - Usuário ${ctx.from.id} não aceitou os termos`);
        return true; // validateUserTermsForCallback já envia o popup
      }

      // ✅ VALIDAÇÃO CRÍTICA: Verificar se usuário é membro ativo
      const isActiveMember = await validateActiveMembershipForCallback(ctx, this.bot, 'reverter');
      if (!isActiveMember) {
        return true; // validateActiveMembershipForCallback já envia o popup
      }

      // Tentar responder ao callback, mas ignorar se expirado
      try {
        await ctx.answerCbQuery();
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado no reverter operação:', cbError.description);
        } else {
          this.logger.error('Erro ao responder callback query:', cbError);
        }
      }

      const operationId = data.replace('revert_operation_', '');
      
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
        this.logger.log(`Usuário encontrado para reversão via callback: ${user._id}`);
      } catch (error) {
        this.logger.error(`Erro ao buscar usuário:`, error);
        await ctx.editMessageText('❌ Erro interno ao processar usuário.');
        return true;
      }
      
      const userId = user._id;

      try {
        const revertedOperation = await this.operationsService.revertOperation(
          new Types.ObjectId(operationId),
          userId,
        );

        // Se estamos no chat privado, remover a mensagem e mostrar popup de confirmação
        if (ctx.callbackQuery.message.chat.type === 'private') {
          try {
            await ctx.editMessageText(
              '✅ **Operação Cancelada**\n\n' +
              'Você desistiu da operação com sucesso.\n\n' +
              '📋 A operação voltou ao status **PENDENTE** e está novamente disponível para outros usuários.'
            );
            
            // Mostrar popup de confirmação
            await ctx.answerCbQuery('✅ Você desistiu da operação!', { show_alert: true });
          } catch (editError) {
            // Se falhar ao editar, apenas mostrar popup
            await ctx.answerCbQuery('✅ Você desistiu da operação!', { show_alert: true });
          }
        } else {
          // Se estamos no grupo, apenas mostrar popup (a mensagem será atualizada pelo broadcast service)
          await ctx.answerCbQuery('✅ Operação revertida com sucesso!');
        }

        this.logger.log(
          `Operation ${operationId} reverted via callback by user ${userId}`,
        );
        
      } catch (error) {
         this.logger.error('Error reverting operation via callback:', error);
         
         // Para erros de permissão, apenas mostrar popup sem alterar a mensagem
         let errorMessage = '❌ Erro ao reverter operação. Tente novamente.';
         if (error instanceof Error) {
           if (error.message.includes('só pode reverter')) {
             errorMessage = '❌ Você só pode reverter operações que criou ou aceitou.';
           } else if (error.message.includes('Apenas operações aceitas')) {
             errorMessage = '❌ Apenas operações aceitas podem ser revertidas.';
           } else if (error.message.includes('concluídas não podem ser revertidas')) {
             errorMessage = '❌ Operações concluídas não podem ser revertidas. A transação já foi finalizada.';
           } else {
             errorMessage = `❌ ${error.message}`;
           }
         }
         
         // Mostrar apenas popup de erro, sem alterar a mensagem da operação
         try {
           await ctx.answerCbQuery(errorMessage, { show_alert: true });
         } catch (cbError: any) {
           if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
             this.logger.warn('Callback query expirado ao mostrar erro:', cbError.description);
           } else {
             this.logger.error('Erro ao mostrar popup de erro:', cbError);
           }
         }
       }
      
      return true;
    } catch (error) {
      this.logger.error('Error in revert operation callback:', error);
      return true;
    }
  }
}