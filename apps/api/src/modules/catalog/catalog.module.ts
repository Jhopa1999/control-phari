import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

/**
 * Primera funcionalidad de referencia: maestras/catalogos genericos.
 * Importa PrismaModule explicitamente (PrismaModule no es global), de modo que
 * la dependencia de persistencia queda visible.
 */
@Module({
  imports: [PrismaModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
