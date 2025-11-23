import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { PendingEvaluationService } from '../../operations/pending-evaluation.service';
import { safeAnswerCbQuery } from './callback.utils';

const logger = new Logger('PendingEvalGuard');

export type UiMode = 'callback' | 'command';

/**
 * Verifica se o usuário possui avaliações pendentes e aciona o UI apropriado.
 * - callback: mostra popup visual (show_alert) e finaliza o fluxo.
 * - command: bloqueio silencioso (não envia mensagens, conforme preferência do projeto).
 * Retorna { blocked, count }.
 */
export async function pendingEvaluationGuard(
  ctx: any,
  userId: Types.ObjectId,
  action: 'criar' | 'aceitar' | 'concluir' | 'confirmar_aceite',
  uiMode: UiMode = 'callback',
  pendingEvaluationService: PendingEvaluationService,
): Promise<{ blocked: boolean; count?: number }> {
  try {
    const hasPending = await pendingEvaluationService.hasPendingEvaluations(userId);
    if (!hasPending) {
      return { blocked: false };
    }

    let count = 0;
    try {
      const pendings = await pendingEvaluationService.getPendingEvaluations(userId);
      count = pendings.length;
    } catch (listErr) {
      logger.warn('Falha ao listar avaliações pendentes:', listErr);
    }

    const popupText = '❌ Você tem uma avaliação pendente. Conclua antes de continuar.';

    if (uiMode === 'callback') {
      await safeAnswerCbQuery(ctx, popupText, true);
    } else {
      // command: não enviar mensagem no chat
      logger.warn(`Bloqueio por avaliação pendente (${action}) — usuário ${ctx?.from?.id}`);
    }
    return { blocked: true, count };
  } catch (error) {
    logger.error('Erro no pendingEvaluationGuard:', error);
    // Em caso de erro, não bloquear para não travar o fluxo indevidamente
    return { blocked: false };
  }
}