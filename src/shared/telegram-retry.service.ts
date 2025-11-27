import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RetryConfig {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
}

/**
 * Códigos de erro do Telegram que são retryable (transientes)
 */
const RETRYABLE_ERROR_CODES = [
  429, // Too Many Requests (rate limiting)
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
];

/**
 * Mensagens de erro que indicam problemas transientes
 */
const RETRYABLE_ERROR_MESSAGES = [
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNREFUSED',
  'network',
  'timeout',
  'socket hang up',
  'temporarily unavailable',
];

@Injectable()
export class TelegramRetryService {
  private readonly logger = new Logger(TelegramRetryService.name);
  private readonly defaultMaxRetries: number;
  private readonly defaultInitialDelay: number;
  private readonly defaultMaxDelay: number;
  private readonly defaultBackoffFactor: number;

  constructor(private readonly configService: ConfigService) {
    this.defaultMaxRetries = parseInt(
      this.configService.get<string>('TELEGRAM_RETRY_MAX_ATTEMPTS') || '5',
    );
    this.defaultInitialDelay = parseInt(
      this.configService.get<string>('TELEGRAM_RETRY_INITIAL_DELAY_MS') || '1000',
    );
    this.defaultMaxDelay = parseInt(
      this.configService.get<string>('TELEGRAM_RETRY_MAX_DELAY_MS') || '30000',
    );
    this.defaultBackoffFactor = parseFloat(
      this.configService.get<string>('TELEGRAM_RETRY_BACKOFF_FACTOR') || '2',
    );
  }

  /**
   * Verifica se um erro é retryable (transiente)
   */
  private isRetryableError(error: any): boolean {
    // Verificar código de erro HTTP
    const errorCode = error?.response?.error_code || error?.code || error?.status;
    if (errorCode && RETRYABLE_ERROR_CODES.includes(errorCode)) {
      return true;
    }

    // Verificar mensagem de erro
    const errorMessage = error?.message || error?.description || '';
    const lowerMessage = errorMessage.toLowerCase();

    return RETRYABLE_ERROR_MESSAGES.some(msg =>
      lowerMessage.includes(msg.toLowerCase())
    );
  }

  /**
   * Extrai o tempo de retry do header Retry-After (para 429 errors)
   */
  private getRetryAfterMs(error: any): number | null {
    const retryAfter = error?.response?.parameters?.retry_after;
    if (retryAfter && typeof retryAfter === 'number') {
      return retryAfter * 1000; // Converter segundos para ms
    }
    return null;
  }

  /**
   * Calcula o delay para a próxima tentativa com exponential backoff
   */
  private calculateDelay(
    attempt: number,
    initialDelay: number,
    maxDelay: number,
    backoffFactor: number,
    error?: any,
  ): number {
    // Se for erro 429, usar Retry-After do Telegram
    const retryAfter = this.getRetryAfterMs(error);
    if (retryAfter) {
      return Math.min(retryAfter, maxDelay);
    }

    // Exponential backoff com jitter
    const exponentialDelay = initialDelay * Math.pow(backoffFactor, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    const delay = exponentialDelay + jitter;

    return Math.min(delay, maxDelay);
  }

  /**
   * Aguarda o tempo especificado
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Executa uma função com retry automático para erros transientes
   *
   * @param fn Função assíncrona a ser executada
   * @param config Configuração de retry (opcional)
   * @returns Resultado da função
   *
   * @example
   * await retryService.executeWithRetry(
   *   () => bot.telegram.sendMessage(chatId, message),
   *   { maxRetries: 3 }
   * );
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    config?: RetryConfig,
  ): Promise<T> {
    const maxRetries = config?.maxRetries ?? this.defaultMaxRetries;
    const initialDelay = config?.initialDelayMs ?? this.defaultInitialDelay;
    const maxDelay = config?.maxDelayMs ?? this.defaultMaxDelay;
    const backoffFactor = config?.backoffFactor ?? this.defaultBackoffFactor;

    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Se não for retryable ou já atingiu o máximo de tentativas, lançar erro
        if (!this.isRetryableError(error)) {
          this.logger.warn(
            `Non-retryable error encountered: ${error.message || error}`,
          );
          throw error;
        }

        if (attempt >= maxRetries) {
          this.logger.error(
            `Max retries (${maxRetries}) exceeded. Last error: ${error.message || error}`,
          );
          throw error;
        }

        // Calcular delay e aguardar
        const delay = this.calculateDelay(
          attempt,
          initialDelay,
          maxDelay,
          backoffFactor,
          error,
        );

        this.logger.warn(
          `Retryable error on attempt ${attempt + 1}/${maxRetries}: ${error.message || error}. ` +
          `Retrying in ${Math.round(delay)}ms...`,
        );

        await this.sleep(delay);
      }
    }

    // Não deveria chegar aqui, mas por segurança
    throw lastError;
  }

  /**
   * Executa múltiplas operações em paralelo com retry
   * Continua executando mesmo se algumas falharem
   *
   * @param operations Array de funções assíncronas
   * @param config Configuração de retry
   * @returns Array de resultados (successful) e erros
   */
  async executeMultipleWithRetry<T>(
    operations: Array<() => Promise<T>>,
    config?: RetryConfig,
  ): Promise<{
    successful: T[];
    failed: Array<{ index: number; error: any }>;
  }> {
    const results = await Promise.allSettled(
      operations.map(op => this.executeWithRetry(op, config)),
    );

    const successful: T[] = [];
    const failed: Array<{ index: number; error: any }> = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successful.push(result.value);
      } else {
        failed.push({ index, error: result.reason });
      }
    });

    if (failed.length > 0) {
      this.logger.warn(
        `${failed.length}/${operations.length} operations failed after retries`,
      );
    }

    return { successful, failed };
  }
}
