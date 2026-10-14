import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import type { UserModel } from '../../generated/prisma/models/User';
import { LoginRequestDto } from './dto/login-request.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { verifyPassword } from './password-hash';

/** Vigencia por defecto del token si no se configura JWT_EXPIRES_IN. */
const DEFAULT_EXPIRES_IN = '8h';

/** Mensaje generico de credenciales: NUNCA revela si el usuario existe. */
const INVALID_CREDENTIALS = 'Credenciales invalidas';

/**
 * Autentica por identifier + contrasena y emite un JWT (modo auth real). Toda
 * falla de credenciales (usuario inexistente, inactivo, sin passwordHash o
 * contrasena incorrecta) termina en el MISMO UnauthorizedException con mensaje
 * generico, para no filtrar la existencia de usuarios.
 */
@Injectable()
export class AuthLoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginRequestDto): Promise<LoginResponseDto> {
    // findFirst por la misma razon que el resto del modulo: el unique de un
    // solo campo con nombre custom no es consultable de forma estable por
    // findUnique con Prisma 7.
    const user = await this.prisma.user.findFirst({
      where: { identifier: dto.identifier },
    });

    if (
      !user ||
      !user.active ||
      !user.passwordHash ||
      !(await verifyPassword(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return this.issueSessionForUser(user);
  }

  /**
   * Emite una sesion (JWT + usuario) para un usuario ya autenticado. UNICA
   * fuente de emision de JWT del modulo: la reutiliza tanto el login (tras
   * validar credenciales) como el reset/activacion (tras consumir el token),
   * para no duplicar ni la firma del token ni la construccion del DTO.
   *
   * Solo lee `id`, `name` e `identifier` del usuario (un `Pick`), de modo que
   * la firma no acarrea campos sensibles como `passwordHash`.
   */
  async issueSessionForUser(
    user: Pick<UserModel, 'id' | 'name' | 'identifier'>,
  ): Promise<LoginResponseDto> {
    const expiresIn = process.env.JWT_EXPIRES_IN ?? DEFAULT_EXPIRES_IN;
    // `expiresIn` llega como string de configuracion (env); los tipos de
    // @nestjs/jwt esperan el formato de jsonwebtoken (p. ej. '8h'). Se tipa la
    // opcion para respetar el contrato sin usar `any`.
    const signOptions: JwtSignOptions = {
      expiresIn: expiresIn as JwtSignOptions['expiresIn'],
    };
    const accessToken = await this.jwtService.signAsync(
      { sub: user.identifier },
      signOptions,
    );

    return {
      accessToken,
      expiresIn,
      user: {
        id: user.id,
        name: user.name,
        identifier: user.identifier,
      },
    };
  }
}
