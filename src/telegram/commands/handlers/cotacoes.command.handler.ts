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
      // Mostrar indicador de "digitando"
      await ctx.sendChatAction('typing');
      
      // Buscar cotações atuais
      const cotacoesMessage = await this.currencyApiService.getAllRatesFormatted();
      
      // Criar botões para sugestões de preço
      const inlineKeyboard = {
        inline_keyboard: [
          [
            {
              text: '💰 Usar Cotação USD',
              callback_data: 'use_usd_rate'
            },
            {
              text: '₿ Usar Cotação BTC',
              callback_data: 'use_btc_rate'
            }
          ],
          [
            {
              text: '🔄 Atualizar Cotações',
              callback_data: 'refresh_rates'
            }
          ]
        ]
      };
      
      await ctx.reply(cotacoesMessage, {
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
      });
      
      this.logger.log(`✅ Cotações enviadas para usuário ${ctx.from.id}`);
      
    } catch (error) {
      this.logger.error('Erro ao buscar cotações:', error);
      
      await ctx.reply(
        '❌ **Erro ao buscar cotações**\n\n' +
        'Não foi possível obter as cotações atuais do mercado. ' +
        'Tente novamente em alguns instantes.',
        { parse_mode: 'Markdown' }
      );
    }
  }

  // Método para lidar com callbacks relacionados a cotações
  async handleCallback(ctx: any): Promise<boolean> {
    const data = ctx.callbackQuery.data;
    
    // Verificar se este callback pertence a este handler
    if (!['refresh_rates', 'use_usd_rate', 'use_btc_rate'].includes(data)) {
      return false;
    }
    
    try {
      if (data === 'refresh_rates') {
        try {
        await ctx.answerCbQuery('🔄 Atualizando cotações...');
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado ao atualizar cotações:', cbError.description);
        } else {
          throw cbError;
        }
      }
        
        const cotacoesMessage = await this.currencyApiService.getAllRatesFormatted();
        
        const inlineKeyboard = {
          inline_keyboard: [
            [
              {
                text: '💰 Usar Cotação USD',
                callback_data: 'use_usd_rate'
              },
              {
                text: '₿ Usar Cotação BTC',
                callback_data: 'use_btc_rate'
              }
            ],
            [
              {
                text: '🔄 Atualizar Cotações',
                callback_data: 'refresh_rates'
              }
            ]
          ]
        };
        
        await ctx.editMessageText(cotacoesMessage, {
          parse_mode: 'Markdown',
          reply_markup: inlineKeyboard
        });
        
      } else if (data === 'use_usd_rate') {
        const rates = await this.currencyApiService.getCurrentRates();
        const usdRate = rates.USDBRL?.bid;
        
        if (usdRate) {
          try {
            await ctx.answerCbQuery(
              `💰 Cotação USD: R$ ${parseFloat(usdRate).toFixed(2)}\n\nUse este valor ao criar sua operação!`,
              { show_alert: true }
            );
          } catch (cbError: any) {
            if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
              this.logger.warn('Callback query expirado ao mostrar cotação USD:', cbError.description);
            } else {
              throw cbError;
            }
          }
        } else {
          try {
            await ctx.answerCbQuery('❌ Cotação USD não disponível', { show_alert: true });
          } catch (cbError: any) {
            if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
              this.logger.warn('Callback query expirado ao mostrar erro USD:', cbError.description);
            } else {
              this.logger.error('Erro ao responder callback USD:', cbError);
            }
          }
        }
        
      } else if (data === 'use_btc_rate') {
        const rates = await this.currencyApiService.getCurrentRates();
        const btcRate = rates.BTCBRL?.bid;
        
        if (btcRate) {
          try {
            await ctx.answerCbQuery(
              `₿ Cotação BTC: R$ ${parseFloat(btcRate).toFixed(2)}\n\nUse este valor ao criar sua operação!`,
              { show_alert: true }
            );
          } catch (cbError: any) {
            if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
              this.logger.warn('Callback query expirado ao mostrar cotação BTC:', cbError.description);
            } else {
              throw cbError;
            }
          }
        } else {
          try {
            await ctx.answerCbQuery('❌ Cotação BTC não disponível', { show_alert: true });
          } catch (cbError: any) {
            if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
              this.logger.warn('Callback query expirado ao mostrar erro BTC:', cbError.description);
            } else {
              this.logger.error('Erro ao responder callback BTC:', cbError);
            }
          }
        }
      }
      
      return true; // Callback processado com sucesso
    } catch (error) {
      this.logger.error('Erro ao processar callback de cotações:', error);
      try {
        await ctx.answerCbQuery('❌ Erro ao processar solicitação', { show_alert: true });
      } catch (cbError: any) {
        if (cbError.description?.includes('query is too old') || cbError.description?.includes('query ID is invalid')) {
          this.logger.warn('Callback query expirado no tratamento de erro geral:', cbError.description);
        } else {
          this.logger.error('Erro ao responder callback de erro geral:', cbError);
        }
      }
      return false; // Erro no processamento
    }
  }
}