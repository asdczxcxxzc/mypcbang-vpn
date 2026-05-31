import { Module } from '@nestjs/common';
import { DetectionService } from './detection.service';
import { DetectionController } from './detection.controller';

@Module({
  controllers: [DetectionController],
  providers: [DetectionService],
})
export class DetectionModule {}
