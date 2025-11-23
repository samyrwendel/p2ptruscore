import { Injectable, Logger } from '@nestjs/common';

interface PopupFlag {
  expiresAt: number;
}

@Injectable()
export class PopupStateService {
  private readonly logger = new Logger(PopupStateService.name);
  // chave: `${userId}:${chatId}:${scope}`
  private readonly flags = new Map<string, PopupFlag>();

  /**
   * Marca que o próximo callback dentro do escopo deve mostrar popup (one-shot)
   * @param userId telegram user id
   * @param chatId telegram chat id
   * @param scope escopo, ex: 'create_op'
   * @param ttlMs tempo em ms até expirar
   */
  setNextPopup(userId: number, chatId: number, scope: string, ttlMs = 60_000): void {
    const key = this.key(userId, chatId, scope);
    const expiresAt = Date.now() + ttlMs;
    this.flags.set(key, { expiresAt });
    this.logger.debug(`Flag de popup setada: ${key} (ttl ${ttlMs}ms)`);
  }

  /**
   * Consome a flag se existir e não estiver expirada.
   * Retorna true se consumiu (deve mostrar popup), caso contrário false.
   */
  consumeNextPopup(userId: number, chatId: number, scope: string): boolean {
    const key = this.key(userId, chatId, scope);
    const flag = this.flags.get(key);
    if (!flag) return false;
    if (flag.expiresAt < Date.now()) {
      this.flags.delete(key);
      return false;
    }
    // one-shot: remover ao consumir
    this.flags.delete(key);
    return true;
  }

  private key(userId: number, chatId: number, scope: string): string {
    return `${userId}:${chatId}:${scope}`;
  }
}