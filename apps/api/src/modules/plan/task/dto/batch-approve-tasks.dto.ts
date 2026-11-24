import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';
import { MAX_BATCH_SIZE } from '../../../../common/batch-result.dto';

/** Entrada para aprobar tareas en lote (EN_REVISION -> TERMINADA). */
export class BatchApproveTasksDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: MAX_BATCH_SIZE,
    uniqueItems: true,
    description: `Ids de las tareas a aprobar (1 a ${MAX_BATCH_SIZE}, sin repetidos).`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_SIZE)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  taskIds!: string[];
}
