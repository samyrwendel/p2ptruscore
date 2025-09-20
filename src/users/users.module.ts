import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { TermsAcceptanceService } from './terms-acceptance.service';
import { TermsAcceptanceRepository } from './terms-acceptance.repository';
import { User, UserSchema } from './schemas/user.schema';
import { TermsAcceptance, TermsAcceptanceSchema } from './schemas/terms-acceptance.schema';
import { GroupsModule } from '../groups/groups.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: TermsAcceptance.name, schema: TermsAcceptanceSchema },
    ]),
    GroupsModule,
  ],
  providers: [
    UsersService, 
    UsersRepository, 
    TermsAcceptanceService, 
    TermsAcceptanceRepository
  ],
  exports: [
    UsersService, 
    UsersRepository, 
    TermsAcceptanceService, 
    TermsAcceptanceRepository
  ],
})
export class UsersModule {}
