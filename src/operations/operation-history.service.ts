import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { Operation, OperationStatus } from './schemas/operation.schema';
import { UsersService } from '../users/users.service';
import { formatTotalBRL, formatUnitPriceBRL } from '../shared/operation-value.utils';

export interface OperationHistoryEntry {
  timestamp: Date;
  status: OperationStatus;
  actor?: Types.ObjectId;
  actorName?: string;
  description: string;
  details?: string;
}

// Estendendo Operation para incluir timestamps do Mongoose
interface OperationWithTimestamps extends Operation {
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable()
export class OperationHistoryService {
  private readonly logger = new Logger(OperationHistoryService.name);

  constructor(
    private readonly usersService: UsersService,
  ) {}

  /**
   * Gera o histórico completo da operação baseado no status atual e dados
   */
  async generateOperationHistory(operation: OperationWithTimestamps): Promise<OperationHistoryEntry[]> {
    const history: OperationHistoryEntry[] = [];

    try {
      // 1. Operação Criada
      const creator = await this.usersService.findById(operation.creator.toString());
      const creatorName = creator?.userName ? `@${creator.userName}` : creator?.firstName || 'Usuário';
      
      history.push({
        timestamp: operation.createdAt || new Date(),
        status: OperationStatus.PENDING,
        actor: operation.creator,
        actorName: creatorName,
        description: '🆕 Operação criada',
        details: `${creatorName} criou uma operação de ${operation.type === 'buy' ? 'compra' : 'venda'}`
      });

      // 2. Operação Aceita (se aplicável)
      if (operation.acceptor && (operation.status === OperationStatus.ACCEPTED || 
          operation.status === OperationStatus.PENDING_COMPLETION || 
          operation.status === OperationStatus.COMPLETED)) {
        
        const acceptor = await this.usersService.findById(operation.acceptor.toString());
        const acceptorName = acceptor?.userName ? `@${acceptor.userName}` : acceptor?.firstName || 'Usuário';
        
        history.push({
          timestamp: operation.updatedAt || new Date(),
          status: OperationStatus.ACCEPTED,
          actor: operation.acceptor,
          actorName: acceptorName,
          description: '✅ Operação aceita',
          details: `${acceptorName} aceitou a operação`
        });
      }

      // 3. Solicitação de Conclusão (se aplicável)
      if (operation.completionRequestedBy && operation.status === OperationStatus.PENDING_COMPLETION) {
        const requester = await this.usersService.findById(operation.completionRequestedBy.toString());
        const requesterName = requester?.userName ? `@${requester.userName}` : requester?.firstName || 'Usuário';
        
        history.push({
          timestamp: operation.completionRequestedAt || operation.updatedAt || new Date(),
          status: OperationStatus.PENDING_COMPLETION,
          actor: operation.completionRequestedBy,
          actorName: requesterName,
          description: '⏳ Conclusão solicitada',
          details: `${requesterName} solicitou a conclusão da operação`
        });
      }

      // 4. Operação Concluída (se aplicável)
      if (operation.status === OperationStatus.COMPLETED) {
        history.push({
          timestamp: operation.updatedAt || new Date(),
          status: OperationStatus.COMPLETED,
          description: '🎉 Operação criada',
          details: 'Operação finalizada com sucesso por ambas as partes'
        });
      }

      // 5. Operação Cancelada (se aplicável)
      if (operation.status === OperationStatus.CANCELLED) {
        history.push({
          timestamp: operation.updatedAt || new Date(),
          status: OperationStatus.CANCELLED,
          description: '❌ Operação cancelada',
          details: 'Operação foi cancelada'
        });
      }

      // 6. Operação Revertida (se aplicável)
      if (operation.status === OperationStatus.PENDING && operation.acceptor) {
        // Se tem acceptor mas status é PENDING, provavelmente foi revertida
        history.push({
          timestamp: operation.updatedAt || new Date(),
          status: OperationStatus.PENDING,
          description: '🔄 Operação revertida',
          details: 'Operação foi revertida e está disponível novamente'
        });
      }

    } catch (error) {
      this.logger.error('Erro ao gerar histórico da operação:', error);
    }

    return history.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Formata o histórico em texto para exibição
   */
  formatHistoryForDisplay(history: OperationHistoryEntry[]): string {
    if (history.length === 0) {
      return '';
    }

    let historyText = '📋 **HISTÓRICO DA OPERAÇÃO**\n\n';
    
    history.forEach((entry, index) => {
      const timeStr = entry.timestamp.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      historyText += `${index + 1}. ${entry.description}\n`;
      historyText += `   📅 ${timeStr}`;
      if (entry.actorName) {
        historyText += ` por ${entry.actorName}`;
      }
      historyText += '\n';
      if (entry.details) {
        historyText += `   💬 ${entry.details}\n`;
      }
      historyText += '\n';
    });

    return historyText;
  }

  /**
   * Gera mensagem consolidada completa da operação
   */
  async generateConsolidatedMessage(operation: OperationWithTimestamps): Promise<string> {
    const history = await this.generateOperationHistory(operation);

    // Informações básicas da operação (mais concisas)
    const typeEmoji = operation.type === 'buy' ? '🟢' : '🔴';
    const typeText = operation.type === 'buy' ? 'COMPRA' : 'VENDA';
    const total = operation.amount * operation.price;
    
    let message = `${typeEmoji} **${typeText}** - ${operation.assets.join(', ')}\n`;
    message += `🌐 ${operation.networks.map(n => n.toUpperCase()).join(', ')} | `;
    message += `📊 ${operation.amount} | `;
    message += `💵 ${formatUnitPriceBRL(operation)} | `;
    message += `💸 Total: ${formatTotalBRL(operation)}\n`;
    message += `🆔 \`${operation._id}\`\n\n`;

    // Histórico otimizado (sem redundâncias)
    message += this.formatOptimizedHistory(history);

    // Status atual e próximos passos
    const statusEmoji = this.getStatusEmoji(operation.status);
    const statusText = this.getStatusText(operation.status);
    message += `📊 **${statusEmoji} ${statusText}**\n\n`;
    message += this.getStatusInstructions(operation.status);

    return message;
  }

  /**
   * Formata o histórico de forma otimizada, removendo redundâncias
   */
  private formatOptimizedHistory(history: OperationHistoryEntry[]): string {
    if (history.length === 0) {
      return '';
    }

    let historyText = '📋 **HISTÓRICO**\n\n';
    
    history.forEach((entry, index) => {
      const timeStr = entry.timestamp.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      // Formato mais compacto: emoji + descrição + tempo + ator
      historyText += `${this.getHistoryEmoji(entry.status)} **${this.getHistoryAction(entry.status)}**`;
      if (entry.actorName) {
        historyText += ` por ${entry.actorName}`;
      }
      historyText += ` - ${timeStr}\n`;
    });

    historyText += '\n';
    return historyText;
  }

  private getHistoryEmoji(status: OperationStatus): string {
    switch (status) {
      case OperationStatus.PENDING: return '🆕';
      case OperationStatus.ACCEPTED: return '✅';
      case OperationStatus.PENDING_COMPLETION: return '⏳';
      case OperationStatus.COMPLETED: return '🎉';
      case OperationStatus.CANCELLED: return '❌';
      default: return '📝';
    }
  }

  private getHistoryAction(status: OperationStatus): string {
    switch (status) {
      case OperationStatus.PENDING: return 'Criada';
      case OperationStatus.ACCEPTED: return 'Aceita';
      case OperationStatus.PENDING_COMPLETION: return 'Conclusão solicitada';
      case OperationStatus.COMPLETED: return 'Concluída';
      case OperationStatus.CANCELLED: return 'Cancelada';
      default: return 'Atualizada';
    }
  }

  private getStatusEmoji(status: OperationStatus): string {
    switch (status) {
      case OperationStatus.PENDING: return '⏳';
      case OperationStatus.ACCEPTED: return '✅';
      case OperationStatus.PENDING_COMPLETION: return '⏳';
      case OperationStatus.COMPLETED: return '🎉';
      case OperationStatus.CANCELLED: return '❌';
      default: return '❓';
    }
  }

  private getStatusText(status: OperationStatus): string {
    switch (status) {
      case OperationStatus.PENDING: return 'Aguardando aceitação';
      case OperationStatus.ACCEPTED: return 'Aceita - Em negociação';
      case OperationStatus.PENDING_COMPLETION: return 'Aguardando confirmação de conclusão';
      case OperationStatus.COMPLETED: return 'Concluída com sucesso';
      case OperationStatus.CANCELLED: return 'Cancelada';
      default: return 'Status desconhecido';
    }
  }

  /**
   * Gera botões dinâmicos baseados no status da operação
   */
  generateDynamicButtons(operation: OperationWithTimestamps): any {
    const buttons: any[] = [];

    switch (operation.status) {
      case OperationStatus.PENDING:
        // Operação criada - apenas cancelar
        buttons.push([
          {
            text: '❌ Cancelar Operação',
            callback_data: `cancel_operation_${operation._id}`
          }
        ]);
        break;

      case OperationStatus.ACCEPTED:
        // Operação aceita - concluir e cancelar
        buttons.push([
          {
            text: '✅ Concluir Operação',
            callback_data: `complete_operation_${operation._id}`
          },
          {
            text: '❌ Cancelar Operação',
            callback_data: `cancel_operation_${operation._id}`
          }
        ]);
        break;

      case OperationStatus.PENDING_COMPLETION:
        // Aguardando confirmação - aceitar conclusão e contestar
        buttons.push([
          {
            text: '✅ Aceitar Conclusão',
            callback_data: `complete_operation_${operation._id}`
          },
          {
            text: '⚠️ Contestar',
            callback_data: `dispute_operation_${operation._id}`
          }
        ]);
        break;

      case OperationStatus.COMPLETED:
        // Operação concluída - sem botões de ação
        return null;

      case OperationStatus.CANCELLED:
        // Operação cancelada - sem botões de ação
        return null;

      default:
        return null;
    }

    return buttons.length > 0 ? {
      inline_keyboard: buttons
    } : null;
  }

  private getStatusInstructions(status: OperationStatus): string {
    switch (status) {
      case OperationStatus.PENDING:
        return '👆 **Próximos passos:** Aguarde alguém aceitar sua operação ou use o botão para cancelar.';
      
      case OperationStatus.ACCEPTED:
        return '👆 **Próximos passos:** Entrem em contato via DM, combinem os detalhes e usem o botão "Concluir Operação" quando finalizada.';
      
      case OperationStatus.PENDING_COMPLETION:
        return '👆 **Próximos passos:** A outra parte deve confirmar a conclusão ou você pode contestar se houver problemas.';
      
      case OperationStatus.COMPLETED:
        return '🎉 **Operação finalizada!** Obrigado por usar o TrustScore P2P.';
      
      case OperationStatus.CANCELLED:
        return '❌ **Operação cancelada.** As informações ficam mantidas para consulta.';
      
      default:
        return '';
    }
  }
}