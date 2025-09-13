import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { Types } from 'mongoose';
import { Operation } from './schemas/operation.schema';
import { GroupsService } from '../groups/groups.service';
import { UsersService } from '../users/users.service';
import { KarmaService } from '../karma/karma.service';
import { OperationsRepository } from './operations.repository';
import { PendingEvaluationRepository } from './pending-evaluation.repository';
import { getReputationInfo } from '../shared/reputation.utils';

@Injectable()
export class OperationsBroadcastService {
  private readonly logger = new Logger(OperationsBroadcastService.name);

  constructor(
    @InjectBot('DEFAULT_BOT_NAME') private readonly bot: Telegraf,
    private readonly groupsService: GroupsService,
    private readonly usersService: UsersService,
    private readonly karmaService: KarmaService,
    private readonly operationsRepository: OperationsRepository,
    private readonly pendingEvaluationRepository: PendingEvaluationRepository,
  ) {}

  private async getKarmaForUserWithFallback(user: any, chatId: number): Promise<any> {
    try {
      // Primeiro tentar buscar karma no grupo atual
      const groupKarma = await this.karmaService.getKarmaForUser(user.userId, chatId);
      
      if (groupKarma && groupKarma.karma !== undefined) {
        return groupKarma;
      }
      
      // Se não encontrar no grupo atual, buscar karma total
      const totalKarma = await this.karmaService.getTotalKarmaForUser(user.userName || user.firstName);
      
      if (totalKarma) {
        // Simular estrutura de karma do grupo para compatibilidade
        return {
          karma: totalKarma.totalKarma,
          givenKarma: totalKarma.totalGiven,
          givenHate: totalKarma.totalHate,
          user: totalKarma.user,
          history: [] // Histórico vazio para karma total
        };
      }
      
      return null;
    } catch (error) {
      this.logger.error('Erro ao buscar karma com fallback:', error);
      return null;
    }
  }

  async deleteOperationMessage(operation: Operation): Promise<void> {
    try {
      this.logger.log(`Attempting to delete operation message for operation ${operation._id}`);
      this.logger.log(`Operation messageId: ${operation.messageId}, group: ${operation.group}`);
      
      if (!operation.messageId) {
        this.logger.warn(`Operation ${operation._id} has no messageId - cannot delete message`);
        return;
      }
      
      if (!operation.group) {
        this.logger.warn(`Operation ${operation._id} has no group - cannot delete message`);
        return;
      }
      
      // Buscar o grupo para obter o groupId
      const group = await this.groupsService.findById(operation.group.toString());
      if (group) {
        this.logger.log(`Found group ${group.groupId}, attempting to delete message ${operation.messageId}`);
        await this.bot.telegram.deleteMessage(group.groupId, operation.messageId);
        this.logger.log(`Successfully deleted operation message ${operation.messageId} from group ${group.groupId}`);
      } else {
        this.logger.warn(`Group ${operation.group} not found - cannot delete message`);
      }
    } catch (error) {
      this.logger.error(`Failed to delete operation message for operation ${operation._id}: ${error.message}`);
      // Não lançar erro pois a deleção da mensagem é opcional
    }
  }

  async broadcastOperationToAllGroups(operation: Operation): Promise<void> {
    try {
      const groups = await this.groupsService.getDistinctGroupIds();
      
      // Filtrar apenas grupos reais (IDs negativos) e excluir chats privados (IDs positivos)
      const realGroups = groups.filter(groupId => groupId < 0);
      
      // Usar apenas os grupos reais do banco de dados
      const allGroupIds = [...new Set(realGroups)];
      
      for (const groupId of allGroupIds) {
        await this.broadcastOperationToSpecificGroup(operation, groupId);
        // Pequeno delay entre envios para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      this.logger.log(
        `Operation ${operation._id} broadcasted to ${allGroupIds.length} groups`
      );
    } catch (error) {
      this.logger.error(
        `Failed to broadcast operation ${operation._id} to all groups:`,
        error
      );
    }
  }

