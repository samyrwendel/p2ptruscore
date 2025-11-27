import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ClientSession } from 'mongoose';

/**
 * Serviço para gerenciar transações MongoDB
 *
 * IMPORTANTE: Transações MongoDB requerem replica set.
 * Se estiver rodando em standalone, as transações falharão silenciosamente
 * e as operações serão executadas sem transação.
 */
@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);
  private transactionsSupported: boolean | null = null;

  constructor(
    @InjectConnection() private readonly connection: Connection,
  ) {
    this.checkTransactionSupport();
  }

  /**
   * Verifica se o MongoDB suporta transações (replica set)
   */
  private async checkTransactionSupport(): Promise<void> {
    try {
      if (!this.connection.db) {
        this.transactionsSupported = false;
        this.logger.warn('MongoDB connection not ready');
        return;
      }

      const admin = this.connection.db.admin();
      const serverInfo = await admin.serverStatus();

      // Verifica se está rodando em replica set
      if (serverInfo.repl && serverInfo.repl.ismaster) {
        this.transactionsSupported = true;
        this.logger.log('✅ MongoDB transactions supported (replica set detected)');
      } else {
        this.transactionsSupported = false;
        this.logger.warn(
          '⚠️ MongoDB transactions NOT supported (standalone mode). ' +
          'Operations will run without transactions. ' +
          'For production, configure MongoDB replica set.'
        );
      }
    } catch (error) {
      this.logger.warn('Could not determine transaction support:', error.message);
      this.transactionsSupported = false;
    }
  }

  /**
   * Executa uma função dentro de uma transação MongoDB
   *
   * Se transações não forem suportadas, executa a função sem transação
   *
   * @param fn Função a executar dentro da transação
   * @returns Resultado da função
   *
   * @example
   * await transactionService.withTransaction(async (session) => {
   *   await repo1.update(filter, data, { session });
   *   await repo2.create(newData, { session });
   *   return result;
   * });
   */
  async withTransaction<T>(
    fn: (session: ClientSession | null) => Promise<T>,
  ): Promise<T> {
    // Se transações não são suportadas, executar sem sessão
    if (this.transactionsSupported === false) {
      this.logger.debug('Executing without transaction (not supported)');
      return fn(null);
    }

    const session = await this.connection.startSession();

    try {
      session.startTransaction();

      const result = await fn(session);

      await session.commitTransaction();
      this.logger.debug('Transaction committed successfully');

      return result;
    } catch (error) {
      await session.abortTransaction();
      this.logger.error('Transaction aborted due to error:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Executa múltiplas operações em paralelo dentro de uma transação
   *
   * IMPORTANTE: Todas as operações devem ter sucesso para a transação ser commitada
   *
   * @param operations Array de funções que recebem a sessão
   * @returns Array de resultados
   *
   * @example
   * const [op1Result, op2Result] = await transactionService.withTransactionParallel([
   *   (session) => repo1.update(filter1, data1, { session }),
   *   (session) => repo2.update(filter2, data2, { session }),
   * ]);
   */
  async withTransactionParallel<T extends any[]>(
    operations: Array<(session: ClientSession | null) => Promise<any>>,
  ): Promise<T> {
    return this.withTransaction(async (session) => {
      return Promise.all(operations.map(op => op(session))) as Promise<T>;
    });
  }

  /**
   * Verifica se transações são suportadas
   */
  areTransactionsSupported(): boolean {
    return this.transactionsSupported === true;
  }
}
