import { ApiProperty } from '@nestjs/swagger';

/**
 * Candidato a responsable de una tarea del plan (rediseño demanda). Son las
 * personas con grant activo en alguno de los procesos que intervienen en la
 * Request del plan (RequestParticipant), decididos en el triage. El backend
 * impone la misma regla al asignar `responsibleUserId` (fuente de verdad); este
 * listado solo acota el desplegable del front para no ofrecer algo que sería
 * rechazado.
 */
export class ResponsibleCandidateDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id del candidato.' })
  id!: string;

  @ApiProperty({ type: String, description: 'Nombre del candidato.' })
  name!: string;
}
