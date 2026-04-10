import { Module } from '@nestjs/common';
import { LoginEventsService } from './login-events.service';
import { FileEventsService } from './file-events.service';
import { LoginEventsController } from './login-events.controller';
import { FileEventsController } from './file-events.controller';

@Module({
  controllers: [LoginEventsController, FileEventsController],
  providers: [LoginEventsService, FileEventsService],
  exports: [LoginEventsService, FileEventsService],
})
export class EventsModule {}
