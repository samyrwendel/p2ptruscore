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
          this.logger.log(`📤 Operação ${operation._id} enviada para grupo ${group.groupId}`);
          return;
        } else {
          this.logger.warn(`❌ Grupo ${operation.group} não encontrado`);
        }
      } catch (error) {
        this.logger.error(`❌ Erro ao buscar grupo ${operation.group}:`, error);
      }
    }
    
    // Se não tem grupo específico ou grupo não encontrado, enviar para todos
    await this.broadcastOperationToAllGroups(operation);
    this.logger.log(`📡 Operação ${operation._id} enviada para todos os grupos`);
    
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
        this.logger.error(`❌ Criador não encontrado: ${operation.creator}`);
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
      const creatorUserId = creator?.userName || creator?.firstName || creator?.userId;
       const privateUrl = `https://t.me/${botUsername}?start=reputacao_${creatorUserId}`;
      
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

      // Configurar envio para tópico específico se for o grupo configurado
      const sendOptions: any = { 
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
      };
      
      const configuredGroupId = parseInt(process.env.TELEGRAM_GROUP_ID || '0');
      const threadId = parseInt(process.env.TELEGRAM_THREAD_ID || '0');
      
      if (groupId === configuredGroupId && threadId > 0) {
        sendOptions.message_thread_id = threadId;
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
          await this.operationsRepository.updateOperation(
            operation._id,
            updateData
          );
          this.logger.log(`✅ MessageId ${sentMessage.message_id} salvo para operação ${operation._id}`);
        } catch (error) {
          this.logger.warn(`⚠️ Failed to save messageId for operation ${operation._id}: ${error.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`❌ ERRO ao enviar operação ${operation._id} para grupo ${groupId}:`);
      this.logger.error(`📋 Tipo do erro: ${error.constructor.name}`);
      this.logger.error(`💬 Mensagem: ${error.message}`);
      
      if (error.response) {
        this.logger.error(`🔍 Resposta da API Telegram:`, error.response.data || error.response);
      }
      
      if (error.code) {
        this.logger.error(`🏷️ Código do erro: ${error.code}`);
      }
      
      // Log completo do erro para debug
      this.logger.error(`🔧 Stack trace:`, error.stack);
    }
  }

  async notifyOperationAccepted(
    operation: Operation,
    acceptorId: Types.ObjectId
  ): Promise<void> {
    try {
      this.logger.log(`🔄 [DEBUG] notifyOperationAccepted iniciado para operação ${operation._id}`);
      this.logger.log(`🔍 [DEBUG] Operation messageId: ${operation.messageId}`);
      this.logger.log(`🔍 [DEBUG] Operation group: ${operation.group}`);
      this.logger.log(`🔍 [DEBUG] AcceptorId: ${acceptorId}`);
      
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

      // Primeiro, notificar o criador no chat privado sobre a aceitação
      try {
        const acceptorName = acceptor.userName ? `@${acceptor.userName}` : acceptor.firstName || 'Usuário';
        
        // Enviar mensagem privada ao criador informando sobre a aceitação
         const creatorNotificationMessage = `✅ **Operação Aceita!**\n\n` +
           `${acceptorName} aceitou sua operação!\n\n` +
           `🔁 **QUERO TROCAR**\n` +
           `Ativos: ${operation.assets.join(', ')}\n` +
           `Redes: ${operation.networks.map(n => n.toUpperCase()).join(', ')}\n` +
           `Quantidade: ${operation.amount} (total)\n\n` +
           `👤 **Negociador:** ${acceptorName}\n` +
           `🆔 **ID:** \`${operation._id}\`\n\n` +
           `📞 **Próximos passos:**\n` +
           `1. Entrem em contato via DM\n` +
           `2. Combinem os detalhes da transação\n` +
           `3. Usem o botão "Concluir Operação" quando finalizada`;

        await this.bot.telegram.sendMessage(
          creator.userId,
          creatorNotificationMessage,
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ Concluir Operação', callback_data: `complete_operation_${operation._id}` },
                { text: '❌ Cancelar Operação', callback_data: `cancel_operation_${operation._id}` }
              ]]
            }
          }
        );
        this.logger.log(`Notificação de aceitação enviada ao criador ${creator.userId} para operação ${operation._id}`);
      } catch (error) {
        this.logger.warn('Erro ao notificar criador sobre aceitação:', error);
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
      
      // Para operações com EUR, ajustar a moeda do preço
      let priceFormatted = '';
      let quotationFormatted = '';
      
      if (operation.assets.includes('EURO' as any)) {
        // Para EUR, mostrar valores em EUR
        priceFormatted = operation.quotationType === 'google' ? 'Calculado na Transação' : `€ ${operation.price.toFixed(4)}`;
        quotationFormatted = operation.quotationType === 'google' ? 'Google' : `€ ${operation.price.toFixed(4)}`;
      } else {
        // Para outros ativos, manter em BRL
        priceFormatted = operation.quotationType === 'google' ? 'Calculado na Transação' : `R$ ${operation.price.toFixed(2)}`;
        quotationFormatted = operation.quotationType === 'google' ? 'Google' : `R$ ${operation.price.toFixed(2)}`;
      }
      
      const message = (
        `✅ **Operação Aceita!**\n\n` +
        `${acceptorName} aceitou a operação de ${typeText}\n\n` +
        `**Ativos:** ${assetsText}\n` +
        `**Quantidade:** ${operation.amount} ${assetUnit}\n` +
        `**Preço:** ${priceFormatted}\n` +
        `Cotação: ${quotationFormatted}\n` +
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

      // Adicionar botões de ação baseados no status da operação
      let inlineKeyboard;
      
      if (operation.status === 'pending_completion') {
        // Operação aguardando confirmação - apenas botão de desistir
        inlineKeyboard = {
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
      } else {
        // Operação aceita - botões de desistir e concluir
        inlineKeyboard = {
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
              },
              {
                text: '✅ Concluir Operação',
                callback_data: `complete_operation_${operation._id}`
              }
            ]
          ]
        };
      }

      // Configurar envio para tópico específico se for o grupo P2P configurado
      const sendOptions: any = { 
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
      };
      
      const p2pGroupId = parseInt(process.env.TELEGRAM_P2P_GROUP_ID || '0');
      const p2pThreadId = parseInt(process.env.TELEGRAM_P2P_THREAD_ID || '0');
      
      if (group.groupId === p2pGroupId && p2pThreadId > 0) {
        sendOptions.message_thread_id = p2pThreadId;
      }

      // Editar a mensagem original em vez de deletar e criar nova
      if (operation.messageId) {
        try {
          this.logger.log(`🔄 Tentando editar mensagem ${operation.messageId} para operação ${operation._id}`);
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
          this.logger.log(`✅ Mensagem ${operation.messageId} editada com sucesso para operação ${operation._id}`);
        } catch (editError: any) {
          this.logger.error(`❌ Falha ao editar mensagem ${operation.messageId} para operação ${operation._id}:`, editError);
          this.logger.warn(`🔄 Tentando deletar e enviar nova mensagem...`);
          
          // Se falhar ao editar, deletar e enviar nova
          try {
            await this.deleteOperationMessage(operation);
            const newMessage = await this.bot.telegram.sendMessage(
              group.groupId,
              message,
              sendOptions
            );
            
            // Atualizar messageId da operação
            await this.operationsRepository.updateOperation(operation._id, {
              messageId: newMessage.message_id
            });
            
            this.logger.log(`✅ Nova mensagem ${newMessage.message_id} enviada para operação ${operation._id}`);
          } catch (sendError: any) {
            this.logger.error(`❌ Falha ao enviar nova mensagem para operação ${operation._id}:`, sendError);
          }
        }
      } else {
        // Se não tem messageId, enviar nova mensagem
        this.logger.log(`📤 Enviando nova mensagem para operação ${operation._id} (sem messageId)`);
        try {
          const newMessage = await this.bot.telegram.sendMessage(
            group.groupId,
            message,
            sendOptions
          );
          
          // Atualizar messageId da operação
          await this.operationsRepository.updateOperation(operation._id, {
            messageId: newMessage.message_id
          });
          
          this.logger.log(`✅ Nova mensagem ${newMessage.message_id} enviada e salva para operação ${operation._id}`);
        } catch (sendError: any) {
          this.logger.error(`❌ Falha ao enviar mensagem para operação ${operation._id}:`, sendError);
        }
      }

      this.logger.log(
        `Operation acceptance ${operation._id} notified to group ${group.groupId}`
      );

      // Enviar mensagem privada ao negociador com botões de ação
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
        `✅ **Operação Concluída com Sucesso!**\n\n` +
        `${typeEmoji} **${typeText} ${assetsText}**\n` +
        `🌐 **Redes:** ${networksText}\n` +
        `💰 **Quantidade:** ${operation.amount} (total)\n\n`
      );

      // Mostrar detalhes da transação baseado no tipo de cotação
      let priceFormatted = '';
      let totalFormatted = '';
      
      if (operation.assets.includes('EURO' as any)) {
        // Para EUR, mostrar valores em EUR
        priceFormatted = operation.quotationType === 'google' ? 'Google (calculada na transação)' : `€ ${operation.price.toFixed(4)}`;
        totalFormatted = `€ ${total.toFixed(2)}`;
      } else {
        // Para outros ativos, manter em BRL
        priceFormatted = operation.quotationType === 'google' ? 'Google (calculada na transação)' : `R$ ${operation.price.toFixed(2)}`;
        totalFormatted = `R$ ${total.toFixed(2)}`;
      }
      
      if (operation.quotationType === 'google') {
        message += `💵 **Cotação:** ${priceFormatted}\n`;
      } else {
        message += `💵 **Preço:** ${priceFormatted}\n`;
      }
      
      message += `💸 **Total:** ${totalFormatted}\n\n`;

      // Informações dos participantes
      message += `👤 **Criador:** ${creatorName}\n`;
      if (acceptor) {
        message += `🤝 **Negociador:** ${acceptorName}\n`;
      }
      
      // Informações da operação para consulta futura
      message += (
        `\n📋 **Detalhes da Operação:**\n` +
        `🆔 **ID:** \`${operation._id}\`\n` +
        `⏰ **Concluída em:** ${new Date().toLocaleString('pt-BR')}\n`
      );
      
      // Adicionar detalhes da transação se fornecidos
      if (operation.transactionDetails) {
        message += `📝 **Detalhes:** ${operation.transactionDetails}\n`;
      }
      
      // Adicionar hash da transação se fornecido
      if (operation.transactionHash) {
        message += `🔗 **Hash:** \`${operation.transactionHash}\`\n`;
      }
      
      message += (
        `\n💡 **Não esqueçam de se avaliarem mutuamente!**\n` +
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
      
      // Usar as variáveis de ambiente corretas
      const p2pGroupId = parseInt(process.env.TELEGRAM_GROUP_ID || '0');
      const p2pThreadId = parseInt(process.env.TELEGRAM_THREAD_ID || '0');
      
      if (group.groupId === p2pGroupId && p2pThreadId > 0) {
        sendOptions.message_thread_id = p2pThreadId;
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
      
      // Enviar mensagens de avaliação bidirecional
      if (creator && acceptor) {
        await this.sendBidirectionalEvaluationMessages(operation, creator, acceptor);
      }
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
      
      // Remover avaliações pendentes e mensagens privadas quando operação é revertida
      await this.removePendingEvaluationMessages(operation);
      
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
        
        // Para operações com EUR, ajustar a moeda do preço
         let totalFormatted = '';
         let priceFormatted = '';
         
         if (operation.assets.includes('EURO' as any)) {
           // Para EUR, mostrar valores em EUR
           totalFormatted = `€ ${total.toFixed(2)}`;
           priceFormatted = `€ ${operation.price.toFixed(4)}`;
         } else {
           // Para outros ativos, manter em BRL
           totalFormatted = `R$ ${total.toFixed(2)}`;
           priceFormatted = `R$ ${operation.price.toFixed(2)}`;
         }
        
        message += (
          `${arrowIcon} **${actionText}:** ${operation.amount} ${assetsText}\n` +
          `${paymentArrow} **${paymentText}:** ${totalFormatted}\n` +
          `💱 **Cotação:** ${priceFormatted}\n\n`
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

      // Criar botões inline EXATAMENTE como no broadcast original
      // Criar URL para chat privado com reputação
      const botUsername = 'p2pscorebot'; // Nome do bot
      const creatorUserId = creator?.userName || creator?.firstName || creator?.userId;
       const privateUrl = `https://t.me/${botUsername}?start=reputacao_${creatorUserId}`;
      
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
        `🎯 **Operação Aceita - Ação Necessária**\n\n` +
        `Você aceitou uma operação P2P e precisa decidir o próximo passo.\n\n` +
        `**Detalhes da Operação:**\n` +
        `${typeEmoji} **${typeText} ${assetsText}**\n` +
        `🌐 **Redes:** ${networksText}\n` +
        `💰 **Quantidade:** ${operation.amount} ${assetsText}\n` +
        `💵 **Preço:** ${operation.quotationType === 'google' ? 'Calculado na Transação' : `R$ ${operation.price.toFixed(2)}`}\n` +
        `👤 **Criador:** ${creatorName}\n\n` +
        `⚠️ **Importante:** Você não poderá criar ou aceitar novas operações até concluir ou desistir desta transação.\n\n` +
        `🆔 **ID da Operação:** ${operation._id}`
      );

      const inlineKeyboard = {
        inline_keyboard: [
          [
            {
              text: '❌ Desistir',
              callback_data: `revert_operation_${operation._id}`
            },
            {
              text: '✅ Concluir',
              callback_data: `complete_operation_${operation._id}`
            }
          ]
        ]
      };

      const sentMessage = await this.bot.telegram.sendMessage(
        acceptor.userId,
        message,
        {
          parse_mode: 'Markdown',
          reply_markup: inlineKeyboard
        }
      );

      // Salvar o ID da mensagem privada para poder removê-la depois
      if (sentMessage && sentMessage.message_id) {
        try {
          await this.operationsRepository.findOneAndUpdate(
            { _id: operation._id },
            { privateEvaluationMessageId: sentMessage.message_id }
          );
          this.logger.log(`Private evaluation message ID ${sentMessage.message_id} saved for operation ${operation._id}`);
        } catch (error) {
          this.logger.warn(`Failed to save private evaluation message ID for operation ${operation._id}: ${error.message}`);
        }
      }

       this.logger.log(`Private evaluation message sent to acceptor ${acceptor.userId} for operation ${operation._id}`);
       // Nota: Avaliações pendentes serão criadas apenas quando a operação for concluída
     } catch (error) {
       this.logger.error(`Failed to send private evaluation message for operation ${operation._id}:`, error);
     }
  }

  private async sendBidirectionalEvaluationMessages(
    operation: Operation,
    creator: any,
    acceptor: any
  ): Promise<void> {
    try {
      const typeEmoji = operation.type === 'buy' ? '🟢' : '🔴';
      const typeText = operation.type === 'buy' ? 'COMPRA' : 'VENDA';
      const assetsText = operation.assets.join(', ');
      
      // Mensagem para o criador avaliar o aceitador
       const acceptorName = acceptor.userName ? `@${acceptor.userName}` : acceptor.firstName;
       
       // Buscar reputação do aceitador para o cabeçalho
         let acceptorReputationInfo = '';
         try {
           if (operation.group) {
             const groupId = typeof operation.group === 'string' ? parseInt(operation.group) : Number(operation.group);
             if (!isNaN(groupId)) {
               const acceptorKarma = await this.getKarmaForUserWithFallback(acceptor, groupId);
               if (acceptorKarma && acceptorKarma.karma !== undefined) {
                 const reputation = getReputationInfo(acceptorKarma.karma);
                 acceptorReputationInfo = `\n📊 **Reputação Atual:** ${reputation.icone} ${reputation.nivel} (${acceptorKarma.karma} pts)\n`;
               }
             }
           }
         } catch (error) {
           this.logger.warn('Erro ao buscar reputação do aceitador:', error);
         }
       
       const creatorMessage = (
         `⭐ **Avaliação Obrigatória**\n\n` +
         `👤 **Avaliando:** ${acceptorName}${acceptorReputationInfo}\n` +
         `Você concluiu uma operação com sucesso!\n` +
         `Para finalizar, é obrigatório avaliar seu parceiro de negociação.\n\n` +
         `**Detalhes da Operação:**\n` +
         `${typeEmoji} **${typeText} ${assetsText}**\n` +
         `💰 **Quantidade:** ${operation.amount}\n` +
         `🆔 **ID:** \`${operation._id}\`\n\n` +
         `**Como foi a experiência?**\n` +
         `Escolha quantas estrelas você daria:`
       );
      
      // Mensagem para o aceitador avaliar o criador
       const creatorName = creator.userName ? `@${creator.userName}` : creator.firstName;
       
       // Buscar reputação do criador para o cabeçalho
         let creatorReputationInfo = '';
         try {
           if (operation.group) {
             const groupId = typeof operation.group === 'string' ? parseInt(operation.group) : Number(operation.group);
             if (!isNaN(groupId)) {
               const creatorKarma = await this.getKarmaForUserWithFallback(creator, groupId);
               if (creatorKarma && creatorKarma.karma !== undefined) {
                 const reputation = getReputationInfo(creatorKarma.karma);
                 creatorReputationInfo = `\n📊 **Reputação Atual:** ${reputation.icone} ${reputation.nivel} (${creatorKarma.karma} pts)\n`;
               }
             }
           }
         } catch (error) {
           this.logger.warn('Erro ao buscar reputação do criador:', error);
         }
       
       const acceptorMessage = (
         `⭐ **Avaliação Obrigatória**\n\n` +
         `👤 **Avaliando:** ${creatorName}${creatorReputationInfo}\n` +
         `A operação foi concluída com sucesso!\n` +
         `Para finalizar, é obrigatório avaliar seu parceiro de negociação.\n\n` +
         `**Detalhes da Operação:**\n` +
         `${typeEmoji} **${typeText} ${assetsText}**\n` +
         `💰 **Quantidade:** ${operation.amount}\n` +
         `🆔 **ID:** \`${operation._id}\`\n\n` +
         `**Como foi a experiência?**\n` +
         `Escolha quantas estrelas você daria:`
       );
      
      const evaluationKeyboard = {
        inline_keyboard: [
          [
            {
              text: '⭐',
              callback_data: `eval_star_1_${operation._id}`
            },
            {
              text: '⭐⭐',
              callback_data: `eval_star_2_${operation._id}`
            },
            {
              text: '⭐⭐⭐',
              callback_data: `eval_star_3_${operation._id}`
            }
          ],
          [
            {
              text: '⭐⭐⭐⭐',
              callback_data: `eval_star_4_${operation._id}`
            },
            {
              text: '⭐⭐⭐⭐⭐',
              callback_data: `eval_star_5_${operation._id}`
            }
          ]
        ]
      };
      
      // Enviar para o criador
      await this.bot.telegram.sendMessage(
        creator.userId,
        creatorMessage,
        {
          parse_mode: 'Markdown',
          reply_markup: evaluationKeyboard
        }
      );
      
      // Enviar para o aceitador
      await this.bot.telegram.sendMessage(
        acceptor.userId,
        acceptorMessage,
        {
          parse_mode: 'Markdown',
          reply_markup: evaluationKeyboard
        }
      );
      
      // Criar avaliações pendentes bidirecionais no banco de dados
      try {
        // Criador avalia aceitador
        await this.pendingEvaluationRepository.createPendingEvaluation(
          operation._id,
          new Types.ObjectId(creator._id),
          new Types.ObjectId(acceptor._id)
        );
        
        // Aceitador avalia criador
        await this.pendingEvaluationRepository.createPendingEvaluation(
          operation._id,
          new Types.ObjectId(acceptor._id),
          new Types.ObjectId(creator._id)
        );
        
        this.logger.log(`Bidirectional pending evaluations created for operation ${operation._id}`);
      } catch (error) {
        this.logger.error(`Failed to create pending evaluations for operation ${operation._id}:`, error);
      }
      
      this.logger.log(`Bidirectional evaluation messages sent for operation ${operation._id}`);
    } catch (error) {
      this.logger.error(`Failed to send bidirectional evaluation messages for operation ${operation._id}:`, error);
    }
  }

  private async removePendingEvaluationMessages(operation: Operation): Promise<void> {
    try {
      this.logger.log(`🔍 [DEBUG] removePendingEvaluationMessages called for operation ${operation._id}`);
      this.logger.log(`🔍 [DEBUG] Operation acceptor: ${operation.acceptor}`);
      this.logger.log(`🔍 [DEBUG] Operation privateEvaluationMessageId: ${operation.privateEvaluationMessageId}`);
      
      // Remover avaliações pendentes do banco de dados
      await this.pendingEvaluationRepository.deletePendingEvaluationsByOperation(operation._id);
      
      // Tentar remover mensagens privadas de avaliação se existirem
      if (operation.acceptor) {
        const acceptor = await this.usersService.findById(operation.acceptor.toString());
        if (acceptor) {
          this.logger.log(`🔍 [DEBUG] Found acceptor: ${acceptor.userId}`);
          try {
            // Remover a mensagem de avaliação privada se existir
            if (operation.privateEvaluationMessageId) {
              this.logger.log(`🔍 [DEBUG] Attempting to delete private message ${operation.privateEvaluationMessageId} for user ${acceptor.userId}`);
              try {
                await this.bot.telegram.deleteMessage(acceptor.userId, operation.privateEvaluationMessageId);
                this.logger.log(`✅ Private evaluation message ${operation.privateEvaluationMessageId} deleted for operation ${operation._id}`);
              } catch (deleteError) {
                this.logger.warn(`❌ Could not delete private evaluation message ${operation.privateEvaluationMessageId}: ${deleteError.message}`);
              }
            } else {
              this.logger.warn(`⚠️ No privateEvaluationMessageId found for operation ${operation._id}`);
            }
            
            // Enviar mensagem informando que a operação foi revertida
            await this.bot.telegram.sendMessage(
              acceptor.userId,
              `🔄 **Operação Revertida**\n\n` +
              `A operação que você aceitou foi revertida e não precisa mais ser avaliada.\n\n` +
              `🆔 **ID:** \`${operation._id}\``,
              { parse_mode: 'Markdown' }
            );
          } catch (error) {
            this.logger.warn(`Could not notify acceptor about operation revert: ${error.message}`);
          }
        } else {
          this.logger.warn(`⚠️ Acceptor not found for operation ${operation._id}`);
        }
      } else {
        this.logger.warn(`⚠️ No acceptor found for operation ${operation._id}`);
      }
      
      this.logger.log(`Pending evaluation messages removed for operation ${operation._id}`);
    } catch (error) {
      this.logger.error(`Failed to remove pending evaluation messages for operation ${operation._id}:`, error);
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

  async notifyCompletionRequested(operation: Operation, requesterId: Types.ObjectId): Promise<void> {
    try {
      if (!operation.group) {
        this.logger.warn('Operation has no associated group for completion request notification');
        return;
      }
      
      const creator = await this.usersService.findById(operation.creator.toString());
      const acceptor = operation.acceptor ? await this.usersService.findById(operation.acceptor.toString()) : null;
      const requester = await this.usersService.findById(requesterId.toString());
      
      if (!creator || !acceptor || !requester) {
        this.logger.warn('Missing user data for completion request notification');
        return;
      }

      // Determinar quem deve receber a notificação (a outra parte)
      const otherParty = requesterId.toString() === creator._id.toString() ? acceptor : creator;
      const requesterName = requester.userName ? `@${requester.userName}` : requester.firstName || 'Usuário';
      
      const typeEmoji = operation.type === 'buy' ? '🟢' : '🔴';
      const typeText = operation.type === 'buy' ? 'COMPRA' : 'VENDA';
      const assetsText = operation.assets.join(', ');

      const message = (
        `⏳ **Solicitação de Conclusão**\n\n` +
        `${typeEmoji} **${typeText} ${assetsText}**\n\n` +
        `👤 **${requesterName}** solicitou a conclusão desta operação.\n\n` +
        `🆔 **ID:** \`${operation._id}\`\n\n` +
        `🤝 **Você precisa confirmar** para finalizar a transação.\n\n` +
        `💡 Clique em "Aceitar Conclusão" se a operação foi realizada com sucesso.`
      );

      // Enviar notificação privada para a outra parte
      await this.bot.telegram.sendMessage(
        otherParty.userId,
        message,
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Aceitar Conclusão', callback_data: `complete_operation_${operation._id}` }
            ]]
          }
        }
      );

      this.logger.log(`Completion request notification sent to user ${otherParty.userId} for operation ${operation._id}`);
      
    } catch (error) {
      this.logger.error('Error sending completion request notification:', error);
    }
  }
}