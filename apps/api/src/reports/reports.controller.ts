import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { UserActivityDto, FolderActivityDto, FolderActionReportDto } from './dto/reports.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@adlogs/shared';

@Controller('reports')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ANALYST, Role.VIEWER)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  /**
   * GET /api/reports/user-activity?username=paulo.jr&from=...&to=...
   * Linha do tempo completa do usuário (logins + arquivos)
   */
  @Get('user-activity')
  getUserActivity(@Query() dto: UserActivityDto) {
    return this.service.getUserActivity(
      dto.username,
      new Date(dto.from),
      new Date(dto.to),
    );
  }

  /**
   * GET /api/reports/folder-activity?folderPath=setores/rh&from=...&to=...
   * Quem acessou uma pasta num período
   */
  @Get('folder-activity')
  getFolderActivity(@Query() dto: FolderActivityDto) {
    return this.service.getFolderActivity(
      dto.folderPath,
      new Date(dto.from),
      new Date(dto.to),
    );
  }

  /**
   * GET /api/reports/folder-action?folderPath=financeiro&action=DELETE&from=...&to=...
   * Quem realizou uma ação específica numa pasta
   */
  @Get('folder-action')
  getFolderActionReport(@Query() dto: FolderActionReportDto) {
    return this.service.getFolderActionReport(
      dto.folderPath,
      dto.action,
      new Date(dto.from),
      new Date(dto.to),
    );
  }
}
