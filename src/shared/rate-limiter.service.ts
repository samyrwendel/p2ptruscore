import { Injectable, Logger } from '@nestjs/common';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly limiters = new Map<string, Map<number, RateLimitEntry>>();

  /**
   * Verifica se o usuário excedeu o limite de rate
   * @param userId ID do usuário
   * @param action Nome da ação (ex: 'create_operation', 'evaluate')
   * @param config Configuração de rate limit
   * @returns { allowed: boolean, remaining: number, resetIn: number }
   */
  checkLimit(
    userId: number,
    action: string,
    config: RateLimitConfig,
  ): { allowed: boolean; remaining: number; resetIn: number } {
    const key = action;
    const now = Date.now();

    // Obter ou criar limiter para esta ação
    if (!this.limiters.has(key)) {
      this.limiters.set(key, new Map());
    }

    const actionLimiter = this.limiters.get(key)!;
    const userLimit = actionLimiter.get(userId);

    // Se não existe ou expirou, criar novo
    if (!userLimit || userLimit.resetAt <= now) {
      actionLimiter.set(userId, {
        count: 1,
        resetAt: now + config.windowMs,
      });

      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetIn: config.windowMs,
      };
    }

    // Verificar se excedeu o limite
    if (userLimit.count >= config.maxRequests) {
      const resetIn = userLimit.resetAt - now;
      this.logger.warn(
        `Rate limit exceeded for user ${userId} on action ${action}. Reset in ${Math.ceil(resetIn / 1000)}s`,
      );

      return {
        allowed: false,
        remaining: 0,
        resetIn,
      };
    }

    // Incrementar contador
    userLimit.count++;
    actionLimiter.set(userId, userLimit);

    return {
      allowed: true,
      remaining: config.maxRequests - userLimit.count,
      resetIn: userLimit.resetAt - now,
    };
  }

  /**
   * Limpa entradas expiradas (executar periodicamente)
   */
  cleanup(): void {
    const now = Date.now();
    let totalCleaned = 0;

    for (const [action, limiter] of this.limiters.entries()) {
      let cleaned = 0;
      for (const [userId, entry] of limiter.entries()) {
        if (entry.resetAt <= now) {
          limiter.delete(userId);
          cleaned++;
        }
      }
      totalCleaned += cleaned;
    }

    if (totalCleaned > 0) {
      this.logger.log(`Cleaned ${totalCleaned} expired rate limit entries`);
    }
  }

  /**
   * Reseta o limite de um usuário para uma ação específica (uso administrativo)
   */
  reset(userId: number, action: string): void {
    const limiter = this.limiters.get(action);
    if (limiter) {
      limiter.delete(userId);
      this.logger.log(`Reset rate limit for user ${userId} on action ${action}`);
    }
  }

  /**
   * Formata o tempo de reset em mensagem amigável
   */
  formatResetTime(resetInMs: number): string {
    const seconds = Math.ceil(resetInMs / 1000);

    if (seconds < 60) {
      return `${seconds} segundo${seconds !== 1 ? 's' : ''}`;
    }

    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) {
      return `${minutes} minuto${minutes !== 1 ? 's' : ''}`;
    }

    const hours = Math.ceil(minutes / 60);
    return `${hours} hora${hours !== 1 ? 's' : ''}`;
  }
}
