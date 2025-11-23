import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigController } from './config.controller';
import { ConfigWebController } from './config-web.controller';
import { ConfigManagementService } from './config-management.service';
import { TelegramModule } from '../telegram/telegram.module';
import { OperationsModule } from '../operations/operations.module';
import { Operation, OperationSchema } from '../operations/schemas/operation.schema';

@Module({
  imports: [
    TelegramModule,
    OperationsModule,
    MongooseModule.forFeature([{ name: Operation.name, schema: OperationSchema }])
  ],
  controllers: [ConfigController, ConfigWebController],
  providers: [ConfigManagementService],
  exports: [ConfigManagementService],
})
export class ConfigModule {}
