import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface BinancePrice {
  symbol: string;
  price: string;
}

export interface PriceData {
  symbol: string;
  price: number;
  source: 'binance';
  timestamp: Date;
}

@Injectable()
export class BinancePriceService {
  private readonly logger = new Logger(BinancePriceService.name);
  
  // Pares P2P suportados
  private readonly P2P_PAIRS = [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 
    'MATICUSDT', 'BTCBRL', 'ETHBRL', 'USDTBRL'
  ];

  constructor(private readonly httpService: HttpService) {}

  /**
   * Busca preços de todos os pares P2P
   */
  async getP2PPrices(): Promise<PriceData[]> {
    try {
      this.logger.log('🔍 Buscando preços P2P da Binance...');
      
      const response = await firstValueFrom(
        this.httpService.get('https://api.binance.com/api/v3/ticker/price')
      );
      
      const allPrices: BinancePrice[] = response.data;
      const timestamp = new Date();
      
      // Filtrar apenas pares P2P
      const p2pPrices = allPrices
        .filter(price => this.P2P_PAIRS.includes(price.symbol))
        .map(price => ({
          symbol: price.symbol,
          price: parseFloat(price.price),
          source: 'binance' as const,
          timestamp
        }));

      this.logger.log(`✅ ${p2pPrices.length} preços P2P obtidos da Binance`);
      return p2pPrices;
      
    } catch (error) {
      this.logger.error('❌ Erro ao buscar preços da Binance:', error.message);
      throw new Error('Falha ao obter cotações da Binance');
    }
  }

  /**
   * Busca preço específico de um par
   */
  async getPrice(symbol: string): Promise<PriceData | null> {
    try {
      if (!this.P2P_PAIRS.includes(symbol.toUpperCase())) {
        this.logger.warn(`⚠️ Par ${symbol} não suportado para P2P`);
        return null;
      }

      this.logger.log(`🔍 Buscando preço ${symbol} da Binance...`);
      
      const response = await firstValueFrom(
        this.httpService.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}`)
      );
      
      const priceData: BinancePrice = response.data;
      
      const result: PriceData = {
        symbol: priceData.symbol,
        price: parseFloat(priceData.price),
        source: 'binance',
        timestamp: new Date()
      };

      this.logger.log(`✅ Preço ${symbol}: ${result.price}`);
      return result;
      
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar preço ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Converte crypto para BRL usando USDT como intermediário
   */
  async convertToBRL(cryptoSymbol: string, amount: number): Promise<number | null> {
    try {
      // Para BTC/ETH que já têm par direto com BRL
      const directPair = `${cryptoSymbol.toUpperCase()}BRL`;
      if (this.P2P_PAIRS.includes(directPair)) {
        const price = await this.getPrice(directPair);
        return price ? amount * price.price : null;
      }

      // Para outras cryptos, usar USDT como intermediário
      const cryptoUsdtPair = `${cryptoSymbol.toUpperCase()}USDT`;
      const usdtBrlPair = 'USDTBRL';

      const [cryptoPrice, usdtPrice] = await Promise.all([
        this.getPrice(cryptoUsdtPair),
        this.getPrice(usdtBrlPair)
      ]);

      if (cryptoPrice && usdtPrice) {
        const usdtAmount = amount * cryptoPrice.price;
        const brlAmount = usdtAmount * usdtPrice.price;
        
        this.logger.log(`💱 Conversão ${cryptoSymbol}: ${amount} → ${usdtAmount} USDT → ${brlAmount} BRL`);
        return brlAmount;
      }

      return null;
      
    } catch (error) {
      this.logger.error(`❌ Erro na conversão ${cryptoSymbol} para BRL:`, error.message);
      return null;
    }
  }

  /**
   * Verifica se um par é suportado
   */
  isSupportedPair(symbol: string): boolean {
    return this.P2P_PAIRS.includes(symbol.toUpperCase());
  }

  /**
   * Lista todos os pares P2P suportados
   */
  getSupportedPairs(): string[] {
    return [...this.P2P_PAIRS];
  }
}