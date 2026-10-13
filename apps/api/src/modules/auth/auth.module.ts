import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../database/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { ACTOR_RESOLVER } from './actor-resolver';
import { DevActorResolver, getAuthMode, isJwtMode } from './dev-actor.resolver';
import { JwtActorResolver } from './jwt-actor.resolver';
import { CurrentUserGuard } from './current-user.guard';
import { RolesGuard } from './roles.guard';
import { MeController } from './me.controller';
import { DevActorsController } from './dev-actors.controller';
import { AuthLoginController } from './auth-login.controller';
import { AuthLoginService } from './auth-login.service';
import { AuthResetController } from './auth-reset.controller';
import { AuthResetService } from './auth-reset.service';
import { AuthTokenService } from './auth-token.service';

const JWT_MODE_AUTH = 'jwt';

/**
 * Lee el secreto JWT desde el entorno (NUNCA hardcodeado). Si el modo es jwt y
 * no hay JWT_SECRET, la app debe fallar al arrancar con un error claro: en
 * modo de autenticacion real un secreto ausente seria un fallo de seguridad
 * silencioso. En otros modos el secreto no se usa y puede quedar vacio.
 */
function resolveJwtSecret(): string | undefined {
  const secret = process.env.JWT_SECRET;
  if (isJwtMode() && (!secret || secret.trim() === '')) {
    throw new Error(
      'AUTH_MODE=jwt requiere definir JWT_SECRET (no debe hardcodearse).',
    );
  }
  return secret;
}

/**
 * Modulo transversal de autorizacion (design 2.3). Expone los guards y el
 * resolver de actor para que los modulos de dominio los apliquen por
 * controller (nunca como APP_GUARD global).
 *
 * El ActorResolver se selecciona por `useFactory` segun AUTH_MODE: en modo
 * `jwt` se usa JwtActorResolver (verifica el bearer token); en cualquier otro
 * modo (incluido `dev-header` y sin definir) se usa DevActorResolver,
 * preservando el default actual. Asi se sustituye la capa de identidad sin
 * tocar guards ni servicios de dominio.
 */
@Module({
  imports: [
    PrismaModule,
    MailModule,
    forwardRef(() => AuditModule),
    JwtModule.registerAsync({
      // Secreto SIEMPRE desde el entorno; valida arranque en modo jwt.
      useFactory: () => ({ secret: resolveJwtSecret() }),
    }),
  ],
  controllers: [
    MeController,
    DevActorsController,
    AuthLoginController,
    AuthResetController,
  ],
  providers: [
    DevActorResolver,
    JwtActorResolver,
    AuthLoginService,
    AuthTokenService,
    AuthResetService,
    {
      provide: ACTOR_RESOLVER,
      useFactory: (dev: DevActorResolver, jwt: JwtActorResolver) =>
        getAuthMode() === JWT_MODE_AUTH ? jwt : dev,
      inject: [DevActorResolver, JwtActorResolver],
    },
    CurrentUserGuard,
    RolesGuard,
  ],
  // AuthTokenService se exporta para que UserModule (invitacion) lo consuma.
  exports: [ACTOR_RESOLVER, CurrentUserGuard, RolesGuard, AuthTokenService],
})
export class AuthModule {}
