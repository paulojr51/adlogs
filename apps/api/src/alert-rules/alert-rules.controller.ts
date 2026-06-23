import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AlertRulesService, CreateAlertRuleDto, UpdateAlertRuleDto } from './alert-rules.service';

@Controller('alert-rules')
@UseGuards(RolesGuard)
export class AlertRulesController {
  constructor(private readonly service: AlertRulesService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'ANALYST', 'VIEWER')
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Body() dto: CreateAlertRuleDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateAlertRuleDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
