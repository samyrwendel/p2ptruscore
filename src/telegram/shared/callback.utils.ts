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

/**
 * Apaga a mensagem do callback com segurança. NÃO-FATAL.
 * O Telegram recusa deletar mensagens antigas (>48h) ou não deletáveis
 * ("message can't be deleted for everyone" / "message to delete not found").
 * @returns true se apagou, false se não foi possível (sem lançar).
 */
export async function safeDeleteMessage(ctx: any): Promise<boolean> {
  try {
    if (!ctx?.deleteMessage) return false;
    await ctx.deleteMessage();
    return true;
  } catch (error: any) {
    const desc = error?.description || error?.message || '';
    logger.debug(`deleteMessage não-fatal ignorado: ${desc}`);
    return false;
  }
}

/**
 * Edita o texto da mensagem do callback com segurança. NÃO-FATAL.
 * - "message is not modified" (conteúdo idêntico) => tratado como sucesso.
 * - "message can't be edited" / "message to edit not found" (msg antiga/removida)
 *   => retorna false para o caller decidir um fallback (ex.: enviar nova mensagem).
 * Um clique de UI nunca deve virar "Erro ao processar ação" por falha de edição.
 * @returns true se editou (ou já estava igual), false se não foi possível (sem lançar).
 */
export async function safeEditMessageText(
  ctx: any,
  text: string,
  extra?: any,
): Promise<boolean> {
  try {
    if (!ctx?.editMessageText) return false;
    await ctx.editMessageText(text, extra);
    return true;
  } catch (error: any) {
    const desc = error?.description || error?.message || '';
    if (desc.includes('message is not modified')) {
      return true; // conteúdo idêntico: nada a fazer, é sucesso
    }
    logger.debug(`editMessageText não-fatal ignorado: ${desc}`);
    return false;
  }
}