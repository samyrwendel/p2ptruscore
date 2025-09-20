import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { ConfigWebController } from './config-web.controller';
import { ConfigManagementService } from './config-management.service';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [TelegramModule],
  controllers: [ConfigController, ConfigWebController],
  providers: [ConfigManagementService],
  exports: [ConfigManagementService],
})
export class ConfigModule {}