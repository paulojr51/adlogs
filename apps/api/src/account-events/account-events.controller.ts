import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ServerApiKeyGuard } from '../auth/guards/server-api-key.guard';
import { CurrentServer } from '../auth/decorators/current-server.decorator';
import type { Server } from '@adlogs/shared';
import { AccountEventsService, AccountEventsFilterDto } from './account-events.service';

class BatchAccountEventsDto {
  events!: Parameters<AccountEventsService['ingestBatch']>[1];
}

@Controller()
export class AccountEventsController {
  constructor(private readonly accountEventsService: AccountEventsService) {}

  @Get('events/accounts')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'ANALYST', 'VIEWER')
  findAll(@Query() filter: AccountEventsFilterDto) {
    return this.accountEventsService.findAll(filter);
  }

  @Post('collector/events/account')
  @UseGuards(ServerApiKeyGuard)
  ingestBatch(@CurrentServer() server: Server, @Body() dto: BatchAccountEventsDto) {
    return this.accountEventsService.ingestBatch(server.id, dto.events ?? []);
  }
}
