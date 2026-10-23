import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';

class HealthResponseDto {
  @ApiProperty({ type: String, enum: ['ok'], example: 'ok' })
  status!: 'ok';

  @ApiProperty({ type: String, example: 'plantilla-portales-api' })
  service!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  timestamp!: string;
}

class ReadinessChecksDto {
  @ApiProperty({
    type: String,
    enum: ['up', 'down'],
    example: 'up',
    description: 'Estado de la conexion a PostgreSQL.',
  })
  database!: 'up' | 'down';
}

class ReadinessResponseDto {
  @ApiProperty({
    type: String,
    enum: ['ready', 'not_ready'],
    example: 'ready',
  })
  status!: 'ready' | 'not_ready';

  @ApiProperty({ type: ReadinessChecksDto })
  checks!: ReadinessChecksDto;

  @ApiProperty({ type: String, format: 'date-time' })
  timestamp!: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Chequeo de salud del servicio.' })
  @ApiOkResponse({ description: 'El servicio responde.', type: HealthResponseDto })
  check(): HealthResponseDto {
    return {
      status: 'ok',
      service: 'plantilla-portales-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness: comprueba las dependencias criticas del servicio.',
  })
  @ApiOkResponse({
    description: 'El servicio esta listo (PostgreSQL responde).',
    type: ReadinessResponseDto,
  })
  @ApiResponse({
    status: 503,
    description:
      'El servicio NO esta listo (PostgreSQL no responde). No se exponen ' +
      'detalles internos del error.',
    type: ReadinessResponseDto,
  })
  async ready(): Promise<ReadinessResponseDto> {
    const timestamp = new Date().toISOString();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // No se expone el error de Prisma ni la URL/credenciales; solo el estado.
      throw new ServiceUnavailableException({
        status: 'not_ready',
        checks: { database: 'down' },
        timestamp,
      } satisfies ReadinessResponseDto);
    }

    return {
      status: 'ready',
      checks: { database: 'up' },
      timestamp,
    };
  }
}
