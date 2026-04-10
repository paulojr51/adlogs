import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CollectorService, CollectorHeartbeatDto } from './collector.service';
import { Public } from '../auth/decorators/public.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@adlogs/shared';

@Controller('collector')
export class CollectorController {
  constructor(private readonly service: CollectorService) {}

  /**
   * Heartbeat do coletor Python — autenticado por API Key no header
   * O coletor usa uma chave fixa (COLLECTOR_API_KEY) em vez de JWT
   */
  @Public()
  @Post('heartbeat')
  heartbeat(@Body() data: CollectorHeartbeatDto) {
    return this.service.heartbeat(data);
  }

  /**
   * Configuração que o coletor deve usar (pastas monitoradas)
   */
  @Public()
  @Get('config')
  getConfig() {
    return this.service.getConfig();
  }

  /**
   * Status do coletor para a interface web
   */
  @Get('status')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ANALYST, Role.VIEWER)
  getStatus() {
    return this.service.getStatus();
  }
}
