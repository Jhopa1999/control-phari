import { ApiProperty } from '@nestjs/swagger';
import { CodeResolutionDto } from '../../plan/code-resolution/dto/code-resolution.dto';

/** Resultado de `GET /search`: dos grupos con la misma forma que `GET /codes/{code}`. */
export class SearchResponseDto {
  @ApiProperty({
    type: [CodeResolutionDto],
    description:
      'Solicitudes en alcance del actor. La coincidencia exacta de código va primero; el resto por fecha de registro descendente.',
  })
  requests!: CodeResolutionDto[];

  @ApiProperty({
    type: [CodeResolutionDto],
    description:
      'Tareas de solicitudes en alcance del actor. La coincidencia exacta de código va primero; el resto por creación descendente.',
  })
  tasks!: CodeResolutionDto[];

  @ApiProperty({
    type: Boolean,
    description: 'Verdadero si algún grupo tenía más resultados que el límite pedido.',
  })
  truncated!: boolean;
}
