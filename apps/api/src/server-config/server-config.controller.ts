import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ServerConfigService, UpdateServerConfigDto } from './server-config.service';

@Controller('servers')
@UseGuards(RolesGuard)
export class ServerConfigController {
  constructor(private readonly serverConfigService: ServerConfigService) {}

  @Get(':id/config')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ANALYST', 'VIEWER')
  getConfig(@Param('id') id: string) {
    return this.serverConfigService.getConfig(id);
  }

  @Patch(':id/config')
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateConfig(@Param('id') id: string, @Body() dto: UpdateServerConfigDto) {
    return this.serverConfigService.updateConfig(id, dto);
  }
}
