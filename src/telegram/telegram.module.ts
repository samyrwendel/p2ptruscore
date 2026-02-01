import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { TelegramHealthService } from './telegram-health.service';
import { KarmaModule } from '../karma/karma.module';
import { CommandsModule, commandHandlers } from './commands/commands.module';
import { KarmaMessageHandler } from './handlers/karma-message.handler';
import { BoraMessageHandler } from './handlers/bora-message.handler';
import { NewMemberHandler } from './handlers/new-member.handler';
import { PendingEvaluationNotificationService } from './handlers/pending-evaluation-notification.service';
import { TelegramSharedModule } from './shared/telegram-shared.module';
import { OperationsModule } from '../operations/operations.module';
import { UsersModule } from '../users/users.module';
import { GroupsModule } from '../groups/groups.module';
import { SharedModule } from '../shared/shared.module';
import { getBotToken } from 'nestjs-telegraf';

@Module({
  imports: [KarmaModule, CommandsModule, TelegramSharedModule, OperationsModule, UsersModule, GroupsModule, SharedModule],
  providers: [TelegramService, TelegramHealthService, KarmaMessageHandler, BoraMessageHandler, NewMemberHandler, PendingEvaluationNotificationService],
  exports: [TelegramService, TelegramHealthService, NewMemberHandler, PendingEvaluationNotificationService],
})
export class TelegramModule {}
