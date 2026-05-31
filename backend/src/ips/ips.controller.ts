import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { IpsService } from './ips.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';

class CreateRouterDto {
  @IsString() @MinLength(3) ipAddress: string;
  @IsOptional() @IsString() host?: string;
  @IsOptional() @IsInt() @Min(1) port?: number;
  @IsOptional() @IsString() protocol?: string;
  @IsOptional() @IsString() psk?: string;
  @IsOptional() @IsString() adminUrl?: string;
  @IsOptional() @IsString() adminUsername?: string;
  @IsOptional() @IsString() adminPassword?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() region?: string;
}

class UpdateRouterDto {
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsString() host?: string;
  @IsOptional() @IsInt() @Min(1) port?: number;
  @IsOptional() @IsString() protocol?: string;
  @IsOptional() @IsString() psk?: string;
  @IsOptional() @IsString() adminUrl?: string;
  @IsOptional() @IsString() adminUsername?: string;
  @IsOptional() @IsString() adminPassword?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() region?: string;
}

@Controller('ips')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class IpsController {
  constructor(private readonly ips: IpsService) {}

  @Post()
  create(@Body() dto: CreateRouterDto) {
    return this.ips.create(dto);
  }

  @Get()
  list() {
    return this.ips.list();
  }

  @Get(':id/credentials')
  credentials(@Param('id', ParseIntPipe) id: number) {
    return this.ips.revealCredentials(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRouterDto) {
    return this.ips.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ips.remove(id);
  }
}
