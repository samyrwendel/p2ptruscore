import { Controller, Get, Post, Body, Render, Res, Req } from '@nestjs/common';
import { Response, Request } from 'express';
import { ConfigManagementService } from './config-management.service';
import * as fs from 'fs';
import * as path from 'path';

@Controller('setup')
export class ConfigWebController {
  constructor(private readonly configService: ConfigManagementService) {}

  @Get()
  @Render('setup')
  async getSetupPage() {
    const envPath = path.join(process.cwd(), '.env');
    const envExists = fs.existsSync(envPath);
    
    let currentConfig = {
      TELEGRAM_BOT_TOKEN: '',
      TELEGRAM_BOT_USERNAME: '',
      TELEGRAM_GROUP_ID: '',
      TELEGRAM_THREAD_ID: '',
      MONGODB_CNN: 'mongodb://admin:password123@mongodb:27017/trustscore_bot?authSource=admin',
      PORT: '3000',
      NODE_ENV: 'production',
      CURRENCY_API_KEY: '',
      CURRENCY_API_URL: 'https://api.coingecko.com/api/v3',
      DEFAULT_CURRENCY: 'BRL'
    };

    if (envExists) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const envLines = envContent.split('\n');
        
        envLines.forEach(line => {
          const trimmedLine = line.trim();
          if (trimmedLine && !trimmedLine.startsWith('#')) {
            const equalIndex = trimmedLine.indexOf('=');
            if (equalIndex > 0) {
              const key = trimmedLine.substring(0, equalIndex).trim();
              const value = trimmedLine.substring(equalIndex + 1).trim();
              if (key && currentConfig.hasOwnProperty(key)) {
                currentConfig[key] = value;
              }
            }
          }
        });
      } catch (error) {
        console.error('Erro ao ler .env:', error);
      }
    }

    const isConfigured = currentConfig.TELEGRAM_BOT_TOKEN && 
                        currentConfig.TELEGRAM_BOT_TOKEN !== 'SEU_TOKEN_AQUI' &&
                        currentConfig.TELEGRAM_BOT_USERNAME &&
                        currentConfig.TELEGRAM_BOT_USERNAME !== 'seu_bot_username';

    return {
      title: 'Configuração TrustScore Bot',
      config: currentConfig,
      isConfigured,
      envExists
    };
  }

  @Post('save')
  async saveConfig(@Body() config: any, @Res() res: Response) {
    try {
      const envPath = path.join(process.cwd(), '.env');
      
      const envContent = `# Configuração do TrustScore Bot - Gerado automaticamente
# Data: ${new Date().toISOString()}

# Token do bot Telegram
TELEGRAM_BOT_TOKEN=${config.TELEGRAM_BOT_TOKEN || ''}

# Username do bot (sem @)
TELEGRAM_BOT_USERNAME=${config.TELEGRAM_BOT_USERNAME || ''}

# IDs dos grupos Telegram
TELEGRAM_GROUP_ID=${config.TELEGRAM_GROUP_ID || ''}
TELEGRAM_THREAD_ID=${config.TELEGRAM_THREAD_ID || ''}

# MongoDB Connection String
MONGODB_CNN=${config.MONGODB_CNN || 'mongodb://admin:password123@mongodb:27017/trustscore_bot?authSource=admin'}

# Porta da aplicação
PORT=${config.PORT || '3000'}

# Ambiente de execução
NODE_ENV=${config.NODE_ENV || 'production'}

# Configurações adicionais
LOG_LEVEL=info
REQUEST_TIMEOUT=30000
RATE_LIMIT_TTL=60
RATE_LIMIT_LIMIT=100
`;

      fs.writeFileSync(envPath, envContent, 'utf8');
      
      res.json({ 
        success: true, 
        message: 'Configuração salva com sucesso! Reinicie o container para aplicar as mudanças.',
        restart_required: true
      });
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Erro ao salvar configuração: ' + error.message 
      });
    }
  }

  @Get('status')
  async getStatus() {
    const envPath = path.join(process.cwd(), '.env');
    const envExists = fs.existsSync(envPath);
    
    let botConfigured = false;
    let mongoConfigured = false;
    let groupConfigured = false;
    let apiConfigured = false;
    
    if (envExists) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        
        // Verificar se o token do bot está configurado
        const tokenMatch = envContent.match(/TELEGRAM_BOT_TOKEN=(.+)/);
        botConfigured = !!(tokenMatch && tokenMatch[1] && 
                       tokenMatch[1] !== 'SEU_TOKEN_AQUI' && 
                       tokenMatch[1] !== '' &&
                       tokenMatch[1].includes(':'));
        
        // Verificar se o MongoDB está configurado
        mongoConfigured = envContent.includes('MONGODB_CNN=mongodb://');
        
        // Verificar se o grupo está configurado
        const groupMatch = envContent.match(/TELEGRAM_GROUP_ID=(.+)/);
        groupConfigured = !!(groupMatch && groupMatch[1] && 
                         groupMatch[1] !== '' &&
                         groupMatch[1].startsWith('-'));
        
        // Verificar se a API de cotação está configurada
        const apiKeyMatch = envContent.match(/CURRENCY_API_KEY=(.+)/);
        const apiUrlMatch = envContent.match(/CURRENCY_API_URL=(.+)/);
        apiConfigured = !!(apiKeyMatch && apiKeyMatch[1] && apiKeyMatch[1] !== '' &&
                       apiUrlMatch && apiUrlMatch[1] && apiUrlMatch[1] !== '');
        
      } catch (error) {
        console.error('Erro ao verificar status:', error);
      }
    }

    return {
      envExists,
      botConfigured,
      mongoConfigured,
      groupConfigured,
      apiConfigured,
      ready: envExists && botConfigured && mongoConfigured && groupConfigured && apiConfigured,
      details: {
        env: envExists ? '✅ Arquivo .env existe' : '❌ Arquivo .env não encontrado',
        bot: botConfigured ? '✅ Token do bot configurado' : '❌ Token do bot não configurado ou inválido',
        mongo: mongoConfigured ? '✅ MongoDB configurado' : '❌ MongoDB não configurado',
        group: groupConfigured ? '✅ Grupo Telegram configurado' : '❌ ID do grupo não configurado',
        api: apiConfigured ? '✅ API de cotação configurada' : '❌ API de cotação não configurada'
      }
    };
  }

  @Get('help')
  @Render('help')
  getHelpPage() {
    return {
      title: 'Ajuda - TrustScore Bot',
      steps: [
        {
          title: 'Criar Bot no Telegram',
          description: 'Acesse @BotFather no Telegram e crie um novo bot',
          details: [
            'Envie /newbot para @BotFather',
            'Escolha um nome para seu bot',
            'Escolha um username (deve terminar com "bot")',
            'Copie o token fornecido'
          ]
        },
        {
          title: 'Configurar Grupos',
          description: 'Adicione o bot aos grupos desejados',
          details: [
            'Adicione o bot como administrador nos grupos',
            'Use /start no grupo para obter o ID',
            'Copie os IDs dos grupos (números negativos)'
          ]
        },
        {
          title: 'Configurar MongoDB',
          description: 'O MongoDB já está configurado automaticamente',
          details: [
            'Usuário: admin',
            'Senha: password123',
            'Banco: trustscore_bot'
          ]
        }
      ]
    };
  }
}