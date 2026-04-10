import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@adlogs/shared';

@Controller('dashboard')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ANALYST, Role.VIEWER)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('summary')
  getSummary() {
    return this.service.getSummary();
  }

  @Get('chart/logins')
  getLoginChart(@Query('days') days?: string) {
    return this.service.getLoginChart(days ? parseInt(days, 10) : 7);
  }

  @Get('top-users')
  getTopUsers(@Query('limit') limit?: string) {
    return this.service.getTopUsers(limit ? parseInt(limit, 10) : 10);
  }
}
