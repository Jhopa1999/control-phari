import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Entrada para importar el plan desde un Excel (.xlsx). El archivo viaja
 * codificado en base64 dentro del JSON (tamaño máximo validado en el service).
 */
export class ImportPlanExcelDto {
  @ApiProperty({
    type: String,
    description: 'Contenido del archivo .xlsx codificado en base64.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1_000_000)
  fileBase64!: string;
}
