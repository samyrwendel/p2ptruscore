import { Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { TextCommandContext } from '../telegram/telegram.types';

const logger = new Logger('GroupMembershipUtils');

export async function validateActiveMembership(
  ctx: TextCommandContext,
  bot: Telegraf,
  operationType: 'criar' | 'aceitar' | 'concluir' | 'cancelar' | 'participar' = 'participar'
): Promise<boolean> {
  try {
    // Para comandos em grupos, verificar se usuário está ativo no próprio grupo
    if (ctx.chat.type !== 'private') {
      return await checkMembershipInGroup(ctx.from.id, ctx.chat.id, bot, ctx, operationType);
    } else {
      // Para comandos privados, verificar no grupo configurado
      const configuredGroupId = parseInt(process.env.TELEGRAM_GROUP_ID || '0');
      
      if (configuredGroupId === 0) {
        logger.warn('⚠️ TELEGRAM_GROUP_ID não configurado');
        return false;
      }
      
      return await checkMembershipInGroup(ctx.from.id, configuredGroupId, bot, ctx, operationType);
    }
  } catch (error: any) {
    logger.error(`Erro na validação de membro ativo para usuário ${ctx.from.id}:`, error);
    return false;
  }
}

async function checkMembershipInGroup(
  userId: number,
  groupId: number,
  bot: Telegraf,
  ctx: TextCommandContext,
  operationType: string
): Promise<boolean> {
  try {
    const memberInfo = await bot.telegram.getChatMember(groupId, userId);
    const activeMemberStatuses = ['member', 'administrator', 'creator'];
    
    // Verificar se o status indica membro ativo
    const isActiveMember = activeMemberStatuses.includes(memberInfo.status);
    
    if (!isActiveMember) {
      logger.warn(`Usuário ${userId} não é membro ativo do grupo ${groupId}. Status: ${memberInfo.status}`);
      
      // Se não for comando em grupo (privado), mostrar APENAS popup
      if (ctx.chat.type === 'private') {
        const actionText = getActionText(operationType);
        
        try {
          if (ctx.answerCbQuery) {
            await ctx.answerCbQuery(
              `🚫 Você não é mais um membro ativo do grupo!\n\n` +
              `Status atual: ${memberInfo.status}\n\n` +
              `📋 Para ${actionText}:\n` +
              `1️⃣ Entre novamente no grupo do TrustScore\n` +
              `2️⃣ Certifique-se de permanecer como membro`,
              { show_alert: true }
            );
          }
        } catch {
          // Fallback com mensagem mais curta
          try {
            if (ctx.answerCbQuery) {
              await ctx.answerCbQuery(
                `🚫 Você não é mais um membro ativo do grupo (Status: ${memberInfo.status})!`,
                { show_alert: true }
              );
            }
          } catch {
            // Falha silenciosa - não poluir o chat
          }
        }
      }
      
      return false;
    }

    logger.log(`✅ Usuário ${userId} é membro ativo do grupo ${groupId} (Status: ${memberInfo.status})`);
    return true;
  } catch (error: any) {
    logger.error(`Erro ao verificar membro ${userId} no grupo ${groupId}:`, error);
    
    // Se o erro for "user not found" ou similar, considerar como não-membro
    if (error.message?.includes('user not found') || error.message?.includes('chat not found')) {
      if (ctx.chat.type === 'private') {
        const actionText = getActionText(operationType);
        
        try {
          if (ctx.answerCbQuery) {
            await ctx.answerCbQuery(
              `🚫 Não foi possível verificar sua participação no grupo!\n\n` +
              `📋 Para ${actionText}:\n` +
              `1️⃣ Certifique-se de estar no grupo do TrustScore\n` +
              `2️⃣ Tente novamente em alguns minutos`,
              { show_alert: true }
            );
          }
        } catch {
          // Fallback com mensagem mais curta
          try {
            if (ctx.answerCbQuery) {
              await ctx.answerCbQuery(
                `🚫 Não foi possível verificar sua participação no grupo!`,
                { show_alert: true }
              );
            }
          } catch {
            // Falha silenciosa - não poluir o chat
          }
        }
      }
      return false;
    }
    
    // Para outros erros, assumir que é membro (fallback seguro)
    logger.warn(`Assumindo que usuário ${userId} é membro devido a erro na verificação`);
    return true;
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

export async function validateActiveMembershipForCallback(
  ctx: any,
  bot: Telegraf,
  operationType: string = 'participar'
): Promise<boolean> {
  try {
    const chatType = ctx.callbackQuery.message.chat.type;
    
    // Se está em chat privado, verificar no grupo configurado
    if (chatType === 'private') {
      const configuredGroupId = parseInt(process.env.TELEGRAM_GROUP_ID || '0');
      if (configuredGroupId === 0) {
        // Nenhum grupo configurado - POPUP ENCURTADO
        await ctx.answerCbQuery(
          `🚫 ACESSO NEGADO\n\n` +
          `❌ Nenhum grupo configurado!\n\n` +
          `📋 PARA CONTINUAR:\n` +
          `1️⃣ Configure TELEGRAM_GROUP_ID\n` +
          `2️⃣ Reinicie o bot`,
          { show_alert: true }
        );
        return false;
      }
      
      return await checkMembershipInGroup(ctx.from.id, configuredGroupId, bot, ctx, operationType);
    } else {
      // Se está em grupo, verificar no próprio grupo
      const groupId = ctx.callbackQuery.message.chat.id;
      const memberInfo = await bot.telegram.getChatMember(groupId, ctx.from.id);
      const activeMemberStatuses = ['member', 'administrator', 'creator'];
      
      const isActiveMember = activeMemberStatuses.includes(memberInfo.status);
      
      if (!isActiveMember) {
        await ctx.answerCbQuery(
          `🚫 Você não é mais um membro ativo do grupo para ${getActionText(operationType)}! Status: ${memberInfo.status}`,
          { show_alert: true }
        );
        return false;
      }
      
      return true;
    }
  } catch (error: any) {
    logger.error(`Erro na validação de membro ativo (callback) para usuário ${ctx.from.id}:`, error);
    
    if (error.message?.includes('user not found') || error.message?.includes('chat not found')) {
      await ctx.answerCbQuery(
        `🚫 Não foi possível verificar sua participação no grupo!`,
        { show_alert: true }
      );
      return false;
    }
    
    // Para outros erros, assumir que é membro (fallback seguro)
    return true;
  }
}