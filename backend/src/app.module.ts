import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { GamesModule } from './games/games.module';
import { IpsModule } from './ips/ips.module';
import { AccountsModule } from './accounts/accounts.module';
import { MeModule } from './me/me.module';
import { DetectionModule } from './detection/detection.module';
import { AlertsModule } from './alerts/alerts.module';
import { UsersModule } from './users/users.module';
import { SessionsModule } from './sessions/sessions.module';
import { TelegramModule } from './telegram/telegram.module';
import { RouterControlModule } from './routers-control/router-control.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';

@Module({
  imports: [
    PrismaModule,
    TelegramModule,
    RouterControlModule,
    LifecycleModule,
    AuthModule,
    GamesModule,
    IpsModule,
    AccountsModule,
    MeModule,
    DetectionModule,
    AlertsModule,
    UsersModule,
    SessionsModule,
  ],
})
export class AppModule {}
