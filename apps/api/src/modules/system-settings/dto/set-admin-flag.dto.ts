import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
/** Entrada para promover/degradar a un usuario como ADMIN de sistema (design e.4). */
export class SetAdminFlagDto {
  @ApiProperty({ type: Boolean, description: 'true promueve a ADMIN de sistema; false degrada.' })
  @IsBoolean()
  isAdmin!: boolean;
}
