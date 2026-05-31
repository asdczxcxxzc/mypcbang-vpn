import { Global, Module } from '@nestjs/common';
import { RouterControlService } from './router-control.service';

@Global()
@Module({
  providers: [RouterControlService],
  exports: [RouterControlService],
})
export class RouterControlModule {}
