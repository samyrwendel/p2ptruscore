import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OperationsService } from './operations.service';
import { PendingEvaluationService } from './pending-evaluation.service';

@Injectable()
export class OperationsSchedulerService {
  private readonly logger = new Logger(OperationsSchedulerService.name);

  constructor(
    private readonly operationsService: OperationsService,
    private readonly pendingEvaluationService: PendingEvaluationService,
  ) {}

  // Limpeza periódica - apenas avaliações pendentes órfãs (operações não expiram mais)
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handlePeriodicCleanup() {
    this.logger.log('Iniciando limpeza periódica...');

    try {
      // Limpar avaliações pendentes órfãs
      try {
        await this.pendingEvaluationService.cleanupOrphanPendings();
      } catch (error) {
        this.logger.warn('Erro ao limpar avaliações pendentes órfãs:', error);
      }

      this.logger.log('Limpeza periódica concluída com sucesso');
    } catch (error) {
      this.logger.error('Erro durante a limpeza periódica:', error);
    }
  }

  // Limpeza profunda a cada 6 horas - apenas avaliações órfãs
  @Cron(CronExpression.EVERY_6_HOURS)
  async handleDeepCleanup() {
    this.logger.log('Iniciando limpeza profunda...');

    try {
      await this.pendingEvaluationService.cleanupOrphanPendings();
      this.logger.log('Limpeza profunda concluída com sucesso');
    } catch (error) {
      this.logger.error('Erro durante a limpeza profunda:', error);
    }
  }

  // Cancelar operações pendentes há mais de 7 dias - executa diariamente às 3h
  @Cron('0 3 * * *')
  async handleStalePendingCleanup() {
    this.logger.log('Iniciando limpeza de operações pendentes antigas...');

    try {
      const STALE_DAYS = 7; // Operações pendentes há mais de 7 dias serão canceladas
      const cancelledCount = await this.operationsService.cleanupStalePendingOperations(STALE_DAYS);

      if (cancelledCount > 0) {
        this.logger.log(`Limpeza de operações antigas concluída: ${cancelledCount} operações canceladas`);
      } else {
        this.logger.log('Limpeza de operações antigas concluída: nenhuma operação pendente antiga encontrada');
      }
    } catch (error) {
      this.logger.error('Erro durante limpeza de operações antigas:', error);
    }
  }

  // Enviar verificação de validade para operações pendentes há mais de 1 dia
  // Executa duas vezes ao dia: 9h e 15h (horário de Brasília)
  @Cron('0 9,15 * * *')
  async handleValidityCheckSend() {
    this.logger.log('Iniciando envio de verificações de validade...');

    try {
      const VALIDITY_CHECK_DAYS = 1; // Operações pendentes há mais de 1 dia recebem verificação
      const sentCount = await this.operationsService.processValidityChecks(VALIDITY_CHECK_DAYS);

      if (sentCount > 0) {
        this.logger.log(`Verificações de validade enviadas: ${sentCount} mensagens`);
      } else {
        this.logger.log('Verificações de validade: nenhuma operação precisa de verificação');
      }
    } catch (error) {
      this.logger.error('Erro ao enviar verificações de validade:', error);
    }
  }

  // Cancelar operações que não responderam à verificação de validade em 24h
  // Executa a cada hora para garantir cancelamento rápido após o prazo
  @Cron(CronExpression.EVERY_HOUR)
  async handleValidityCheckTimeout() {
    this.logger.log('Verificando operações sem resposta à verificação de validade...');

    try {
      const TIMEOUT_HOURS = 24; // 24 horas para responder
      const cancelledCount = await this.operationsService.cancelUnconfirmedOperations(TIMEOUT_HOURS);

      if (cancelledCount > 0) {
        this.logger.log(`Operações canceladas por timeout de validade: ${cancelledCount}`);
      }
    } catch (error) {
      this.logger.error('Erro ao processar timeout de verificação de validade:', error);
    }
  }
}
