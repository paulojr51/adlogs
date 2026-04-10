import { Module } from '@nestjs/common';
import { MonitoredFoldersService } from './monitored-folders.service';
import { MonitoredFoldersController } from './monitored-folders.controller';

@Module({
  controllers: [MonitoredFoldersController],
  providers: [MonitoredFoldersService],
  exports: [MonitoredFoldersService],
})
export class MonitoredFoldersModule {}
