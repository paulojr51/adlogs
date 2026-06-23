import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@adlogs/shared';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ProcessEventsService } from './process-events.service';
import { ProcessEventsFilterDto } from './dto/process-events-filter.dto';

@Controller('events/processes')
@UseGuards(RolesGuard)
export class ProcessEventsController {
  constructor(private readonly service: ProcessEventsService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ANALYST, Role.VIEWER)
  findAll(@Query() filter: ProcessEventsFilterDto) {
    return this.service.findAll(filter);
  }
}
