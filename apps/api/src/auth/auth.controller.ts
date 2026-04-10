import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser, AuthUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('logout')
  logout(@CurrentUser() user: AuthUser) {
    return this.authService.logout(user.userId);
  }

  @Post('refresh')
  refresh(@CurrentUser() user: AuthUser) {
    return this.authService.refresh(user.userId);
  }

  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.authService.getMe(user.userId);
  }
}
