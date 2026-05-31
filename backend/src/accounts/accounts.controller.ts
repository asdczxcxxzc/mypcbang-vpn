import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { AccountsService } from './accounts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';

class CreateAccountDto {
  @IsInt() vpnIpId: number;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
}
class CreateBatchDto {
  @IsInt() vpnIpId: number;
  @IsInt() @Min(1) count: number;
}
class UpdateAccountDto {
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
}

@Controller('accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get('gen-credentials')
  gen() {
    return this.accounts.generateCredentials();
  }

  @Get('status')
  status() {
    return this.accounts.connectedStatus();
  }

  @Get()
  list(@Query('vpnIpId') vpnIpId?: string, @Query('status') status?: string) {
    return this.accounts.list({
      vpnIpId: vpnIpId ? Number(vpnIpId) : undefined,
      status,
    });
  }

  @Post()
  create(@Body() dto: CreateAccountDto) {
    return this.accounts.create(dto.vpnIpId, dto.username, dto.password);
  }

  @Post('batch')
  batch(@Body() dto: CreateBatchDto) {
    return this.accounts.createBatch(dto.vpnIpId, dto.count);
  }

  @Get(':id/credentials')
  reveal(@Param('id', ParseIntPipe) id: number) {
    return this.accounts.reveal(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAccountDto) {
    return this.accounts.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.accounts.remove(id);
  }
}
