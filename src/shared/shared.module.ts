import { Module, OnModuleInit } from '@nestjs/common';
import { RateLimiterService } from './rate-limiter.service';
import { TelegramRetryService } from './telegram-retry.service';
import { TransactionService } from './transaction.service';

@Module({
  providers: [RateLimiterService, TelegramRetryService, TransactionService],
  exports: [RateLimiterService, TelegramRetryService, TransactionService],
})
export class SharedModule implements OnModuleInit {
  constructor(private readonly rateLimiterService: RateLimiterService) {}

  onModuleInit() {
    // Limpar rate limits expirados a cada 5 minutos
    setInterval(() => {
      this.rateLimiterService.cleanup();
    }, 5 * 60 * 1000);
  }
}
