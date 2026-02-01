import { Injectable, Logger, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/types';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class TelegramHealthService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramHealthService.name);
  private consecutiveFailures = 0;
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private readonly HEALTH_CHECK_TIMEOUT = 30000; // 30 seconds
  private isShuttingDown = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
  ) {}

  async onModuleInit() {
    this.logger.log('🏥 Telegram Health Service initialized');

    // Start health check after a delay to allow bot to fully initialize
    setTimeout(() => {
      this.startHealthCheckInterval();
    }, 30000); // Wait 30 seconds before first check
  }

  onApplicationShutdown() {
    this.isShuttingDown = true;
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  private startHealthCheckInterval() {
    // Check every 5 minutes
    this.healthCheckInterval = setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.performHealthCheck();
      }
    }, 5 * 60 * 1000);

    this.logger.log('🏥 Health check interval started (every 5 minutes)');
  }

  // Also run on cron for redundancy - every 10 minutes
  @Cron('*/10 * * * *')
  async scheduledHealthCheck() {
    if (!this.isShuttingDown) {
      await this.performHealthCheck();
    }
  }

  private async performHealthCheck(): Promise<boolean> {
    try {
      this.logger.debug('🏥 Performing Telegram health check...');

      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), this.HEALTH_CHECK_TIMEOUT);
      });

      // Try to get bot info (simple API call to verify connection)
      const healthCheckPromise = this.bot.telegram.getMe();

      const botInfo = await Promise.race([healthCheckPromise, timeoutPromise]);

      if (botInfo && botInfo.id) {
        this.consecutiveFailures = 0;
        this.logger.debug(`🏥 Health check passed: Bot @${botInfo.username} is online`);
        return true;
      } else {
        throw new Error('Invalid bot info received');
      }
    } catch (error: any) {
      this.consecutiveFailures++;
      this.logger.error(`🏥 Health check failed (${this.consecutiveFailures}/${this.MAX_CONSECUTIVE_FAILURES}): ${error.message}`);

      if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        this.logger.error('🏥 ❌ Too many consecutive failures. Forcing restart...');
        this.forceRestart();
      }

      return false;
    }
  }

  private forceRestart() {
    this.logger.error('🏥 💀 Forcing process exit to trigger PM2 restart...');

    // Give some time for the log to be written
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  }

  // Manual health check endpoint for debugging
  async checkHealth(): Promise<{ healthy: boolean; consecutiveFailures: number; message: string }> {
    const healthy = await this.performHealthCheck();
    return {
      healthy,
      consecutiveFailures: this.consecutiveFailures,
      message: healthy ? 'Bot is healthy' : `Bot is unhealthy (${this.consecutiveFailures} consecutive failures)`,
    };
  }
}
