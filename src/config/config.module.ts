import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { ConfigManagementService } from './config-management.service';

@Module({
  controllers: [ConfigController],
  providers: [ConfigManagementService],
  exports: [ConfigManagementService],
})
export class ConfigModule {}
