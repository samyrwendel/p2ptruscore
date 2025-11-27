import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Markup } from 'telegraf';
import { Types } from 'mongoose';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { OperationsService } from '../../../operations/operations.service';
import { OperationsBroadcastService } from '../../../operations/operations-broadcast.service';
import { CurrencyApiService } from '../../../operations/currency-api.service';
import { BinancePriceService } from '../../../integrations/binance-price.service';
import { PendingEvaluationService } from '../../../operations/pending-evaluation.service';
import { UsersService } from '../../../users/users.service';
import { GroupsService } from '../../../groups/groups.service';
import { TermsAcceptanceService } from '../../../users/terms-acceptance.service';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import { PopupStateService } from '../../shared/popup-state.service';
import { validateUserTermsForOperation } from '../../../shared/terms-validation.utils';
import { validateActiveMembership } from '../../../shared/group-membership.utils';
import { getOrCreateUserFromCtx } from '../../shared/user.utils';
import { pendingEvaluationGuard } from '../../shared/pending-eval.guard';
import { safeAnswerCbQuery } from '../../shared/callback.utils';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';
  import {
    OperationType,
    NetworkType,
    AssetType,
    QuotationType,
    QuotationSource,
    OperationStatus,
  } from '../../../operations/schemas/operation.schema';

  interface OperationSession {
    step: 'type' | 'assets_networks' | 'amount_quotation' | 'price' | 'payment' | 'description' | 'description_payment' | 'confirmation';
    messageId?: number;
    timestamp: number; // Para cleanup
    data: {
      type?: OperationType;
      assets?: AssetType[];
      networks?: NetworkType[];
      amount?: number;
      quotationType?: QuotationType;
      price?: number | null;
      quotationSource?: QuotationSource;
      paymentMethods?: string[];
      description?: string;
    };
  }

@Injectable()
export class CriarOperacaoCommandHandler implements ITextCommandHandler, OnModuleDestroy {
  private readonly logger = new Logger(CriarOperacaoCommandHandler.name);
  command = /^\/(criaroperacao|iniciar)(?:@\w+)?$/;
  private sessions = new Map<string, OperationSession>();
  private cleanupTimer: NodeJS.Timeout;

  constructor(
    private readonly operationsService: OperationsService,
    private readonly broadcastService: OperationsBroadcastService,
    private readonly currencyApiService: CurrencyApiService,
    private readonly binancePriceService: BinancePriceService,
    private readonly pendingEvaluationService: PendingEvaluationService,
    private readonly usersService: UsersService,
    private readonly groupsService: GroupsService,
    private readonly termsAcceptanceService: TermsAcceptanceService,
    private readonly keyboardService: TelegramKeyboardService,
    private readonly popupStateService: PopupStateService,
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
  ) {
    // Limpar sessões antigas a cada 10 minutos
    this.cleanupTimer = setInterval(() => this.cleanupExpiredSessions(), 10 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.logger.log('Cleanup timer cleared');
    }
    // Limpar todas as sessões
    this.sessions.clear();
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiryTime = 60 * 60 * 1000; // 1 hora
    let cleaned = 0;

    for (const [key, session] of this.sessions.entries()) {
      if (now - session.timestamp > expiryTime) {
        this.sessions.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned ${cleaned} expired sessions`);
    }
  }

  async handle(ctx: TextCommandContext): Promise<void> {
    if (ctx.chat.type !== 'private') {
      await ctx.reply(
        '🔒 Este comando só pode ser usado em chat privado com o bot.\n\n' +
        '💡 Clique em @p2pscorebot para iniciar um chat privado e criar sua operação.',
      );
      return;
    }

    const sessionKey = `${ctx.from.id}_${ctx.chat.id}`;
    
    // Iniciar nova sessão
    this.sessions.set(sessionKey, {
      step: 'type',
      timestamp: Date.now(),
      data: {},
    });

    await this.showTypeSelection(ctx);
  }

  private async showTypeSelection(ctx: TextCommandContext): Promise<void> {
    const sessionKey = `${ctx.from.id}_${ctx.chat.id}`;
    const session = this.sessions.get(sessionKey);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🟢 QUERO COMPRAR', 'op_type_buy'),
        Markup.button.callback('🔴 QUERO VENDER', 'op_type_sell'),
      ],
      [
        Markup.button.callback('📰 QUERO ANUNCIAR', 'op_type_announcement'),
        Markup.button.callback('🔁 QUERO TROCAR', 'op_type_exchange'),
      ],
      [Markup.button.callback('❌ Cancelar', 'op_cancel')],
    ]);

    const message = await ctx.reply(
      '💼 **Criar Nova Operação P2P**\n\n' +
      'Escolha o tipo de operação:',
      { parse_mode: 'Markdown', ...keyboard }
    );
    
    if (session) {
      session.messageId = message.message_id;
    }
  }

  private async showAssetsAndNetworksSelection(ctx: any, operationType: OperationType): Promise<void> {
    const sessionKey = `${ctx.from.id}_${ctx.message?.chat?.id || ctx.chat?.id}`;
    const session: OperationSession = {
      step: 'assets_networks',
      timestamp: Date.now(),
      data: { type: operationType, assets: [], networks: [] },
    };
    this.sessions.set(sessionKey, session);

    // Usar a função refatorada para gerar o keyboard completo
    const keyboard = this.createOperationKeyboard(session);
    const selectedAssets = session?.data.assets || [];
    const selectedNetworks = session?.data.networks || [];

    // Adicionar botões de navegação
    keyboard.reply_markup.inline_keyboard.push(
      [],
      [
        Markup.button.callback('⬅️ Voltar', 'op_back_type'),
        Markup.button.callback(
          `${selectedAssets.length > 0 && selectedNetworks.length > 0 ? '✅' : '✔️'} Continuar`, 
          'op_assets_networks_continue'
        ),
      ],
      [
        Markup.button.callback('❌ Cancelar', 'op_cancel'),
      ]
    );

    const typeText = this.getOperationTypeText(operationType);
    const assetsText = selectedAssets.length > 0 ? selectedAssets.join(', ') : 'Nenhum';
    const networksText = selectedNetworks.length > 0 ? selectedNetworks.map(n => n.toUpperCase()).join(', ') : 'Nenhuma';
    const quotationText = this.getQuotationText(session?.data.quotationType);
    
    const message = await ctx.editMessageText(
      `💼 **Criar Nova Operação P2P**\n\n` +
      `${typeText}\n\n` +
      `**Ativos:** ${assetsText}\n` +
      `**Redes:** ${networksText}\n` +
      `**Cotação:** ${quotationText}\n\n` +
      '💡 Selecione ativos, redes e tipo de cotação',
      { parse_mode: 'Markdown', ...keyboard }
    );
    
    session.messageId = message.message_id;
  }

  private async showNetworkSelection(ctx: any): Promise<void> {
    const sessionKey = `${ctx.from.id}_${ctx.message?.chat?.id || ctx.chat?.id}`;
    const session = this.sessions.get(sessionKey);
    
    if (session) {
      session.step = 'assets_networks';
      if (!session.data.networks) {
        session.data.networks = [];
      }
    }

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('⚪ ARB', 'op_network_arbitrum'),
        Markup.button.callback('🟣 POL', 'op_network_polygon'),
        Markup.button.callback('🔵 BASE', 'op_network_base'),
        Markup.button.callback('🟡 BNB', 'op_network_bnb'),
      ],
      [
        Markup.button.callback('🟪 SOLANA', 'op_network_solana'),
      ],
      [
        Markup.button.callback('⬜ ETH', 'op_network_eth'),
      ],
      [

      ],
      [
        Markup.button.callback('⬅️ Voltar', 'op_back_assets'),
        Markup.button.callback('✔️ Continuar', 'op_networks_continue'),
      ],
      [
        Markup.button.callback('❌ Cancelar', 'op_cancel'),
      ],
    ]);

    const typeText = session?.data.type === OperationType.BUY ? '🟢 QUERO COMPRAR' : session?.data.type === OperationType.SELL ? '🔴 QUERO VENDER' : session?.data.type === OperationType.ANNOUNCEMENT ? '📰 QUERO ANUNCIAR' : '🔁 QUERO TROCAR';
    const assetsText = session?.data.assets?.join(', ') || 'Nenhum';
    
    const message = await ctx.editMessageText(
      `💼 **Criar Nova Operação P2P**\n\n` +
      `${typeText}\n` +
      `Ativos: ${assetsText}\n\n` +
      'Escolha a(s) rede(s):\n' +
      '💡 Você pode selecionar múltiplas redes',
      { parse_mode: 'Markdown', ...keyboard }
    );
    
    if (session) {
      session.messageId = message.message_id;
    }
  }

  private async showAmountAndQuotationInput(ctx: any): Promise<void> {
    const sessionKey = `${ctx.from.id}_${ctx.message?.chat?.id || ctx.chat?.id}`;
    const session = this.sessions.get(sessionKey);
    
    if (session) {
      session.step = 'amount_quotation';
    }

    const keyboard = Markup.inlineKeyboard([
      // Separador COTAÇÃO
      [],
      [
        Markup.button.callback('✋ Manual', 'op_quote_manual'),
        Markup.button.callback('🌐 Google', 'op_quote_google'),
        Markup.button.callback('🟡 Binance', 'op_quote_binance'),
      ],
      [],
      [
        Markup.button.callback('⬅️ Voltar', 'op_back_networks'),
        Markup.button.callback('❌ Cancelar', 'op_cancel'),
      ],
    ]);

    const typeText = session?.data.type === OperationType.BUY ? '🟢 QUERO COMPRAR' : session?.data.type === OperationType.SELL ? '🔴 QUERO VENDER' : session?.data.type === OperationType.ANNOUNCEMENT ? '📰 QUERO ANUNCIAR' : '🔁 QUERO TROCAR';
    const assetsText = session?.data.assets?.join(', ') || 'Nenhum';
    const networksText = session?.data.networks?.map(n => n.toUpperCase()).join(', ') || 'Nenhuma';
    
    // Determinar texto baseado no tipo de operação
    const actionText = session?.data.type === OperationType.BUY ? 'comprar' : session?.data.type === OperationType.SELL ? 'vender' : 'negociar';
    const valueText = 'VALOR';
    
    const message = await ctx.editMessageText(
      `💼 **Criar Nova Operação P2P**\n\n` +
      `${typeText}\n` +
      `Ativos: ${assetsText}\n` +
      `Redes: ${networksText}\n\n` +
      `💰 **${valueText}**\n` +
      `Digite o valor total que deseja ${actionText}:\n\n` +
      `Exemplo: 1000\n\n` +
      `━━━━━━━━ COTAÇÃO ━━━━━━━━\n\n` +
      `Escolha o tipo de cotação:\n` +
      `• **Manual:** Você define o preço\n` +
      `• **Google:** Cotação automática (forex)\n` +
      `• **Binance:** Cotação crypto em tempo real`,
      { parse_mode: 'Markdown', ...keyboard }
    );
    
    if (session) {
      session.messageId = message.message_id;
    }
  }

  async handleCallback(ctx: any): Promise<boolean> {
    const data = ctx.callbackQuery.data;
    const sessionKey = `${ctx.from.id}_${ctx.chat.id}`;

    // Verificar se este callback pertence a este handler
    if (!data.startsWith('op_') && !data.startsWith('view_operation_details_') && !data.startsWith('back_to_operation_') && !this.sessions.has(sessionKey)) {
      return false; // Não é um callback deste handler
    }

    // Bloqueio por avaliação pendente APENAS para callbacks deste fluxo
    try {
      const isCancel = data === 'op_cancel';
      if (!isCancel) {
        const user = await getOrCreateUserFromCtx(ctx, this.usersService);
        if (user) {
          const res = await pendingEvaluationGuard(ctx, user._id, 'criar', 'callback', this.pendingEvaluationService);
          if (res.blocked) return true;
        }
      }
    } catch (error) {
      this.logger.error('Erro ao checar avaliações pendentes no callback de criação:', error);
    }

    // Processar callbacks de operações criadas
    if (data.startsWith('view_operation_details_')) {
      const operationId = data.replace('view_operation_details_', '');
      
      await safeAnswerCbQuery(ctx);
      
      try {
        const operation = await this.operationsService.getOperationById(new Types.ObjectId(operationId));
        if (!operation) {
          await ctx.editMessageText('❌ Operação não encontrada.');
          return true;
        }
        
        const typeText = operation.type === 'buy' ? 'COMPRA' : 'VENDA';
        const total = operation.amount * operation.price;
        
        const detailsMessage = 
          `📊 **Detalhes da Operação**\n\n` +
          `🔹 **Tipo:** ${typeText}\n` +
          `💰 **Ativos:** ${operation.assets.join(', ')}\n` +
          `🌐 **Redes:** ${operation.networks.map(n => n.toUpperCase()).join(', ')}\n` +
          `📊 **Quantidade:** ${operation.amount}\n` +
          `💵 **Preço Unitário:** R$ ${operation.price.toFixed(2)}\n` +
          `💸 **Total:** R$ ${total.toFixed(2)}\n` +
          `📝 **Descrição:** ${operation.description || 'Sem descrição'}\n` +
           `⏰ **Status:** ${operation.status === OperationStatus.PENDING ? 'Pendente' : operation.status}`;
        
        const backKeyboard = {
          inline_keyboard: [
            [
              {
                text: '🔙 Voltar',
                callback_data: `back_to_operation_${operationId}`
              }
            ]
          ]
        };
        
        await ctx.editMessageText(detailsMessage, {
          parse_mode: 'Markdown',
          reply_markup: backKeyboard
        });
        
      } catch (error) {
        this.logger.error('Erro ao buscar detalhes da operação:', error);
        await ctx.editMessageText('❌ Erro ao carregar detalhes da operação.');
      }
      
      return true;
    }
    
    if (data.startsWith('back_to_operation_')) {
      const operationId = data.replace('back_to_operation_', '');
      
      try {
        await ctx.answerCbQuery();
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado - voltar:', cbError.description);
        }
      }
      
      try {
        const operation = await this.operationsService.getOperationById(new Types.ObjectId(operationId));
        if (!operation) {
          await ctx.editMessageText('❌ Operação não encontrada.');
          return true;
        }
        
        // Usar exatamente a mesma formatação da mensagem original
        const typeEmoji = operation.type === 'buy' ? '🟢' : operation.type === 'sell' ? '🔴' : operation.type === 'announcement' ? '📰' : '🔁';
        const typeText = operation.type === 'buy' ? 'COMPRA' : operation.type === 'sell' ? 'VENDA' : operation.type === 'announcement' ? 'ANÚNCIO' : 'TROCA';
        const assetsText = operation.assets.join(', ');
        
        // Calcular total e formatação
        const total = operation.amount * operation.price;
        const networksText = operation.networks.map(n => n.toUpperCase()).join(', ');
        const quotationText = operation.quotationType === 'google' ? '🌐 GOOGLE' : 
                           operation.quotationType === 'binance' ? '🟡 BINANCE' : 
                           operation.quotationType.toUpperCase();
        
        // Formatação da data de expiração
        const expirationDate = new Date(operation.expiresAt);
        const now = new Date();
        const diffMs = expirationDate.getTime() - now.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const expiresIn = `${diffHours}h ${diffMinutes}m`;
        
        let confirmationMessage = (
          `✅ **Operação Criada com Sucesso!**\n\n` +
          `${typeEmoji} **${typeText} ${assetsText}**\n` +
          `Redes: ${networksText}\n`
        );
        
        // Exibir cotação e fonte quando for Google ou Binance
        if (operation.quotationType === 'google' || operation.quotationType === 'binance') {
          confirmationMessage += `**Cotação:** (calculada na transação)\n`;
          const fonte = operation.quotationType === 'google' ? '🌐 Google' : '🟡 Binance';
          confirmationMessage += `**Fonte:** ${fonte}\n`;
        }
        
        confirmationMessage += `**Quantidade:** ${operation.amount} (total)\n\n`;
        
        if (operation.quotationType !== 'google' && operation.quotationType !== 'binance') {
          const assetsText = operation.assets.join(', ');
          const buyText = operation.type === 'buy' ? `${operation.amount} ${assetsText}` : `${operation.amount} ${assetsText}`;
          const payText = operation.type === 'buy' ? `R$ ${total.toFixed(2)}` : `R$ ${total.toFixed(2)}`;
          const actionText = operation.type === 'buy' ? 'Quero comprar' : 'Quero vender';
          
          // Setas corrigidas: ⬅️ para receber (entrada), ➡️ para pagar (saída)
          const arrowIcon = operation.type === 'buy' ? '⬅️' : '➡️';
          const paymentArrow = operation.type === 'buy' ? '➡️' : '⬅️';
          const paymentText = operation.type === 'buy' ? 'Quero pagar' : 'Quero receber';
          
          confirmationMessage += (
            `${arrowIcon} **${actionText}:** ${buyText}\n` +
            `${paymentArrow} **${paymentText}:** ${payText}\n` +
            `💱 **Cotação:** ${operation.price.toFixed(2)}\n\n`
          );
        }
        
        confirmationMessage += (
          `⏰ **Expira em:** ${expiresIn}\n` +
          `🆔 **ID:** \`${operation._id}\`\n\n` +
          `🚀 **Sua operação está sendo enviada para todos os grupos ativos...**\n\n` +
          `Use os botões abaixo para gerenciar sua operação:`
        );
        
        // Usar o método que verifica o status da operação para mostrar botões apropriados
        const controlKeyboard = this.createOperationControlKeyboard(operation);
        
        await ctx.editMessageText(confirmationMessage, {
          parse_mode: 'Markdown',
          reply_markup: controlKeyboard
        });
        
      } catch (error) {
        this.logger.error('Erro ao voltar para operação:', error);
        await ctx.editMessageText('❌ Erro ao carregar operação.');
      }
      
      return true;
    }

