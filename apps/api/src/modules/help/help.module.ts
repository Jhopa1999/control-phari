import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HelpController } from './help.controller';
import { HelpService } from './help.service';

/** Ayuda del portal: búsqueda en la documentación de uso (BL-032). */
@Module({
  imports: [AuthModule],
  controllers: [HelpController],
  providers: [HelpService],
})
export class HelpModule {}
