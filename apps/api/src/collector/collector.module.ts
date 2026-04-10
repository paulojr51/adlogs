import { Module } from '@nestjs/common';
import { CollectorService } from './collector.service';
import { CollectorController } from './collector.controller';

@Module({
  controllers: [CollectorController],
  providers: [CollectorService],
})
export class CollectorModule {}
