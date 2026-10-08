import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { DevActorResponseDto } from './dto/dev-actor-response.dto';
import { isDevHeaderMode } from './dev-actor.resolver';

/**
 * Endpoint de arranque del selector dev (design 3.4). Ruta PUBLICA, exenta de
 * CurrentUserGuard (el selector elige el actor que puebla X-Actor-Id, asi que
 * no puede exigir actor para listarse). Activo solo con AUTH_MODE=dev-header;
 * con otro modo responde 404 (la ruta no existe funcionalmente fuera de dev).
 */
@ApiTags('dev')
@Controller('dev')
export class DevActorsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('actors')
  @ApiOperation({ summary: 'Lista usuarios activos para el selector de desarrollo.' })
  @ApiResponse({ status: 200, description: 'Usuarios activos.', type: [DevActorResponseDto] })
  @ApiResponse({ status: 404, description: 'No disponible fuera del modo dev-header.' })
  async listActors(): Promise<DevActorResponseDto[]> {
    if (!isDevHeaderMode()) {
      throw new NotFoundException('Ruta no disponible.');
    }

    const users = await this.prisma.user.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { identifier: true, name: true },
    });

    return users.map((user) => ({ identifier: user.identifier, name: user.name }));
  }
}
