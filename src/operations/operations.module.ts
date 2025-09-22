import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
// import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { OperationsService } from './operations.service';
import { OperationsRepository } from './operations.repository';
import { PendingEvaluationRepository } from './pending-evaluation.repository';
import { PendingEvaluationService } from './pending-evaluation.service';
import { OperationsBroadcastService } from './operations-broadcast.service';
import { OperationsSchedulerService } from './operations-scheduler.service';
import { CurrencyApiService } from './currency-api.service';
import { Operation, OperationSchema } from './schemas/operation.schema';
import { PendingEvaluation, PendingEvaluationSchema } from './schemas/pending-evaluation.schema';
import { UsersModule } from '../users/users.module';
import { GroupsModule } from '../groups/groups.module';
import { KarmaModule } from '../karma/karma.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Operation.name, schema: OperationSchema },
      { name: PendingEvaluation.name, schema: PendingEvaluationSchema },
    ]),
    // ScheduleModule.forRoot(),
    HttpModule,
    UsersModule,
    GroupsModule,
    KarmaModule,
  ],
  providers: [OperationsRepository, PendingEvaluationRepository, PendingEvaluationService, OperationsService, OperationsBroadcastService, OperationsSchedulerService, CurrencyApiService],
  exports: [OperationsService, OperationsRepository, PendingEvaluationRepository, PendingEvaluationService, OperationsBroadcastService, CurrencyApiService],
})
export class OperationsModule {}