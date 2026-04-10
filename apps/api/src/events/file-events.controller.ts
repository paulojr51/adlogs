import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { FileEventsService } from './file-events.service';
import { FileEventsFilterDto } from './dto/events-filter.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@adlogs/shared';

@Controller('events/files')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ANALYST, Role.VIEWER)
export class FileEventsController {
  constructor(private readonly service: FileEventsService) {}

  @Get()
  findAll(@Query() filter: FileEventsFilterDto) {
    return this.service.findAll(filter);
  }

  @Get('stats')
  getStats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.getStats(
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
