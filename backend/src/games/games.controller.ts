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
import { IsOptional, IsString, MinLength } from 'class-validator';
import { GamesService } from './games.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';

class CreateGameDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional() @IsString() image?: string;
}
class ImageDto {
  @IsOptional() @IsString() image?: string;
}

@Controller('games')
@UseGuards(JwtAuthGuard)
export class GamesController {
  constructor(private readonly games: GamesService) {}

  /** 게임 목록 (로그인한 누구나 — 사용자 클라이언트의 게임 선택 화면에서도 사용) */
  @Get()
  list() {
    return this.games.list();
  }

  /** 게임 등록 (관리자 전용) */
  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  create(@Body() dto: CreateGameDto) {
    return this.games.create(dto.name, dto.image);
  }

  /** 게임 이미지 변경 (관리자 전용) */
  @Patch(':id/image')
  @UseGuards(RolesGuard)
  @Roles('admin')
  setImage(@Param('id', ParseIntPipe) id: number, @Body() dto: ImageDto) {
    return this.games.setImage(id, dto.image ?? null);
  }

  /** 게임 삭제 (관리자 전용) */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.games.remove(id);
  }
}