  async broadcastOperationToGroup(operation: Operation): Promise<void> {
    // Se a operação tem um grupo específico, enviar apenas para esse grupo
    if (operation.group) {
      try {
        const group = await this.groupsService.findById(operation.group.toString());
        if (group) {
          await this.broadcastOperationToSpecificGroup(operation, group.groupId);
          this.logger.log(`Operation ${operation._id} sent to specific group ${group.groupId}`);
          return;
        }
      } catch (error) {
        this.logger.warn(`Group ${operation.group} not found, falling back to all groups`);
      }
    }
    
    // Se não tem grupo específico ou grupo não encontrado, enviar para todos
    await this.broadcastOperationToAllGroups(operation);
    
    // Código antigo comentado para referência
    // Tentar encontrar o grupo, se não existir, criar automaticamente
    /*
    let group;
    if (operation.group) {
      const groupId = operation.group;
      try {
        group = await this.groupsService.findById(groupId!.toString());
      } catch (error) {
        // Se o grupo não existir, criar automaticamente
        this.logger.warn(`Group ${groupId} not found, creating automatically`);
        const groupIdNumber = parseInt(groupId!.toString());
        group = await this.groupsService.findOrCreate({
          id: groupIdNumber,
          title: `Grupo ${groupIdNumber}`
        });
      }
    */
    
    // Código removido - não é mais necessário pois a lógica foi alterada
  }

