import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { OperationsService } from '../../../operations/operations.service';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import { UsersService } from '../../../users/users.service';
import { TermsAcceptanceService } from '../../../users/terms-acceptance.service';
import { KarmaService } from '../../../karma/karma.service';
import { getReputationInfo } from '../../../shared/reputation.utils';
import { validateUserTermsForOperation } from '../../../shared/terms-validation.utils';
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
    private readonly keyboardService: TelegramKeyboardService,
    private readonly usersService: UsersService,
    private readonly termsAcceptanceService: TermsAcceptanceService,
    private readonly karmaService: KarmaService,
  ) {}

  private async getKarmaForUserWithFallback(user: any, chatId: number): Promise<any> {
    try {
      // Primeiro tentar buscar karma no grupo atual
      const groupKarma = await this.karmaService.getKarmaForUser(user.userId, chatId);
      
      if (groupKarma && groupKarma.karma !== undefined) {
        return groupKarma;
      }
      
      // Se não encontrar no grupo atual, buscar karma total
      const totalKarma = await this.karmaService.getTotalKarmaForUser(user.userName || user.firstName);
      
      if (totalKarma) {
        // Simular estrutura de karma do grupo para compatibilidade
        return {
          karma: totalKarma.totalKarma,
          givenKarma: totalKarma.totalGiven,
          givenHate: totalKarma.totalHate,
          user: totalKarma.user,
          history: [] // Histórico vazio para karma total
        };
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

    // VALIDAÇÃO CRÍTICA: Verificar se usuário aceitou os termos
    const isValid = await validateUserTermsForOperation(ctx, this.termsAcceptanceService, 'aceitar');
    if (!isValid) {
      return;
    }

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
    const acceptorUser = await this.usersService.findOrCreate(acceptorUserData);
    const acceptorId = acceptorUser._id;

    try {
      // Verificar se a operação existe e está disponível
      const operation = await this.operationsService.getOperationById(
        new Types.ObjectId(operationId),
      );

      // Validação de grupo removida - permitir aceitar operações de qualquer grupo

      // Verificar se o usuário não está tentando aceitar sua própria operação
      if (operation.creator.toString() === acceptorId.toString()) {
        await ctx.reply('▼ Você não pode aceitar sua própria operação.');
        return;
      }

      // Aceitar a operação
      const acceptedOperation = await this.operationsService.acceptOperation(
        new Types.ObjectId(operationId),
        acceptorId,
      );

      // Buscar informações do usuário criador (acceptorUser já foi obtido acima)
      const creatorUser = await this.usersService.findById(acceptedOperation.creator.toString());

      // Buscar reputação de ambos (usar karma total se não encontrar no grupo atual)
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
      
      // Determinar ordem de transferência (menor reputação transfere primeiro)
      const creatorTransfersFirst = creatorReputation <= acceptorReputation;
      const firstTransferer = creatorTransfersFirst ? 
        { name: creatorName, reputation: creatorReputation, icons: { nivel: creatorIcons.nivel, icone: creatorIcons.icone }, role: 'Criador' } :
        { name: acceptorName, reputation: acceptorReputation, icons: { nivel: acceptorIcons.nivel, icone: acceptorIcons.icone }, role: 'Negociador' };
      const secondTransferer = creatorTransfersFirst ? 
        { name: acceptorName, reputation: acceptorReputation, icons: { nivel: acceptorIcons.nivel, icone: acceptorIcons.icone }, role: 'Negociador' } :
        { name: creatorName, reputation: creatorReputation, icons: { nivel: creatorIcons.nivel, icone: creatorIcons.icone }, role: 'Criador' };
      
      // Formatar quantidade conforme tipo de ativo
      const formattedAmount = this.formatValueByAsset(acceptedOperation.amount, acceptedOperation.assets);
      const currencySuffix = this.getCurrencySuffix(acceptedOperation.assets);
      
      // Verificar tipo de cotação para exibir informações corretas
      const isGoogleQuotation = acceptedOperation.quotationType === 'google';
      const priceText = isGoogleQuotation ? 'Calculado na Transação' : `R$ ${(acceptedOperation.amount * acceptedOperation.price).toFixed(2)}`;
      const quotationText = isGoogleQuotation ? 'Google' : `R$ ${acceptedOperation.price.toFixed(2)}`;
      
      // Não enviar mensagem aqui - deixar que o broadcast service gerencie
      // A mensagem será enviada via notifyOperationAccepted no operations.service.ts

      this.logger.log(
        `Operation ${operationId} accepted by user ${acceptorId} in group ${ctx.chat.id}`,
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

    // Outros casos (XRP, etc.) - 2 casas decimais por padrão
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
      // VALIDAÇÃO CRÍTICA: Verificar se usuário aceitou os termos
      const { validateUserTermsForCallback } = await import('../../../shared/terms-validation.utils');
      const isValid = await validateUserTermsForCallback(ctx, this.termsAcceptanceService, 'aceitar');
      if (!isValid) {
        return true;
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
      
      // Verificar se não é o próprio criador tentando aceitar
      if (operation.creator.toString() === ctx.from.id.toString()) {
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
      
      // Buscar ou criar usuário aceitador
      const acceptorUser = await this.usersService.findOrCreate({
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name
      });
      
      // Processar a aceitação da operação
      await this.operationsService.acceptOperation(new Types.ObjectId(operationId), acceptorUser._id);
      
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