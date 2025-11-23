import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { TermsAcceptanceService } from './terms-acceptance.service';
import { TermsAcceptanceRepository } from './terms-acceptance.repository';
import { TermsNotificationService } from './terms-notification.service';
import { User, UserSchema } from './schemas/user.schema';
import { TermsAcceptance, TermsAcceptanceSchema } from './schemas/terms-acceptance.schema';
import { GroupsModule } from '../groups/groups.module';
import { TelegrafModule } from 'nestjs-telegraf';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: TermsAcceptance.name, schema: TermsAcceptanceSchema },
    ]),
    GroupsModule,
    TelegrafModule,
  ],
  providers: [
    UsersService, 
    UsersRepository, 
    TermsAcceptanceService, 
    TermsAcceptanceRepository,
    TermsNotificationService
  ],
  exports: [
    UsersService, 
    UsersRepository, 
    TermsAcceptanceService, 
    TermsAcceptanceRepository,
    TermsNotificationService
  ],
})
export class UsersModule {}