  private async broadcastOperationToSpecificGroup(operation: Operation, groupId: number): Promise<void> {
    try {
      const creator = await this.usersService.findById(operation.creator.toString());
      if (!creator) {
        this.logger.warn(`Creator not found: ${operation.creator}`);
        return;
      }

      // Buscar reputação do criador (com fallback para karma total)
      let karmaInfo: any = null;
      try {
        karmaInfo = await this.getKarmaForUserWithFallback(creator, groupId);
      } catch (error) {
        this.logger.warn(`Could not fetch karma for user ${creator.userId}:`, error);
      }

      let typeEmoji = '🟢';
      let typeText = 'COMPRA';
      
      switch (operation.type) {
        case 'buy':
          typeEmoji = '🟢';
          typeText = 'COMPRA';
          break;
        case 'sell':
          typeEmoji = '🔴';
          typeText = 'VENDA';
          break;
        case 'announcement':
          typeEmoji = '📰';
          typeText = 'ANÚNCIO';
          break;
        case 'exchange':
          typeEmoji = '🔁';
          typeText = 'TROCA';
          break;
      }
      const total = operation.amount * operation.price;
      const expiresIn = this.getTimeUntilExpiration(operation.expiresAt);

      const assetsText = operation.assets.join(', ');
      const networksText = operation.networks.map(n => n.toUpperCase()).join(', ');
      
      // Formatação do nome do usuário
      const userName = creator.userName ? `@${creator.userName}` : creator.firstName || 'Usuário';
      
      // Informações de reputação usando função centralizada
      const reputationInfo = getReputationInfo(karmaInfo);
      const scoreTotal = reputationInfo.score;
      const nivelConfianca = reputationInfo.nivel;
      const reputationIcon = reputationInfo.icone;
      
      let message = (
          `🚀 **Nova Operação P2P Disponível!**\n\n` +
          `${typeEmoji} **${typeText} ${assetsText}**\n` +
          `Redes: ${networksText}\n`
        );

      if (operation.quotationType !== 'google') {
          const assetsText = operation.assets.join(', ');
          const buyText = operation.type === 'buy' ? `${operation.amount} ${assetsText}` : `${operation.amount} ${assetsText}`;
          const payText = operation.type === 'buy' ? `R$ ${total.toFixed(2)}` : `R$ ${total.toFixed(2)}`;
          const actionText = operation.type === 'buy' ? 'Quero comprar' : 'Quero vender';
          
          const arrowIcon = operation.type === 'buy' ? '⬅️' : '➡️';
          const paymentArrow = operation.type === 'buy' ? '➡️' : '⬅️';
          const paymentText = operation.type === 'buy' ? 'Quero pagar' : 'Quero receber';
          
          message += (
            `${arrowIcon} **${actionText}:** ${buyText}\n` +
            `${paymentArrow} **${paymentText}:** ${payText}\n` +
            `💱 **Cotação:** R$ ${operation.price.toFixed(2)}\n\n`
          );
        } else {
          const assetsText = operation.assets.join(', ');
          const actionText = operation.type === 'buy' ? 'Quero comprar' : 'Quero vender';
          
          const arrowIcon = operation.type === 'buy' ? '⬅️' : '➡️';
          message += (
            `${arrowIcon} **${actionText}:** ${operation.amount} ${assetsText}\n` +
            `💱 **Cotação:** Google (calculada na transação)\n` +
            `💰 **Valor:** Conforme cotação atual do Google\n\n`
          );
        }
        
        message += (
          `👤 **Criador:** ${userName}\n` +
          `${reputationIcon} ${nivelConfianca}: ${scoreTotal} pts\n\n`
        );

      if (operation.description) {
        message += `📝 **Descrição:** ${operation.description}\n\n`;
      }

      message += (
        `⏰ **Expira em:** ${expiresIn}\n` +
        `🆔 **ID da Operação:** ${operation._id}`
      );

      // Criar botões inline
      // Criar URL para chat privado com reputação
      const botUsername = 'p2pscorebot'; // Nome do bot
      const userId = creator.userName || creator.firstName || creator.userId;
      const privateUrl = `https://t.me/${botUsername}?start=reputacao_${userId}`;
      
      // Criar teclado inline apenas com botões apropriados para grupos
      const inlineKeyboard = {
        inline_keyboard: [
          [
            {
              text: '🚀 Aceitar Operação',
              callback_data: `accept_operation_${operation._id}`
            },
            {
              text: '📊 Ver Reputação',
              url: privateUrl
            }
          ]
          // Removidos botões 'Minhas Operações' e 'Ver Todas' do grupo
          // Estes botões devem aparecer apenas no chat privado
        ]
      };

      // Configurar envio para tópico específico se for o grupo mencionado
      const sendOptions: any = { 
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
      };
      if (groupId === -1002907400287) {
        sendOptions.message_thread_id = 6; // Tópico específico do grupo
      }

      const sentMessage = await this.bot.telegram.sendMessage(
        groupId,
        message,
        sendOptions
      );

      // Salvar o messageId na operação para poder deletar depois
      if (sentMessage && sentMessage.message_id) {
        operation.messageId = sentMessage.message_id;
        
        // Salvar apenas o messageId, sem modificar associação de grupo
        let updateData: any = { messageId: sentMessage.message_id };
        
        // Salvar no banco de dados
        try {
          await this.operationsRepository.findOneAndUpdate(
            { _id: operation._id },
            updateData
          );
          this.logger.log(`Saved messageId ${sentMessage.message_id} for operation ${operation._id}`);
        } catch (error) {
          this.logger.warn(`Failed to save messageId for operation ${operation._id}: ${error.message}`);
        }
      }

      this.logger.log(
        `Operation ${operation._id} broadcasted to group ${groupId}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to broadcast operation ${operation._id}:`,
        error
      );
    }
  }

