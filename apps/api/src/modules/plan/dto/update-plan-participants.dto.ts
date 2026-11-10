import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

/**
 * Entrada para corregir los procesos que intervienen en la solicitud de un
 * plan. Reemplaza el conjunto de procesos participantes ADEMÁS del principal
 * (que participa siempre y no se puede quitar), con la misma semántica que
 * `participantProcessIds` del triage.
 */
export class UpdatePlanParticipantsDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'Procesos que intervienen además del principal (el principal participa siempre y no se quita). Un proceso ausente de la lista se quita si ya participaba; solo se puede quitar si ninguna tarea del plan está asignada a personas que dejarían de ser elegibles.',
  })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  participantProcessIds!: string[];
}
