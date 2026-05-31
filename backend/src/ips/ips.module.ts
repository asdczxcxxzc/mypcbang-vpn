import { Module } from '@nestjs/common';
import { IpsService } from './ips.service';
import { IpsController } from './ips.controller';

@Module({
  controllers: [IpsController],
  providers: [IpsService],
})
export class IpsModule {}
