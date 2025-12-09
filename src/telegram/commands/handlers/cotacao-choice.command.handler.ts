import { Injectable, Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import { CurrencyApiService } from '../../../operations/currency-api.service';
import { BinancePriceService } from '../../../integrations/binance-price.service';
import { AssetType } from '../../../operations/schemas/operation.schema';

export interface QuotationChoice {
  source: 'google' | 'binance';
  rate: number;
  timestamp: Date;
  symbol?: string;
}

@Injectable()
export class CotacaoChoiceService {
  private readonly logger = new Logger(CotacaoChoiceService.name);

  constructor(
    private readonly currencyApiService: CurrencyApiService,
    private readonly binancePriceService: BinancePriceService,
  ) {}

  /**
   * Mostra ambas as cotações para o usuário escolher
   */
  async showQuotationChoice(
    ctx: any, 
    asset: AssetType, 
    amount: number,
    operationId?: string
  ): Promise<void> {
    try {
      this.logger.log(`🔍 Buscando cotações para ${asset}...`);

      // Buscar cotações de ambas as fontes
      const [googleRate, binanceRate] = await Promise.allSettled([
        this.getGoogleRate(asset),
        this.getBinanceRate(asset)
      ]);

      let message = `💰 **Escolha a Cotação**\n\n`;
      message += `**Ativo:** ${asset}\n`;
      message += `**Quantidade:** ${amount}\n\n`;

      const keyboard: any[][] = [];

      // Cotação Google
      if (googleRate.status === 'fulfilled' && googleRate.value) {
        const total = amount * googleRate.value.rate;
        message += `🌐 **Google Finance**\n`;
        message += `Cotação: R$ ${googleRate.value.rate.toFixed(4)}\n`;
        message += `Total: R$ ${total.toFixed(2)}\n`;
        message += `Fonte: Forex (${googleRate.value.timestamp.toLocaleTimeString('pt-BR')})\n\n`;

        keyboard.push([{
          text: `🌐 Usar Google: R$ ${googleRate.value.rate.toFixed(4)}`,
          callback_data: `use_quote_google_${googleRate.value.rate}_${operationId || 'new'}`
        }]);
      } else {
        message += `🌐 **Google Finance**\n❌ Indisponível\n\n`;
      }

      // Cotação Binance
      if (binanceRate.status === 'fulfilled' && binanceRate.value) {
        const total = amount * binanceRate.value.rate;
        message += `🟡 **Binance**\n`;
        message += `Cotação: R$ ${binanceRate.value.rate.toFixed(4)}\n`;
        message += `Total: R$ ${total.toFixed(2)}\n`;
        message += `Fonte: Crypto (${binanceRate.value.timestamp.toLocaleTimeString('pt-BR')})\n\n`;

        keyboard.push([{
          text: `🟡 Usar Binance: R$ ${binanceRate.value.rate.toFixed(4)}`,
          callback_data: `use_quote_binance_${binanceRate.value.rate}_${operationId || 'new'}`
        }]);
      } else {
        message += `🟡 **Binance**\n❌ Indisponível para ${asset}\n\n`;
      }

      // Botões de ação
      keyboard.push([
        { text: '🔄 Atualizar Cotações', callback_data: `refresh_quotes_${asset}_${amount}` },
        { text: '❌ Cancelar', callback_data: 'cancel_quote_choice' }
      ]);

      if (keyboard.length === 1) {
        message += `⚠️ **Nenhuma cotação disponível no momento.**\n`;
        message += `Tente novamente em alguns instantes.`;
      }

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });

    } catch (error) {
      this.logger.error('Erro ao mostrar escolha de cotação:', error);
      await ctx.editMessageText(
        '❌ **Erro ao buscar cotações**\n\n' +
        'Não foi possível obter as cotações no momento.\n' +
        'Tente novamente em alguns instantes.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '🔄 Tentar Novamente', callback_data: `refresh_quotes_${asset}_${amount}` },
              { text: '❌ Cancelar', callback_data: 'cancel_quote_choice' }
            ]]
          }
        }
      );
    }
  }

  /**
   * Busca cotação do Google Finance
   */
  private async getGoogleRate(asset: AssetType): Promise<QuotationChoice | null> {
    try {
      // DEPIX sempre tem cotação 1:1 com BRL (stablecoin brasileira na rede Liquid)
      if (asset === AssetType.DEPIX) {
        return {
          source: 'google',
          rate: 1.0,
          timestamp: new Date(),
          symbol: 'DEPIXBRL'
        };
      }

      // Mapear assets para símbolos do Google Finance
      const symbolMap = {
        [AssetType.USDT]: 'USD',
        [AssetType.USDC]: 'USD',
        [AssetType.USDE]: 'USD',
        [AssetType.DOLAR]: 'USD',
        [AssetType.EURO]: 'EUR',
        [AssetType.ETH]: 'ETH'
      };

      const symbol = symbolMap[asset];
      if (!symbol) return null;

      if (symbol === 'USD') {
        const rates = await this.currencyApiService.getCurrentRates();
        if (rates.USDBRL) {
          return {
            source: 'google',
            rate: parseFloat(rates.USDBRL.bid),
            timestamp: new Date(),
            symbol: 'USDBRL'
          };
        }
      } else if (symbol === 'EUR') {
        const rates = await this.currencyApiService.getCurrentRates();
        if (rates.EURBRL) {
          return {
            source: 'google',
            rate: parseFloat(rates.EURBRL.bid),
            timestamp: new Date(),
            symbol: 'EURBRL'
          };
        }
      }

      return null;
    } catch (error) {
      this.logger.warn(`Erro ao buscar cotação Google para ${asset}:`, error);
      return null;
    }
  }

  /**
   * Busca cotação da Binance
   */
  private async getBinanceRate(asset: AssetType): Promise<QuotationChoice | null> {
    try {
      // DEPIX sempre tem cotação 1:1 com BRL (stablecoin brasileira na rede Liquid)
      if (asset === AssetType.DEPIX) {
        return {
          source: 'binance',
          rate: 1.0,
          timestamp: new Date(),
          symbol: 'DEPIXBRL'
        };
      }

      // Mapear assets para símbolos da Binance
      const symbolMap = {
        [AssetType.USDT]: 'USDTBRL',
        [AssetType.USDC]: 'USDCBRL',
        [AssetType.ETH]: 'ETHBRL',
        [AssetType.USDE]: 'USDTBRL' // Fallback para USDT
      };

      const symbol = symbolMap[asset];
      if (!symbol) return null;

      const priceData = await this.binancePriceService.getPrice(symbol);
      if (priceData) {
        return {
          source: 'binance',
          rate: priceData.price,
          timestamp: priceData.timestamp,
          symbol: priceData.symbol
        };
      }

      return null;
    } catch (error) {
      this.logger.warn(`Erro ao buscar cotação Binance para ${asset}:`, error);
      return null;
    }
  }

  /**
   * Processa a escolha da cotação
   */
  async processQuotationChoice(
    ctx: any,
    source: 'google' | 'binance',
    rate: number,
    operationId?: string
  ): Promise<QuotationChoice> {
    const choice: QuotationChoice = {
      source,
      rate,
      timestamp: new Date()
    };

    // Confirmar escolha
    const sourceIcon = source === 'google' ? '🌐' : '🟡';
    const sourceName = source === 'google' ? 'Google Finance' : 'Binance';
    
    await ctx.answerCbQuery(
      `${sourceIcon} Cotação ${sourceName} selecionada: R$ ${rate.toFixed(4)}`,
      { show_alert: false }
    );

    return choice;
  }
}
