import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AlertsService, AlertsFilterDto } from './alerts.service';

@Controller('alerts')
@UseGuards(RolesGuard)
export class AlertsController {
  constructor(private readonly service: AlertsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'ANALYST', 'VIEWER')
  findAll(@Query() filter: AlertsFilterDto) {
    return this.service.findAll(filter);
  }
}
