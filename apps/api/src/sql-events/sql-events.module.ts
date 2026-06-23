import { Module } from '@nestjs/common';
import { SqlEventsController } from './sql-events.controller';
import { SqlEventsService } from './sql-events.service';
import { ServerApiKeyGuard } from '../auth/guards/server-api-key.guard';

@Module({
  controllers: [SqlEventsController],
  providers: [SqlEventsService, ServerApiKeyGuard],
  exports: [SqlEventsService],
})
export class SqlEventsModule {}
