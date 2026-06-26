import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { IsArray } from 'class-validator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ServerApiKeyGuard } from '../auth/guards/server-api-key.guard';
import { CurrentServer } from '../auth/decorators/current-server.decorator';
import type { Server } from '@adlogs/shared';
import { SqlEventsService, SqlEventsFilterDto } from './sql-events.service';

class BatchSqlEventsDto {
  @IsArray()
  events!: Parameters<SqlEventsService['ingestBatch']>[1];
}

@Controller()
export class SqlEventsController {
  constructor(private readonly sqlEventsService: SqlEventsService) {}

  @Get('events/sql')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'ANALYST', 'VIEWER')
  findAll(@Query() filter: SqlEventsFilterDto) {
    return this.sqlEventsService.findAll(filter);
  }

  @Post('collector/events/sql')
  @Public()
  @UseGuards(ServerApiKeyGuard)
  ingestBatch(@CurrentServer() server: Server, @Body() dto: BatchSqlEventsDto) {
    return this.sqlEventsService.ingestBatch(server.id, dto.events ?? []);
  }
}