  async notifyOperationAccepted(
    operation: Operation,
    acceptorId: Types.ObjectId
  ): Promise<void> {
    try {
      if (!operation.group) {
        this.logger.warn('Operation has no associated group for acceptance notification');
        return;
      }
      
      // Tentar encontrar o grupo, se não existir, criar automaticamente
      let group;
      try {
        group = await this.groupsService.findById(operation.group.toString());
      } catch (error) {
        // Se o grupo não existir, criar automaticamente
        this.logger.warn(`Group ${operation.group} not found, creating automatically`);
        const groupIdNumber = parseInt(operation.group.toString());
        group = await this.groupsService.findOrCreate({
          id: groupIdNumber,
          title: `Grupo ${groupIdNumber}`
        });
      }
      
      const creator = await this.usersService.findById(operation.creator.toString());
      const acceptor = await this.usersService.findById(acceptorId.toString());

      if (!group || !creator || !acceptor) {
        this.logger.warn('Missing data for operation acceptance notification');
        return;
      }

      let typeEmoji = '🟢';
      let typeText = 'COMPRA';
      
      switch (operation.type) {
        case 'buy':
          typeEmoji = '🟢';
          typeText = 'COMPRA';
          break;
        case 'sell':
          typeEmoji = '🔴';
          typeText = 'VENDA';
          break;
        case 'announcement':
          typeEmoji = '📰';
          typeText = 'ANÚNCIO';
          break;
        case 'exchange':
          typeEmoji = '🔁';
          typeText = 'TROCA';
          break;
      }
      const total = operation.amount * operation.price;

      const assetsText = operation.assets.join(', ');
      const networksText = operation.networks.map(n => n.toUpperCase()).join(', ');
      
      // Buscar reputação dos usuários
      const creatorName = creator.userName ? `@${creator.userName}` : creator.firstName || 'Usuário';
      const acceptorName = acceptor.userName ? `@${acceptor.userName}` : acceptor.firstName || 'Usuário';
      
      // Buscar karma dos usuários com fallback
      const creatorKarma = await this.getKarmaForUserWithFallback(creator, group._id);
      const acceptorKarma = await this.getKarmaForUserWithFallback(acceptor, group._id);
      
      // Calcular níveis de reputação usando função utilitária
      const creatorRep = getReputationInfo(creatorKarma);
      const acceptorRep = getReputationInfo(acceptorKarma);
      
      // Determinar ordem de transferência (menor reputação transfere primeiro)
      const creatorScore = creatorRep.score;
      const acceptorScore = acceptorRep.score;
      const creatorTransfersFirst = creatorScore <= acceptorScore;
      const firstTransferer = creatorTransfersFirst ? creatorName : acceptorName;
      const secondTransferer = creatorTransfersFirst ? acceptorName : creatorName;
      
      // Função para formatar unidade de ativo (stablecoins → USD)
      const formatAssetUnit = (assets: string[]) => {
        const stablecoins = ['USDT', 'USDC', 'USDE', 'DAI', 'BUSD', 'TUSD', 'FRAX', 'LUSD'];
        const hasOnlyStablecoins = assets.every(asset => stablecoins.includes(asset.toUpperCase()));
        return hasOnlyStablecoins ? 'USD' : assets.join(', ');
      };
      
      const assetUnit = formatAssetUnit(operation.assets);
      
      const message = (
        `✅ **Operação Aceita!**\n\n` +
        `${acceptorName} aceitou a operação de ${typeText}\n\n` +
        `**Ativos:** ${assetsText}\n` +
        `**Quantidade:** ${operation.amount} ${assetUnit}\n` +
        `**Preço:** ${operation.quotationType === 'google' ? 'Calculado na Transação' : `R$ ${operation.price.toFixed(2)}`}\n` +
        `Cotação: ${operation.quotationType === 'google' ? 'Google' : `R$ ${operation.price.toFixed(2)}`}\n` +
        `Redes: ${networksText}\n\n` +
        `👥 **Partes Envolvidas:**\n` +
        `• **Criador:**\n` +
        `  ${creatorName}\n` +
        `  ${creatorRep.icone} ${creatorRep.nivel}: ${creatorRep.score} pts\n\n` +
        `• **Negociador:**\n` +
        `  ${acceptorName}\n` +
        `  ${acceptorRep.icone} ${acceptorRep.nivel}: ${acceptorRep.score} pts\n\n` +
        `🔄 **Ordem de Transferência:**\n` +
        `1️⃣ ${firstTransferer} transfere primeiro\n` +
        `2️⃣ ${secondTransferer} transfere por último\n\n` +
        `🍀 **Próximos passos:**\n` +
        `1. Entrem em contato via DM\n` +
        `2. Combinem os detalhes da transação\n` +
        `3. Após concluir, usem o botão concluir operação\n` +
        `4. Faça a avaliação da outra parte\n\n` +
        `⚠️ **Importante:** Sempre verifiquem a reputação antes de prosseguir!`
      );

      // Adicionar botões de ação
      const inlineKeyboard = {
        inline_keyboard: [
          [
            {
              text: '💬 Criador',
              url: `https://t.me/${creator.userName || creator.firstName}`
            },
            {
              text: '💬 Negociador',
              url: `https://t.me/${acceptor.userName || acceptor.firstName}`
            }
          ],
          [
            {
              text: '🔙 Desistir da Operação',
              callback_data: `revert_operation_${operation._id}`
            }
          ]
        ]
      };

      // Configurar envio para tópico específico se for o grupo mencionado
      const sendOptions: any = { 
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
      };
      if (group.groupId === -1002907400287) {
        sendOptions.message_thread_id = 6; // Tópico específico do grupo
      }

      // Editar a mensagem original em vez de deletar e criar nova
      if (operation.messageId) {
        try {
          await this.bot.telegram.editMessageText(
            group.groupId,
            operation.messageId,
            undefined,
            message,
            {
              parse_mode: 'Markdown',
              reply_markup: inlineKeyboard
            }
          );
          this.logger.log(`Edited original message ${operation.messageId} for operation ${operation._id}`);
        } catch (editError) {
          this.logger.warn(`Failed to edit message ${operation.messageId}, sending new message:`, editError);
          // Se falhar ao editar, deletar e enviar nova
          await this.deleteOperationMessage(operation);
          await this.bot.telegram.sendMessage(
            group.groupId,
            message,
            sendOptions
          );
        }
      } else {
        // Se não tem messageId, enviar nova mensagem
        await this.bot.telegram.sendMessage(
          group.groupId,
          message,
          sendOptions
        );
      }

      this.logger.log(
        `Operation acceptance ${operation._id} notified to group ${group.groupId}`
      );

      // Enviar mensagem privada ao negociador com botão de avaliação
      await this.sendPrivateEvaluationMessage(operation, acceptor, creator);
    } catch (error) {
      this.logger.error(
        `Failed to notify operation acceptance ${operation._id}:`,
        error
      );
    }
  }

