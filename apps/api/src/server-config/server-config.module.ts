import { Module } from '@nestjs/common';
import { ServerConfigController } from './server-config.controller';
import { ServerConfigService } from './server-config.service';

@Module({
  controllers: [ServerConfigController],
  providers: [ServerConfigService],
  exports: [ServerConfigService],
})
export class ServerConfigModule {}
