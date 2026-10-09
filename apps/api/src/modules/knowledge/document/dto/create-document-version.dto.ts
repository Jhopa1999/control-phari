import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Entrada para crear una nueva version de documento = editar contenido
 * (design §2.4/§3.4, AC-020). Misma regla que `content` de creacion: requerido
 * no vacio tras validacion, tope 200.000 (vacio o excedido ⇒ 400). Crear una
 * version NO mueve el estado del documento (D6).
 */
export class CreateDocumentVersionDto {
  @ApiProperty({ type: String, description: 'Contenido Markdown de la nueva version.', maxLength: 200000 })
  @IsString()
  @MinLength(1, { message: 'El contenido es obligatorio.' })
  @MaxLength(200000, { message: 'El contenido supera el limite de 200.000 caracteres.' })
  content!: string;
}