  async notifyOperationCompleted(operation: Operation): Promise<void> {
    try {
      if (!operation.group) {
        this.logger.warn('Operation has no associated group for completion notification');
        return;
      }
      
      // Tentar encontrar o grupo, se não existir, criar automaticamente
      let group;
      try {
        group = await this.groupsService.findById(operation.group.toString());
      } catch (error) {
        // Se o grupo não existir, criar automaticamente
        this.logger.warn(`Group ${operation.group} not found, creating automatically`);
        const groupIdNumber = parseInt(operation.group.toString());
        group = await this.groupsService.findOrCreate({
          id: groupIdNumber,
          title: `Grupo ${groupIdNumber}`
        });
      }
      
      const creator = await this.usersService.findById(operation.creator.toString());
      
      // Verificar tanto acceptedBy quanto acceptor
      let acceptor: any = null;
      if (operation.acceptedBy) {
        acceptor = await this.usersService.findById(operation.acceptedBy.toString());
      } else if (operation.acceptor) {
        acceptor = await this.usersService.findById(operation.acceptor.toString());
      }
      
      this.logger.log(`Operation completion - Creator: ${creator?._id}, Acceptor: ${acceptor?._id}, AcceptedBy: ${operation.acceptedBy}, AcceptorField: ${operation.acceptor}`);

      if (!group || !creator) {
        this.logger.warn('Missing data for operation completion notification');
        return;
      }

      const typeEmoji = operation.type === 'buy' ? '🟢' : '🔴';
      const typeText = operation.type === 'buy' ? 'COMPRA' : 'VENDA';
      const total = operation.amount * operation.price;

      const assetsText = operation.assets.join(', ');
      const networksText = operation.networks.map(n => n.toUpperCase()).join(', ');
      
      // Formatar nomes com @ quando disponível
      const creatorName = creator.userName ? `@${creator.userName}` : creator.firstName || 'Usuário';
      const acceptorName = acceptor?.userName ? `@${acceptor.userName}` : acceptor?.firstName || 'Usuário';

      let message = (
        `🎉 **Operação Concluída com Sucesso!**\n\n` +
        `${typeEmoji} **${typeText} ${assetsText}**\n\n` +
        `👤 **Criador:** ${creatorName}\n`
      );

      if (acceptor) {
        message += `🤝 **Negociador:** ${acceptorName}\n\n`;
      } else {
        message += '\n';
      }

      message += (
        `💰 **Quantidade:** ${operation.amount} (total)\n` +
        `💵 **Preço:** R$ ${operation.price.toFixed(2)}\n` +
        `💸 **Total:** R$ ${total.toFixed(2)}\n` +
        `🌐 **Redes:** ${networksText}\n\n` +
        `🆔 **ID:** \`${operation._id}\`\n\n` +
        `💡 **Não esqueçam de se avaliarem mutuamente usando:**\n\n` +
        `🚀 **Continuem negociando com segurança!**`
      );

      // Para operações concluídas, criar botões de reputação
      const botUsername = 'p2pscorebot';
      const creatorUserId = creator?.userName || creator?.firstName || creator?.userId;
      const acceptorUserId = acceptor?.userName || acceptor?.firstName || acceptor?.userId;
      
      const buttons = [
        {
          text: `📊 ${creatorName}`,
          url: `https://t.me/${botUsername}?start=reputacao_${creatorUserId}`
        }
      ];
      
      if (acceptor) {
        buttons.push({
          text: `📊 ${acceptorName}`,
          url: `https://t.me/${botUsername}?start=reputacao_${acceptorUserId}`
        });
      }
      
      const inlineKeyboard = {
        inline_keyboard: [buttons]
      };

      // Configurar envio para tópico específico se for o grupo mencionado
      const sendOptions: any = { 
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
      };
      if (group.groupId === -1002907400287) {
        sendOptions.message_thread_id = 6; // Tópico específico do grupo
      }

      // Editar a mensagem original em vez de criar nova
      if (operation.messageId) {
        try {
          await this.bot.telegram.editMessageText(
            group.groupId,
            operation.messageId,
            undefined,
            message,
            {
              parse_mode: 'Markdown',
              reply_markup: inlineKeyboard
            }
          );
          this.logger.log(`Edited original message ${operation.messageId} for reverted operation ${operation._id}`);
        } catch (editError) {
          this.logger.warn(`Failed to edit message ${operation.messageId}, sending new message:`, editError);
          // Se falhar ao editar, enviar nova mensagem
          await this.bot.telegram.sendMessage(
            group.groupId,
            message,
            sendOptions
          );
        }
      } else {
        // Se não tem messageId, enviar nova mensagem
        await this.bot.telegram.sendMessage(
          group.groupId,
          message,
          sendOptions
        );
      }

      this.logger.log(
        `Operation completion ${operation._id} notified to group ${group.groupId}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to notify operation completion ${operation._id}:`,
        error
      );
    }
  }

