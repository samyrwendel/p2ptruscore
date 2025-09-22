import { Logger } from '@nestjs/common';
import { TermsAcceptanceService } from '../users/terms-acceptance.service';
import { TextCommandContext } from '../telegram/telegram.types';

const logger = new Logger('TermsValidationUtils');

export async function validateUserTermsForOperation(
  ctx: TextCommandContext,
  termsAcceptanceService: TermsAcceptanceService,
  operationType: 'criar' | 'aceitar' | 'concluir' | 'cancelar' | 'participar' = 'participar'
): Promise<boolean> {
  try {
    // Para comandos em grupos, verificar no próprio grupo
    if (ctx.chat.type !== 'private') {
      const hasAccepted = await termsAcceptanceService.hasUserAcceptedCurrentTerms(
        ctx.from.id,
        ctx.chat.id
      );

      if (!hasAccepted) {
        const actionText = getActionText(operationType);
        await ctx.reply(
          `🚫 **Acesso Negado**\n\n` +
          `❌ Você precisa aceitar os termos de responsabilidade antes de ${actionText}.\n\n` +
          `📋 **Como aceitar:**\n` +
          `1️⃣ Use o comando \`/termos\` para ver os termos atuais\n` +
          `2️⃣ Entre novamente no grupo se necessário\n` +
          `3️⃣ Aceite os termos quando solicitado\n\n` +
          `💡 **Importante:** Apenas usuários que aceitaram os termos podem participar de operações.`,
          { parse_mode: 'Markdown' }
        );
        return false;
      }
    } else {
      // Para comandos privados, verificar em grupos configurados
      const configuredGroups = process.env.TELEGRAM_GROUPS?.split(',').map(id => parseInt(id.trim())) || [];
      
      let hasAcceptedInAnyGroup = false;
      
      for (const groupId of configuredGroups) {
        const hasAccepted = await termsAcceptanceService.hasUserAcceptedCurrentTerms(
          ctx.from.id,
          groupId
        );
        
        if (hasAccepted) {
          hasAcceptedInAnyGroup = true;
          break;
        }
      }

      if (!hasAcceptedInAnyGroup) {
        const actionText = getActionText(operationType);
        await ctx.reply(
          `🚫 **Acesso Negado**\n\n` +
          `❌ Você precisa aceitar os termos de responsabilidade antes de ${actionText}.\n\n` +
          `📋 **Como aceitar:**\n` +
          `1️⃣ Entre em um dos grupos do TrustScore\n` +
          `2️⃣ Aceite os termos quando solicitado\n` +
          `3️⃣ Volte aqui para usar o bot\n\n` +
          `💡 **Comando:** \`/termos\` - para ver os termos atuais`,
          { parse_mode: 'Markdown' }
        );
        return false;
      }
    }

    logger.log(`✅ Usuário ${ctx.from.id} validado - termos aceitos para ${operationType}`);
    return true;
  } catch (error) {
    logger.error(`Erro na validação de termos para usuário ${ctx.from.id}:`, error);
    await ctx.reply('❌ Erro interno na validação. Tente novamente.');
    return false;
  }
}

function getActionText(operationType: string): string {
  switch (operationType) {
    case 'criar': return 'criar operações';
    case 'aceitar': return 'aceitar operações';
    case 'concluir': return 'concluir operações';
    case 'cancelar': return 'cancelar operações';
    default: return 'participar de operações';
  }
}

export async function validateUserTermsForCallback(
  ctx: any,
  termsAcceptanceService: TermsAcceptanceService,
  operationType: string = 'participar'
): Promise<boolean> {
  try {
    const hasAccepted = await termsAcceptanceService.hasUserAcceptedCurrentTerms(
      ctx.from.id,
      ctx.callbackQuery.message.chat.id
    );

    if (!hasAccepted) {
      await ctx.answerCbQuery(
        `🚫 Você precisa aceitar os termos antes de ${getActionText(operationType)}!`,
        { show_alert: true }
      );
      return false;
    }

    return true;
  } catch (error) {
    logger.error(`Erro na validação de termos (callback) para usuário ${ctx.from.id}:`, error);
    await ctx.answerCbQuery('❌ Erro na validação. Tente novamente.', { show_alert: true });
    return false;
  }
}
