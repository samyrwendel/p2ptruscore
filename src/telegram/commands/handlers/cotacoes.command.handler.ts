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
        await ctx.answerCbQuery('🔄 Atualizando cotações...');
        
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
          await ctx.answerCbQuery(
            `💰 Cotação USD: R$ ${parseFloat(usdRate).toFixed(2)}\n\nUse este valor ao criar sua operação!`,
            { show_alert: true }
          );
        } else {
          await ctx.answerCbQuery('❌ Cotação USD não disponível', { show_alert: true });
        }
        
      } else if (data === 'use_btc_rate') {
        const rates = await this.currencyApiService.getCurrentRates();
        const btcRate = rates.BTCBRL?.bid;
        
        if (btcRate) {
          await ctx.answerCbQuery(
            `₿ Cotação BTC: R$ ${parseFloat(btcRate).toFixed(2)}\n\nUse este valor ao criar sua operação!`,
            { show_alert: true }
          );
        } else {
          await ctx.answerCbQuery('❌ Cotação BTC não disponível', { show_alert: true });
        }
      }
      
      return true; // Callback processado com sucesso
    } catch (error) {
      this.logger.error('Erro ao processar callback de cotações:', error);
      try {
        await ctx.answerCbQuery('❌ Erro ao processar solicitação', { show_alert: true });
      } catch (cbError) {
        // Ignorar erro de callback expirado
        if (cbError.message && cbError.message.includes('query is too old')) {
          this.logger.warn('Callback query expirado no tratamento de erro:', cbError.message);
        } else {
          this.logger.error('Erro ao responder callback query:', cbError);
        }
      }
      return false; // Erro no processamento
    }
  }
}