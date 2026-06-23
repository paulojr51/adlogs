import { Module } from '@nestjs/common';
import { ProcessEventsController } from './process-events.controller';
import { ProcessEventsService } from './process-events.service';

@Module({
  controllers: [ProcessEventsController],
  providers: [ProcessEventsService],
  exports: [ProcessEventsService],
})
export class ProcessEventsModule {}
