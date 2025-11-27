import { Module, OnModuleInit } from '@nestjs/common';
import { RateLimiterService } from './rate-limiter.service';

@Module({
  providers: [RateLimiterService],
  exports: [RateLimiterService],
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
