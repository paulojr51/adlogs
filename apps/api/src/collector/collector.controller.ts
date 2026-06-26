import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@adlogs/shared';
import type { Server } from '@adlogs/shared';
import { CollectorService, CollectorHeartbeatDto, LoginEventInput, FileEventInput } from './collector.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ServerApiKeyGuard } from '../auth/guards/server-api-key.guard';
import { CurrentServer } from '../auth/decorators/current-server.decorator';
import { ProcessEventsService } from '../process-events/process-events.service';
import type { ProcessEventInput } from '../process-events/process-events.service';

class BatchLoginEventsDto {
  events!: LoginEventInput[];
}

class BatchFileEventsDto {
  events!: FileEventInput[];
}

class BatchProcessEventsDto {
  events!: ProcessEventInput[];
}

@Controller('collector')
export class CollectorController {
  constructor(
    private readonly service: CollectorService,
    private readonly processEvents: ProcessEventsService,
  ) {}

  @Post('heartbeat')
  @Public()
  @UseGuards(ServerApiKeyGuard)
  heartbeat(@CurrentServer() server: Server, @Body() data: CollectorHeartbeatDto) {
    return this.service.heartbeat(server, data);
  }

  @Get('config')
  @Public()
  @UseGuards(ServerApiKeyGuard)
  getConfig(@CurrentServer() server: Server) {
    return this.service.getConfig(server.id);
  }

  @Post('events/login')
  @Public()
  @UseGuards(ServerApiKeyGuard)
  ingestLogin(@CurrentServer() server: Server, @Body() dto: BatchLoginEventsDto) {
    return this.service.ingestLoginEvents(server.id, dto.events ?? []);
  }

  @Post('events/file')
  @Public()
  @UseGuards(ServerApiKeyGuard)
  ingestFile(@CurrentServer() server: Server, @Body() dto: BatchFileEventsDto) {
    return this.service.ingestFileEvents(server.id, dto.events ?? []);
  }

  @Post('events/process')
  @Public()
  @UseGuards(ServerApiKeyGuard)
  ingestProcess(@CurrentServer() server: Server, @Body() dto: BatchProcessEventsDto) {
    return this.processEvents.ingestBatch(server.id, dto.events ?? []);
  }

  @Get('status')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ANALYST, Role.VIEWER)
  getStatus() {
    return this.service.getStatus();
  }
}
