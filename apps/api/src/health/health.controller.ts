import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';

class HealthResponseDto {
  @ApiProperty({ type: String, enum: ['ok'], example: 'ok' })
  status!: 'ok';

  @ApiProperty({ type: String, example: 'plantilla-portales-api' })
  service!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  timestamp!: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
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
}
