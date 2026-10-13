import { ApiProperty } from '@nestjs/swagger';
import { TriageResponseDto } from './triage-response.dto';

/** Candidato elegible como responsable principal (design §2.5). */
export class EligibleResponsibleDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id del candidato.' })
  id!: string;

  @ApiProperty({ type: String, description: 'Nombre del candidato.' })
  name!: string;
}

/**
 * Respuesta de GET /requests/:id/triage (design §2.5): el triage (0 o 1 fila en
 * Fase 2) junto a los candidatos elegibles como responsable principal, de modo
 * que el desplegable del front consuma exactamente el mismo conjunto que valida
 * el backend en el POST (sin divergencia posible).
 */
export class TriageContextResponseDto {
  @ApiProperty({ type: [TriageResponseDto] })
  triages!: TriageResponseDto[];

  @ApiProperty({
    type: [EligibleResponsibleDto],
    description:
      'Candidatos elegibles como responsable principal (lideres del proceso principal; o su equipo si no hay lider).',
  })
  eligibleResponsibles!: EligibleResponsibleDto[];
}
