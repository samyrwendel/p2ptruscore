import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { KarmaModule } from '../karma/karma.module';
import { CommandsModule, commandHandlers } from './commands/commands.module';
import { KarmaMessageHandler } from './handlers/karma-message.handler';
import { BoraMessageHandler } from './handlers/bora-message.handler';
import { NewMemberHandler } from './handlers/new-member.handler';
import { TelegramSharedModule } from './shared/telegram-shared.module';
import { OperationsModule } from '../operations/operations.module';
import { UsersModule } from '../users/users.module';
import { GroupsModule } from '../groups/groups.module';
import { getBotToken } from 'nestjs-telegraf';

@Module({
  imports: [KarmaModule, CommandsModule, TelegramSharedModule, OperationsModule, UsersModule, GroupsModule],
  providers: [TelegramService, KarmaMessageHandler, BoraMessageHandler, NewMemberHandler],
  exports: [TelegramService, NewMemberHandler],
})
export class TelegramModule {}
