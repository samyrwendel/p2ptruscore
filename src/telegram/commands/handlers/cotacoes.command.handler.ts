import { Injectable, Logger } from '@nestjs/common';
import { CurrencyApiService } from '../../../operations/currency-api.service';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class CotacoesCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(CotacoesCommandHandler.name);
  command = /^\/cotacoes(?:@\w+)?$/;

  constructor(
    private readonly currencyApiService: CurrencyApiService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    this.logger.log(`📊 Comando /cotacoes executado por ${ctx.from.id}`);
    
    try {
      await this.showQuotesMenu(ctx);
    } catch (error) {
      this.logger.error('Erro ao mostrar menu de cotações:', error);
      
      await ctx.reply(
        '❌ **Erro ao buscar cotações**\n\n' +
        'Não foi possível obter as cotações atuais do mercado. ' +
        'Tente novamente em alguns instantes.',
        { parse_mode: 'Markdown' }
      );
    }
  }

  private async showQuotesMenu(ctx: TextCommandContext): Promise<void> {
    await ctx.sendChatAction('typing');
    
    const message = (
      '**Central de Cotações TrustScore**\n\n' +
      'Escolha uma opção para ver as cotações atuais:\n\n' +
      '**Principais Stablecoins**\n' +
      '• USD, USDT, USDC, DAI\n\n' +
      '**Criptomoedas Principais**\n' +
      '• Bitcoin, Ethereum, Solana\n\n' +
      '**Moedas Tradicionais**\n' +
      '• Euro, Real\n\n' +
      '**Rápido:** Veja todas as cotações de uma vez'
    );

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '📊 Todas as Cotações',
            callback_data: 'quotes_all'
          }
        ],
        [
          {
            text: '💰 USD/Stablecoins',
            callback_data: 'quotes_stablecoins'
          },
          {
            text: '₿ Bitcoin',
            callback_data: 'quotes_btc'
          }
        ],
        [
          {
            text: '🔷 Ethereum',
            callback_data: 'quotes_eth'
          },
          {
            text: '🟣 Solana',
            callback_data: 'quotes_sol'
          }
        ],
        [
          {
            text: '🌍 Euro',
            callback_data: 'quotes_eur'
          },
          {
            text: '🔄 Atualizar',
            callback_data: 'quotes_refresh'
          }
        ],
        [
          {
            text: '🔙 Voltar ao Menu',
            callback_data: 'quotes_back'
          }
        ]
      ]
    };

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  // Método para lidar com callbacks relacionados a cotações
  async handleCallback(ctx: any): Promise<boolean> {
    const data = ctx.callbackQuery.data;
    
    // Verificar se este callback pertence a este handler
    if (!data.startsWith('quotes_')) {
      return false;
    }
    
    try {
      await ctx.answerCbQuery('⏳ Processando...');

      switch (data) {
        case 'quotes_all':
          await this.showAllQuotes(ctx);
          break;
        case 'quotes_stablecoins':
          await this.showStablecoinQuotes(ctx);
          break;
        case 'quotes_btc':
          await this.showBitcoinQuote(ctx);
          break;
        case 'quotes_eth':
          await this.showEthereumQuote(ctx);
          break;
        case 'quotes_sol':
          await this.showSolanaQuote(ctx);
          break;
        case 'quotes_eur':
          await this.showEuroQuote(ctx);
          break;
        case 'quotes_refresh':
          await this.showQuotesMenuRefresh(ctx);
          break;
        case 'quotes_back':
          await this.handleBackToStart(ctx);
          break;
        default:
          return false;
      }
      
      return true;
    } catch (error) {
      this.logger.error('Erro ao processar callback de cotações:', error);
      try {
        await ctx.answerCbQuery('❌ Erro ao processar solicitação', { show_alert: true });
      } catch (cbError: any) {
        this.logger.warn('Erro ao responder callback de erro:', cbError.description || cbError.message);
      }
      return false;
    }
  }

  private formatCurrencyRateImproved(rate: any, pairName: string, symbol: string = 'R$'): string {
    const price = parseFloat(rate.bid);
    const change = parseFloat(rate.pctChange);
    const changeIcon = change >= 0 ? '🟢' : '🔴';
    const high = parseFloat(rate.high);
    const low = parseFloat(rate.low);
    
    return (
      `**${pairName}**\n` +
      `**Preço:** ${symbol} ${price.toFixed(2)}\n` +
      `**Variação:** ${changeIcon} ${change.toFixed(2)}%\n` +
      `**Máxima:** ${symbol} ${high.toFixed(2)}\n` +
      `**Mínima:** ${symbol} ${low.toFixed(2)}`
    );
  }

  private async showAllQuotes(ctx: any): Promise<void> {
    await ctx.sendChatAction('typing');
    const cotacoesMessage = await this.currencyApiService.getAllRatesFormatted();
    
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '🔙 Voltar ao Menu',
            callback_data: 'quotes_refresh'
          }
        ]
      ]
    };

    await ctx.editMessageText(cotacoesMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  private async showStablecoinQuotes(ctx: any): Promise<void> {
    const rates = await this.currencyApiService.getCurrentRates();
    
    let message = '**Cotações de Stablecoins**\n\n';
    
    if (rates.USDBRL) {
      message += this.formatCurrencyRateImproved(rates.USDBRL, 'USD/BRL') + '\n\n';
      message += '**Aplicável para:** USDT, USDC, DAI, BUSD\n\n';
    }
    
    message += `**Atualizado em:** ${new Date().toLocaleString('pt-BR')}`;

    await this.editWithBackButton(ctx, message);
  }

  private async showBitcoinQuote(ctx: any): Promise<void> {
    const rates = await this.currencyApiService.getCurrentRates();
    
    let message = '**Cotação do Bitcoin**\n\n';
    
    
    
    if (rates.BTCUSD) {
      message += this.formatCurrencyRateImproved(rates.BTCUSD, 'BTC/USD', '$') + '\n\n';
    }
    
    message += `**Atualizado em:** ${new Date().toLocaleString('pt-BR')}`;

    await this.editWithBackButton(ctx, message);
  }

  private async showEthereumQuote(ctx: any): Promise<void> {
    const rates = await this.currencyApiService.getCurrentRates();
    
    let message = '**Cotação do Ethereum**\n\n';
    
    if (rates.ETHBRL) {
      message += this.formatCurrencyRateImproved(rates.ETHBRL, 'ETH/BRL') + '\n\n';
    }
    
    if (rates.ETHUSD) {
      message += this.formatCurrencyRateImproved(rates.ETHUSD, 'ETH/USD', '$') + '\n\n';
    }
    
    message += `**Atualizado em:** ${new Date().toLocaleString('pt-BR')}`;

    await this.editWithBackButton(ctx, message);
  }

  private async showSolanaQuote(ctx: any): Promise<void> {
    const rates = await this.currencyApiService.getCurrentRates();
    
    let message = '**Cotação do Solana**\n\n';
    
    if (rates.SOLBRL) {
      message += this.formatCurrencyRateImproved(rates.SOLBRL, 'SOL/BRL') + '\n\n';
    }
    
    if (rates.SOLUSD) {
      message += this.formatCurrencyRateImproved(rates.SOLUSD, 'SOL/USD', '$') + '\n\n';
    }
    
    message += `**Atualizado em:** ${new Date().toLocaleString('pt-BR')}`;

    await this.editWithBackButton(ctx, message);
  }

  private async showEuroQuote(ctx: any): Promise<void> {
    const rates = await this.currencyApiService.getCurrentRates();
    
    let message = '**Cotação do Euro**\n\n';
    
    if (rates.EURBRL) {
      message += this.formatCurrencyRateImproved(rates.EURBRL, 'EUR/BRL') + '\n\n';
    }
    
    message += `**Atualizado em:** ${new Date().toLocaleString('pt-BR')}`;

    await this.editWithBackButton(ctx, message);
  }

  private async showQuotesMenuRefresh(ctx: any): Promise<void> {
    await ctx.sendChatAction('typing');
    
    const message = (
      '**Central de Cotações TrustScore**\n\n' +
      'Escolha uma opção para ver as cotações atuais:\n\n' +
      '**Principais Stablecoins**\n' +
      '• USD, USDT, USDC, DAI\n\n' +
      '**Criptomoedas Principais**\n' +
      '• Bitcoin, Ethereum, Solana\n\n' +
      '**Moedas Tradicionais**\n' +
      '• Euro, Real\n\n' +
      '**Rápido:** Veja todas as cotações de uma vez'
    );

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '📊 Todas as Cotações',
            callback_data: 'quotes_all'
          }
        ],
        [
          {
            text: '💰 USD/Stablecoins',
            callback_data: 'quotes_stablecoins'
          },
          {
            text: '₿ Bitcoin',
            callback_data: 'quotes_btc'
          }
        ],
        [
          {
            text: '🔷 Ethereum',
            callback_data: 'quotes_eth'
          },
          {
            text: '🟣 Solana',
            callback_data: 'quotes_sol'
          }
        ],
        [
          {
            text: '🌍 Euro',
            callback_data: 'quotes_eur'
          },
          {
            text: '🔄 Atualizar',
            callback_data: 'quotes_refresh'
          }
        ],
        [
          {
            text: '🔙 Voltar ao Menu',
            callback_data: 'quotes_back'
          }
        ]
      ]
    };

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  private async editWithBackButton(ctx: any, message: string): Promise<void> {
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '🔙 Voltar às Cotações',
            callback_data: 'quotes_refresh'
          }
        ],
        [
          {
            text: '🏠 Menu Principal',
            callback_data: 'quotes_back'
          }
        ]
      ]
    };

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  private async handleBackToStart(ctx: any): Promise<void> {
    try {
      // EXATAMENTE a mesma lógica do comando /start (linha 253-300 do start.command.handler.ts)
      const welcomeMessage = 
        '🎉 **Bem-vindo ao P2P Score Bot!**\n\n' +
        '🚀 **Principais funcionalidades:**\n' +
        '• 💰 Criar e gerenciar operações P2P\n' +
        '• ⭐ Ver reputação e histórico de usuários\n' +
        '• 📊 Avaliar transações e parceiros\n' +
        '• 💱 Consultar cotações atuais\n\n' +
        '👇 **Use os botões abaixo para navegar rapidamente:**';

      const mainCommandsKeyboard = {
        inline_keyboard: [
          [
            {
              text: '💰 Criar Operação',
              callback_data: 'start_create_operation'
            },
            {
              text: '📋 Minhas Operações',
              callback_data: 'start_my_operations'
            }
          ],
          [
            {
              text: '⭐ Minha Reputação',
              callback_data: 'start_my_reputation'
            },
            {
              text: '💱 Cotações',
              callback_data: 'start_quotes'
            }
          ],
          [
            {
              text: '📊 Ver Operações',
              callback_data: 'start_view_operations'
            },
            {
              text: '❓ Ajuda',
              callback_data: 'start_help'
            }
          ]
        ]
      };

      // Usar editMessageText em vez de reply (diferença entre callback e comando)
      await ctx.editMessageText(welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: mainCommandsKeyboard
      });
    } catch (error) {
      this.logger.error('Erro ao voltar ao menu:', error);
    }
  }
}
