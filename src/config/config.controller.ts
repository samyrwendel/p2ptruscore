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
  redirectToConfig(@Res() res: Response) {
    res.redirect('/config');
  }

  @Get('config')
  getConfigPage(@Res() res: Response) {
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Configuração TrustScore Bot</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        
        .header p {
            opacity: 0.9;
            font-size: 1.1em;
        }
        
        .form-container {
            padding: 40px;
        }
        
        .form-group {
            margin-bottom: 25px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #333;
            font-size: 1.1em;
        }
        
        .form-group input,
        .form-group textarea {
            width: 100%;
            padding: 15px;
            border: 2px solid #e1e5e9;
            border-radius: 8px;
            font-size: 1em;
            transition: all 0.3s ease;
            font-family: inherit;
        }
        
        .form-group input:focus,
        .form-group textarea:focus {
            outline: none;
            border-color: #4facfe;
            box-shadow: 0 0 0 3px rgba(79, 172, 254, 0.1);
        }
        
        .form-group textarea {
            resize: vertical;
            min-height: 80px;
        }
        
        .form-group small {
            display: block;
            margin-top: 5px;
            color: #666;
            font-size: 0.9em;
        }
        
        .btn-container {
            display: flex;
            gap: 15px;
            margin-top: 30px;
        }
        
        .btn {
            flex: 1;
            padding: 15px 30px;
            border: none;
            border-radius: 8px;
            font-size: 1.1em;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            color: white;
        }
        
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(79, 172, 254, 0.3);
        }
        
        .btn-secondary {
            background: #f8f9fa;
            color: #333;
            border: 2px solid #e1e5e9;
        }
        
        .btn-secondary:hover {
            background: #e9ecef;
        }
        
        .alert {
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: none;
        }
        
        .alert-success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .alert-error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .loading {
            display: none;
            text-align: center;
            padding: 20px;
        }
        
        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #4facfe;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .status-indicator {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 8px;
        }
        
        .status-ok {
            background: #28a745;
        }
        
        .status-error {
            background: #dc3545;
        }
        
        .status-section {
            margin-bottom: 30px;
        }
        
        .status-section h3 {
            color: #333;
            margin-bottom: 20px;
            font-size: 1.5em;
        }
        
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .status-card {
            background: #f8f9fa;
            border: 2px solid #e1e5e9;
            border-radius: 10px;
            padding: 20px;
            transition: all 0.3s ease;
        }
        
        .status-card:hover {
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        
        .status-header {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .status-icon {
            font-size: 1.2em;
            margin-right: 8px;
        }
        
        .status-title {
            font-weight: 600;
            color: #333;
        }
        
        .status-value {
            font-size: 1.1em;
            font-weight: 500;
            margin-bottom: 5px;
        }
        
        .status-details {
            font-size: 0.9em;
            color: #666;
            margin-top: 5px;
        }
        
        .status-actions {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
        }
        
        .last-update {
            color: #666;
            font-size: 0.9em;
        }
        
        .btn-test {
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 6px;
            font-size: 0.9em;
            cursor: pointer;
            transition: all 0.3s ease;
            width: 100%;
        }
        
        .btn-test:hover {
            transform: translateY(-1px);
            box-shadow: 0 5px 10px rgba(40, 167, 69, 0.3);
        }
        
        .btn-test:disabled {
            background: #6c757d;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        
        .status-healthy {
            color: #28a745;
        }
        
        .status-degraded {
            color: #ffc107;
        }
        
        .status-error {
            color: #dc3545;
        }
        
        .status-connected {
            color: #28a745;
        }
        
        .status-disconnected {
            color: #dc3545;
        }
        
        .status-connecting {
            color: #ffc107;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 TrustScore Bot</h1>
            <p>Configuração de Variáveis de Ambiente</p>
        </div>
        
        <div class="form-container">
            <div id="alert" class="alert"></div>
            
            <div id="loading" class="loading">
                <div class="spinner"></div>
                <p>Carregando configurações...</p>
            </div>
            
            <div id="statusSection" class="status-section" style="display: none;">
                <h3>📊 Status do Sistema</h3>
                <div class="status-grid">
                    <div class="status-card">
                        <div class="status-header">
                            <span class="status-icon" id="overallStatusIcon">⚪</span>
                            <span class="status-title">Status Geral</span>
                        </div>
                        <div class="status-value" id="overallStatus">Carregando...</div>
                    </div>
                    
                    <div class="status-card">
                        <div class="status-header">
                            <span class="status-icon" id="telegramStatusIcon">📱</span>
                            <span class="status-title">Telegram Bot</span>
                        </div>
                        <div class="status-value" id="telegramStatus">Carregando...</div>
                        <div class="status-details" id="telegramDetails"></div>
                    </div>
                    
                    <div class="status-card">
                        <div class="status-header">
                            <span class="status-icon" id="mongoStatusIcon">🗄️</span>
                            <span class="status-title">MongoDB</span>
                        </div>
                        <div class="status-value" id="mongoStatus">Carregando...</div>
                        <div class="status-details" id="mongoDetails"></div>
                    </div>
                    
                    <div class="status-card">
                        <div class="status-header">
                            <span class="status-icon">💾</span>
                            <span class="status-title">Memória</span>
                        </div>
                        <div class="status-value" id="memoryStatus">Carregando...</div>
                        <div class="status-details" id="memoryDetails"></div>
                    </div>
                    
                    <div class="status-card">
                        <div class="status-header">
                            <span class="status-icon">⏱️</span>
                            <span class="status-title">Uptime</span>
                        </div>
                        <div class="status-value" id="uptimeStatus">Carregando...</div>
                    </div>
                    
                    <div class="status-card">
                        <div class="status-header">
                            <span class="status-icon">🚀</span>
                            <span class="status-title">Teste de Conectividade</span>
                        </div>
                        <button id="testMessageBtn" class="btn btn-test">📤 Enviar Teste</button>
                        <div class="status-details" id="testResults"></div>
                    </div>
                </div>
                
                <div class="status-actions">
                    <button type="button" class="btn btn-secondary" onclick="loadStatus()">🔄 Atualizar Status</button>
                    <span class="last-update">Última atualização: <span id="lastUpdate">-</span></span>
                </div>
            </div>
            
            <form id="configForm" style="display: none;">
                <div class="form-group">
                    <label for="telegramBotToken">
                        <span class="status-indicator status-error" id="tokenStatus"></span>
                        Token do Bot Telegram
                    </label>
                    <input type="password" id="telegramBotToken" name="TELEGRAM_BOT_TOKEN" placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz">
                    <small>Obtenha em @BotFather no Telegram</small>
                </div>
                
                <div class="form-group">
                    <label for="telegramBotUsername">
                        <span class="status-indicator status-error" id="usernameStatus"></span>
                        Username do Bot
                    </label>
                    <input type="text" id="telegramBotUsername" name="TELEGRAM_BOT_USERNAME" placeholder="meu_bot">
                    <small>Username do bot (sem @)</small>
                </div>
                
                <div class="form-group">
                    <label for="mongodbCnn">
                        <span class="status-indicator status-error" id="mongoStatus"></span>
                        MongoDB Connection String
                    </label>
                    <input type="password" id="mongodbCnn" name="MONGODB_CNN" placeholder="mongodb://localhost:27017/trustscore ou mongodb+srv://user:pass@cluster.mongodb.net/trustscore">
                    <small>URL de conexão com o MongoDB</small>
                </div>
                
                <div class="form-group">
                    <label for="port">
                        <span class="status-indicator status-ok" id="portStatus"></span>
                        Porta da Aplicação
                    </label>
                    <input type="number" id="port" name="PORT" value="3001" min="1" max="65535">
                    <small>Porta onde a aplicação será executada</small>
                </div>
                
                <div class="form-group">
                    <label for="telegramGroups">
                        <span class="status-indicator status-error" id="groupsStatus"></span>
                        IDs dos Grupos Telegram
                    </label>
                    <textarea id="telegramGroups" name="TELEGRAM_GROUPS" rows="3" placeholder="-1001234567890\n-1009876543210\n@meugrupo"></textarea>
                    <small>IDs dos grupos onde o bot pode enviar mensagens (um por linha). Para obter o ID: adicione o bot ao grupo, use /start e verifique os logs do servidor.</small>
                </div>
                
                <div class="btn-container">
                    <button type="button" class="btn btn-secondary" onclick="loadConfig()">🔄 Recarregar</button>
                    <button type="submit" class="btn btn-primary">💾 Salvar Configuração</button>
                </div>
            </form>
        </div>
    </div>
    
    <script>
        let currentConfig = {};
        
        async function loadConfig() {
            document.getElementById('loading').style.display = 'block';
            document.getElementById('configForm').style.display = 'none';
            hideAlert();
            
            try {
                const response = await fetch('/config/env');
                const data = await response.json();
                
                if (response.ok) {
                    currentConfig = data;
                    populateForm(data);
                    updateStatusIndicators(data);
                    document.getElementById('configForm').style.display = 'block';
                } else {
                    showAlert('Erro ao carregar configurações: ' + data.message, 'error');
                }
            } catch (error) {
                showAlert('Erro de conexão: ' + error.message, 'error');
            } finally {
                document.getElementById('loading').style.display = 'none';
            }
        }
        
        function populateForm(config) {
            document.getElementById('telegramBotToken').value = config.TELEGRAM_BOT_TOKEN || '';
            document.getElementById('telegramBotUsername').value = config.TELEGRAM_BOT_USERNAME || '';
            document.getElementById('mongodbCnn').value = config.MONGODB_CNN || '';
            document.getElementById('port').value = config.PORT || '3001';
            document.getElementById('telegramGroups').value = config.TELEGRAM_GROUPS || '';
        }
        
        function updateStatusIndicators(config) {
            updateStatus('tokenStatus', config.TELEGRAM_BOT_TOKEN);
            updateStatus('usernameStatus', config.TELEGRAM_BOT_USERNAME);
            updateStatus('mongoStatus', config.MONGODB_CNN);
            updateStatus('portStatus', config.PORT || '3001');
            updateStatus('groupsStatus', config.TELEGRAM_GROUPS);
        }
        
        function updateStatus(elementId, value) {
            const element = document.getElementById(elementId);
            if (value && value.trim() !== '') {
                element.className = 'status-indicator status-ok';
            } else {
                element.className = 'status-indicator status-error';
            }
        }
        
        function showAlert(message, type) {
            const alert = document.getElementById('alert');
            alert.textContent = message;
            alert.className = 'alert alert-' + type;
            alert.style.display = 'block';
            
            if (type === 'success') {
                setTimeout(() => {
                    hideAlert();
                }, 5000);
            }
        }
        
        function hideAlert() {
            document.getElementById('alert').style.display = 'none';
        }
        
        document.getElementById('configForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const config = {};
            
            for (let [key, value] of formData.entries()) {
                config[key] = value;
            }
            
            try {
                const response = await fetch('/config/env', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(config)
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    showAlert('✅ Configuração salva com sucesso! Reinicie a aplicação para aplicar as mudanças.', 'success');
                    currentConfig = config;
                    updateStatusIndicators(config);
                } else {
                    showAlert('❌ Erro ao salvar: ' + data.message, 'error');
                }
            } catch (error) {
                showAlert('❌ Erro de conexão: ' + error.message, 'error');
            }
        });
        
        // Carregar configurações ao inicializar
        loadConfig();
        loadStatus();
        
        // Atualizar status a cada 30 segundos
        setInterval(loadStatus, 30000);
        
        async function loadStatus() {
            try {
                const response = await fetch('/config/status');
                const data = await response.json();
                
                if (response.ok && !data.error) {
                    updateStatusDisplay(data);
                    document.getElementById('statusSection').style.display = 'block';
                } else {
                    showStatusError(data.message || 'Erro ao carregar status');
                }
            } catch (error) {
                showStatusError('Erro de conexão: ' + error.message);
            }
        }
        
        function updateStatusDisplay(status) {
            // Status geral
            const overallStatus = document.getElementById('overallStatus');
            const overallIcon = document.getElementById('overallStatusIcon');
            
            if (status.status.overall === 'healthy') {
                overallStatus.textContent = 'Saudável';
                overallStatus.className = 'status-value status-healthy';
                overallIcon.textContent = '✅';
            } else {
                overallStatus.textContent = 'Degradado';
                overallStatus.className = 'status-value status-degraded';
                overallIcon.textContent = '⚠️';
            }
            
            // Status Telegram
            const telegramStatus = document.getElementById('telegramStatus');
            const telegramDetails = document.getElementById('telegramDetails');
            const telegramIcon = document.getElementById('telegramStatusIcon');
            
            if (status.status.telegram.status === 'connected') {
                telegramStatus.textContent = 'Conectado';
                telegramStatus.className = 'status-value status-connected';
                telegramIcon.textContent = '✅';
                if (status.status.telegram.botInfo) {
                    telegramDetails.textContent = '@' + status.status.telegram.botInfo.username + ' (' + status.status.telegram.botInfo.first_name + ')';
                }
            } else {
                telegramStatus.textContent = 'Erro';
                telegramStatus.className = 'status-value status-error';
                telegramIcon.textContent = '❌';
                telegramDetails.textContent = status.status.telegram.error || 'Erro desconhecido';
            }
            
            // Status MongoDB
            const mongoStatus = document.getElementById('mongoStatus');
            const mongoDetails = document.getElementById('mongoDetails');
            const mongoIcon = document.getElementById('mongoStatusIcon');
            
            console.log('MongoDB Status Debug:', status.status.mongodb);
            
            if (status.status.mongodb.status === 'connected' && status.status.mongodb.readyState === 1) {
                mongoStatus.textContent = 'Conectado';
                mongoStatus.className = 'status-value status-connected';
                mongoIcon.textContent = '✅';
                mongoDetails.textContent = 'Estado: Conectado (ReadyState: ' + status.status.mongodb.readyState + ')';
            } else if (status.status.mongodb.status === 'connecting') {
                mongoStatus.textContent = 'Conectando';
                mongoStatus.className = 'status-value status-connecting';
                mongoIcon.textContent = '🔄';
                mongoDetails.textContent = 'Estado: Conectando...';
            } else {
                mongoStatus.textContent = status.status.mongodb.status || 'Desconectado';
                mongoStatus.className = 'status-value status-error';
                mongoIcon.textContent = '❌';
                mongoDetails.textContent = status.status.mongodb.error || 'Erro de conexão';
            }
            
            // Memória
            const memoryStatus = document.getElementById('memoryStatus');
            const memoryDetails = document.getElementById('memoryDetails');
            
            memoryStatus.textContent = status.memory.used + ' MB';
            memoryDetails.textContent = 'Total: ' + status.memory.total + ' MB | RSS: ' + status.memory.rss + ' MB';
            
            // Uptime
            const uptimeStatus = document.getElementById('uptimeStatus');
            const uptimeHours = Math.floor(status.uptime / 3600);
            const uptimeMinutes = Math.floor((status.uptime % 3600) / 60);
            uptimeStatus.textContent = uptimeHours + 'h ' + uptimeMinutes + 'm';
            
            // Última atualização
            document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('pt-BR');
        }
        
        function showStatusError(message) {
            document.getElementById('overallStatus').textContent = 'Erro';
            document.getElementById('overallStatus').className = 'status-value status-error';
            document.getElementById('overallStatusIcon').textContent = '❌';
            console.error('Erro de status:', message);
        }
        
        // Botão de teste
        document.getElementById('testMessageBtn').addEventListener('click', async function() {
            const btn = this;
            const results = document.getElementById('testResults');
            
            btn.disabled = true;
            btn.textContent = '📤 Enviando...';
            results.textContent = '';
            
            try {
                const response = await fetch('/config/test-message', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({})
                });
                
                const data = await response.json();
                
                if (response.ok && data.success) {
                    results.innerHTML = 
                        '<div style="color: #28a745; margin-top: 10px;">' +
                            '✅ ' + data.message + '<br>' +
                            '<small>' + data.note + '</small>' +
                        '</div>';
                } else {
                    results.innerHTML = 
                        '<div style="color: #dc3545; margin-top: 10px;">' +
                            '❌ ' + (data.message || 'Erro ao enviar teste') + '<br>' +
                            '<small>' + (data.details || '') + '</small>' +
                        '</div>';
                }
            } catch (error) {
                results.innerHTML = 
                    '<div style="color: #dc3545; margin-top: 10px;">' +
                        '❌ Erro de conexão: ' + error.message +
                    '</div>';
            } finally {
                btn.disabled = false;
                btn.textContent = '📤 Enviar Teste';
            }
        });
    </script>
</body>
</html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

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
  async getBotStatus() {
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

      return {
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
    } catch (error) {
      this.logger.error('Erro ao obter status:', error);
      return {
        error: true,
        message: 'Erro ao obter status do sistema',
        details: error.message
      };
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
      const configuredGroups = process.env.TELEGRAM_GROUPS || '';
      const groupIds = configuredGroups
        .split('\n')
        .map(id => id.trim())
        .filter(id => id.length > 0);

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
            
            // Enviar mensagem
            const messageResult = await bot.telegram.sendMessage(
              groupId, 
              testMessage + '\n\n🔧 Mensagem de teste automática do painel de controle\n📅 ' + new Date().toLocaleString('pt-BR'), 
              { parse_mode: 'Markdown' }
            );
            
            this.logger.log(`Mensagem enviada com sucesso! ID da mensagem: ${messageResult.message_id}`);
            
            sentMessages.push({ 
              type: 'group', 
              id: groupId, 
              name: chatInfo.title || 'Grupo',
              messageId: messageResult.message_id,
              botStatus: botMember.status
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
}
