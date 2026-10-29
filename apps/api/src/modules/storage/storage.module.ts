import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/** Almacenamiento de archivos en el bucket maestro del app (S3). */
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
