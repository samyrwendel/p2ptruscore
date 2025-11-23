import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BinancePriceService } from './binance-price.service';

@Module({
  imports: [HttpModule],
  providers: [BinancePriceService],
  exports: [BinancePriceService],
})
export class IntegrationsModule {}