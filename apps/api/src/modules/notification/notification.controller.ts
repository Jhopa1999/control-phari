import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import {
  MarkAllReadResultDto,
  NotificationListDto,
} from './dto/notification-response.dto';
import { NotificationService } from './notification.service';

/**
 * Centro de notificaciones del usuario actual (NOT-01). Cada usuario solo ve y
 * marca sus propias notificaciones.
 */
@ApiTags('notifications')
@Controller('notifications')
@UseGuards(CurrentUserGuard)
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Notificaciones del usuario actual y contador de no leídas.' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiResponse({ status: 200, type: NotificationListDto })
  @ApiResponse({ status: 401, description: 'No hay un usuario actual válido.' })
  list(
    @CurrentActor() actor: CurrentActorType,
    @Query() filters: ListNotificationsDto,
  ) {
    return this.notifications.listMine(actor.userId, filters);
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marca todas las notificaciones del usuario como leídas.' })
  @ApiResponse({ status: 200, type: MarkAllReadResultDto })
  markAllRead(@CurrentActor() actor: CurrentActorType) {
    return this.notifications.markAllRead(actor.userId);
  }

  @Post(':id/read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Marca una notificación propia como leída.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Marcada como leída.' })
  @ApiResponse({ status: 404, description: 'No existe o no pertenece al usuario.' })
  async markRead(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.notifications.markRead(actor.userId, id);
  }
}
