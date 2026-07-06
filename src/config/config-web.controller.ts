import { Controller, Get, Post, Body, Render, Res, Req, Logger, Query, Param } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Operation, OperationStatus } from '../operations/schemas/operation.schema';
import { OperationsService } from '../operations/operations.service';
import { Response, Request } from 'express';
import { ConfigManagementService } from './config-management.service';
import * as fs from 'fs';
import * as path from 'path';

@Controller('setup')
export class ConfigWebController {
  private readonly logger = new Logger(ConfigWebController.name);
  constructor(
    private readonly configService: ConfigManagementService,
    @InjectModel(Operation.name) private readonly operationModel: Model<Operation>,
    private readonly operationsService: OperationsService,
  ) {}

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
      MONGODB_CNN: 'mongodb://usuario:senha@host:27017/trustscore_bot?authSource=admin',
      PORT: '3000',
      NODE_ENV: 'production',
      CURRENCY_API_KEY: '',
      CURRENCY_API_URL: 'https://api.coingecko.com/api/v3',
      DEFAULT_CURRENCY: 'BRL',
      RATE_LIMIT_TTL: '60000',
      RATE_LIMIT_LIMIT: '100',
      BROADCAST_CONCURRENCY: '3',
      BROADCAST_DELAY_MS: '150',
      TELEGRAM_BACKOFF_RETRIES: '3',
      TELEGRAM_BACKOFF_INITIAL_MS: '500',
      TELEGRAM_BACKOFF_FACTOR: '2',
      REQUEST_TIMEOUT: '5000',
      CACHE_TTL: '60',
      TELEGRAM_ADMIN_CHANNEL_ID: '',
      TELEGRAM_ADMINS: ''
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
        this.logger.error('Erro ao ler .env:', error as any);
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
      envExists,
      stats: await this.getStats()
    };
  }

  private async getStats() {
    try {
      const total = await this.operationModel.countDocuments({}).exec();
      const completed = await this.operationModel.countDocuments({ status: OperationStatus.COMPLETED }).exec();
      const disputed = await this.operationModel.countDocuments({ status: OperationStatus.DISPUTED }).exec();
      const reverted = await this.operationModel.countDocuments({ status: OperationStatus.PENDING, acceptor: { $exists: true } }).exec();
      const cancelled = await this.operationModel.countDocuments({ status: OperationStatus.CANCELLED }).exec();
      return { total, completed, disputed, reverted, cancelled };
    } catch (e) {
      this.logger.error('Erro ao coletar estatísticas:', e as any);
      return { total: '-', completed: '-', disputed: '-', reverted: '-', cancelled: '-' };
    }
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
MONGODB_CNN=${config.MONGODB_CNN || 'mongodb://usuario:senha@host:27017/trustscore_bot?authSource=admin'}

# Porta da aplicação
PORT=${config.PORT || '3000'}

# Ambiente de execução
NODE_ENV=${config.NODE_ENV || 'production'}

# Configurações adicionais
LOG_LEVEL=info
REQUEST_TIMEOUT=${config.REQUEST_TIMEOUT || '5000'}
RATE_LIMIT_TTL=${config.RATE_LIMIT_TTL || '60000'}
RATE_LIMIT_LIMIT=${config.RATE_LIMIT_LIMIT || '100'}
BROADCAST_CONCURRENCY=${config.BROADCAST_CONCURRENCY || '3'}
BROADCAST_DELAY_MS=${config.BROADCAST_DELAY_MS || '150'}
TELEGRAM_BACKOFF_RETRIES=${config.TELEGRAM_BACKOFF_RETRIES || '3'}
TELEGRAM_BACKOFF_INITIAL_MS=${config.TELEGRAM_BACKOFF_INITIAL_MS || '500'}
TELEGRAM_BACKOFF_FACTOR=${config.TELEGRAM_BACKOFF_FACTOR || '2'}
CACHE_TTL=${config.CACHE_TTL || '60'}
TELEGRAM_ADMIN_CHANNEL_ID=${config.TELEGRAM_ADMIN_CHANNEL_ID || ''}
TELEGRAM_ADMINS=${config.TELEGRAM_ADMINS || ''}
`;

      fs.writeFileSync(envPath, envContent, 'utf8');
      
      res.json({ 
        success: true, 
        message: 'Configuração salva com sucesso! Reinicie o container para aplicar as mudanças.',
        restart_required: true
      });
      } catch (error) {
        this.logger.error('Erro ao salvar configuração:', error as any);
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
        this.logger.error('Erro ao verificar status:', error as any);
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

  @Get('disputes')
  async getDisputes() {
    try {
      const items = await this.operationModel
        .find({ status: OperationStatus.DISPUTED })
        .populate('creator', 'userName firstName')
        .populate('acceptor', 'userName firstName')
        .populate('disputedBy', 'userName firstName')
        .sort({ updatedAt: -1 })
        .limit(50)
        .lean()
        .exec();
      const mapped = items.map((op: any) => ({
        _id: op._id,
        status: op.status,
        type: op.type,
        assets: op.assets,
        networks: op.networks,
        amount: op.amount,
        price: op.price,
        reason: op.disputeReason,
        complainant: op.disputedBy ? (op.disputedBy.userName ? '@' + op.disputedBy.userName : op.disputedBy.firstName) : '—',
        defendant: op.acceptor ? (op.acceptor.userName ? '@' + op.acceptor.userName : op.acceptor.firstName) : '—',
        creator: op.creator ? (op.creator.userName ? '@' + op.creator.userName : op.creator.firstName) : '—',
        createdAt: op.disputedAt || op.updatedAt || op.createdAt
      }));
      return { success: true, items: mapped };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  @Get('operations')
  async getOperations(
    @Query('status') status?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    try {
      const filter: any = {};
      if (status) filter.status = status;
      const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
      const items = await this.operationModel
        .find(filter)
        .populate('creator', 'userName firstName')
        .populate('acceptor', 'userName firstName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Math.max(1, Number(limit)))
        .lean()
        .exec();
      const total = await this.operationModel.countDocuments(filter).exec();
      return { success: true, items, total, page: Number(page), limit: Number(limit) };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  @Post('admin/operations/:id/cancel')
  async adminCancel(@Param('id') id: string, @Body('reason') reason?: string) {
    try {
      const opId = (await import('mongoose')).Types.ObjectId.createFromHexString(id);
      const updated = await this.operationsService.adminCancelOperation(opId, { telegramId: 0, username: 'web', firstName: 'WebAdmin' }, reason);
      return { success: true, item: updated };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  @Post('admin/operations/:id/clear')
  async adminClear(@Param('id') id: string, @Body('reason') reason?: string) {
    try {
      const opId = (await import('mongoose')).Types.ObjectId.createFromHexString(id);
      const updated = await this.operationsService.adminClearDispute(opId, { telegramId: 0, username: 'web', firstName: 'WebAdmin' }, reason);
      return { success: true, item: updated };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  @Post('admin/operations/:id/flag')
  async adminFlag(@Param('id') id: string, @Body('reason') reason?: string) {
    try {
      const opId = (await import('mongoose')).Types.ObjectId.createFromHexString(id);
      const updated = await this.operationsService.adminFlagFraud(opId, { telegramId: 0, username: 'web', firstName: 'WebAdmin' }, reason);
      return { success: true, item: updated };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  @Post('admin/disputes/:id/clear')
  async adminClearDispute(@Param('id') id: string, @Body('reason') reason?: string) {
    try {
      const opId = (await import('mongoose')).Types.ObjectId.createFromHexString(id);
      const updated = await this.operationsService.adminClearDispute(opId, { telegramId: 0, username: 'web', firstName: 'WebAdmin' }, reason);
      return { success: true, item: updated };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  @Post('admin/disputes/:id/penalize-accused')
  async adminPenalizeAccused(@Param('id') id: string, @Body('reason') reason?: string) {
    try {
      const opId = (await import('mongoose')).Types.ObjectId.createFromHexString(id);
      const updated = await this.operationsService.adminFlagFraud(opId, { telegramId: 0, username: 'web', firstName: 'WebAdmin' }, reason);
      return { success: true, item: updated };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  @Post('admin/disputes/:id/penalize-accuser')
  async adminPenalizeAccuser(@Param('id') id: string, @Body('reason') reason?: string) {
    try {
      const opId = (await import('mongoose')).Types.ObjectId.createFromHexString(id);
      await this.operationsService.adminPenalizeAccuser(opId, { telegramId: 0, username: 'web', firstName: 'WebAdmin' }, reason);
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
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
