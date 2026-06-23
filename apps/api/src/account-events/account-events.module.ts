import { Module } from '@nestjs/common';
import { AccountEventsController } from './account-events.controller';
import { AccountEventsService } from './account-events.service';
import { ServerApiKeyGuard } from '../auth/guards/server-api-key.guard';

@Module({
  controllers: [AccountEventsController],
  providers: [AccountEventsService, ServerApiKeyGuard],
  exports: [AccountEventsService],
})
export class AccountEventsModule {}
