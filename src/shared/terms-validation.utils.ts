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
        
        // Para callbacks, usar answerCbQuery se disponível, senão usar reply
        if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
          try {
            await ctx.answerCbQuery(
              `🚫 ACESSO NEGADO\n\n` +
              `❌ Você precisa ACEITAR OS TERMOS antes de ${actionText}!\n\n` +
              `📋 COMO RESOLVER:\n` +
              `1️⃣ Use o comando /termos\n` +
              `2️⃣ Leia e aceite os termos\n` +
              `3️⃣ Volte aqui e tente novamente\n\n` +
              `💡 Apenas quem aceitou os termos pode usar o P2P!`,
              { show_alert: true }
            );
          } catch (error) {
            logger.error('Erro ao enviar popup de termos:', error);
            // REMOVIDO: Não enviar mensagem no chat em nenhum caso
            // Apenas logar o erro e retornar false
          }
        } else {
          // REMOVIDO: Não enviar mensagem no chat em nenhum caso
          // Apenas retornar false silenciosamente
        }
        return false;
      }
    } else {
      // Para comandos privados, verificar no grupo configurado
      const configuredGroupId = parseInt(process.env.TELEGRAM_GROUP_ID || '0');
      
      if (configuredGroupId === 0) {
        return false; // Nenhum grupo configurado
      }
      
      const hasAccepted = await termsAcceptanceService.hasUserAcceptedCurrentTerms(
        ctx.from.id,
        configuredGroupId
      );
      
      if (!hasAccepted) {
        const actionText = getActionText(operationType);
        
        // Para callbacks, usar answerCbQuery se disponível, senão usar reply
        if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
          try {
            await ctx.answerCbQuery(
              `🚫 ACESSO NEGADO\n\n` +
              `❌ Você precisa ACEITAR OS TERMOS antes de ${actionText}!\n\n` +
              `📋 COMO RESOLVER:\n` +
              `1️⃣ Use o comando /termos\n` +
              `2️⃣ Leia e aceite os termos\n` +
              `3️⃣ Volte aqui e tente novamente\n\n` +
              `💡 Apenas quem aceitou os termos pode usar o P2P!`,
              { show_alert: true }
            );
          } catch (error) {
            logger.error('Erro ao enviar popup de termos:', error);
            // REMOVIDO: Não enviar mensagem no chat em nenhum caso
            // Apenas logar o erro
          }
        } else {
          // REMOVIDO: Não enviar mensagem no chat em nenhum caso
          // Apenas retornar false silenciosamente
        }
        return false;
      }
    }

    logger.log(`✅ Usuário ${ctx.from.id} validado - termos aceitos para ${operationType}`);
    return true;
  } catch (error) {
    // REMOVIDO: Não enviar mensagem no chat em caso de erro
    // Apenas logar o erro
    logger.error(`Erro na validação de termos para usuário ${ctx.from.id}:`, error);
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
    const chatType = ctx.callbackQuery.message.chat.type;
    
    // Se está em chat privado, verificar no grupo configurado
    if (chatType === 'private') {
      const configuredGroupId = parseInt(process.env.TELEGRAM_GROUP_ID || '0');
      
      if (configuredGroupId === 0) {
        return false; // Nenhum grupo configurado
      }
      
      const hasAccepted = await termsAcceptanceService.hasUserAcceptedCurrentTerms(
        ctx.from.id,
        configuredGroupId
      );
      
      if (hasAccepted) {
        return true; // Aceitou termos no grupo
      }
      
      // Não aceitou termos no grupo configurado - POPUP ENCURTADO
      await ctx.answerCbQuery(
        `🚫 ACESSO NEGADO\n\n` +
        `❌ Você precisa ACEITAR OS TERMOS!\n\n` +
        `📋 PARA CONTINUAR:\n` +
        `1️⃣ Entre no grupo TrustScore P2P\n` +
        `2️⃣ Use o comando /termos\n` +
        `3️⃣ Aceite os termos\n\n` +
        `Toque OK para fechar 👇🏽`,
        { show_alert: true }
      );
      return false;
    } else {
      // Se está em grupo, verificar no próprio grupo
      const hasAccepted = await termsAcceptanceService.hasUserAcceptedCurrentTerms(
        ctx.from.id,
        ctx.callbackQuery.message.chat.id
      );

      if (!hasAccepted) {
        await ctx.answerCbQuery(
          `🚫 ACESSO NEGADO\n\n` +
          `❌ Você precisa ACEITAR OS TERMOS!\n\n` +
          `📋 PARA CONTINUAR:\n` +
          `1️⃣ Use o comando /termos\n` +
          `2️⃣ Aceite os termos`,
          { show_alert: true }
        );
        return false;
      }

      return true;
    }
  } catch (error) {
    logger.error(`Erro na validação de termos (callback) para usuário ${ctx.from.id}:`, error);
    await ctx.answerCbQuery('❌ Erro na validação. Tente novamente.', { show_alert: true });
    return false;
  }
}
