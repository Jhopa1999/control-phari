import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Vigencia por defecto (segundos) de las URLs de descarga prefirmadas. */
export const DEFAULT_PRESIGN_TTL_SECONDS = 300;

/**
 * Acceso al bucket maestro de archivos del app (AWS S3). Toda la configuracion
 * sale del entorno: `STORAGE_S3_BUCKET` (obligatoria), `STORAGE_S3_REGION`
 * (o `AWS_REGION`) y `STORAGE_PRESIGN_TTL_SECONDS`. Las credenciales las
 * resuelve la cadena por defecto del SDK (rol de la instancia, perfil o
 * variables AWS_*); nunca se guardan en el codigo.
 *
 * Los objetos son privados: el navegador solo los descarga con una URL
 * prefirmada y de vida corta que emite el backend tras autorizar.
 */
@Injectable()
export class StorageService {
  private client: S3Client | null = null;

  /** Nombre del bucket; 503 si el almacenamiento no esta configurado. */
  private bucket(): string {
    const bucket = process.env.STORAGE_S3_BUCKET?.trim();
    if (!bucket) {
      throw new ServiceUnavailableException(
        'El almacenamiento de archivos no está configurado. Contacta al administrador.',
      );
    }
    return bucket;
  }

  private s3(): S3Client {
    if (!this.client) {
      const region = (process.env.STORAGE_S3_REGION ?? process.env.AWS_REGION)?.trim();
      this.client = new S3Client(region ? { region } : {});
    }
    return this.client;
  }

  private presignTtlSeconds(): number {
    const parsed = Number(process.env.STORAGE_PRESIGN_TTL_SECONDS);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 3600
      ? parsed
      : DEFAULT_PRESIGN_TTL_SECONDS;
  }

  /** Guarda un objeto cifrado en reposo (SSE-S3). */
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3().send(
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  /** URL de descarga temporal; fuerza el nombre original del archivo. */
  async presignDownload(
    key: string,
    fileName: string,
    contentType: string,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const expiresInSeconds = this.presignTtlSeconds();
    // Cabecera ASCII segura; el nombre completo va en filename* (RFC 5987).
    const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    const url = await getSignedUrl(
      this.s3(),
      new GetObjectCommand({
        Bucket: this.bucket(),
        Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      }),
      { expiresIn: expiresInSeconds },
    );
    return { url, expiresInSeconds };
  }

  /** Borra un objeto (idempotente en S3: borrar uno inexistente no falla). */
  async remove(key: string): Promise<void> {
    await this.s3().send(
      new DeleteObjectCommand({ Bucket: this.bucket(), Key: key }),
    );
  }
}
