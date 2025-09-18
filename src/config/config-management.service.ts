import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';

@Injectable()
export class ConfigManagementService {
  private readonly logger = new Logger(ConfigManagementService.name);
  private readonly envFilePath = join(process.cwd(), '.env');

  async readEnvFile(): Promise<Record<string, string>> {
    try {
      const envContent = await fs.readFile(this.envFilePath, 'utf-8');
      return this.parseEnvContent(envContent);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.warn('Arquivo .env não encontrado, criando um novo');
        await this.createDefaultEnvFile();
        return this.getDefaultConfig();
      }
      throw error;
    }
  }

  async writeEnvFile(config: Record<string, string>): Promise<void> {
    const envContent = this.generateEnvContent(config);
    await fs.writeFile(this.envFilePath, envContent, 'utf-8');
    this.logger.log('Arquivo .env atualizado com sucesso');
  }

  private parseEnvContent(content: string): Record<string, string> {
    const config: Record<string, string> = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Ignorar linhas vazias e comentários
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmedLine.substring(0, equalIndex).trim();
        let value = trimmedLine.substring(equalIndex + 1).trim();
        
        // Remover aspas se existirem
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        config[key] = value;
      }
    }

    return config;
  }

  private generateEnvContent(config: Record<string, string>): string {
    const lines = [
      '# Configuração do TrustScore Bot',
      '# Gerado automaticamente pela interface web',
      '',
      '# Token do bot Telegram (obtenha em @BotFather)',
      `TELEGRAM_BOT_TOKEN=${this.escapeValue(config.TELEGRAM_BOT_TOKEN || '')}`,
      '',
      '# Username do bot (sem @)',
      `TELEGRAM_BOT_USERNAME=${this.escapeValue(config.TELEGRAM_BOT_USERNAME || '')}`,
      '',
      '# IDs dos grupos Telegram (um por linha, separados por vírgula)',
      `TELEGRAM_GROUPS=${this.escapeValue(config.TELEGRAM_GROUPS || '')}`,
      '',
      '# MongoDB Connection String',
      `MONGODB_CNN=${this.escapeValue(config.MONGODB_CNN || '')}`,
      '',
      '# Porta da aplicação',
      `PORT=${config.PORT || '3001'}`,
      '',
      '# Ambiente de execução',
      `NODE_ENV=${config.NODE_ENV || 'production'}`,
      ''
    ];

    return lines.join('\n');
  }

  private escapeValue(value: string): string {
    // Se o valor contém espaços ou caracteres especiais, colocar entre aspas
    if (value.includes(' ') || value.includes('\n') || value.includes('\t') || 
        value.includes('"') || value.includes("'")) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }

  private async createDefaultEnvFile(): Promise<void> {
    const defaultConfig = this.getDefaultConfig();
    await this.writeEnvFile(defaultConfig);
  }

  private getDefaultConfig(): Record<string, string> {
    return {
      TELEGRAM_BOT_TOKEN: '',
      TELEGRAM_BOT_USERNAME: '',
      TELEGRAM_GROUPS: '',
      MONGODB_CNN: 'mongodb://localhost:27017/trustscore',
      PORT: '3001',
      NODE_ENV: 'production'
    };
  }

  async validateConfig(config: Record<string, string>): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Validar token do Telegram
    if (!config.TELEGRAM_BOT_TOKEN || config.TELEGRAM_BOT_TOKEN.trim() === '') {
      errors.push('Token do Telegram é obrigatório');
    } else if (!this.isValidTelegramToken(config.TELEGRAM_BOT_TOKEN)) {
      errors.push('Token do Telegram inválido');
    }

    // Validar username do bot
    if (!config.TELEGRAM_BOT_USERNAME || config.TELEGRAM_BOT_USERNAME.trim() === '') {
      errors.push('Username do bot é obrigatório');
    }

    // Validar MongoDB connection string
    if (!config.MONGODB_CNN || config.MONGODB_CNN.trim() === '') {
      errors.push('String de conexão do MongoDB é obrigatória');
    } else if (!this.isValidMongoUri(config.MONGODB_CNN)) {
      errors.push('String de conexão do MongoDB inválida');
    }

    // Validar porta
    const port = parseInt(config.PORT || '3001');
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('Porta deve ser um número entre 1 e 65535');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private isValidTelegramToken(token: string): boolean {
    // Formato básico: número:string_base64
    const tokenRegex = /^\d+:[A-Za-z0-9_-]+$/;
    return tokenRegex.test(token);
  }

  private isValidMongoUri(uri: string): boolean {
    // Validação básica para MongoDB URI
    return uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://');
  }

  async backupEnvFile(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(process.cwd(), `.env.backup.${timestamp}`);
    
    try {
      const content = await fs.readFile(this.envFilePath, 'utf-8');
      await fs.writeFile(backupPath, content, 'utf-8');
      this.logger.log(`Backup criado: ${backupPath}`);
      return backupPath;
    } catch (error) {
      this.logger.error('Erro ao criar backup:', error);
      throw error;
    }
  }
}
