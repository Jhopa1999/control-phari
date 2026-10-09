import { ApiProperty } from '@nestjs/swagger';

/**
 * Fila del portafolio (design §5.3, SCR-07). Estado operativo EXPLICITO (no
 * inferido); `priorityBand`/`priorityLabel`/`currentScore` son `null` cuando la
 * Request no tiene evaluacion vigente (SIN_PRIORIZAR). Fechas en `YYYY-MM-DD`
 * (eco) o `null`.
 */
export class PortfolioItemResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id de la solicitud.' })
  id!: string;

  @ApiProperty({ type: String, description: 'Titulo de la iniciativa.' })
  title!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso principal.' })
  mainProcessId!: string;

  @ApiProperty({ type: String, description: 'Code del proceso principal.' })
  mainProcessCode!: string;

  @ApiProperty({ type: String, description: 'Nombre del proceso principal.' })
  mainProcessName!: string;

  @ApiProperty({ type: String, description: 'Estado operativo explicito (no inferido).' })
  operationalState!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "'P1'..'P4' si hay evaluacion vigente; null cuando SIN_PRIORIZAR.",
  })
  priorityBand!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Glosa legible del marco §4 o null.' })
  priorityLabel!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Score vigente o null.' })
  currentScore!: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Ruta de gobierno (COMPLETA/SIMPLIFICADA/EXPLORACION) o null.',
  })
  governanceRoute!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Responsable (functionalOwner) o null.' })
  responsibleName!: string | null;

  @ApiProperty({ type: String, description: 'Fecha de registro (YYYY-MM-DD).' })
  registeredAt!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Fecha objetivo (YYYY-MM-DD) o null.' })
  targetDate!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Compromiso inicial (YYYY-MM-DD) o null.' })
  initialCommitmentDate!: string | null;

  @ApiProperty({ type: Boolean, description: 'Flag transversal de bloqueo activo (Fase 7).' })
  blocked!: boolean;

  @ApiProperty({ type: String, nullable: true, description: 'Motivo del bloqueo o null.' })
  blockedReason!: string | null;
}
