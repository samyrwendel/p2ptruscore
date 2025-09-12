import { Module } from '@nestjs/common';
import * as Joi from 'joi';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { DatabaseModule } from './database/database.module';
import { TelegramModule } from './telegram/telegram.module';
import { UsersModule } from './users/users.module';
import { KarmaModule } from './karma/karma.module';
import { OperationsModule } from './operations/operations.module';
import { KarmaApiModule } from './api/karma/karma-api.module';
import { UsersApiModule } from './api/users/users-api.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        TELEGRAM_BOT_TOKEN: Joi.string().required(),
        MONGODB_CNN: Joi.string().required(),
        TELEGRAM_BOT_USERNAME: Joi.string().required(),
        PORT: Joi.string().default('3000'),
      }),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    TelegrafModule.forRootAsync({
      botName: 'DEFAULT_BOT_NAME',
      useFactory: (configService: ConfigService) => ({
        token: configService.get<string>('TELEGRAM_BOT_TOKEN')!,
      }),
      inject: [ConfigService],
    }),
    DatabaseModule,
    TelegramModule,
    UsersModule,
    KarmaModule,
    OperationsModule,

    // API modules for external access
    KarmaApiModule,
    UsersApiModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
