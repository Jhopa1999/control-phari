import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { stripSensitive } from './sensitive-fields';

/**
 * Defensa en profundidad: quita de toda respuesta JSON las claves de
 * credenciales (ver `SENSITIVE_RESPONSE_KEYS`) y registra un WARN con las
 * rutas si encontro alguna. La correccion de raiz esta en el cliente Prisma
 * (`omit`) y en los mapeadores de respuesta; esto solo atrapa regresiones.
 *
 * Es poco intrusivo: no toca Date, Buffer ni streams (descargas) y no copia el
 * objeto cuando no hay nada que quitar.
 */
@Injectable()
export class SensitiveFieldsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SensitiveFieldsInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((body: unknown) => {
        const { value, removed } = stripSensitive(body);
        if (removed.length > 0) {
          const req = context
            .switchToHttp()
            .getRequest<{ method?: string; url?: string }>();
          this.logger.warn(
            `Respuesta con campos sensibles eliminados en ${req?.method ?? '?'} ${(req?.url ?? '?').split('?')[0]}: ${removed.join(', ')}`,
          );
        }
        return value;
      }),
    );
  }
}