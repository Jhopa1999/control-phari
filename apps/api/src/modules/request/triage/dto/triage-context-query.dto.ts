import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * Filtro opcional del contexto de triage (GET /requests/:id/triage). Permite
 * previsualizar los candidatos a responsable principal de un proceso aún no
 * persistido: cuando la solicitud todavía no tiene proceso principal, el triage
 * lo elige en el mismo formulario y necesita recargar los elegibles de ese
 * proceso. Si se omite, los elegibles se derivan del proceso ya persistido.
 */
export class TriageContextQueryDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Proceso principal candidato para previsualizar sus responsables elegibles (el que se elige en el triage).',
  })
  @IsOptional()
  @IsUUID()
  mainProcessId?: string;
}
