import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { DATE_PATTERN } from '../../date';

/**
 * Tope del texto que se envía al modelo (control de costo y abuso). Valor por
 * defecto seguro en código (decisión D8).
 */
export const MEETING_AI_MAX_INPUT_CHARS = 12000;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada de la ayuda de IA del acta. El texto NO se guarda: solo se envía al
 * modelo. El tope de caracteres lo valida el DTO (400 si se excede) y el service
 * lo vuelve a comprobar (413).
 */
export class StructureMeetingAiDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Proceso de la reunión; acota las personas candidatas a responsable.',
  })
  @IsUUID()
  processId!: string;

  @ApiProperty({
    type: String,
    description: 'Fecha de la reunión (YYYY-MM-DD); referencia para resolver «el viernes».',
    example: '2025-03-10',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  @Matches(DATE_PATTERN, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  meetingDate!: string;

  @ApiProperty({
    type: String,
    maxLength: MEETING_AI_MAX_INPUT_CHARS,
    description: 'Notas de la reunión tal como las escribió la persona. No se guardan.',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Escribe o pega el texto de la reunión.' })
  @MaxLength(MEETING_AI_MAX_INPUT_CHARS, {
    message: `El texto es demasiado largo: el máximo es de ${MEETING_AI_MAX_INPUT_CHARS} caracteres.`,
  })
  text!: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Participantes ya elegidos; solo se usan para indicarle al modelo quiénes asistieron.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  participantUserIds?: string[];
}

/** Compromiso propuesto por la IA. Nada se crea: la persona lo acepta o descarta. */
export class MeetingAiCommitmentDto {
  @ApiProperty({ type: String, maxLength: 300, description: 'Título propuesto.' })
  title!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Persona del proceso propuesta como responsable; null si no se reconoció.',
  })
  assignedUserId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Nombre tal como aparece en las notas (para que la persona elija a quién asignar).',
  })
  assigneeText!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Fecha límite propuesta (YYYY-MM-DD); null si no hay o no es válida.',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  dueDate!: string | null;

  @ApiProperty({ type: String, nullable: true, maxLength: 2000, description: 'Resultado esperado.' })
  expectedResult!: string | null;

  @ApiProperty({ type: String, description: 'Frase de las notas que origina el compromiso.' })
  sourceQuote!: string;
}

/** Propuesta de acta reestructurada y compromisos. No persiste nada. */
export class MeetingAiStructureResponseDto {
  @ApiProperty({ type: String, maxLength: 5000, description: 'Agenda propuesta (vacía si no hay).' })
  agenda!: string;

  @ApiProperty({ type: String, maxLength: 5000, description: 'Decisiones y acuerdos propuestos.' })
  decisions!: string;

  @ApiProperty({ type: String, maxLength: 5000, description: 'Observaciones propuestas.' })
  notes!: string;

  @ApiProperty({ type: [MeetingAiCommitmentDto], description: 'Compromisos propuestos.' })
  commitments!: MeetingAiCommitmentDto[];

  @ApiProperty({
    type: [String],
    description: 'Dudas y ajustes hechos por el sistema (fechas descartadas, responsables no reconocidos, recortes).',
  })
  warnings!: string[];

  @ApiProperty({ type: String, description: 'Modelo que respondió (lo fija el backend).' })
  model!: string;

  @ApiProperty({ type: String, description: 'Agente que respondió (lo fija el backend).', example: 'ACTAS' })
  agentCode!: string;
}

/** Estados en que puede estar la ayuda de IA del acta para quien la usa. */
export const MEETING_AI_STATUSES = ['available', 'off', 'unavailable'] as const;
export type MeetingAiStatus = (typeof MEETING_AI_STATUSES)[number];

/** Disponibilidad de la ayuda de IA del acta (para mostrar, ocultar o desactivar el botón). */
export class MeetingAiAvailabilityDto {
  @ApiProperty({
    type: String,
    enum: MEETING_AI_STATUSES,
    description:
      'available: lista para usar. off: IA global o agente de actas apagados. unavailable: sin presupuesto mensual.',
  })
  status!: MeetingAiStatus;

  @ApiPropertyOptional({ type: String, description: 'Motivo legible cuando no está disponible.' })
  message?: string;
}
