import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/** Convierte «2» en 2: algunos modelos devuelven el alias como texto. */
const numericString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;

/** Compromiso tal como lo devuelve el modelo (sin confiar en él). */
export class ModelCommitmentOutput {
  @IsString()
  title!: string;

  @IsOptional()
  @Transform(numericString)
  @IsInt()
  assigneeAlias?: number | null;

  @IsOptional()
  @IsString()
  assigneeText?: string | null;

  @IsOptional()
  @IsString()
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  expectedResult?: string | null;

  @IsOptional()
  @IsString()
  sourceQuote?: string | null;
}

/** Salida del modelo del agente de actas, validada antes de usarla (422 si no cumple). */
export class ModelMeetingOutput {
  @IsOptional()
  @IsString()
  agenda?: string | null;

  @IsOptional()
  @IsString()
  decisions?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModelCommitmentOutput)
  commitments?: ModelCommitmentOutput[] | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warnings?: string[] | null;
}
