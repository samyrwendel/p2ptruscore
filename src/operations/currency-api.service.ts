import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface CurrencyRate {
  code: string;
  codein: string;
  name: string;
  high: string;
  low: string;
  varBid: string;
  pctChange: string;
  bid: string;
  ask: string;
  timestamp: string;
  create_date: string;
}

export interface CurrencyApiResponse {
  USDBRL?: CurrencyRate;
  EURBRL?: CurrencyRate;
  BTCUSD?: CurrencyRate;
  BTCBRL?: CurrencyRate;
  ETHUSD?: CurrencyRate;
  ETHBRL?: CurrencyRate;
  SOLUSD?: CurrencyRate;
  SOLBRL?: CurrencyRate;
}

@Injectable()
export class CurrencyApiService {
  private readonly logger = new Logger(CurrencyApiService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private readonly httpService: HttpService) {
    this.apiKey = process.env.CURRENCY_API_KEY || '3d7237cbd0d3ee56ce8eeaac087135beddf5d8fc3292dc5ae44acfee97d86918';
    this.baseUrl = process.env.CURRENCY_API_URL || 'https://economia.awesomeapi.com.br/json/last';
  }

  async getCurrentRates(): Promise<CurrencyApiResponse> {
    try {
      const url = `${this.baseUrl}/USD-BRL,EUR-BRL,BTC-USD,BTC-BRL,ETH-USD,ETH-BRL,SOL-USD,SOL-BRL?token=${this.apiKey}`;
      
      this.logger.log('Fetching current currency rates...');
      const response = await firstValueFrom(
        this.httpService.get<CurrencyApiResponse>(url)
      );
      
      this.logger.log('Currency rates fetched successfully');
      return response.data as CurrencyApiResponse;
    } catch (error) {
      this.logger.error('Failed to fetch currency rates:', error);
      throw new Error('Erro ao buscar cotações atuais');
    }
  }

  async getSuggestedPrice(asset: string): Promise<number | null> {
    try {
      const rates = await this.getCurrentRates();
      
      // Mapear ativos para suas cotações correspondentes
      const assetMapping: { [key: string]: keyof CurrencyApiResponse } = {
        'USDT': 'USDBRL',
        'USDC': 'USDBRL',
        'USDE': 'USDBRL',
        'DAI': 'USDBRL',
        'BUSD': 'USDBRL',
        'BTC': 'BTCBRL',
        'ETH': 'ETHBRL',
        'SOL': 'SOLBRL',
        'EUR': 'EURBRL'
      };
      
      const rateKey = assetMapping[asset.toUpperCase()];
      if (!rateKey || !rates[rateKey]) {
        this.logger.warn(`No rate found for asset: ${asset}`);
        return null;
      }
      
      const rate = rates[rateKey];
      const suggestedPrice = parseFloat(rate.bid);
      
      this.logger.log(`Suggested price for ${asset}: R$ ${suggestedPrice.toFixed(2)}`);
      return suggestedPrice;
    } catch (error) {
      this.logger.error(`Failed to get suggested price for ${asset}:`, error);
      return null;
    }
  }

  formatCurrencyRate(rate: CurrencyRate): string {
    const price = parseFloat(rate.bid);
    const change = parseFloat(rate.pctChange);
    const changeIcon = change >= 0 ? '📈' : '📉';
    const changeColor = change >= 0 ? '🟢' : '🔴';
    
    return (
      `${changeIcon} **${rate.name}**\n` +
      `💰 **Preço:** R$ ${price.toFixed(2)}\n` +
      `${changeColor} **Variação:** ${change.toFixed(2)}%\n` +
      `📊 **Máxima:** R$ ${parseFloat(rate.high).toFixed(2)}\n` +
      `📊 **Mínima:** R$ ${parseFloat(rate.low).toFixed(2)}`
    );
  }

  async getAllRatesFormatted(): Promise<string> {
    try {
      const rates = await this.getCurrentRates();
      let message = '💱 **Cotações Atuais do Mercado**\n\n';
      
      if (rates.USDBRL) {
        message += this.formatCurrencyRate(rates.USDBRL) + '\n\n';
      }
      
      if (rates.BTCBRL) {
        message += this.formatCurrencyRate(rates.BTCBRL) + '\n\n';
      }
      
      if (rates.ETHBRL) {
        message += this.formatCurrencyRate(rates.ETHBRL) + '\n\n';
      }
      
      if (rates.SOLBRL) {
        message += this.formatCurrencyRate(rates.SOLBRL) + '\n\n';
      }
      
      if (rates.EURBRL) {
        message += this.formatCurrencyRate(rates.EURBRL) + '\n\n';
      }
      
      message += `🕐 **Atualizado em:** ${new Date().toLocaleString('pt-BR')}`;
      
      return message;
    } catch (error) {
      return '❌ **Erro ao buscar cotações atuais**\n\nTente novamente em alguns instantes.';
    }
  }
}