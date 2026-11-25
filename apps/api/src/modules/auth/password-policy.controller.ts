import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PasswordPolicyResponseDto } from './dto/password-policy-response.dto';
import { PasswordPolicyService } from './password-policy.service';

/**
 * Ruta PÚBLICA (sin CurrentUserGuard): las pantallas de activación y de
 * restablecimiento la necesitan antes de tener sesión. Solo devuelve el mínimo.
 */
@ApiTags('auth')
@Controller('auth')
export class PasswordPolicyController {
  constructor(private readonly policy: PasswordPolicyService) {}

  @Get('password-policy')
  @ApiOperation({
    summary:
      'Devuelve la longitud mínima vigente de la contraseña. Pública: se usa al activar la cuenta o restablecer la contraseña.',
  })
  @ApiResponse({ status: 200, type: PasswordPolicyResponseDto })
  async getPolicy(): Promise<PasswordPolicyResponseDto> {
    return { minLength: await this.policy.minLength() };
  }
}
