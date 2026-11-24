import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';
import { MAX_BATCH_SIZE } from '../../../../common/batch-result.dto';

/** Entrada para aprobar solicitudes en lote (solo APROBAR; devolver es individual). */
export class BatchApprovalDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: MAX_BATCH_SIZE,
    uniqueItems: true,
    description: `Ids de las solicitudes a aprobar (1 a ${MAX_BATCH_SIZE}, sin repetidos).`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_SIZE)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  requestIds!: string[];
}
