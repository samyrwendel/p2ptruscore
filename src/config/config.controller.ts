import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigManagementService } from './config-management.service';

@Controller('')
export class ConfigController {
  private readonly logger = new Logger(ConfigController.name);

  constructor(
    private readonly configManagementService: ConfigManagementService,
  ) {}

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
        
        .form-group input {
            width: 100%;
            padding: 15px;
            border: 2px solid #e1e5e9;
            border-radius: 8px;
            font-size: 1em;
            transition: all 0.3s ease;
        }
        
        .form-group input:focus {
            outline: none;
            border-color: #4facfe;
            box-shadow: 0 0 0 3px rgba(79, 172, 254, 0.1);
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
                const response = await fetch('/api/config/env');
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
        }
        
        function updateStatusIndicators(config) {
            updateStatus('tokenStatus', config.TELEGRAM_BOT_TOKEN);
            updateStatus('usernameStatus', config.TELEGRAM_BOT_USERNAME);
            updateStatus('mongoStatus', config.MONGODB_CNN);
            updateStatus('portStatus', config.PORT || '3001');
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
                const response = await fetch('/api/config/env', {
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
}
