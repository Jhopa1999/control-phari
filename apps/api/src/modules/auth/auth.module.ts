import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ACTOR_RESOLVER } from './actor-resolver';
import { DevActorResolver } from './dev-actor.resolver';
import { CurrentUserGuard } from './current-user.guard';
import { RolesGuard } from './roles.guard';
import { MeController } from './me.controller';
import { DevActorsController } from './dev-actors.controller';

/**
 * Modulo transversal de autorizacion (design 2.3). Expone los guards y el
 * resolver de actor para que los modulos de dominio los apliquen por
 * controller (nunca como APP_GUARD global). El ActorResolver se cablea al
 * DevActorResolver detras del token ACTOR_RESOLVER, para poder sustituirlo por
 * una implementacion de auth real sin tocar guards ni servicios.
 */
@Module({
  imports: [PrismaModule],
  controllers: [MeController, DevActorsController],
  providers: [
    DevActorResolver,
    { provide: ACTOR_RESOLVER, useExisting: DevActorResolver },
    CurrentUserGuard,
    RolesGuard,
  ],
  exports: [ACTOR_RESOLVER, CurrentUserGuard, RolesGuard],
})
export class AuthModule {}
