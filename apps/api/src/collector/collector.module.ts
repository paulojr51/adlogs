import { Module } from '@nestjs/common';
import { CollectorService } from './collector.service';
import { CollectorController } from './collector.controller';
import { ServerApiKeyGuard } from '../auth/guards/server-api-key.guard';
import { ProcessEventsModule } from '../process-events/process-events.module';

@Module({
  imports: [ProcessEventsModule],
  controllers: [CollectorController],
  providers: [CollectorService, ServerApiKeyGuard],
})
export class CollectorModule {}
