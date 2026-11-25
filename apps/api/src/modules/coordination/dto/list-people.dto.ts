import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/** Query de `GET /coordination/people`. */
export class ListPeopleDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Proceso del que se piden los candidatos a responsable y participantes (personas con acceso al proceso, las mismas que acepta la validación). Sin él, las personas en alcance del actor.',
  })
  @IsOptional()
  @IsUUID()
  processId?: string;
}