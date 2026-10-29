import { ApiProperty } from '@nestjs/swagger';

/** Notificación del usuario actual (centro de notificaciones). */
export class NotificationDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, description: 'Tipo de evento (p. ej. TASK_ASSIGNED).' })
  type!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String })
  message!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Ruta interna del elemento relacionado.' })
  link!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  requestId!: string | null;

  @ApiProperty({ type: Boolean })
  read!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

/** Listado de notificaciones con el contador de no leídas. */
export class NotificationListDto {
  @ApiProperty({ type: Number, description: 'Total de notificaciones no leídas.' })
  unreadCount!: number;

  @ApiProperty({ type: [NotificationDto] })
  items!: NotificationDto[];
}

/** Resultado de marcar todas como leídas. */
export class MarkAllReadResultDto {
  @ApiProperty({ type: Number })
  updated!: number;
}
