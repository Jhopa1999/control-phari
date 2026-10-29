import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

/**
 * Centro de notificaciones. Global para que los módulos de negocio (plan,
 * tareas, documentos, cierre, aprobaciones) emitan eventos sin acoplarse entre
 * sí ni crear dependencias circulares.
 */
@Global()
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
