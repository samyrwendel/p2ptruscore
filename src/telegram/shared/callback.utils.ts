import { Logger } from '@nestjs/common';

const logger = new Logger('CallbackUtils');

/**
 * Responde um callback do Telegram com segurança, evitando erros de timeout/expiração.
 * - Quando `text` é fornecido, envia a resposta com ou sem `show_alert`.
 * - Quando não há `text`, apenas fecha o spinner (silenciosamente).
 * - Ignora erros conhecidos de callback expirado para não poluir logs.
 */
export async function safeAnswerCbQuery(
  ctx: any,
  text?: string,
  showAlert: boolean = false,
): Promise<void> {
  try {
    if (!ctx?.answerCbQuery) {
      return; // não é um contexto de callback
    }

    if (text) {
      await ctx.answerCbQuery(text, showAlert ? { show_alert: true } : undefined);
    } else {
      await ctx.answerCbQuery();
    }
  } catch (error: any) {
    const desc = error?.description || '';
    if (desc.includes('query is too old') || desc.includes('query ID is invalid')) {
      // Erro comum de callback expirado: não precisa logar como erro
      logger.debug(`Callback expirado/ inválido ao responder: ${desc}`);
      return;
    }
    // Outros erros — registrar para diagnóstico
    logger.warn(`Falha ao responder callback: ${desc || error?.message || error}`);
  }
}