    if (data === 'op_cancel') {
      this.sessions.delete(sessionKey);
      
      // Responder com popup temporário
      try {
        await ctx.answerCbQuery('❌ Operação cancelada com sucesso!', { show_alert: false });
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado - cancelamento:', cbError.description);
        } else {
          this.logger.error('Erro ao responder callback - cancelamento:', cbError);
        }
      }
      
      // Editar mensagem com notificação temporária
      const tempMessage = await ctx.editMessageText(
        '❌ **Operação Cancelada**\n\n' +
        '✔️ A criação da operação foi cancelada com sucesso.\n\n' +
        '_Esta mensagem será removida em 3 segundos..._',
        { parse_mode: 'Markdown' }
      );
      
      // Deletar a mensagem após 3 segundos
      setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(ctx.chat.id, tempMessage.message_id);
        } catch (error) {
          // Ignora erro se a mensagem já foi deletada
          this.logger.warn('Could not delete temporary cancellation message:', error.message);
        }
      }, 3000);
      
      return true;
    }

    // Tratar callback de cotação sugerida
    if (data.startsWith('op_use_suggested_price_')) {
      const session = this.sessions.get(sessionKey);
      const priceStr = data.replace('op_use_suggested_price_', '');
      const suggestedPrice = parseFloat(priceStr);
      
      if (session && !isNaN(suggestedPrice)) {
        // Definir o preço sugerido na sessão
        session.data.price = suggestedPrice;
        // Registrar fonte utilizada para cotação manual sugerida
        session.data.quotationSource = QuotationSource.GOOGLE;
        
        // Responder ao callback
        try {
          const currency = session.data.type === OperationType.EXCHANGE ? 
            (session.data.assets?.[0] === AssetType.EURO ? '$' : '€') : 'R$';
          await ctx.answerCbQuery(
            `🌐 Cotação AwesomeAPI aplicada: ${currency} ${suggestedPrice.toFixed(session.data.type === OperationType.EXCHANGE ? 4 : 2)}`,
            { show_alert: false }
          );
        } catch (cbError: any) {
          if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
            this.logger.warn('Callback query expirado - cotação aplicada:', cbError.description);
          } else {
            this.logger.error('Erro ao responder callback - cotação aplicada:', cbError);
          }
        }
        
        // Avançar para próxima etapa (descrição)
        await this.showDescriptionInput(ctx);
      }
      
      return true;
    }

    // Tratar callback de cotação Binance
    if (data.startsWith('op_use_binance_price_')) {
      const session = this.sessions.get(sessionKey);
      const priceStr = data.replace('op_use_binance_price_', '');
      const binancePrice = parseFloat(priceStr);
      
      if (session && !isNaN(binancePrice)) {
        // Definir o preço Binance na sessão
        session.data.price = binancePrice;
        // Registrar fonte utilizada para cotação manual sugerida
        session.data.quotationSource = QuotationSource.BINANCE;
        
        // Responder ao callback
        try {
          await ctx.answerCbQuery(
            `🟡 Cotação Binance aplicada: R$ ${binancePrice.toFixed(2)}`,
            { show_alert: false }
          );
        } catch (cbError: any) {
          if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
            this.logger.warn('Callback query expirado - cotação Binance aplicada:', cbError.description);
          } else {
            this.logger.error('Erro ao responder callback - cotação Binance aplicada:', cbError);
          }
        }
        
        // Avançar para próxima etapa (descrição)
        await this.showDescriptionInput(ctx);
      }
      
      return true;
    }

    if (data.startsWith('op_type_')) {
      const type = data.replace('op_type_', '') as OperationType;
      await this.showAssetsAndNetworksSelection(ctx, type);
    } else if (data.startsWith('op_asset_')) {
      const session = this.sessions.get(sessionKey);
      if (session) {
        const asset = data.replace('op_asset_', '') as AssetType;
        if (!session.data.assets) session.data.assets = [];
        if (!session.data.networks) session.data.networks = [];
        
        if (session.data.assets.includes(asset)) {
          // Remove se já estiver selecionado
          session.data.assets = session.data.assets.filter(a => a !== asset);
          
          // Se removeu uma moeda fiat, remove também a rede fiat se não há outras moedas fiat
          if ([AssetType.DOLAR, AssetType.EURO, AssetType.REAL].includes(asset)) {
            const hasFiatAssets = session.data.assets.some(a => [AssetType.DOLAR, AssetType.EURO, AssetType.REAL].includes(a));
            if (!hasFiatAssets) {
              session.data.networks = session.data.networks.filter(n => n !== NetworkType.FIAT);
            }
          }
        } else {
          // Verificar compatibilidade antes de adicionar
          const isCompatible = this.isAssetCompatible(session.data.assets, asset);
          
          if (!isCompatible) {
            // Mostrar mensagem de erro sobre incompatibilidade
            await ctx.answerCbQuery('❌ Não é possível misturar stablecoins com BTC/ETH/XRP ou moedas FIAT. Escolha ativos do mesmo tipo.', { show_alert: true });
            return true;
          }
          
          // Adiciona se não estiver selecionado e for compatível
          session.data.assets.push(asset);
          
          // Se selecionou uma moeda fiat, adiciona automaticamente a rede fiat
          if ([AssetType.DOLAR, AssetType.EURO, AssetType.REAL].includes(asset)) {
            if (!session.data.networks.includes(NetworkType.FIAT)) {
              session.data.networks.push(NetworkType.FIAT);
            }
          }
        }
        
        await this.updateAssetsAndNetworksSelection(ctx, session);
      }

    } else if (data === 'op_assets_networks_continue') {
      const session = this.sessions.get(sessionKey);
      if (session) {
        const hasAssets = session.data.assets && session.data.assets.length > 0;
        const hasNetworks = session.data.networks && session.data.networks.length > 0;
        const hasPayment = session.data.paymentMethods && session.data.paymentMethods.length > 0;
        const hasQuotation = session.data.quotationType !== undefined;
        
        if (!hasAssets || !hasNetworks) {
          await ctx.answerCbQuery('⚠️ Selecione pelo menos um ativo e uma rede para continuar', { show_alert: true });
          return true;
        }
        
        if (!hasPayment) {
          await ctx.answerCbQuery('⚠️ Selecione pelo menos um método de pagamento para continuar', { show_alert: true });
          return true;
        }
        
        if (!hasQuotation) {
          await ctx.answerCbQuery('⚠️ Selecione o tipo de cotação para continuar', { show_alert: true });
          return true;
        }
      }
      await this.showValueInput(ctx);
    } else if (data.startsWith('op_network_')) {
      const session = this.sessions.get(sessionKey);
      if (session) {
        // Mapear callbacks para valores corretos do enum NetworkType
        const networkMap: { [key: string]: NetworkType } = {
          'arbitrum': NetworkType.ARBITRUM,
          'polygon': NetworkType.POLYGON,
          'base': NetworkType.BASE,
          'bnb': NetworkType.BNB,
          'solana': NetworkType.SOLANA,
          'btc': NetworkType.BTC,
          'eth': NetworkType.ETH
        };
        
        const networkKey = data.replace('op_network_', '');
        const network = networkMap[networkKey];
        
        if (network) {
          if (!session.data.networks) session.data.networks = [];
          
          if (session.data.networks.includes(network)) {
            // Remove se já estiver selecionado
            session.data.networks = session.data.networks.filter(n => n !== network);
          } else {
            // Adiciona se não estiver selecionado
            session.data.networks.push(network);
          }
          
          await this.updateAssetsAndNetworksSelection(ctx, session);
        }
      }

    } else if (data === 'op_networks_continue') {
      await this.showAmountAndQuotationInput(ctx);
    } else if (data === 'op_back_type') {
      await this.updateTypeSelection(ctx);
    } else if (data === 'op_back_assets') {
      const session = this.sessions.get(sessionKey);
      if (session) {
        await this.updateAssetsAndNetworksSelection(ctx, session);
      }
    } else if (data === 'op_back_networks') {
      await this.updateNetworkSelectionBack(ctx);
    } else if (data === 'op_quote_manual') {
      const session = this.sessions.get(sessionKey);
      if (session) {
        session.data.quotationType = QuotationType.MANUAL;
        await ctx.answerCbQuery('✋ Cotação Manual selecionada.', { show_alert: false });
        await this.updateAssetsAndNetworksSelection(ctx, session);
      }
    } else if (data === 'op_quote_google') {
      const session = this.sessions.get(sessionKey);
      if (session) {
        session.data.quotationType = QuotationType.GOOGLE;
        await ctx.answerCbQuery('🌐 Cotação Google selecionada.', { show_alert: false });
        // Voltar para a tela de seleção para permitir revisão
        await this.updateAssetsAndNetworksSelection(ctx, session);
      }
    } else if (data === 'op_quote_binance') {
      const session = this.sessions.get(sessionKey);
      if (session) {
        session.data.quotationType = QuotationType.BINANCE;
        await ctx.answerCbQuery('🟡 Cotação Binance selecionada.', { show_alert: false });
        // Voltar para a tela de seleção para permitir revisão
        await this.updateAssetsAndNetworksSelection(ctx, session);
      }
    } else if (data.startsWith('op_payment_')) {
      const session = this.sessions.get(sessionKey);
      if (session) {
        const paymentMethod = data.replace('op_payment_', '');
        
        if (paymentMethod === 'continue') {
          // Processar continuação com múltiplas seleções
          if (!session.data.paymentMethods || session.data.paymentMethods.length === 0) {
            await ctx.answerCbQuery('⚠️ Selecione pelo menos um método de pagamento!');
            return true;
          }
          await this.showDescriptionInput(ctx);
        } else if (paymentMethod === 'outros') {
          session.step = 'payment';
          
          // Deletar a mensagem anterior se existir
          if (session.messageId) {
            try {
              await ctx.deleteMessage(session.messageId);
            } catch (error) {
              // Ignorar erro se a mensagem já foi deletada
            }
          }
          
          const message = await ctx.reply(
            'Digite o método de pagamento personalizado:\n\n' +
            'Exemplo: Transferência bancária, Crypto específica, etc.'
          );
          
          session.messageId = message.message_id;
        } else {
          // Métodos predefinidos - toggle seleção
          const paymentNames = {
            'pix': 'PIX',
            'boleto': 'Boleto',
            'dolar': 'Dólar',
            'euro': 'Euro',
            'paypal': 'PayPal'
          };
          
          const methodName = paymentNames[paymentMethod] || paymentMethod;
          
          // Inicializar array se não existir
          if (!session.data.paymentMethods) {
            session.data.paymentMethods = [];
          }
          
          // Toggle seleção
          const index = session.data.paymentMethods.indexOf(methodName);
          if (index > -1) {
            // Remover se já selecionado
            session.data.paymentMethods.splice(index, 1);
          } else {
            // Adicionar se não selecionado
            session.data.paymentMethods.push(methodName);
          }
          
          // Atualizar interface na tela principal
          await this.updateAssetsAndNetworksSelection(ctx, session);
        }
      }
    } else if (data === 'op_description_payment_continue') {
      const session = this.sessions.get(sessionKey);
      if (session) {
        // Verificar se pelo menos um método de pagamento foi selecionado
        if (!session.data.paymentMethods || session.data.paymentMethods.length === 0) {
          await ctx.answerCbQuery('⚠️ Selecione pelo menos um método de pagamento.', { show_alert: true });
          return true;
        }
        await this.showConfirmation(ctx);
      }
    } else if (data === 'op_confirm_send') {
      const session = this.sessions.get(sessionKey);
      if (session) {
        // ✅ VALIDAÇÃO CRÍTICA: Verificar se usuário ainda é membro ativo antes de enviar ordem
        this.logger.log(`🔍 Validando membro ativo antes de enviar ordem - Usuário: ${ctx.from.id}`);
        
        const isActiveMember = await validateActiveMembership(ctx, this.bot, 'criar');
        if (!isActiveMember) {
          this.logger.warn(`❌ ORDEM BLOQUEADA - Usuário ${ctx.from.id} não é mais membro ativo durante envio`);
          
          // Limpar sessão pois usuário não pode mais continuar
          this.sessions.delete(sessionKey);
          
          // Popup específico para membros removidos durante operação
           try {
             await ctx.answerCbQuery(
               `🚫 ACESSO NEGADO\n\n` +
               `❌ Você foi removido do grupo!\n\n` +
               `📋 PARA CONTINUAR:\n` +
               `1️⃣ Volte ao grupo TrustScore P2P\n` +
               `2️⃣ Aceite os termos novamente\n` +
               `3️⃣ Inicie nova operação`,
               { show_alert: true }
             );
          } catch (error) {
            this.logger.error('Erro ao enviar popup de membro removido:', error);
          }
          
          return true;
        }
        
        // ✅ VALIDAÇÃO CRÍTICA: Verificar se usuário ainda tem termos aceitos
        this.logger.log(`🔍 Validando termos aceitos antes de enviar ordem - Usuário: ${ctx.from.id}`);
        
        const hasValidTerms = await validateUserTermsForOperation(ctx, this.termsAcceptanceService, 'criar');
        if (!hasValidTerms) {
          this.logger.warn(`❌ ORDEM BLOQUEADA - Usuário ${ctx.from.id} não tem termos aceitos durante envio`);
          
          // Limpar sessão pois usuário não pode mais continuar
          this.sessions.delete(sessionKey);
          
          return true; // validateUserTermsForOperation já envia o popup
        }
        
        this.logger.log(`✅ Validações aprovadas - Criando operação para usuário ${ctx.from.id}`);
        await this.createOperation(ctx, session);
      }
    } else if (data === 'op_back_description') {
      await this.updateDescriptionSelectionBack(ctx);
    } else if (data === 'op_back_quotation') {
      await this.updateQuotationSelection(ctx);
    } else if (data === 'op_back_payment') {
      await this.updatePaymentSelectionBack(ctx);
    } else if (data === 'op_back_amount') {
      await this.showValueInput(ctx);
    } else if (data === 'op_back_value') {
      await this.showValueInput(ctx);
    } else if (data === 'op_skip_description') {
      const session = this.sessions.get(sessionKey);
      if (session) {
        session.data.description = '';
        await this.showConfirmation(ctx);
      }
    }

    try {
      await ctx.answerCbQuery();
      return true; // Callback processado com sucesso
    } catch (cbError: any) {
      if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
        this.logger.warn('Callback query expirado - ignorando:', cbError.description);
        return true; // Ainda consideramos como processado
      } else {
        this.logger.error('Erro ao responder callback query:', cbError);
        return false; // Erro no processamento
      }
    }
  }

  hasActiveSession(sessionKey: string): boolean {
    return this.sessions.has(sessionKey);
  }

  private isAssetCompatible(existingAssets: AssetType[], newAsset: AssetType): boolean {
    if (!existingAssets || existingAssets.length === 0) {
      return true; // Primeiro ativo sempre é compatível
    }

    // Definir grupos de ativos
    const stablecoins = [AssetType.USDC, AssetType.USDT, AssetType.USDE];
    const cryptos: AssetType[] = [];
    const fiatCurrencies = [AssetType.DOLAR, AssetType.EURO, AssetType.REAL];

    // Verificar qual grupo o novo ativo pertence
    const newAssetIsStablecoin = stablecoins.includes(newAsset);
    const newAssetIsCrypto = cryptos.includes(newAsset);
    const newAssetIsFiat = fiatCurrencies.includes(newAsset);

    // Verificar grupos dos ativos existentes
    const hasStablecoins = existingAssets.some(asset => stablecoins.includes(asset));
    const hasCryptos = existingAssets.some(asset => cryptos.includes(asset));
    const hasFiat = existingAssets.some(asset => fiatCurrencies.includes(asset));

    // Regras de compatibilidade:
    // 1. Stablecoins podem ser misturadas entre si
    // 2. BTC, ETH, XRP não podem ser misturados com nada (cada um isolado)
    // 3. Moedas FIAT não podem ser misturadas com nada (cada uma isolada)
    
    if (newAssetIsStablecoin) {
      // Stablecoins só podem ser adicionadas se não há cryptos ou fiat
      return !hasCryptos && !hasFiat;
    }
    
    if (newAssetIsCrypto) {
      // Cryptos (ETH) não podem ser misturadas com nada
      return !hasStablecoins && !hasCryptos && !hasFiat;
    }
    
    if (newAssetIsFiat) {
      // Moedas FIAT não podem ser misturadas com nada
      return !hasStablecoins && !hasCryptos && !hasFiat;
    }

    return false; // Por segurança, rejeitar se não se encaixar em nenhum grupo
  }

  private async updateAssetsAndNetworksSelection(ctx: any, session: OperationSession): Promise<void> {
    // Usar a função refatorada para gerar o keyboard completo
    const keyboard = this.createOperationKeyboard(session);
    
    const typeText = this.getOperationTypeText(session?.data.type);
    const selectedAssets = session?.data.assets || [];
    const selectedNetworks = session?.data.networks || [];
    
    // Adicionar botões de navegação
    keyboard.reply_markup.inline_keyboard.push(
      [
        Markup.button.callback('⬅️ Voltar', 'op_back_type'),
        Markup.button.callback(
          `${selectedAssets.length > 0 && selectedNetworks.length > 0 ? '✅' : '✔️'} Continuar`, 
          'op_assets_networks_continue'
        ),
      ],
      [
        Markup.button.callback('❌ Cancelar', 'op_cancel'),
      ]
    );
    
    const assetsText = selectedAssets.length > 0 ? selectedAssets.join(', ') : 'Nenhum';
    const networksText = selectedNetworks.length > 0 ? selectedNetworks.map(n => n.toUpperCase()).join(', ') : 'Nenhuma';
    const quotationText = this.getQuotationText(session?.data.quotationType);
    const paymentText = session?.data.paymentMethods && session.data.paymentMethods.length > 0 ? session.data.paymentMethods.join(', ') : 'Nenhum';
    
    await ctx.editMessageText(
      `💼 **Criar Nova Operação P2P**\n\n` +
      `${typeText}\n\n` +
      `**Ativos:** ${assetsText}\n` +
      `**Redes:** ${networksText}\n` +
      `**Pagamento:** ${paymentText}\n` +
      `**Cotação:** ${quotationText}\n\n` +
      '💡 Selecione ativos, redes, pagamento e tipo de cotação',
      { parse_mode: 'Markdown', ...keyboard }
    );
  }

  // Função refatorada para criar keyboard completo e consistente
  private createOperationKeyboard(session: OperationSession): any {
    // Mapeamento de nomes de botões para valores do enum
    const networkButtonMap: { [key: string]: NetworkType } = {
      'ARB': NetworkType.ARBITRUM,
      'POL': NetworkType.POLYGON,
      'BASE': NetworkType.BASE,
      'BNB': NetworkType.BNB,
      'SOLANA': NetworkType.SOLANA,
      'ETH': NetworkType.ETH
    };
    
    // Funções para verificar seleções
    const isAssetSelected = (asset: string) => session?.data.assets?.includes(asset as AssetType) || false;
    const isNetworkSelected = (networkButton: string) => {
      const networkEnum = networkButtonMap[networkButton];
      return networkEnum ? session?.data.networks?.includes(networkEnum) || false : false;
    };
    const isPaymentSelected = (method: string) => session?.data.paymentMethods?.includes(method) || false;
    
    // Funções para criar botões com indicadores visuais
    const createAssetButton = (emoji: string, name: string, callback: string) => {
      const selected = isAssetSelected(name);
      const icon = selected ? '✔️' : emoji;
      return Markup.button.callback(`${icon} ${name}`, callback);
    };
    
    const createNetworkButton = (emoji: string, name: string, callback: string) => {
      const selected = isNetworkSelected(name);
      const icon = selected ? '✔️' : emoji;
      return Markup.button.callback(`${icon} ${name}`, callback);
    };

    const createQuotationButton = (emoji: string, name: string, callback: string) => {
      const selected = session?.data.quotationType === (
        callback === 'op_quote_manual' ? QuotationType.MANUAL : 
        callback === 'op_quote_google' ? QuotationType.GOOGLE :
        callback === 'op_quote_binance' ? QuotationType.BINANCE : null
      );
      const icon = selected ? '✔️' : emoji;
      return Markup.button.callback(`${icon} ${name}`, callback);
    };

    const createPaymentButton = (emoji: string, name: string, callback: string) => {
      // Mapear callbacks para nomes corretos armazenados na sessão
      const paymentNames = {
        'pix': 'PIX',
        'boleto': 'Boleto',
        'dolar': 'Dólar',
        'euro': 'Euro',
        'paypal': 'PayPal',
        'outros': 'Outros'
      };
      const methodKey = callback.replace('op_payment_', '');
      const methodName = paymentNames[methodKey] || methodKey;
      const selected = isPaymentSelected(methodName);
      const icon = selected ? '✔️' : emoji;
      return Markup.button.callback(`${icon} ${name}`, callback);
    };

    return Markup.inlineKeyboard([
      // Seção de Ativos
      [
        createAssetButton('🟢', 'USDT', 'op_asset_USDT'),
        createAssetButton('🔵', 'USDC', 'op_asset_USDC'),
        createAssetButton('⚫', 'USDe', 'op_asset_USDe'),
      ],
      [
        // createAssetButton('⚪', 'ETH', 'op_asset_ETH'),
      ],
      [
        createAssetButton('💵', 'DÓLAR', 'op_asset_DOLAR'),
        createAssetButton('💶', 'EURO', 'op_asset_EURO'),
        createAssetButton('💰', 'REAL', 'op_asset_REAL'),
      ],

      // Divisor visual - REDES
      [
        Markup.button.callback('━━━━━ REDES ━━━━━', 'op_divider'),
      ],
      // Seção de Redes
      [
        createNetworkButton('⚪', 'ARB', 'op_network_arbitrum'),
        createNetworkButton('🟣', 'POL', 'op_network_polygon'),
        createNetworkButton('🔵', 'BASE', 'op_network_base'),
      ],
      [
        createNetworkButton('🟡', 'BNB', 'op_network_bnb'),
        createNetworkButton('🟪', 'SOLANA', 'op_network_solana'),
        createNetworkButton('⬜', 'ETH', 'op_network_eth'),
      ],

      // Divisor visual - PAGAMENTO
      [
        Markup.button.callback(session?.data.type === OperationType.BUY ? '━━━━━ QUERO PAGAR EM ━━━━━' : '━━━━━ QUERO RECEBER EM ━━━━━', 'op_divider'),
      ],
      // Seção de Métodos de Pagamento
      [
        createPaymentButton('', 'PIX', 'op_payment_pix'),
        createPaymentButton('🧾', 'Boleto', 'op_payment_boleto'),
        createPaymentButton('💵', 'Dólar', 'op_payment_dolar'),
      ],
      [
        createPaymentButton('💶', 'Euro', 'op_payment_euro'),
        createPaymentButton('💙', 'PayPal', 'op_payment_paypal'),
        createPaymentButton('⚙️', 'Outros', 'op_payment_outros'),
      ],

      // Divisor visual - COTAÇÃO
      [
        Markup.button.callback('━━━━━ COTAÇÃO ━━━━━', 'op_divider'),
      ],
      // Seção de Cotação
      [
        createQuotationButton('✋', 'Manual', 'op_quote_manual'),
        createQuotationButton('🌐', 'Google', 'op_quote_google'),
        createQuotationButton('🟡', 'Binance', 'op_quote_binance'),
      ],
    ]);
  }

  // Funções auxiliares refatoradas
  private getOperationTypeText(type?: OperationType): string {
    switch (type) {
      case OperationType.BUY: return '🟢 QUERO COMPRAR';
      case OperationType.SELL: return '🔴 QUERO VENDER';
      case OperationType.ANNOUNCEMENT: return '📰 QUERO ANUNCIAR';
      case OperationType.EXCHANGE: return '🔁 QUERO TROCAR';
      default: return '';
    }
  }

  private getQuotationText(quotationType?: QuotationType): string {
    switch (quotationType) {
      case QuotationType.MANUAL: return '👋🏽MANUAL';
      case QuotationType.GOOGLE: return '🌐 GOOGLE';
      case QuotationType.BINANCE: return '🟡 BINANCE';
      default: return 'Nenhuma';
    }
  }

  // Função para formatar valores baseado no tipo de ativo
  private formatValueByAsset(value: number, assets: AssetType[]): string {
    if (!assets || assets.length === 0) {
      return value.toFixed(2);
    }

    // Verificar se tem BTC ou ETH (8 casas decimais)
    const hasCrypto = false;
    if (hasCrypto) {
      return value.toFixed(8);
    }

    // Verificar se tem stablecoins ou moedas fiat (2 casas decimais)
    const hasStablecoinOrFiat = assets.some(asset => 
      [AssetType.USDT, AssetType.USDC, AssetType.USDE, AssetType.DOLAR, AssetType.EURO, AssetType.REAL].includes(asset)
    );
    if (hasStablecoinOrFiat) {
      return value.toFixed(2);
    }

    // Outros casos (sem ETH) - 2 casas decimais por padrão
    return value.toFixed(2);
  }

  // Função para obter sufixo da moeda baseado nos ativos
  private getCurrencySuffix(assets: AssetType[]): string {
    if (!assets || assets.length === 0) {
      return '';
    }

    // Verificar se tem stablecoins
    const hasStablecoin = assets.some(asset => [AssetType.USDT, AssetType.USDC, AssetType.USDE].includes(asset));
    if (hasStablecoin) {
      return ' USD';
    }

    // Verificar se tem moedas fiat
    if (assets.includes(AssetType.REAL)) {
      return ' BRL';
    }
    if (assets.includes(AssetType.DOLAR)) {
      return ' USD';
    }
    if (assets.includes(AssetType.EURO)) {
      return ' EUR';
    }

    // Verificar se tem BTC
    

    // Verificar se tem ETH
    

    return '';
  }

  private async updateAssetSelection(ctx: any, session: OperationSession): Promise<void> {
    const selectedAssets = session.data.assets || [];
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(`${selectedAssets.includes(AssetType.USDT) ? '✔️' : '🟢'} USDT`, 'op_asset_USDT'),
        Markup.button.callback(`${selectedAssets.includes(AssetType.USDC) ? '✔️' : '🔵'} USDC`, 'op_asset_USDC'),
        Markup.button.callback(`${selectedAssets.includes(AssetType.USDE) ? '✔️' : '⚫'} USDe`, 'op_asset_USDe'),
      ],
      [
        Markup.button.callback(`${selectedAssets.includes(AssetType.ETH) ? '✔️' : '⚪'} ETH`, 'op_asset_ETH'),
      ],
      [
        Markup.button.callback(`${selectedAssets.includes(AssetType.DOLAR) ? '✔️' : '💵'} DÓLAR`, 'op_asset_DOLAR'),
        Markup.button.callback(`${selectedAssets.includes(AssetType.EURO) ? '✔️' : '💶'} EURO`, 'op_asset_EURO'),
        Markup.button.callback(`${selectedAssets.includes(AssetType.REAL) ? '✔️' : '💰'} REAL`, 'op_asset_REAL'),
      ],
      [

      ],
      [
        Markup.button.callback('⬅️ Voltar', 'op_back_type'),
        Markup.button.callback('✔️ Continuar', 'op_assets_continue'),
      ],
      [
        Markup.button.callback('❌ Cancelar', 'op_cancel'),
      ],
    ]);

    const typeText = session.data.type === OperationType.BUY ? '🟢 QUERO COMPRAR' : session.data.type === OperationType.SELL ? '🔴 QUERO VENDER' : session.data.type === OperationType.ANNOUNCEMENT ? '📰 QUERO ANUNCIAR' : '🔁 QUERO TROCAR';
    const selectedText = selectedAssets.length > 0 ? `\n\n✔️ **Selecionados:** ${selectedAssets.join(', ')}` : '';
    
    await ctx.editMessageText(
      `💼 **Criar Nova Operação P2P**\n\n` +
      `${typeText}\n\n` +
      'Escolha o(s) ativo(s):\n' +
      '💡 Você pode selecionar múltiplos ativos' +
      selectedText,
      { parse_mode: 'Markdown', ...keyboard }
    );
  }

  private async updateNetworkSelection(ctx: any, session: OperationSession): Promise<void> {
    const selectedNetworks = session.data.networks || [];
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(`${selectedNetworks.includes(NetworkType.ARBITRUM) ? '✔️' : '⚪'} ARB`, 'op_network_arbitrum'),
        Markup.button.callback(`${selectedNetworks.includes(NetworkType.POLYGON) ? '✔️' : '🟣'} POL`, 'op_network_polygon'),
        Markup.button.callback(`${selectedNetworks.includes(NetworkType.BASE) ? '✔️' : '🔵'} BASE`, 'op_network_base'),
      ],
      [
        Markup.button.callback(`${selectedNetworks.includes(NetworkType.BNB) ? '✔️' : '🟡'} BNB`, 'op_network_bnb'),
        Markup.button.callback(`${selectedNetworks.includes(NetworkType.SOLANA) ? '✔️' : '🟪'} SOLANA`, 'op_network_solana'),
        Markup.button.callback(`${selectedNetworks.includes(NetworkType.ETH) ? '✔️' : '⬜'} ETH`, 'op_network_eth'),
      ],
      [
      ],
      [
        Markup.button.callback('⬅️ Voltar', 'op_back_assets'),
        Markup.button.callback('✔️ Continuar', 'op_networks_continue'),
      ],
      [
        Markup.button.callback('❌ Cancelar', 'op_cancel'),
      ],
    ]);

    const typeText = session.data.type === OperationType.BUY ? '🟢 QUERO COMPRAR' : session.data.type === OperationType.SELL ? '🔴 QUERO VENDER' : session.data.type === OperationType.ANNOUNCEMENT ? '📰 QUERO ANUNCIAR' : '🔁 QUERO TROCAR';
    const assetsText = session.data.assets?.join(', ') || 'Nenhum';
    const selectedText = selectedNetworks.length > 0 ? `\n\n✔️ **Selecionadas:** ${selectedNetworks.map(n => n.toUpperCase()).join(', ')}` : '';
    
    await ctx.editMessageText(
      `💼 **Criar Nova Operação P2P**\n\n` +
      `${typeText}\n` +
      `Ativos: ${assetsText}\n\n` +
      'Escolha a(s) rede(s):\n' +
      '💡 Você pode selecionar múltiplas redes' +
      selectedText,
      { parse_mode: 'Markdown', ...keyboard }
    );
  }

  private async updatePaymentSelection(ctx: any, session: OperationSession): Promise<void> {
    // Inicializar array de métodos de pagamento se não existir
    if (!session.data.paymentMethods) {
      session.data.paymentMethods = [];
    }

    // Função para verificar se um método está selecionado
    const isSelected = (method: string) => session?.data.paymentMethods?.includes(method) || false;
    
    // Função para criar botão com indicador visual
    const createPaymentButton = (emoji: string, name: string, callback: string) => {
      const selected = isSelected(name);
      const icon = selected ? '✔️' : emoji;
      return Markup.button.callback(`${icon} ${name}`, callback);
    };

    const selectedMethods = session?.data.paymentMethods || [];
    
    const keyboard = Markup.inlineKeyboard([
      [
        createPaymentButton('', 'PIX', 'op_payment_pix'),
        createPaymentButton('🧾', 'Boleto', 'op_payment_boleto'),
        createPaymentButton('💵', 'Dólar', 'op_payment_dolar'),
      ],
      [
        createPaymentButton('💶', 'Euro', 'op_payment_euro'),
        createPaymentButton('💙', 'PayPal', 'op_payment_paypal'),
        createPaymentButton('⚙️', 'Outros', 'op_payment_outros'),
      ],
      [
        Markup.button.callback('⬅️ Voltar', 'op_back_quotation'),
        Markup.button.callback(`${selectedMethods.length > 0 ? '✅' : '✔️'} Continuar`, 'op_payment_continue'),
      ],
      [
        Markup.button.callback('❌ Cancelar', 'op_cancel'),
      ],
    ]);

    const typeText = session?.data.type === OperationType.BUY ? 'pagar' : 'receber';
    const selectedText = selectedMethods.length > 0 
      ? `\n\n🎯 **Selecionados:** ${selectedMethods.join(', ')}`
      : '';
    
    await ctx.editMessageText(
      `💼 **Método de Pagamento**\n\n` +
      `Como você quer ${typeText}?\n\n` +
      '💡 Selecione um ou mais métodos de pagamento' +
      selectedText,
      { parse_mode: 'Markdown', ...keyboard }
    );
  }

  private async updateTypeSelection(ctx: any): Promise<void> {
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🟢 QUERO COMPRAR', 'op_type_buy'),
        Markup.button.callback('🔴 QUERO VENDER', 'op_type_sell'),
      ],
      [
        Markup.button.callback('📰 QUERO ANUNCIAR', 'op_type_announcement'),
        Markup.button.callback('🔁 QUERO TROCAR', 'op_type_exchange'),
      ],
      [Markup.button.callback('❌ Cancelar', 'op_cancel')],
    ]);

    await ctx.editMessageText(
      '💼 **Criar Nova Operação P2P**\n\n' +
      'Escolha o tipo de operação:',
      { parse_mode: 'Markdown', ...keyboard }
    );
  }

  private async updateAssetSelectionBack(ctx: any, operationType: OperationType): Promise<void> {
    const sessionKey = `${ctx.from.id}_${ctx.chat.id}`;
    const session = this.sessions.get(sessionKey);
    
    if (session) {
      session.step = 'assets_networks';
      if (!session.data.assets) session.data.assets = [];
    }

    const isSelected = (asset: AssetType) => session?.data.assets?.includes(asset) || false;
    const createAssetButton = (emoji: string, name: string, asset: AssetType) => {
      const selected = isSelected(asset);
      const icon = selected ? '✔️' : emoji;
      return Markup.button.callback(`${icon} ${name}`, `op_asset_${asset}`);
    };

    const keyboard = Markup.inlineKeyboard([
      [
        createAssetButton('🟢', 'USDT', AssetType.USDT),
        createAssetButton('🔵', 'USDC', AssetType.USDC),
        createAssetButton('⚫', 'USDe', AssetType.USDE),
      ],
      [
        createAssetButton('⚪', 'ETH', AssetType.ETH),
      ],
      [
        createAssetButton('💵', 'DÓLAR', AssetType.DOLAR),
        createAssetButton('💶', 'EURO', AssetType.EURO),
        createAssetButton('💰', 'REAL', AssetType.REAL),
      ],
      [

      ],
      [
        Markup.button.callback('⬅️ Voltar', 'op_back_type'),
        Markup.button.callback('✔️ Continuar', 'op_assets_continue'),
      ],
      [
        Markup.button.callback('❌ Cancelar', 'op_cancel'),
      ],
    ]);

    const typeText = operationType === OperationType.BUY ? '🟢 QUERO COMPRAR' : operationType === OperationType.SELL ? '🔴 QUERO VENDER' : operationType === OperationType.ANNOUNCEMENT ? '📰 QUERO ANUNCIAR' : '🔁 QUERO TROCAR';
    const selectedAssets = session?.data.assets || [];
    const selectedText = selectedAssets.length > 0 
      ? `\n\n✔️ **Selecionados:** ${selectedAssets.join(', ')}`
      : '';
    
    await ctx.editMessageText(
      `💼 **Criar Nova Operação P2P**\n\n` +
      `${typeText}\n\n` +
      'Escolha o(s) ativo(s):\n' +
      '💡 Você pode selecionar múltiplos ativos' +
      selectedText,
      { parse_mode: 'Markdown', ...keyboard }
    );
  }

  private async updateNetworkSelectionBack(ctx: any): Promise<void> {
    const sessionKey = `${ctx.from.id}_${ctx.chat.id}`;
    const session = this.sessions.get(sessionKey);
    
    if (session) {
      session.step = 'assets_networks';
      if (!session.data.networks) session.data.networks = [];
    }

    const isSelected = (network: NetworkType) => session?.data.networks?.includes(network) || false;
    const createNetworkButton = (emoji: string, name: string, network: NetworkType) => {
      const selected = isSelected(network);
      const icon = selected ? '✔️' : emoji;
      return Markup.button.callback(`${icon} ${name}`, `op_network_${network}`);
    };

    const keyboard = Markup.inlineKeyboard([
      [
        createNetworkButton('⚪', 'ARB', NetworkType.ARBITRUM),
        createNetworkButton('🟣', 'POL', NetworkType.POLYGON),
        createNetworkButton('🔵', 'BASE', NetworkType.BASE),
        createNetworkButton('🟡', 'BNB', NetworkType.BNB),
      ],
      [
        createNetworkButton('🟪', 'SOLANA', NetworkType.SOLANA),
      ],
      [
        createNetworkButton('⬜', 'ETH', NetworkType.ETH),
      ],
      [

      ],
      [
        Markup.button.callback('⬅️ Voltar', 'op_back_assets'),
        Markup.button.callback('✔️ Continuar', 'op_networks_continue'),
      ],
      [
        Markup.button.callback('❌ Cancelar', 'op_cancel'),
      ],
    ]);

    const typeText = session?.data.type === OperationType.BUY ? '🟢 QUERO COMPRAR' : session?.data.type === OperationType.SELL ? '🔴 QUERO VENDER' : session?.data.type === OperationType.ANNOUNCEMENT ? '📰 QUERO ANUNCIAR' : '🔁 QUERO TROCAR';
    const assetsText = session?.data.assets?.join(', ') || 'Nenhum';
    const selectedNetworks = session?.data.networks || [];
    const selectedText = selectedNetworks.length > 0 
      ? `\n\n✔️ **Selecionadas:** ${selectedNetworks.map(n => n.toUpperCase()).join(', ')}`
      : '';
    
    await ctx.editMessageText(
      `💼 **Criar Nova Operação P2P**\n\n` +
      `${typeText}\n` +
      `Ativos: ${assetsText}\n\n` +
      'Escolha a(s) rede(s):\n' +
      '💡 Você pode selecionar múltiplas redes' +
      selectedText,
      { parse_mode: 'Markdown', ...keyboard }
    );
  }

  private async updateQuotationSelection(ctx: any): Promise<void> {
    const sessionKey = `${ctx.from.id}_${ctx.chat.id}`;
    const session = this.sessions.get(sessionKey);

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✋ Manual', 'op_quote_manual'),
        Markup.button.callback('🌐 Google', 'op_quote_google'),
        Markup.button.callback('🟡 Binance', 'op_quote_binance'),
      ],
      [Markup.button.callback('❌ Cancelar', 'op_cancel')],
    ]);

    const formattedAmount = session?.data.amount ? this.formatValueByAsset(session.data.amount, session.data.assets || []) : '0';
    const currencySuffix = this.getCurrencySuffix(session?.data.assets || []);
    
    await ctx.editMessageText(
      `💼 **Resumo da Operação**\n\n` +
      `${session?.data.type === OperationType.BUY ? '🟢 QUERO COMPRAR' : session?.data.type === OperationType.SELL ? '🔴 QUERO VENDER' : session?.data.type === OperationType.ANNOUNCEMENT ? '📰 QUERO ANUNCIAR' : '🔁 QUERO TROCAR'}\n` +
      `Ativos: ${session?.data.assets?.join(', ') || 'Nenhum'}\n` +
      `Redes: ${session?.data.networks?.map(n => n.toUpperCase()).join(', ') || 'Nenhuma'}\n` +
      `QTD: ${formattedAmount}${currencySuffix}\n\n` +
      'Como foi definida a cotação?',
      { parse_mode: 'Markdown', ...keyboard }
    );
  }

  private async updatePaymentSelectionBack(ctx: any): Promise<void> {
    const sessionKey = `${ctx.from.id}_${ctx.chat.id}`;
    const session = this.sessions.get(sessionKey);
    
    // Voltar para a tela de seleção de ativos/redes/cotação
    if (session) {
      session.step = 'assets_networks';
      await this.updateAssetsAndNetworksSelection(ctx, session);
      return;
    }
  }

  private async updateDescriptionSelectionBack(ctx: any): Promise<void> {
    const sessionKey = `${ctx.from.id}_${ctx.chat.id}`;
    const session = this.sessions.get(sessionKey);
    
    // Voltar para a etapa anterior (preço ou valor)
    if (session) {
      if (session.data.quotationType === QuotationType.MANUAL) {
        // Se for cotação manual, voltar para a tela de preço
        session.step = 'price';
        await this.showPriceInput(ctx);
      } else {
        // Se for cotação Google ou Binance, voltar para a tela de valor
        session.step = 'amount_quotation';
        await this.showValueInput(ctx);
      }
      return;
    }

    // Todo o código restante foi removido pois não é mais necessário
  }

  async handleTextInput(ctx: TextCommandContext): Promise<void> {
    const sessionKey = `${ctx.from.id}_${ctx.chat.id}`;
    const session = this.sessions.get(sessionKey);

    if (!session) return;

    const text = ctx.message.text;

    if (session.step === 'amount_quotation') {
      // Normalizar o texto: substituir vírgula por ponto
      const normalizedText = text.replace(',', '.');
      const amount = parseFloat(normalizedText);
      
      // Validar se é um número válido e maior que zero
      if (isNaN(amount) || amount <= 0) {
        // Deletar a mensagem do usuário com valor inválido
        try {
          await ctx.deleteMessage(ctx.message.message_id);
        } catch (error) {
          // Ignora erro se não conseguir deletar
        }
        await ctx.reply('▼ Por favor, digite um valor numérico válido maior que zero.');
        return;
      }
      
      // Validar casas decimais baseado no ativo selecionado
      const decimalSeparator = text.includes(',') ? ',' : '.';
      const decimalPlaces = (text.split(decimalSeparator)[1] || '').length;
      
      // Verificar se BTC está entre os ativos selecionados
      const hasBTC = session.data.assets && session.data.assets.includes(AssetType.BTC);
      const maxDecimals = hasBTC ? 8 : 2;
      const exampleValue = hasBTC ? '0.00000001 ou 0,00000001' : '1000.50 ou 1000,50';
      
      if (decimalPlaces > maxDecimals) {
        // Deletar a mensagem do usuário com valor inválido
        try {
          await ctx.deleteMessage(ctx.message.message_id);
        } catch (error) {
          // Ignora erro se não conseguir deletar
        }
        await ctx.reply(`▼ Por favor, digite um valor com no máximo ${maxDecimals} casas decimais.\n\nExemplo: ${exampleValue}`);
        return;
      }
      
      // Deletar a mensagem do usuário com a quantidade digitada
      try {
        await ctx.deleteMessage(ctx.message.message_id);
      } catch (error) {
        // Ignora erro se não conseguir deletar
      }
      
      // Deletar a mensagem anterior se existir
      if (session.messageId) {
        try {
          await ctx.deleteMessage(session.messageId);
        } catch (error) {
          // Ignora erro se não conseguir deletar
        }
      }
      
      session.data.amount = amount;
      
      // Verificar se já foi selecionado um tipo de cotação
      if (session.data.quotationType === QuotationType.GOOGLE || session.data.quotationType === QuotationType.BINANCE) {
        // Se cotação Google ou Binance, pular direto para descrição/pagamento
        await this.showDescriptionInput(ctx);
      } else if (session.data.quotationType === QuotationType.MANUAL) {
        // Se cotação manual, ir para inserção de preço
        await this.showPriceInput(ctx);
      } else {
        // Se não foi selecionado ainda, mostrar erro (não deveria acontecer)
        await ctx.reply('⚠️ Selecione primeiro o tipo de cotação.');
      }
    } else if (session.step === 'price') {
      // Normalizar o texto: substituir vírgula por ponto
      const normalizedText = text.replace(',', '.');
      const price = parseFloat(normalizedText);
      if (isNaN(price) || price <= 0) {
        // Deletar a mensagem do usuário com valor inválido
        try {
          await ctx.deleteMessage(ctx.message.message_id);
        } catch (error) {
          // Ignora erro se não conseguir deletar
        }
        await ctx.reply('▼ Por favor, digite um preço válido maior que zero.');
        return;
      }
      
      // Deletar a mensagem do usuário com o preço digitado
      try {
        await ctx.deleteMessage(ctx.message.message_id);
      } catch (error) {
        // Ignora erro se não conseguir deletar
      }
      
      session.data.price = price;
      
      await this.showDescriptionInput(ctx);
    } else if (session.step === 'payment') {
      // Deletar a mensagem do usuário com o método de pagamento digitado
      try {
        await ctx.deleteMessage(ctx.message.message_id);
      } catch (error) {
        // Ignora erro se não conseguir deletar
      }
      
      // Adicionar método personalizado ao array
      if (!session.data.paymentMethods) {
        session.data.paymentMethods = [];
      }
      session.data.paymentMethods.push(text);
      await this.showDescriptionInput(ctx);
    } else if (session.step === 'description' || session.step === 'description_payment') {
      // Deletar a mensagem do usuário com a descrição digitada
      try {
        await ctx.deleteMessage(ctx.message.message_id);
      } catch (error) {
        // Ignora erro se não conseguir deletar
      }
      
      session.data.description = text;
      await this.showConfirmation(ctx);
    }
  }

  private async showConfirmation(ctx: TextCommandContext): Promise<void> {
    const sessionKey = `${ctx.from.id}_${ctx.chat.id}`;
    const session = this.sessions.get(sessionKey);
    
    if (session) {
      session.step = 'confirmation';
      
      // Deletar a mensagem anterior se existir
      if (session.messageId) {
        try {
          await ctx.deleteMessage(session.messageId);
        } catch (error) {
          // Ignorar erro se a mensagem já foi deletada
        }
      }
    }

    // Verificar se o usuário tem disputas ativas
    let disputeWarning = '';
    try {
      const userData = {
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name
      };
      const user = await this.usersService.findOrCreate(userData);
      const warning = await this.pendingEvaluationService.getUserDisputeWarning(user._id);
      
      if (warning) {
        disputeWarning = `\n\n${warning}\n` +
          `⚠️ **Aviso:** Outros usuários verão que você tem disputas ativas.\n` +
          `Resolva suas disputas pendentes para melhorar sua reputação.\n`;
      }
    } catch (error) {
      this.logger.error('Erro ao verificar disputas do usuário:', error);
    }

    const formattedAmount = session?.data.amount ? this.formatValueByAsset(session.data.amount, session.data.assets || []) : '0';
    const currencySuffix = this.getCurrencySuffix(session?.data.assets || []);
    
    let resumoText = `💼 **Resumo da Operação**\n\n` +
      `${session?.data.type === OperationType.BUY ? '🟢 QUERO COMPRAR' : session?.data.type === OperationType.SELL ? '🔴 QUERO VENDER' : session?.data.type === OperationType.ANNOUNCEMENT ? '📰 QUERO ANUNCIAR' : '🔁 QUERO TROCAR'}\n\n` +
      `Ativos: ${session?.data.assets?.join(', ') || 'Nenhum'}\n` +
      `Redes: ${session?.data.networks?.map(n => n.toUpperCase()).join(', ') || 'Nenhuma'}\n` +
      `Quantidade: ${formattedAmount}${currencySuffix}\n`;
    
    if (session?.data.quotationType === QuotationType.GOOGLE) {
      resumoText += `Cotação: (calculada na transação)\n`;
      resumoText += `Fonte: 🌐 Google\n`;
      // Não adicionar Pagamento aqui para evitar duplicidade; linha global abaixo cobre isso
    } else if (session?.data.quotationType === QuotationType.BINANCE) {
      resumoText += `Cotação: (calculada na transação)\n`;
      resumoText += `Fonte: 🟡 Binance\n`;
      // Não adicionar Pagamento aqui para evitar duplicidade; linha global abaixo cobre isso
    } else if (session?.data.quotationType === QuotationType.MANUAL) {
      const total = (session?.data.amount || 0) * (session?.data.price || 0);
      const formattedPrice = session?.data.price ? this.formatValueByAsset(session.data.price, session.data.assets || []) : '0';
      
      // Verificar se o pagamento é PIX ou Boleto (sempre em Reais)
      const paymentMethods = session?.data.paymentMethods || [];
      const isPixOrBoleto = paymentMethods.some(method => method === 'PIX' || method === 'Boleto');
      
      if (isPixOrBoleto) {
        resumoText += `Preço: R$ ${total.toFixed(2)}\n` +
          `Cotação: R$ ${(session?.data.price || 0).toFixed(2)}\n`;
      } else {
        resumoText += `Preço: ${total.toFixed(2)} USD\n` +
          `Cotação: ${formattedPrice}${currencySuffix}\n`;
      }
      
      // Verificar spread para cotação manual
      if (session?.data.price && session?.data.assets && session.data.assets.length > 0) {
        try {
          const firstAsset = session.data.assets[0];
          let awesomeApiPrice: number | null = null;
          let binancePrice: number | null = null;
          
          // Buscar cotação da AwesomeAPI
          if (session.data.type === OperationType.EXCHANGE) {
            if (firstAsset === AssetType.USDT || firstAsset === AssetType.USDC) {
              const rates = await this.currencyApiService.getCurrentRates();
              if (rates.USDBRL && rates.EURBRL) {
                const usdInBrl = parseFloat(rates.USDBRL.bid);
                const eurInBrl = parseFloat(rates.EURBRL.bid);
                awesomeApiPrice = usdInBrl / eurInBrl;
              }
            } else if (firstAsset === AssetType.EURO) {
              const rates = await this.currencyApiService.getCurrentRates();
              if (rates.EURBRL && rates.USDBRL) {
                const eurInBrl = parseFloat(rates.EURBRL.bid);
                const usdInBrl = parseFloat(rates.USDBRL.bid);
                awesomeApiPrice = eurInBrl / usdInBrl;
              }
            } else {
              awesomeApiPrice = await this.currencyApiService.getSuggestedPrice(firstAsset);
            }
          } else {
            awesomeApiPrice = await this.currencyApiService.getSuggestedPrice(firstAsset);
          }
          
          // Buscar cotação da Binance
          try {
            const symbolMap = {
              [AssetType.USDT]: 'USDTBRL',
              [AssetType.USDC]: 'USDTBRL',
              [AssetType.BTC]: 'BTCBRL',
              [AssetType.ETH]: 'ETHBRL',
              [AssetType.USDE]: 'USDTBRL'
            };
            
            const binanceSymbol = symbolMap[firstAsset];
            if (binanceSymbol) {
              const priceData = await this.binancePriceService.getPrice(binanceSymbol);
              if (priceData) {
                binancePrice = priceData.price;
              }
            }
          } catch (error) {
            this.logger.warn('Erro ao obter cotação da Binance para spread:', error);
          }
          
          // Calcular spread se temos pelo menos uma cotação de referência
          const userPrice = session.data.price;
          const maxReferencePrice = Math.max(awesomeApiPrice || 0, binancePrice || 0);
          const minReferencePrice = Math.min(awesomeApiPrice || Infinity, binancePrice || Infinity);
          
          if (maxReferencePrice > 0 && userPrice > maxReferencePrice) {
            // Alerta de Spread - preço acima do mercado
            const spreadValue = userPrice - maxReferencePrice;
            const spreadPercentage = ((spreadValue / maxReferencePrice) * 100);
            
            if (spreadPercentage > 5) { // Alerta se spread > 5%
              const currency = session.data.type === OperationType.EXCHANGE ? 
                (firstAsset === AssetType.EURO ? '$' : '€') : 'R$';
              resumoText += `🚨 **Alerta de Spread:** ${currency} ${spreadValue.toFixed(session.data.type === OperationType.EXCHANGE ? 4 : 2)} (+${spreadPercentage.toFixed(1)}%)\n`;
            }
          } else if (minReferencePrice < Infinity && userPrice < minReferencePrice) {
            // Alerta de Oportunidade - preço abaixo do mercado
            const opportunityValue = minReferencePrice - userPrice;
            const opportunityPercentage = ((opportunityValue / minReferencePrice) * 100);
            
            if (opportunityPercentage > 5) { // Alerta se oportunidade > 5%
              const currency = session.data.type === OperationType.EXCHANGE ? 
                (firstAsset === AssetType.EURO ? '$' : '€') : 'R$';
              resumoText += `🎉 **Alerta de Oportunidade:** ${currency} ${opportunityValue.toFixed(session.data.type === OperationType.EXCHANGE ? 4 : 2)} (-${opportunityPercentage.toFixed(1)}%)\n`;
            }
          }
        } catch (error) {
          this.logger.warn('Erro ao calcular spread:', error);
        }
      }
    }
    
    // Exibir fonte quando preço manual veio de uma origem conhecida
    if (session?.data.quotationType === QuotationType.MANUAL) {
      if (session?.data.quotationSource === QuotationSource.GOOGLE) {
        resumoText += `Fonte: 🌐 Google\n`;
      } else if (session?.data.quotationSource === QuotationSource.BINANCE) {
        resumoText += `Fonte: 🟡 Binance\n`;
      }
    }

    // Adicionar Pagamento UMA vez, independente do tipo de cotação
    const paymentText = session?.data.paymentMethods && session.data.paymentMethods.length > 0 
      ? session.data.paymentMethods.join(', ')
      : 'Não selecionado';
    resumoText += `Pagamento: ${paymentText}\n`;
    
    if (session?.data.description && session.data.description !== 'pular') {
      resumoText += `Descrição: ${session.data.description}\n`;
    }
    
    // Adicionar aviso de disputa se existir
    resumoText += disputeWarning;
    
    resumoText += `\n\n✓ Confirme os dados e escolha uma ação:`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🚀 Enviar Ordem', 'op_confirm_send'),
      ],
      [
        Markup.button.callback('⬅️ Voltar', 'op_back_description'),
        Markup.button.callback('❌ Cancelar', 'op_cancel'),
      ],
    ]);
    
    const message = await ctx.reply(resumoText, { parse_mode: 'Markdown', ...keyboard });
    
    if (session) {
      session.messageId = message.message_id;
    }
  }

  private async showDescriptionInput(ctx: TextCommandContext): Promise<void> {
    const sessionKey = `${ctx.from.id}_${ctx.chat.id}`;
    const session = this.sessions.get(sessionKey);
    
    if (session) {
      session.step = 'description_payment';
      
      // Inicializar array de métodos de pagamento se não existir
      if (!session.data.paymentMethods) {
        session.data.paymentMethods = [];
      }
      
      // Deletar a mensagem anterior se existir
      if (session.messageId) {
        try {
          await ctx.deleteMessage(session.messageId);
        } catch (error) {
          // Ignorar erro se a mensagem já foi deletada
        }
      }
    }

    const selectedMethods = session?.data.paymentMethods || [];
    const typeText = session?.data.type === OperationType.BUY ? 'receber' : 'pagar';
    const formattedAmount = session?.data.amount ? this.formatValueByAsset(session.data.amount, session.data.assets || []) : '0';
    const currencySuffix = this.getCurrencySuffix(session?.data.assets || []);

    const keyboard = Markup.inlineKeyboard([
      // Botões de ação
      [
        Markup.button.callback('⬅️ Voltar', 'op_back_description'),
        Markup.button.callback('⏭️ Pular Descrição', 'op_skip_description'),
      ],
      [
        Markup.button.callback('✅ Continuar', 'op_description_payment_continue'),
        Markup.button.callback('❌ Cancelar', 'op_cancel'),
      ],
    ]);

    let resumoText = `💼 **Resumo da Operação**\n\n` +
      `${session?.data.type === OperationType.BUY ? '🟢 QUERO COMPRAR' : session?.data.type === OperationType.SELL ? '🔴 QUERO VENDER' : session?.data.type === OperationType.ANNOUNCEMENT ? '📰 QUERO ANUNCIAR' : '🔁 QUERO TROCAR'}\n\n` +
      `**Ativos:** ${session?.data.assets?.join(', ') || 'Nenhum'}\n` +
      `**Redes:** ${session?.data.networks?.map(n => n.toUpperCase()).join(', ') || 'Nenhuma'}\n` +
      `**Quantidade:** ${formattedAmount}${currencySuffix}\n`;
    
    if (session?.data.quotationType === QuotationType.GOOGLE) {
      resumoText += `**Cotação:** (calculada na transação)\n`;
      resumoText += `**Fonte:** 🌐 Google\n`;
      // Não adicionar Pagamento aqui para evitar duplicidade; linha global abaixo cobre isso
    } else if (session?.data.quotationType === QuotationType.BINANCE) {
      resumoText += `**Cotação:** (calculada na transação)\n`;
      resumoText += `**Fonte:** 🟡 Binance\n`;
      // Não adicionar Pagamento aqui para evitar duplicidade; linha global abaixo cobre isso
    } else {
      const total = (session?.data.amount || 0) * (session?.data.price || 0);
      const formattedPrice = session?.data.price ? this.formatValueByAsset(session.data.price, session.data.assets || []) : '0';
      
      // Para operações de troca, ajustar a moeda do preço total
      let formattedTotal = '';
      let priceCurrency = '';
      
      if (session?.data.type === OperationType.EXCHANGE) {
        // Para troca USDT/USDC → EUR, mostrar preço em EUR
        if (session.data.assets?.some(asset => [AssetType.USDT, AssetType.USDC].includes(asset))) {
          formattedTotal = `${total.toFixed(2)} EUR`;
          priceCurrency = `${(session?.data.price || 0).toFixed(4)} EUR`;
        }
        // Para troca EUR → USD, mostrar preço em USD
        else if (session.data.assets?.includes(AssetType.EURO)) {
          formattedTotal = `${total.toFixed(2)} USD`;
          priceCurrency = `${(session?.data.price || 0).toFixed(4)} USD`;
        }
        // Para outras trocas, usar formatação padrão
        else {
          const formattedTotalDefault = this.formatValueByAsset(total, session?.data.assets || []);
          formattedTotal = `${formattedTotalDefault}${currencySuffix}`;
          priceCurrency = `${formattedPrice}${currencySuffix}`;
        }
      } else {
        // Para operações normais (compra/venda), usar formatação padrão
        const formattedTotalDefault = this.formatValueByAsset(total, session?.data.assets || []);
        formattedTotal = `${formattedTotalDefault}${currencySuffix}`;
        priceCurrency = `${formattedPrice}${currencySuffix}`;
      }
      
      // Verificar se o pagamento é PIX ou Boleto (sempre em Reais)
      const paymentMethods = session?.data.paymentMethods || [];
      const isPixOrBoleto = paymentMethods.some(method => method === 'PIX' || method === 'Boleto');
      
      if (isPixOrBoleto && session?.data.type !== OperationType.EXCHANGE) {
        resumoText += `Preço: R$ ${total.toFixed(2)}\n` +
          `Cotação: R$ ${(session?.data.price || 0).toFixed(2)}\n`;
      } else {
        resumoText += `Preço: ${formattedTotal}\n` +
          `Cotação: ${priceCurrency}\n`;
      }

      // Exibir fonte quando preço manual veio de uma origem conhecida
      if (session?.data.quotationSource === QuotationSource.GOOGLE) {
        resumoText += `**Fonte:** 🌐 Google\n`;
      } else if (session?.data.quotationSource === QuotationSource.BINANCE) {
        resumoText += `**Fonte:** 🟡 Binance\n`;
      }
    }
    
    // Gerar exemplo baseado nos ativos selecionados
    let exemplo = 'Pagamento via PIX, entrega rápida';
    if (session?.data.assets && session.data.assets.length > 0) {
      const hasStablecoin = session.data.assets.some(asset => [AssetType.USDT, AssetType.USDC, AssetType.USDE].includes(asset));
      const hasBTC = session.data.assets.includes(AssetType.BTC);
      const hasETH = session.data.assets.includes(AssetType.ETH);
      
      if (hasStablecoin) {
        exemplo = 'Exemplo: Valor 200,00 USD, pagamento via PIX, entrega rápida';
      } else if (hasBTC) {
        exemplo = 'Exemplo: Valor 0,00500000 BTC, pagamento via PIX, entrega rápida';
      } else if (hasETH) {
        exemplo = 'Exemplo: Valor 0,10000000 ETH, pagamento via PIX, entrega rápida';
      } else if (session.data.assets.includes(AssetType.REAL)) {
        exemplo = 'Exemplo: Valor 1.000,00 BRL, pagamento via PIX, entrega rápida';
      }
    }
    
    // Adicionar pagamento UMA vez aqui, cobrindo todas as modalidades
    resumoText += `**Pagamento:** ${selectedMethods.join(', ') || 'Nenhum'}\n\n` +
      '📝 **Descrição (opcional):**\n' +
      'Digite uma descrição para sua operação ou clique em "Pular Descrição" para continuar.\n\n' +
      exemplo;
    
    const message = await ctx.reply(resumoText, { parse_mode: 'Markdown', ...keyboard });
    
    if (session) {
      session.messageId = message.message_id;
    }
  }

  private async showPaymentSelection(ctx: TextCommandContext): Promise<void> {
    const sessionKey = `${ctx.from.id}_${ctx.chat.id}`;
    const session = this.sessions.get(sessionKey);
    
    if (session) {
      session.step = 'payment';
      
      // Inicializar array de métodos de pagamento se não existir
      if (!session.data.paymentMethods) {
        session.data.paymentMethods = [];
      }
      
      // Deletar a mensagem anterior se existir
      if (session.messageId) {
        try {
          await ctx.deleteMessage(session.messageId);
        } catch (error) {
          // Ignorar erro se a mensagem já foi deletada
        }
      }
    }

    const selectedMethods = session?.data.paymentMethods || [];
    
    // Função para verificar se um método está selecionado
    const isSelected = (method: string) => session?.data.paymentMethods?.includes(method) || false;
    
    // Função para criar botão com indicador visual
    const createPaymentButton = (emoji: string, name: string, callback: string) => {
      const selected = isSelected(name);
      const icon = selected ? '✔️' : emoji;
      return Markup.button.callback(`${icon} ${name}`, callback);
    };

    const keyboard = Markup.inlineKeyboard([
      [
        createPaymentButton('', 'PIX', 'op_payment_pix'),
        createPaymentButton('🧾', 'Boleto', 'op_payment_boleto'),
        createPaymentButton('💵', 'Dólar', 'op_payment_dolar'),
      ],
      [
        createPaymentButton('💶', 'Euro', 'op_payment_euro'),
        createPaymentButton('💙', 'PayPal', 'op_payment_paypal'),
        createPaymentButton('⚙️', 'Outros', 'op_payment_outros'),
      ],
      [
        Markup.button.callback('⬅️ Voltar', 'op_back_quotation'),
        Markup.button.callback(`${selectedMethods.length > 0 ? '✅' : '✔️'} Continuar`, 'op_payment_continue'),
      ],
      [
        Markup.button.callback('❌ Cancelar', 'op_cancel'),
      ],
    ]);

    const typeText = session?.data.type === OperationType.BUY ? 'receber' : 'pagar';
    const selectedText = selectedMethods.length > 0 
      ? `\n\n🎯 **Selecionados:** ${selectedMethods.join(', ')}`
      : '';
    
    const message = await ctx.reply(
      `💼 **Método de Pagamento**\n\n` +
      `Como você quer ${typeText}?\n\n` +
      '💡 Selecione um ou mais métodos de pagamento' +
      selectedText,
      { parse_mode: 'Markdown', ...keyboard }
    );
    
    if (session) {
      session.messageId = message.message_id;
    }
  }

  private async showPriceInput(ctx: any): Promise<void> {
    const sessionKey = `${ctx.from.id}_${ctx.message?.chat?.id || ctx.chat?.id}`;
    const session = this.sessions.get(sessionKey);
    
    if (session) {
      session.step = 'price';
      
      // Deletar a mensagem anterior se existir
      if (session.messageId) {
        try {
          await ctx.deleteMessage(session.messageId);
        } catch (error) {
          // Ignorar erro se a mensagem já foi deletada
        }
      }
    }

    // Obter cotações de ambas as fontes para o primeiro ativo
    let apiCurrentPrice: number | null = null;
    let binancePrice: number | null = null;
    let suggestedPriceText = '';
    
    if (session?.data.assets && session.data.assets.length > 0) {
      try {
        const firstAsset = session.data.assets[0];
        
        // Buscar cotação da API atual
        if (session.data.type === OperationType.EXCHANGE) {
          // Para operações de troca, calcular cotação entre as moedas
          if (firstAsset === AssetType.USDT || firstAsset === AssetType.USDC) {
            const rates = await this.currencyApiService.getCurrentRates();
            if (rates.USDBRL && rates.EURBRL) {
              const usdInBrl = parseFloat(rates.USDBRL.bid);
              const eurInBrl = parseFloat(rates.EURBRL.bid);
              apiCurrentPrice = usdInBrl / eurInBrl; // USD para EUR
            }
          } else if (firstAsset === AssetType.EURO) {
            const rates = await this.currencyApiService.getCurrentRates();
            if (rates.EURBRL && rates.USDBRL) {
              const eurInBrl = parseFloat(rates.EURBRL.bid);
              const usdInBrl = parseFloat(rates.USDBRL.bid);
              apiCurrentPrice = eurInBrl / usdInBrl; // EUR para USD
            }
          } else {
            apiCurrentPrice = await this.currencyApiService.getSuggestedPrice(firstAsset);
          }
        } else {
          // Para operações normais (compra/venda), usar cotação em BRL
          apiCurrentPrice = await this.currencyApiService.getSuggestedPrice(firstAsset);
        }

        // Buscar cotação da Binance
        try {
          const symbolMap = {
            [AssetType.USDT]: 'USDTBRL',
            [AssetType.USDC]: 'USDTBRL', // Fallback para USDT
            [AssetType.BTC]: 'BTCBRL',
            [AssetType.ETH]: 'ETHBRL',
            [AssetType.USDE]: 'USDTBRL' // Fallback para USDT
          };

          const binanceSymbol = symbolMap[firstAsset];
          if (binanceSymbol) {
            const priceData = await this.binancePriceService.getPrice(binanceSymbol);
            if (priceData) {
              binancePrice = priceData.price;
            }
          }
        } catch (error) {
          this.logger.warn('Erro ao obter cotação da Binance:', error);
        }

        // Criar texto informativo sobre as cotações
         if (apiCurrentPrice || binancePrice) {
           suggestedPriceText = `\n💡 **Cotações Disponíveis:**\n`;
           
           if (apiCurrentPrice) {
             const currency = session.data.type === OperationType.EXCHANGE ? 
               (firstAsset === AssetType.EURO ? '$' : '€') : 'R$';
             suggestedPriceText += `🌐 **AwesomeAPI:** ${currency} ${apiCurrentPrice.toFixed(session.data.type === OperationType.EXCHANGE ? 4 : 2)}\n`;
           }
           
           if (binancePrice) {
             suggestedPriceText += `🟡 **Binance:** R$ ${binancePrice.toFixed(2)}\n`;
           }
           
           suggestedPriceText += `\n`;
         }
      } catch (error) {
        this.logger.warn('Erro ao obter cotações:', error);
      }
    }

    // Criar teclado com botões de cotação
    const keyboardButtons: any[] = [];
    
    // Adicionar botões de cotação se disponíveis
     if (apiCurrentPrice) {
       const currency = session?.data.type === OperationType.EXCHANGE ? 
         (session.data.assets?.[0] === AssetType.EURO ? '$' : '€') : 'R$';
       keyboardButtons.push([{
         text: `🌐 Usar AwesomeAPI: ${currency} ${apiCurrentPrice.toFixed(session?.data.type === OperationType.EXCHANGE ? 4 : 2)}`,
         callback_data: `op_use_suggested_price_${apiCurrentPrice.toFixed(session?.data.type === OperationType.EXCHANGE ? 4 : 2)}`
       }]);
     }
    
    if (binancePrice) {
      keyboardButtons.push([{
        text: `🟡 Usar Binance: R$ ${binancePrice.toFixed(2)}`,
        callback_data: `op_use_binance_price_${binancePrice.toFixed(2)}`
      }]);
    }
    
    keyboardButtons.push([
      Markup.button.callback('⬅️ Voltar', 'op_back_value'),
      Markup.button.callback('❌ Cancelar', 'op_cancel'),
    ]);

    const keyboard = Markup.inlineKeyboard(keyboardButtons);

    const typeText = session?.data.type === OperationType.BUY ? '🟢 QUERO COMPRAR' : session?.data.type === OperationType.SELL ? '🔴 QUERO VENDER' : session?.data.type === OperationType.ANNOUNCEMENT ? '📰 QUERO ANUNCIAR' : '🔁 QUERO TROCAR';
    const assetsText = session?.data.assets?.join(', ') || 'Nenhum';
    const networksText = session?.data.networks?.map(n => n.toUpperCase()).join(', ') || 'Nenhuma';
    const formattedAmount = session?.data.amount ? this.formatValueByAsset(session.data.amount, session.data.assets || []) : '0';
    const currencySuffix = this.getCurrencySuffix(session?.data.assets || []);
    
    // Determinar a moeda para entrada de preço baseado no tipo de operação e ativo
    let priceCurrency = 'R$';
    let priceExample = '5.45';
    
    if (session?.data.type === OperationType.EXCHANGE) {
      // Para troca USDT/USDC → EUR, entrada em EUR
      if (session.data.assets?.some(asset => [AssetType.USDT, AssetType.USDC].includes(asset))) {
        priceCurrency = '€';
        priceExample = '0.8559';
      }
      // Para troca EUR → USD, entrada em USD
      else if (session.data.assets?.includes(AssetType.EURO)) {
        priceCurrency = '$';
        priceExample = '1.0850';
      }
    } else if (session?.data.assets?.includes(AssetType.EURO)) {
      // Para compra/venda de EUR, entrada em EUR
      priceCurrency = '€';
      priceExample = '6.20';
    }
    
    const message = await ctx.reply(
      `💼 **Criar Nova Operação P2P**\n\n` +
      `${typeText}\n` +
      `Ativos: ${assetsText}\n` +
      `Redes: ${networksText}\n` +
      `QTD: ${formattedAmount}${currencySuffix}\n\n` +
      `💵 **COTAÇÃO MANUAL**\n` +
      suggestedPriceText +
      `Digite o preço unitário em ${priceCurrency} ou use uma das opções acima:\n\n` +
      `Exemplo: ${priceExample}`,
      { parse_mode: 'Markdown', ...keyboard }
    );
    
    if (session) {
      session.messageId = message.message_id;
    }
  }

  private async showValueInput(ctx: any): Promise<void> {
    const sessionKey = `${ctx.from.id}_${ctx.message?.chat?.id || ctx.chat?.id}`;
    const session = this.sessions.get(sessionKey);
    
    if (session) {
      session.step = 'amount_quotation';
    }

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('⬅️ Voltar', 'op_back_assets'),
        Markup.button.callback('❌ Cancelar', 'op_cancel'),
      ],
    ]);

    const typeText = session?.data.type === OperationType.BUY ? '🟢 QUERO COMPRAR' : session?.data.type === OperationType.SELL ? '🔴 QUERO VENDER' : session?.data.type === OperationType.ANNOUNCEMENT ? '📰 QUERO ANUNCIAR' : '🔁 QUERO TROCAR';
    const assetsText = session?.data.assets?.join(', ') || 'Nenhum';
    const networksText = session?.data.networks?.map(n => n.toUpperCase()).join(', ') || 'Nenhuma';
    const paymentText = session?.data.paymentMethods?.join(', ') || 'Nenhum';
    const quotationText = session?.data.quotationType === QuotationType.MANUAL ? 'Manual' : 
                         session?.data.quotationType === QuotationType.GOOGLE ? '🌐 GOOGLE' :
                         session?.data.quotationType === QuotationType.BINANCE ? '🟡 BINANCE' : 'Automática';
    
    // Determinar texto baseado no tipo de operação
    const actionText = session?.data.type === OperationType.BUY ? 'comprar' : session?.data.type === OperationType.SELL ? 'vender' : 'negociar';
    const valueText = 'VALOR';
    
    const message = await ctx.editMessageText(
      `💼 **Criar Nova Operação P2P**\n\n` +
      `${typeText}\n` +
      `Ativos: ${assetsText}\n` +
      `Redes: ${networksText}\n` +
      `Pagamento: ${paymentText}\n` +
      `Cotação: ${quotationText}\n\n` +
      `💰 **${valueText}**\n` +
      `Digite o valor total que deseja ${actionText}:\n\n` +
      `Exemplo: 2345,67`,
      { parse_mode: 'Markdown', ...keyboard }
    );
    
    if (session) {
      session.messageId = message.message_id;
    }
  }

  private async createOperation(ctx: TextCommandContext, session: OperationSession): Promise<void> {
    try {
      // Validar se ctx.from e ctx.from.id existem
      if (!ctx.from || !ctx.from.id) {
        this.logger.error('ctx.from ou ctx.from.id não definido');
        await ctx.reply('❌ Erro interno: informações do usuário não disponíveis.');
        return;
      }

      // Validar se o ID do usuário é válido para ObjectId
      const userIdString = ctx.from.id.toString();
      if (!userIdString || userIdString.length === 0) {
        this.logger.error(`ID do usuário inválido: ${userIdString}`);
        await ctx.reply('❌ Erro interno: ID do usuário inválido.');
        return;
      }

      // Primeiro, garantir que o usuário existe no banco de dados
      const userData = {
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name
      };
      
      let user;
      try {
        user = await this.usersService.findOrCreate(userData);
        this.logger.log(`Usuário encontrado/criado: ${user._id}`);
      } catch (error) {
        this.logger.error(`Erro ao criar/encontrar usuário:`, error);
        await ctx.reply('❌ Erro interno: não foi possível processar usuário.');
        return;
      }
      
      // Usar o ObjectId do usuário criado/encontrado
      const creatorObjectId = user._id;

      const description = session.data.description === 'pular' ? undefined : session.data.description;
      
      // Deletar a mensagem anterior se existir
      if (session.messageId) {
        try {
          await ctx.deleteMessage(session.messageId);
        } catch (error) {
          // Ignorar erro se a mensagem já foi deletada
        }
      }
      
      // Para cotação Google ou Binance, usar preço 0 pois será calculado na transação
      const price = (session.data.quotationType === QuotationType.GOOGLE || session.data.quotationType === QuotationType.BINANCE) ? 0 : (session.data.price || 0);
      
      // Definir grupo específico para operações criadas no privado usando variável de ambiente
      const specificGroupId = parseInt(process.env.TELEGRAM_GROUP_ID || '-1002907400287');
      if (!process.env.TELEGRAM_GROUP_ID) {
        this.logger.warn('⚠️ TELEGRAM_GROUP_ID não configurado, usando fallback');
      }
      let groupObjectId: Types.ObjectId | null = null;
      
      try {
        const group = await this.groupsService.findOrCreate({
          id: specificGroupId,
          title: 'Grupo P2P TrustScore'
        });
        groupObjectId = group._id;
        this.logger.log(`Operação será associada ao grupo: ${groupObjectId}`);
      } catch (error) {
        this.logger.warn(`Erro ao encontrar/criar grupo: ${error.message}`);
      }
      
      const operation = await this.operationsService.createOperation({
        creatorId: creatorObjectId,
        groupId: groupObjectId, // Grupo específico definido
        chatId: specificGroupId, // ID do grupo para referência
        type: session.data.type!,
        assets: session.data.assets!,
        networks: session.data.networks!,
        amount: session.data.amount!,
        price: price,
        quotationType: session.data.quotationType!,
        // Persistir origem da cotação manual quando disponível
        // (para Google/Binance automáticas, fonte é derivada do tipo)
        // Apenas setar quando existir na sessão
        // @ts-ignore - campo será aceito no DTO ajustado
        quotationSource: session.data.quotationSource,
        description,
        paymentMethods: session.data.paymentMethods,
      });

      // Enviar mensagem de confirmação com botões de controle
      const typeEmoji = operation.type === 'buy' ? '🟢' : operation.type === 'sell' ? '🔴' : operation.type === 'announcement' ? '📰' : '🔁';
      const typeText = operation.type === 'buy' ? 'COMPRA' : operation.type === 'sell' ? 'VENDA' : operation.type === 'announcement' ? 'ANÚNCIO' : 'TROCA';
      const assetsText = operation.assets.join(', ');
      
      // Calcular total e formatação
      const total = operation.amount * operation.price;
      const networksText = operation.networks.map(n => n.toUpperCase()).join(', ');
      const quotationText = operation.quotationType === 'google' ? '🌐 GOOGLE' : 
                           operation.quotationType === 'binance' ? '🟡 BINANCE' : 
                           operation.quotationType.toUpperCase();
      
      // Formatação da data de expiração
      const expirationDate = new Date(operation.expiresAt);
      const now = new Date();
      const diffMs = expirationDate.getTime() - now.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const expiresIn = `${diffHours}h ${diffMinutes}m`;
      
      let confirmationMessage = (
        `✅ **Operação Criada!**\n\n` +
        `${typeEmoji} **${typeText} ${assetsText}**\n` +
        `Redes: ${networksText}\n`
      );
      
      // Exibir cotação e fonte quando for Google ou Binance
      if (operation.quotationType === 'google' || operation.quotationType === 'binance') {
        confirmationMessage += `**Cotação:** (calculada na transação)\n`;
        const fonte = operation.quotationType === 'google' ? '🌐 Google' : '🟡 Binance';
        confirmationMessage += `**Fonte:** ${fonte}\n`;
      }
      
      confirmationMessage += `**Quantidade:** ${operation.amount} (total)\n`;
      
      // Adicionar métodos de pagamento se existirem
      if (operation.paymentMethods && operation.paymentMethods.length > 0) {
        confirmationMessage += `💳 **Métodos de Pagamento:** ${operation.paymentMethods.join(', ')}\n`;
      }
      
      confirmationMessage += `\n`;
      
      if (operation.quotationType === 'manual') {
        const assetsText = operation.assets.join(', ');
        const buyText = operation.type === 'buy' ? `${operation.amount} ${assetsText}` : `${operation.amount} ${assetsText}`;
        const payText = operation.type === 'buy' ? `R$ ${total.toFixed(2)}` : `R$ ${total.toFixed(2)}`;
        const actionText = operation.type === 'buy' ? 'Quero comprar' : 'Quero vender';
        
        // Setas conforme lógica: pagar >, receber <, vender >, comprar <
        // CORREÇÃO: Para VENDA, o usuário RECEBE dinheiro (não paga)
        const arrowIcon = operation.type === 'buy' ? '⬅️' : '➡️'; // comprar ⬅️, vender ➡️
        const paymentArrow = operation.type === 'buy' ? '➡️' : '⬅️'; // pagar ➡️, receber ⬅️
        const paymentText = operation.type === 'buy' ? 'Quero pagar' : 'Quero receber';
        
        confirmationMessage += (
          `${arrowIcon} **${actionText}:** ${buyText}\n` +
          `${paymentArrow} **${paymentText}:** ${payText}\n` +
          `💱 **Cotação:** R$ ${operation.price.toFixed(2)}\n\n`
        );
      } else if (operation.quotationType === 'google') {
        const assetsText = operation.assets.join(', ');
        const actionText = operation.type === 'buy' ? 'Quero comprar' : 'Quero vender';
        const paymentText = operation.type === 'buy' ? 'Quero pagar' : 'Quero receber';
        
        const arrowIcon = operation.type === 'buy' ? '⬅️' : '➡️';
        const paymentArrow = operation.type === 'buy' ? '➡️' : '⬅️';
        
        confirmationMessage += (
          `${arrowIcon} **${actionText}:** ${operation.amount} ${assetsText}\n` +
          `${paymentArrow} **${paymentText}:** Calculado na hora\n` +
          `💱 **Cotação:** 🌐 Google\n\n`
        );
      } else if (operation.quotationType === 'binance') {
        const assetsText = operation.assets.join(', ');
        const actionText = operation.type === 'buy' ? 'Quero comprar' : 'Quero vender';
        const paymentText = operation.type === 'buy' ? 'Quero pagar' : 'Quero receber';
        
        const arrowIcon = operation.type === 'buy' ? '⬅️' : '➡️';
        const paymentArrow = operation.type === 'buy' ? '➡️' : '⬅️';
        
        confirmationMessage += (
          `${arrowIcon} **${actionText}:** ${operation.amount} ${assetsText}\n` +
          `${paymentArrow} **${paymentText}:** Calculado na hora\n` +
          `💱 **Cotação:** 🟡 Binance\n\n`
        );
      }
      
      confirmationMessage += (
        `⏰ **Expira em:** ${expiresIn}\n` +
        `🆔 **ID:** \`${operation._id}\`\n\n` +
        `🚀 **Sua operação está sendo enviada para todos os grupos ativos...**\n\n` +
        `Use os botões abaixo para gerenciar sua operação:`
      );
      
      // Criar teclado inline com botões de controle baseado no status
      const controlKeyboard = this.createOperationControlKeyboard(operation);
      
      const replyOptions: any = {
        parse_mode: 'Markdown'
      };
      
      // Só adicionar keyboard se existir (operações concluídas não têm botões)
      if (controlKeyboard) {
        replyOptions.reply_markup = controlKeyboard;
      }
      
      await ctx.reply(confirmationMessage, replyOptions);

      // Enviar apenas para o grupo específico da operação
      await this.broadcastService.broadcastOperationToGroup(operation);

      // Limpar sessão
      this.sessions.delete(`${ctx.from.id}_${ctx.chat.id}`);
      
    } catch (error) {
      this.logger.error('Error creating operation:', error);
      
      // Mostrar popup de erro
      try {
        await ctx.answerCbQuery('❌ Erro ao criar operação. Tente novamente.', { show_alert: true });
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado no tratamento de erro (createOperation):', cbError.description);
        } else {
          this.logger.error('Erro ao responder callback de erro (createOperation):', cbError);
        }
      }
      
      // Enviar mensagem temporária que desaparece em 5 segundos
      const errorMessage = await ctx.reply('❌ Erro ao criar operação. Tente novamente.');
      
      // Deletar mensagem de erro após 5 segundos
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(errorMessage.message_id);
        } catch (deleteError) {
          // Ignora erro se não conseguir deletar
        }
      }, 5000);
    }
  }

  private async calculateGooglePrice(asset: AssetType): Promise<number> {
    try {
      // Para operações de troca, usar cotações reais da API
      const rates = await this.currencyApiService.getCurrentRates();
      
      // Mapear ativos para suas cotações correspondentes
      const assetMapping = {
        [AssetType.BTC]: rates.BTCBRL ? parseFloat(rates.BTCBRL.bid) : 350000.00,
        [AssetType.ETH]: rates.ETHBRL ? parseFloat(rates.ETHBRL.bid) : 18500.00,
        [AssetType.USDC]: rates.USDBRL ? parseFloat(rates.USDBRL.bid) : 5.45,
        [AssetType.USDT]: rates.USDBRL ? parseFloat(rates.USDBRL.bid) : 5.42,
        [AssetType.USDE]: rates.USDBRL ? parseFloat(rates.USDBRL.bid) : 5.43,
        [AssetType.DOLAR]: rates.USDBRL ? parseFloat(rates.USDBRL.bid) : 5.50,
        [AssetType.EURO]: rates.EURBRL ? parseFloat(rates.EURBRL.bid) : 6.20,
        [AssetType.REAL]: 1.00,
        [AssetType.XRP]: 3.25, // Fallback para XRP
      };
      
      return assetMapping[asset] || 1.00;
    } catch (error) {
      this.logger.warn('Erro ao buscar cotação real, usando fallback:', error);
      
      // Fallback para cotações simuladas
      const mockPrices = {
        [AssetType.BTC]: 350000.00,
        [AssetType.ETH]: 18500.00,
        [AssetType.XRP]: 3.25,
        [AssetType.USDC]: 5.45,
        [AssetType.USDT]: 5.42,
        [AssetType.USDE]: 5.43,
        [AssetType.DOLAR]: 5.50,
        [AssetType.EURO]: 6.20,
        [AssetType.REAL]: 1.00,
      };
      
      return mockPrices[asset] || 1.00;
    }
  }

  private createOperationControlKeyboard(operation: any): any {
    const buttons: any[] = [];

    if (operation.status === OperationStatus.ACCEPTED) {
      // Operação aceita - primeira solicitação de conclusão
      buttons.push({
        text: '✅ Concluir Operação',
        callback_data: `complete_operation_${operation._id}`
      });
      buttons.push({
        text: '❌ Cancelar Operação',
        callback_data: `cancel_operation_${operation._id}`
      });
    } else if (operation.status === OperationStatus.PENDING_COMPLETION) {
      // Aguardando confirmação - mostrar botões para aceitar/cancelar/contestar
      buttons.push({
        text: '✅ Aceitar Conclusão',
        callback_data: `complete_operation_${operation._id}`
      });
      buttons.push({
        text: '❌ Cancelar Operação',
        callback_data: `cancel_operation_${operation._id}`
      });
      buttons.push({
        text: '⚠️ Contestar',
        callback_data: `dispute_operation_${operation._id}`
      });
    } else if (operation.status === OperationStatus.COMPLETED) {
      // Operação concluída - sem botões de ação, apenas informativa
      return null; // Não mostrar botões para operações concluídas
    } else if (operation.status !== OperationStatus.CANCELLED && operation.status !== OperationStatus.CLOSED) {
      // Outras operações ativas - apenas cancelar
      buttons.push({
        text: '❌ Cancelar Operação',
        callback_data: `cancel_operation_${operation._id}`
      });
    }

    return buttons.length > 0 ? {
      inline_keyboard: [buttons]
    } : null;
  }
}
