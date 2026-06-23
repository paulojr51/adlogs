import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EventsModule } from './events/events.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { MonitoredFoldersModule } from './monitored-folders/monitored-folders.module';
import { CollectorModule } from './collector/collector.module';
import { HealthModule } from './health/health.module';
import { ReportsModule } from './reports/reports.module';
import { ServersModule } from './servers/servers.module';
import { ProcessEventsModule } from './process-events/process-events.module';
import { ServerConfigModule } from './server-config/server-config.module';
import { AccountEventsModule } from './account-events/account-events.module';
import { SqlEventsModule } from './sql-events/sql-events.module';
import { NotificationModule } from './notification/notification.module';
import { AlertRulesModule } from './alert-rules/alert-rules.module';
import { AlertsModule } from './alerts/alerts.module';
import { AlertCheckerModule } from './alert-checker/alert-checker.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    EventsModule,
    DashboardModule,
    MonitoredFoldersModule,
    CollectorModule,
    HealthModule,
    ReportsModule,
    ServersModule,
    ProcessEventsModule,
    ServerConfigModule,
    AccountEventsModule,
    SqlEventsModule,
    NotificationModule,
    AlertRulesModule,
    AlertsModule,
    AlertCheckerModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
