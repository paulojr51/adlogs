import { Module } from '@nestjs/common';
import { AlertCheckerService } from './alert-checker.service';
import { NotificationModule } from '../notification/notification.module';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [NotificationModule, AlertsModule],
  providers: [AlertCheckerService],
})
export class AlertCheckerModule {}
