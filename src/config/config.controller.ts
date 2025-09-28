import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  HttpStatus,
  Logger,
  Inject,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigManagementService } from './config-management.service';
import { TelegramService } from '../telegram/telegram.service';
import { Connection } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';

@Controller('')
export class ConfigController {
  private readonly logger = new Logger(ConfigController.name);

  constructor(
    private readonly configManagementService: ConfigManagementService,
    private readonly telegramService: TelegramService,
    @InjectConnection() private readonly mongoConnection: Connection,
  ) {}

  @Get('')
  redirectToSetup(@Res() res: Response) {
    res.redirect('/setup');
  }

  // Página /config removida - usar apenas /setup

  @Get('config/env')
  async getEnvConfig() {
    try {
      const config = await this.configManagementService.readEnvFile();
      return config;
    } catch (error) {
      this.logger.error('Erro ao ler configuração:', error);
      return {
        error: true,
        message: 'Erro ao ler arquivo de configuração',
      };
    }
  }

  @Post('config/env')
  async saveEnvConfig(@Body() config: Record<string, string>) {
    try {
      await this.configManagementService.writeEnvFile(config);
      this.logger.log('Configuração salva com sucesso');
      return {
        success: true,
        message: 'Configuração salva com sucesso',
      };
    } catch (error) {
      this.logger.error('Erro ao salvar configuração:', error);
      return {
        error: true,
        message: 'Erro ao salvar configuração: ' + error.message,
      };
    }
  }

