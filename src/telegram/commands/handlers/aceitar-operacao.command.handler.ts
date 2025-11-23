import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { Types } from 'mongoose';
import { OperationsService } from '../../../operations/operations.service';
import { PendingEvaluationService } from '../../../operations/pending-evaluation.service';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import { UsersService } from '../../../users/users.service';
import { TermsAcceptanceService } from '../../../users/terms-acceptance.service';
import { KarmaService } from '../../../karma/karma.service';
import { getReputationInfo } from '../../../shared/reputation.utils';
import { validateUserTermsForOperation } from '../../../shared/terms-validation.utils';
import { validateActiveMembership } from '../../../shared/group-membership.utils';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class AceitarOperacaoCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(AceitarOperacaoCommandHandler.name);
  command = /^\/aceitaroperacao(?:@\w+)?\s+([a-f0-9]{24})$/;

  constructor(
    private readonly operationsService: OperationsService,
    private readonly pendingEvaluationService: PendingEvaluationService,
    private readonly keyboardService: TelegramKeyboardService,
    private readonly usersService: UsersService,
    private readonly termsAcceptanceService: TermsAcceptanceService,
    private readonly karmaService: KarmaService,
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
  ) {}

  private async getKarmaForUserWithFallback(user: any, chatId: number): Promise<any> {
    try {
      // Priorizar total consolidado
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
      // Fallback para karma do grupo
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

  async handle(ctx: TextCommandContext): Promise<void> {
    if (ctx.chat.type === 'private') {
      await ctx.reply(
        '▼ Este comando só pode ser usado em grupos onde o bot está ativo.',
      );
      return;
    }

    // VALIDAÇÃO CRÍTICA: Verificar se usuário é membro ativo do grupo
    const isActiveMember = await validateActiveMembership(ctx, this.bot, 'aceitar');
    if (!isActiveMember) {
      return; // Mensagem de erro já foi enviada pela função de validação
    }

    // A validação de termos é feita globalmente no TelegramService
    // Não precisa validar aqui novamente

    const match = ctx.message.text.match(this.command);
    if (!match) {
      await ctx.reply(
        '▼ Formato incorreto. Use:\n' +
        '`/aceitaroperacao [ID_DA_OPERACAO]`\n\n' +
        'Exemplo: `/aceitaroperacao 507f1f77bcf86cd799439011`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const [, operationId] = match;
    
    // Validar se ctx.from e ctx.from.id existem
    if (!ctx.from || !ctx.from.id) {
      this.logger.error('ctx.from ou ctx.from.id não definido');
      await ctx.reply('❌ Erro interno: informações do usuário não disponíveis.');
      return;
    }

    // Garantir que o usuário aceitador existe no banco de dados
    const acceptorUserData = {
      id: ctx.from.id,
      username: ctx.from.username,
      first_name: ctx.from.first_name || 'Usuário',
      last_name: ctx.from.last_name
    };

    try {
      // ⚡ OTIMIZAÇÃO: Buscar operação e validações em paralelo
      const [operation, acceptorUser] = await Promise.all([
        this.operationsService.getOperationById(new Types.ObjectId(operationId)),
        this.usersService.findOrCreate(acceptorUserData)
      ]);

      const acceptorId = acceptorUser._id;

      // Bloqueio por avaliação pendente — enviar notificação direta por DM
      try {
        const hasPending = await this.pendingEvaluationService.hasPendingEvaluations(acceptorId);
        if (hasPending) {
          let pendingCount = 0;
          let pendingOps: string[] = [];
          try {
            const pendings = await this.pendingEvaluationService.getPendingEvaluations(acceptorId);
            pendingCount = pendings.length;
            pendingOps = pendings.map((p: any) => p.operation?.toString?.() || 'unknown');
          } catch (listErr) {
            this.logger.warn('Falha ao listar avaliações pendentes (aceitar):', listErr);
          }

          const dmMessage = [
            '🚫 Operação não pode ser aceita.',
            '',
            `Você tem ${pendingCount} avaliação(ões) pendente(s). Conclua-as para aceitar novas operações.`,
            '',
            'Como resolver:',
            '• Abra o chat com @p2pscorebot',
            '• Use /start e toque em "Minha Reputação"',
            '• Finalize as avaliações recebidas após suas operações',
            '',
            `Se acredita que não há pendências, envie /ajuda com este ID: ${ctx.from.id}.`
          ].join('\n');

          try {
            await this.bot.telegram.sendMessage(ctx.from.id, dmMessage, { parse_mode: 'Markdown' });
          } catch (dmErr) {
            this.logger.warn('Não foi possível enviar DM de bloqueio (aceitar):', dmErr);
          }

          this.logger.warn(
            `Aceite bloqueado por avaliação pendente para usuário ${ctx.from.id} — ` +
            `count=${pendingCount}, ops=[${pendingOps.join(',')}]`
          );
          return;
        }
      } catch (evalErr) {
        this.logger.error('Erro ao validar avaliações pendentes (aceitar - comando):', evalErr);
      }

      // Verificar se o usuário não está tentando aceitar sua própria operação
      if (operation.creator.toString() === acceptorId.toString()) {
        await ctx.reply('▼ Você não pode aceitar sua própria operação.');
        return;
      }

      // ⚡ OTIMIZAÇÃO: Aceitar operação e buscar dados em paralelo
      const [acceptedOperation, creatorUser] = await Promise.all([
        this.operationsService.acceptOperation(new Types.ObjectId(operationId), acceptorId),
        this.usersService.findById(operation.creator.toString())
      ]);

      // Verificar se o criador da operação tem disputas ativas
      let disputeWarning = '';
      try {
        if (creatorUser) {
          const warning = await this.pendingEvaluationService.getUserDisputeWarning(operation.creator);
          if (warning) {
            disputeWarning = `\n\n${warning}\n` +
              `⚠️ **Cuidado:** O criador desta operação tem disputas pendentes.\n` +
              `Considere isso ao negociar e mantenha evidências da transação.\n`;
          }
        }
      } catch (error) {
        this.logger.error('Erro ao verificar disputas do criador:', error);
      }

      // ⚡ OTIMIZAÇÃO: Buscar karma de ambos em paralelo
      const [creatorKarma, acceptorKarma] = await Promise.all([
        creatorUser?.userId ? this.getKarmaForUserWithFallback(creatorUser, ctx.chat.id) : null,
        acceptorUser?.userId ? this.getKarmaForUserWithFallback(acceptorUser, ctx.chat.id) : null,
      ]);

      const creatorName = creatorUser?.userName ? `@${creatorUser.userName}` : creatorUser?.firstName || 'Usuário';
      const acceptorName = acceptorUser?.userName ? `@${acceptorUser.userName}` : acceptorUser?.firstName || 'Usuário';
      const creatorReputation = creatorKarma?.karma || 0;
      const acceptorReputation = acceptorKarma?.karma || 0;
      const typeText = acceptedOperation.type === 'buy' ? 'COMPRA' : 'VENDA';
      
      const creatorIcons = getReputationInfo(creatorReputation);
      const acceptorIcons = getReputationInfo(acceptorReputation);
      
      // REMOVIDO: Lógica de ordem de transferência duplicada
      // A ordem de transferência é determinada no operations-broadcast.service.ts
      // com base em disputas ativas, não apenas reputação
      
      // Formatar quantidade conforme tipo de ativo
      const formattedAmount = this.formatValueByAsset(acceptedOperation.amount, acceptedOperation.assets);
      const currencySuffix = this.getCurrencySuffix(acceptedOperation.assets);
      
      // Verificar tipo de cotação para exibir informações corretas
      const isAutomaticQuotation = acceptedOperation.quotationType === 'google' || acceptedOperation.quotationType === 'binance';
      const priceText = isAutomaticQuotation ? 'Calculado na Transação' : `R$ ${(acceptedOperation.amount * acceptedOperation.price).toFixed(2)}`;
      const quotationText = acceptedOperation.quotationType === 'google' ? 'Google' : 
                           acceptedOperation.quotationType === 'binance' ? 'Binance' : 
                           `R$ ${acceptedOperation.price.toFixed(2)}`;
      
      // Enviar aviso de disputa se existir
      if (disputeWarning) {
        await ctx.reply(disputeWarning, { parse_mode: 'Markdown' });
      }
      
      // Não enviar mensagem aqui - deixar que o broadcast service gerencie
      // A mensagem será enviada via notifyOperationAccepted no operations.service.ts

      this.logger.log(
        `Operation ${operationId} accepted by user ${acceptorId} in group ${ctx.chat.id}${disputeWarning ? ' - Creator has active disputes' : ''}`,
      );
      
    } catch (error) {
      this.logger.error('Error accepting operation:', error);
      
      if (error instanceof Error) {
        await ctx.reply(`▼ ${error.message}`);
      } else {
        await ctx.reply('▼ Erro ao aceitar operação. Tente novamente.');
      }
    }
  }

  private formatValueByAsset(value: number, assets: string[]): string {
    if (!assets || assets.length === 0) {
      return value.toFixed(2);
    }

    // Verificar se tem BTC ou ETH (8 casas decimais)
    const hasCrypto = assets.some(asset => ['BTC', 'ETH'].includes(asset));
    if (hasCrypto) {
      return value.toFixed(8);
    }

    // Verificar se tem stablecoins ou moedas fiat (2 casas decimais)
    const hasStablecoinOrFiat = assets.some(asset => 
      ['USDT', 'USDC', 'USDE', 'DOLAR', 'EURO', 'REAL'].includes(asset)
    );
    if (hasStablecoinOrFiat) {
      return value.toFixed(2);
    }

    // Outros casos - 2 casas decimais por padrão
    return value.toFixed(2);
  }

  // Função para obter sufixo da moeda baseado nos ativos
  private getCurrencySuffix(assets: string[]): string {
    if (!assets || assets.length === 0) {
      return '';
    }

    // Verificar se tem stablecoins
    const hasStablecoin = assets.some(asset => ['USDT', 'USDC', 'USDE'].includes(asset));
    if (hasStablecoin) {
      return ' USD';
    }

    // Verificar se tem moedas fiat
    if (assets.includes('REAL')) {
      return ' BRL';
    }
    if (assets.includes('DOLAR')) {
      return ' USD';
    }
    if (assets.includes('EURO')) {
      return ' EUR';
    }

    // Verificar se tem BTC ou ETH
    if (assets.includes('BTC')) {
      return ' BTC';
    }
    if (assets.includes('ETH')) {
      return ' ETH';
    }

    // Outros casos
    return '';
  }

  async handleCallback(ctx: any): Promise<boolean> {
    const data = ctx.callbackQuery.data;

    // Verificar se este callback pertence a este handler
    if (!data.startsWith('accept_operation_')) {
      return false;
    }

    try {
      // Interceptar ACK do alerta
      if (data === 'eval_pending_ack_accept_cb') {
        try {
          await ctx.answerCbQuery('Você precisa avaliar a outra parte antes de operar.', { show_alert: true });
        } catch (cbError) {
          this.logger.warn('Falha ao exibir popup de avaliação pendente (aceitar-callback):', cbError);
        }
        return true;
      }

      // ✅ VALIDAÇÃO CRÍTICA: Verificar se usuário aceitou os termos ANTES de aceitar operação
      const { validateUserTermsForCallback } = await import('../../../shared/terms-validation.utils');
      const hasValidTerms = await validateUserTermsForCallback(ctx, this.termsAcceptanceService, 'aceitar');
      if (!hasValidTerms) {
        this.logger.warn(`❌ ACEITE BLOQUEADO - Usuário ${ctx.from.id} não aceitou os termos`);
        return true; // validateUserTermsForCallback já envia o popup
      }

      // Extrair o ID da operação do callback
      const operationId = data.replace('accept_operation_', '');
      
      this.logger.log(`📞 Processando aceitar operação: ${operationId}`);
      this.logger.log(`📞 ID length: ${operationId.length}, ID: ${operationId}`);
      
      // Validar se é um ObjectId válido
      if (!Types.ObjectId.isValid(operationId)) {
        this.logger.error(`❌ ID de operação inválido: ${operationId}`);
        try {
          await ctx.answerCbQuery('❌ ID de operação inválido', { show_alert: true });
        } catch (cbError: any) {
          if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
            this.logger.warn('Callback query expirado - ID inválido:', cbError.description);
          } else {
            this.logger.error('Erro ao responder callback - ID inválido:', cbError);
          }
        }
        return true;
      }
      
      // Buscar a operação
      const operation = await this.operationsService.getOperationById(new Types.ObjectId(operationId));
      if (!operation) {
        try {
          await ctx.answerCbQuery('❌ Operação não encontrada', { show_alert: true });
        } catch (cbError: any) {
          if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
            this.logger.warn('Callback query expirado - operação não encontrada:', cbError.description);
          } else {
            this.logger.error('Erro ao responder callback - operação não encontrada:', cbError);
          }
        }
        return true;
      }
      
      // Verificar se a operação ainda está disponível
      if (operation.status !== 'pending') {
        try {
          await ctx.answerCbQuery('❌ Esta operação não está mais disponível', { show_alert: true });
        } catch (cbError: any) {
          if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
            this.logger.warn('Callback query expirado - operação indisponível:', cbError.description);
          } else {
            this.logger.error('Erro ao responder callback - operação indisponível:', cbError);
          }
        }
        return true;
      }
      
      // Buscar ou criar usuário aceitador
      const acceptorUser = await this.usersService.findOrCreate({
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name
      });

      // Bloqueio por avaliação pendente
      try {
        const hasPending = await this.pendingEvaluationService.hasPendingEvaluations(acceptorUser._id);
        if (hasPending) {
          try {
            await ctx.answerCbQuery('❌ Você tem uma avaliação pendente. Conclua antes de aceitar novas operações.', { show_alert: true });
          } catch (cbError: any) {
            this.logger.warn('Falha ao responder popup de avaliação pendente (aceitar-callback):', cbError);
          }
          return true;
        }
      } catch (evalErr) {
        this.logger.error('Erro ao validar avaliações pendentes (aceitar - callback):', evalErr);
      }
      
      // Verificar se não é o próprio criador tentando aceitar (usando o ID do usuário no banco)
      if (operation.creator.toString() === acceptorUser._id.toString()) {
        try {
          await ctx.answerCbQuery('❌ Você não pode aceitar sua própria operação', { show_alert: true });
        } catch (cbError: any) {
          if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
            this.logger.warn('Callback query expirado - própria operação:', cbError.description);
          } else {
            this.logger.error('Erro ao responder callback - própria operação:', cbError);
          }
        }
        return true;
      }
      
      // Processar a aceitação da operação
      this.logger.log(`🔄 Chamando acceptOperation para operação ${operationId}`);
      const acceptedOperation = await this.operationsService.acceptOperation(new Types.ObjectId(operationId), acceptorUser._id);
      this.logger.log(`✅ acceptOperation concluído para operação ${operationId}`);
      
      try {
        await ctx.answerCbQuery('✅ Operação aceita com sucesso!', { show_alert: true });
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado - sucesso:', cbError.description);
        } else {
          this.logger.error('Erro ao responder callback - sucesso:', cbError);
        }
      }
      
      this.logger.log(`✅ Operação ${operationId} aceita por ${acceptorUser._id}`);

      return true;

    } catch (error) {
      this.logger.error('❌ Erro ao processar callback de aceitar operação:', error);
      
      let errorMessage = '❌ Erro ao aceitar operação';
      if (error instanceof Error) {
        errorMessage = `❌ ${error.message}`;
      }
      
      try {
        await ctx.answerCbQuery(errorMessage, { show_alert: true });
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado no tratamento de erro:', cbError.description);
        } else {
          this.logger.error('Erro ao responder callback de erro:', cbError);
        }
      }
      
      return false;
    }
  }
}
