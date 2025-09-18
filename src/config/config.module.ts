import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { ConfigManagementService } from './config-management.service';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [TelegramModule],
  controllers: [ConfigController],
  providers: [ConfigManagementService],
  exports: [ConfigManagementService],
})
export class ConfigModule {}
