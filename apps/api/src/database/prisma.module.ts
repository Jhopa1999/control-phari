import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule expone PrismaService para los modulos de negocio que necesiten
 * acceso a la base de datos.
 *
 * No es @Global() de forma deliberada: cada modulo funcional que requiera
 * persistencia debe importar PrismaModule explicitamente. Asi las dependencias
 * de datos quedan visibles en cada modulo.
 */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
