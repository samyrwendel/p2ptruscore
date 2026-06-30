import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { OperationsService } from '../../operations/operations.service';
import { KarmaService } from '../../karma/karma.service';
import { UsersService } from '../../users/users.service';
import { TextCommandContext } from '../telegram.types';
import { OperationStatus } from '../../operations/schemas/operation.schema';
import { getReputationInfoColored } from '../../shared/reputation.utils';

const BORA_REGEX = /\b(bora{1,}|Bora{1,}|BORA{1,})\b/i;

@Injectable()
export class BoraMessageHandler {
  private readonly logger = new Logger(BoraMessageHandler.name);

  constructor(
    private readonly operationsService: OperationsService,
    private readonly karmaService: KarmaService,
    private readonly usersService: UsersService,
  ) {}

  private async getKarmaForUserWithFallback(user: any, chatId: number): Promise<any> {
    try {
      // Priorizar total consolidado para consistência de exibição
      const totalKarma = await this.karmaService.getTotalKarmaForUser(user.userName || user.firstName);
      if (totalKarma) {
        return {
          karma: totalKarma.totalKarma,
          givenKarma: totalKarma.totalGiven,
          givenHate: totalKarma.totalHate,
          user: totalKarma.user,
          history: []
        };
      }
      // Fallback para karma do grupo
      const groupKarma = await this.karmaService.getKarmaForUser(user.userId, chatId);
      if (groupKarma && groupKarma.karma !== undefined) {
        return groupKarma;
      }
      return null;
    } catch (error) {
      this.logger.error('Erro ao buscar karma com fallback:', error);
      return null;
    }
  }

  public isApplicable(text: string): boolean {
    return BORA_REGEX.test(text);
  }

  public async handle(ctx: TextCommandContext): Promise<void> {
    // Só funciona em grupos
    if (ctx.chat.type === 'private') {
      return;
    }

    // Verificar se a mensagem é uma resposta a outra mensagem
    if (!ctx.message.reply_to_message) {
      return;
    }

    try {
      // Extrair ID da operação da mensagem respondida
      const replyMessage = ctx.message.reply_to_message as any;
      const replyText = replyMessage?.text;
      if (!replyText) {
        return;
      }

      // Procurar por ID da operação no formato: ID da Operação: `id`
      const operationIdMatch = replyText.match(/🆔.*?ID.*?`([a-f0-9]{24})`/i);
      if (!operationIdMatch) {
        return;
      }

      const operationId = operationIdMatch[1];
      const acceptorId = new Types.ObjectId(ctx.from.id.toString());

      // Verificar se a operação existe e está disponível
      const operation = await this.operationsService.getOperationById(
        new Types.ObjectId(operationId),
      );

      // Validação de grupo removida - permitir aceitar operações de qualquer grupo

      // Verificar se a operação está pendente
      if (operation.status !== OperationStatus.PENDING) {
        await ctx.reply(
          '❌ Esta operação não está mais disponível.'
        );
        return;
      }

      // Verificar se não é o próprio criador tentando aceitar
      if (operation.creator.toString() === acceptorId.toString()) {
        await ctx.reply(
          '❌ Você não pode aceitar sua própria operação.'
        );
        return;
      }

      // Aceitar a operação
      const acceptedOperation = await this.operationsService.acceptOperation(
        new Types.ObjectId(operationId),
        acceptorId,
      );

      // Buscar informações de reputação do usuário que aceitou (com fallback)
      const acceptorUser = await this.usersService.findOneByUserId(ctx.from.id);
      const acceptorKarma = await this.getKarmaForUserWithFallback(acceptorUser, ctx.chat.id);

      const reputationInfo = getReputationInfoColored(acceptorKarma);
      const nivelConfianca = reputationInfo.nivel;
      const reputationEmoji = reputationInfo.emoji;

      // Formatação do nome do usuário que aceitou
      const acceptorName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || 'Usuário';
      
      const typeText = acceptedOperation.type === 'buy' ? 'COMPRA' : 'VENDA';
      const total = acceptedOperation.amount * acceptedOperation.price;
      
      // Para operações com EUR, ajustar a moeda
      let priceFormatted = '';
      let totalFormatted = '';
      
      if (acceptedOperation.assets.includes('EURO' as any)) {
        priceFormatted = `€ ${acceptedOperation.price.toFixed(4)}`;
        totalFormatted = `€ ${total.toFixed(2)}`;
      } else {
        priceFormatted = `R$ ${acceptedOperation.price.toFixed(2)}`;
        totalFormatted = `R$ ${total.toFixed(2)}`;
      }

      await ctx.reply(
        `🚀 **OPERAÇÃO ACEITA COM BORA!**\n\n` +
        `✅ **${typeText}** aceita por ${acceptorName}\n` +
        `${reputationEmoji} **Reputação:** ${reputationInfo.score} pts | ${nivelConfianca}\n\n` +
        `💰 **Ativos:** ${acceptedOperation.assets.join(', ')}\n` +
        `📊 **Quantidade:** ${acceptedOperation.amount}\n` +
        `💵 **Preço:** ${priceFormatted}\n` +
        `💸 **Total:** ${totalFormatted}\n\n` +
        `🆔 **ID:** \`${operationId}\`\n\n` +
        `📞 **Próximos passos:**\n` +
        `1. Entrem em contato para combinar os detalhes\n` +
        `2. Realizem a transação conforme acordado\n` +
        `3. Usem \`/concluiroperacao ${operationId}\` quando finalizada`,
        { parse_mode: 'Markdown' }
      );

      this.logger.log(
        `Operation ${operationId} accepted via BORA by user ${ctx.from.id} (${acceptorName})`
      );

    } catch (error) {
      this.logger.error('Error handling BORA message:', error);
      await ctx.reply(
        '❌ Erro ao processar aceitação da operação. Tente novamente.'
      );
    }
  }
}