  async notifyOperationReverted(
    operation: Operation,
    userId: Types.ObjectId
  ): Promise<void> {
    try {
      if (!operation.group) {
        this.logger.warn('Operation has no associated group for revert notification');
        return;
      }
      
      // Tentar encontrar o grupo
      let group;
      try {
        group = await this.groupsService.findById(operation.group.toString());
      } catch (error) {
        this.logger.warn(`Group ${operation.group} not found for revert notification`);
        return;
      }
      
      const user = await this.usersService.findById(userId.toString());
      if (!group || !user) {
        this.logger.warn('Missing data for operation revert notification');
        return;
      }

      let typeEmoji = '🟢';
      let typeText = 'COMPRA';
      
      switch (operation.type) {
        case 'buy':
          typeEmoji = '🟢';
          typeText = 'COMPRA';
          break;
        case 'sell':
          typeEmoji = '🔴';
          typeText = 'VENDA';
          break;
        case 'announcement':
          typeEmoji = '📰';
          typeText = 'ANÚNCIO';
          break;
        case 'exchange':
          typeEmoji = '🔁';
          typeText = 'TROCA';
          break;
      }
      
      const total = operation.amount * operation.price;
      const assetsText = operation.assets.join(', ');
      const networksText = operation.networks.map(n => n.toUpperCase()).join(', ');
      const userName = user.userName ? `@${user.userName}` : user.firstName || 'Usuário';
      
      // Restaurar formato original da operação pendente
      const creator = await this.usersService.findById(operation.creator.toString());
      const creatorName = creator?.userName ? `@${creator.userName}` : creator?.firstName || 'Usuário';
      
      // Buscar karma do criador com fallback
      const creatorKarma = await this.getKarmaForUserWithFallback(creator, group._id);
      
      // Calcular nível de reputação do criador usando função utilitária
      const creatorRep = getReputationInfo(creatorKarma);
      
      // Calcular tempo até expiração
      const now = new Date();
      const expiresAt = new Date(operation.expiresAt);
      const timeLeft = this.getTimeUntilExpiration(expiresAt);
      
      let message = `🚀 **Nova Operação P2P Disponível!**\n\n`;
      message += `${typeEmoji} **${typeText} ${assetsText}**\n`;
      message += `🌐 **Redes:** ${networksText}\n\n`;
      
      // Formato baseado no tipo de cotação
      if (operation.quotationType !== 'google') {
        const arrowIcon = operation.type === 'buy' ? '⬅️' : '➡️';
        const paymentArrow = operation.type === 'buy' ? '➡️' : '⬅️';
        const actionText = operation.type === 'buy' ? 'Quero comprar' : 'Quero vender';
        const paymentText = operation.type === 'buy' ? 'Quero pagar' : 'Quero receber';
        
        message += (
          `${arrowIcon} **${actionText}:** ${operation.amount} ${assetsText}\n` +
          `${paymentArrow} **${paymentText}:** R$ ${total.toFixed(2)}\n` +
          `💱 **Cotação:** R$ ${operation.price.toFixed(2)}\n\n`
        );
      } else {
        const arrowIcon = operation.type === 'buy' ? '⬅️' : '➡️';
        const actionText = operation.type === 'buy' ? 'Quero comprar' : 'Quero vender';
        
        message += (
          `${arrowIcon} **${actionText}:** ${operation.amount} ${assetsText}\n` +
          `💱 **Cotação:** Google (calculada na transação)\n` +
          `💰 **Valor:** Conforme cotação atual do Google\n\n`
        );
      }
      
      message += `👤 **Criador:** ${creatorName}\n`;
      message += `${creatorRep.icone} ${creatorRep.nivel}: ${creatorRep.score} pts\n\n`;
      
      if (operation.description) {
        message += `📝 **Descrição:** ${operation.description}\n\n`;
      }
      
      message += (
        `⏰ **Expira em:** ${timeLeft}\n` +
        `🆔 **ID da Operação:** ${operation._id}`
      );

      // Adicionar botão de aceitar operação para operação reaberta
      const inlineKeyboard = {
        inline_keyboard: [
          [
            {
              text: '🚀 Aceitar Operação',
              callback_data: `accept_operation_${operation._id}`
            }
          ]
        ]
      };

      // Configurar envio para tópico específico se for o grupo mencionado
      const sendOptions: any = { 
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
      };
      if (group.groupId === -1002907400287) {
        sendOptions.message_thread_id = 6; // Tópico específico do grupo
      }

      // Editar a mensagem original em vez de criar nova
      if (operation.messageId) {
        try {
          await this.bot.telegram.editMessageText(
            group.groupId,
            operation.messageId,
            undefined,
            message,
            {
              parse_mode: 'Markdown',
              reply_markup: inlineKeyboard
            }
          );
          this.logger.log(`Edited original message ${operation.messageId} for reverted operation ${operation._id}`);
        } catch (editError) {
          this.logger.warn(`Failed to edit message ${operation.messageId}, sending new message:`, editError);
          // Se falhar ao editar, enviar nova mensagem
          await this.bot.telegram.sendMessage(
            group.groupId,
            message,
            sendOptions
          );
        }
      } else {
        // Se não tem messageId, enviar nova mensagem
        await this.bot.telegram.sendMessage(
          group.groupId,
          message,
          sendOptions
        );
      }

      this.logger.log(
        `Operation revert ${operation._id} notified to group ${group.groupId}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to notify operation revert ${operation._id}:`,
        error
      );
    }
  }

