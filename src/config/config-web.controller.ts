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
      CURRENCY_API_KEY: '',
      MONGODB_CNN: 'mongodb://admin:password123@mongodb:27017/trustscore_bot?authSource=admin',
      PORT: '3000',
      NODE_ENV: 'production'
    };

    if (envExists) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const envLines = envContent.split('\n');
        
        envLines.forEach(line => {
          const [key, value] = line.split('=');
          if (key && value && currentConfig.hasOwnProperty(key)) {
            currentConfig[key] = value.trim();
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

# ID do grupo Telegram principal
TELEGRAM_GROUP_ID=${config.TELEGRAM_GROUP_ID || ''}

# ID do tópico P2P dentro do grupo (opcional)
TELEGRAM_THREAD_ID=${config.TELEGRAM_THREAD_ID || ''}

# Chave da API de cotações (AwesomeAPI)
CURRENCY_API_KEY=${config.CURRENCY_API_KEY || '3d7237cbd0d3ee56ce8eeaac087135beddf5d8fc3292dc5ae44acfee97d86918'}

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
    
    if (envExists) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        botConfigured = envContent.includes('TELEGRAM_BOT_TOKEN=') && 
                       !envContent.includes('TELEGRAM_BOT_TOKEN=SEU_TOKEN_AQUI') &&
                       !envContent.includes('TELEGRAM_BOT_TOKEN=');
        mongoConfigured = envContent.includes('MONGODB_CNN=mongodb://');
      } catch (error) {
        console.error('Erro ao verificar status:', error);
      }
    }

    return {
      envExists,
      botConfigured,
      mongoConfigured,
      ready: envExists && botConfigured && mongoConfigured
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
          title: 'Configurar API de Cotações',
          description: 'Configure a chave da API para cotações de moedas',
          details: [
            'Acesse: https://docs.awesomeapi.com.br/api-de-moedas',
            'Registre-se para obter uma chave gratuita',
            'Cole a chave no campo correspondente',
            'A chave padrão funciona mas tem limites de uso'
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