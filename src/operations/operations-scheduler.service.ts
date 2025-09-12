import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OperationsService } from './operations.service';

@Injectable()
export class OperationsSchedulerService {
  private readonly logger = new Logger(OperationsSchedulerService.name);

  constructor(private readonly operationsService: OperationsService) {}

  // Executa a limpeza de operações expiradas a cada 30 minutos
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleExpiredOperationsCleanup() {
    this.logger.log('Iniciando limpeza de operações expiradas...');
    
    try {
      await this.operationsService.cleanupExpiredOperations();
      this.logger.log('Limpeza de operações expiradas concluída com sucesso');
    } catch (error) {
      this.logger.error('Erro durante a limpeza de operações expiradas:', error);
    }
  }

  // Executa uma limpeza mais completa a cada 6 horas
  @Cron(CronExpression.EVERY_6_HOURS)
  async handleDeepCleanup() {
    this.logger.log('Iniciando limpeza profunda de operações...');
    
    try {
      await this.operationsService.cleanupExpiredOperations();
      this.logger.log('Limpeza profunda de operações concluída com sucesso');
    } catch (error) {
      this.logger.error('Erro durante a limpeza profunda de operações:', error);
    }
  }
}