  private async sendPrivateEvaluationMessage(
    operation: Operation,
    acceptor: any,
    creator: any
  ): Promise<void> {
    try {
      const typeEmoji = operation.type === 'buy' ? '🟢' : '🔴';
      const typeText = operation.type === 'buy' ? 'COMPRA' : 'VENDA';
      const assetsText = operation.assets.join(', ');
      const networksText = operation.networks.map(n => n.toUpperCase()).join(', ');
      const creatorName = creator.userName ? `@${creator.userName}` : creator.firstName || 'Usuário';
      
      const message = (
        `🎯 **Operação Aceita - Avaliação Necessária**\n\n` +
        `Você aceitou uma operação P2P e precisa avaliar a experiência.\n\n` +
        `**Detalhes da Operação:**\n` +
        `${typeEmoji} **${typeText} ${assetsText}**\n` +
        `🌐 **Redes:** ${networksText}\n` +
        `💰 **Quantidade:** ${operation.amount} ${assetsText}\n` +
        `💵 **Preço:** ${operation.quotationType === 'google' ? 'Calculado na Transação' : `R$ ${operation.price.toFixed(2)}`}\n` +
        `👤 **Criador:** ${creatorName}\n\n` +
        `⚠️ **Importante:** Você não poderá criar ou aceitar novas operações até avaliar esta transação.\n\n` +
        `🆔 **ID da Operação:** ${operation._id}`
      );

      const inlineKeyboard = {
        inline_keyboard: [
          [
            {
              text: '⭐ Avaliar Transação',
              callback_data: `evaluate_operation_${operation._id}`
            }
          ]
        ]
      };

      await this.bot.telegram.sendMessage(
        acceptor.userId,
        message,
        {
          parse_mode: 'Markdown',
          reply_markup: inlineKeyboard
        }
      );

      // Criar avaliação pendente no banco de dados
       await this.pendingEvaluationRepository.createPendingEvaluation(
         operation._id,
         new Types.ObjectId(acceptor._id),
         new Types.ObjectId(creator._id)
       );

       this.logger.log(`Private evaluation message sent to acceptor ${acceptor.userId} for operation ${operation._id}`);
     } catch (error) {
       this.logger.error(`Failed to send private evaluation message for operation ${operation._id}:`, error);
     }
  }

  private getTimeUntilExpiration(expiresAt: Date): string {
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();
    
    if (diff <= 0) {
      return 'Expirada';
    }
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
}