  @Get('config/status')
  async getBotStatus(@Res() res?: Response) {
    try {
      const startTime = Date.now();
      
      // Verificar conexão MongoDB
       let mongoStatus = 'disconnected';
       let mongoError = null;
       try {
         const readyState = this.mongoConnection.readyState;
         if (readyState === 1) {
           mongoStatus = 'connected';
         } else if (readyState === 2) {
           mongoStatus = 'connecting';
         } else if (readyState === 3) {
           mongoStatus = 'disconnecting';
         } else {
           mongoStatus = 'disconnected';
         }
       } catch (error) {
         mongoStatus = 'error';
         mongoError = error.message;
       }

      // Verificar status do Telegram Bot
       let telegramStatus = 'unknown';
       let botInfo: any = null;
       let telegramError = null;
       try {
         // Tentar obter informações do bot através do serviço
         botInfo = await (this.telegramService as any).bot.telegram.getMe();
         telegramStatus = 'connected';
       } catch (error) {
         telegramStatus = 'error';
         telegramError = error.message;
       }

      const responseTime = Date.now() - startTime;

      const statusData = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime,
        status: {
          overall: mongoStatus === 'connected' && telegramStatus === 'connected' ? 'healthy' : 'degraded',
          mongodb: {
            status: mongoStatus,
            error: mongoError,
            readyState: this.mongoConnection.readyState
          },
          telegram: {
            status: telegramStatus,
            error: telegramError,
            botInfo: botInfo ? {
              id: botInfo.id,
              username: botInfo.username,
              first_name: botInfo.first_name,
              is_bot: botInfo.is_bot
            } : null
          }
        },
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
        },
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          pid: process.pid
        }
      };

      // Se for uma requisição de browser (Accept: text/html), renderizar HTML
      if (res && res.req.headers.accept && res.req.headers.accept.includes('text/html')) {
        return res.render('status', {
          title: 'Status do TrustScore Bot',
          ...statusData
        });
      }

      // Caso contrário, retornar JSON
      if (res) {
        return res.json(statusData);
      }

      return statusData;
    } catch (error) {
      this.logger.error('Erro ao obter status:', error);
      const errorData = {
        error: true,
        message: 'Erro ao obter status do sistema',
        details: error.message
      };

      // Se for uma requisição de browser, renderizar página de erro
      if (res && res.req.headers.accept && res.req.headers.accept.includes('text/html')) {
        return res.render('status', {
          title: 'Status do TrustScore Bot - Erro',
          hasError: true,
          message: errorData.message,
          details: errorData.details
        });
      }

      if (res) {
        return res.json(errorData);
      }

      return errorData;
    }
  }

  @Post('config/test-message')
  async sendTestMessage(@Body() body: { message?: string }) {
    try {
      const testMessage = body.message || '🤖 **Teste de Conectividade**\n\n✅ Bot TrustScore está online e funcionando!\n\n📅 ' + new Date().toLocaleString('pt-BR');
       
       const bot = (this.telegramService as any).bot;
       if (!bot) {
         throw new Error('Bot do Telegram não está disponível');
       }

       // Obter informações do bot
       const botInfo = await bot.telegram.getMe();
       
       // Tentar enviar mensagem de teste
       let sentMessages: any[] = [];
       let errors: any[] = [];

       // Teste de conectividade básica - verificar se o bot está funcionando
       try {
         // Apenas verificar se conseguimos obter informações do bot (já feito acima)
         sentMessages.push({ 
           type: 'bot_info', 
           id: botInfo.id, 
           username: botInfo.username,
           status: 'Bot conectado e funcionando'
         });
       } catch (error) {
         errors.push({ type: 'bot_info', error: error.message });
       }

       // Obter grupos configurados do arquivo .env
       // Primeiro tentar TELEGRAM_GROUP_ID (novo formato)
       let groupIds: string[] = [];
       
       if (process.env.TELEGRAM_GROUP_ID) {
         groupIds.push(process.env.TELEGRAM_GROUP_ID);
       }
       
       // Depois tentar TELEGRAM_GROUPS (formato antigo)
       const configuredGroups = process.env.TELEGRAM_GROUPS || '';
       if (configuredGroups) {
         const additionalGroups = configuredGroups
           .split('\n')
           .map(id => id.trim())
           .filter(id => id.length > 0);
         groupIds = [...groupIds, ...additionalGroups];
       }
       
       // Remover duplicatas
       groupIds = [...new Set(groupIds)];

       if (groupIds.length > 0) {
         this.logger.log(`Tentando enviar mensagem para ${groupIds.length} grupo(s): ${groupIds.join(', ')}`);
         
         for (const groupId of groupIds) {
           try {
             this.logger.log(`Enviando mensagem para grupo: ${groupId}`);
             
             // Primeiro, verificar se o bot tem acesso ao chat
             const chatInfo = await bot.telegram.getChat(groupId);
             this.logger.log(`Chat encontrado: ${chatInfo.title || chatInfo.first_name || 'Chat sem nome'} (Tipo: ${chatInfo.type})`);
             
             // Verificar se o bot é membro/admin do grupo
             const botMember = await bot.telegram.getChatMember(groupId, botInfo.id);
             this.logger.log(`Status do bot no grupo: ${botMember.status}`);
             
             // Preparar opções da mensagem
             const messageOptions: any = { parse_mode: 'Markdown' };
             
             // Se há TELEGRAM_THREAD_ID configurado, usar como message_thread_id
             if (process.env.TELEGRAM_THREAD_ID) {
               messageOptions.message_thread_id = parseInt(process.env.TELEGRAM_THREAD_ID);
               this.logger.log(`Enviando para thread: ${process.env.TELEGRAM_THREAD_ID}`);
             }
             
             // Enviar mensagem
             const messageResult = await bot.telegram.sendMessage(
               groupId, 
               testMessage + '\n\n🔧 Mensagem de teste automática do painel de controle\n📅 ' + new Date().toLocaleString('pt-BR'), 
               messageOptions
             );
             
             this.logger.log(`Mensagem enviada com sucesso! ID da mensagem: ${messageResult.message_id}`);
             
             sentMessages.push({ 
               type: 'group', 
               id: groupId, 
               name: chatInfo.title || 'Grupo',
               messageId: messageResult.message_id,
               botStatus: botMember.status,
               threadId: process.env.TELEGRAM_THREAD_ID || null
             });
           } catch (error) {
             this.logger.error(`Erro ao enviar para grupo ${groupId}:`, error);
             errors.push({ 
               type: 'group', 
               id: groupId, 
               error: error.message,
               errorCode: error.code || 'UNKNOWN'
             });
           }
         }
       } else {
         // Simular teste bem-sucedido se não há grupos configurados
         sentMessages.push({
           type: 'simulation',
           message: 'Nenhum grupo configurado. Configure IDs de grupos na seção "IDs dos Grupos Telegram" para envio efetivo.'
         });
       }

      this.logger.log(`Mensagem de teste enviada: ${sentMessages.length} sucessos, ${errors.length} erros`);

      return {
         success: true,
         message: 'Mensagem de teste processada',
         results: {
           sent: sentMessages,
           errors: errors,
           botInfo: {
             id: botInfo.id,
             username: botInfo.username,
             first_name: botInfo.first_name
           }
         },
         instructions: {
           forGroups: 'Para testar em grupos reais: 1) Adicione o bot ao grupo, 2) Use /start no grupo, 3) Copie o ID do grupo dos logs, 4) Adicione o ID real no código',
           currentTest: 'Teste atual envia apenas para o próprio bot. IDs de grupos de exemplo não são reais.',
           howToGetGroupId: 'Para obter ID do grupo: adicione o bot, envie uma mensagem e verifique os logs do servidor'
         }
       };
    } catch (error) {
      this.logger.error('Erro ao enviar mensagem de teste:', error);
      return {
        error: true,
        message: 'Erro ao enviar mensagem de teste',
        details: error.message
      };
    }
  }

  @Post('config/test-currency')
  async testCurrencyAPI(@Body() body: { from?: string; to?: string }) {
    try {
      const fromCurrency = body.from || 'USD';
      const toCurrency = body.to || 'BRL';
      
      this.logger.log(`Testando API de cotação: ${fromCurrency}/${toCurrency}`);
      
      // Lista de APIs de fallback em ordem de prioridade
      const apiEndpoints = [
        {
          name: 'AwesomeAPI',
          url: process.env.CURRENCY_API_URL || 'https://economia.awesomeapi.com.br/json/last',
          type: 'awesomeapi'
        },
        {
          name: 'ExchangeRate-API (Backup)',
          url: 'https://api.exchangerate-api.com/v4/latest',
          type: 'exchangerate'
        },
        {
          name: 'Fixer.io (Backup)',
          url: 'https://api.fixer.io/latest',
          type: 'fixer'
        }
      ];
      
      let lastError: any = null;
      
      // Tentar cada API em sequência
      for (const api of apiEndpoints) {
        try {
          this.logger.log(`Tentando API: ${api.name}`);
          
          if (api.type === 'awesomeapi') {
            const response = await fetch(`${api.url}/${fromCurrency}-${toCurrency}`);
            const data = await response.json();
            
            const currencyPair = `${fromCurrency}${toCurrency}`;
            if (data[currencyPair]) {
              const rate = parseFloat(data[currencyPair].bid);
              return {
                success: true,
                rate: rate,
                source: api.name,
                timestamp: new Date(data[currencyPair].create_date).toISOString(),
                pair: `${fromCurrency}/${toCurrency}`,
                apiUsed: api.name
              };
            }
          } else if (api.type === 'exchangerate') {
            const response = await fetch(`${api.url}/${fromCurrency}`);
            const data = await response.json();
            
            if (data.rates && data.rates[toCurrency]) {
              const rate = parseFloat(data.rates[toCurrency]);
              return {
                success: true,
                rate: rate,
                source: api.name,
                timestamp: new Date(data.date).toISOString(),
                pair: `${fromCurrency}/${toCurrency}`,
                apiUsed: api.name
              };
            }
          } else if (api.type === 'fixer') {
            // Fixer.io requer API key, mas podemos tentar
            const apiKey = process.env.FIXER_API_KEY;
            if (apiKey) {
              const response = await fetch(`${api.url}?access_key=${apiKey}&base=${fromCurrency}&symbols=${toCurrency}`);
              const data = await response.json();
              
              if (data.success && data.rates && data.rates[toCurrency]) {
                const rate = parseFloat(data.rates[toCurrency]);
                return {
                  success: true,
                  rate: rate,
                  source: api.name,
                  timestamp: new Date(data.date).toISOString(),
                  pair: `${fromCurrency}/${toCurrency}`,
                  apiUsed: api.name
                };
              }
            } else {
              this.logger.log(`${api.name} requer FIXER_API_KEY, pulando...`);
              continue;
            }
          }
          
        } catch (error) {
          lastError = error;
          this.logger.warn(`Falha na API ${api.name}: ${error.message}`);
          continue; // Tentar próxima API
        }
      }
      
      // Se chegou aqui, todas as APIs falharam
       throw new Error(`Todas as APIs de cotação falharam. Último erro: ${lastError?.message || 'Erro desconhecido'}`);
       
     } catch (error: any) {
       this.logger.error('Erro ao testar API de cotação:', error);
       return {
         success: false,
         message: error.message || 'Erro ao conectar com as APIs de cotação',
         details: error.toString()
       };
     }
  }
}