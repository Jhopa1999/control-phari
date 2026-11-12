import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  isSecureCookie,
  resolveCookieSecureMode,
  SESSION_COOKIE_NAME,
} from './session-cookie';

/** Parte de la peticion Express que necesita el servicio. */
export interface CookieRequest {
  secure?: boolean;
}

/** Parte de la respuesta Express que necesita el servicio. */
export interface CookieResponse {
  setHeader(name: string, value: string): unknown;
  cookie(name: string, value: string, options: Record<string, unknown>): unknown;
  clearCookie(name: string, options: Record<string, unknown>): unknown;
}

/**
 * Emite y borra la cookie de sesion. Los atributos de borrado son IDENTICOS a
 * los de emision (si no coinciden el navegador no la elimina).
 */
@Injectable()
export class SessionCookieService {
  private readonly logger = new Logger(SessionCookieService.name);

  constructor(private readonly jwtService: JwtService) {
    const { unknown } = resolveCookieSecureMode();
    if (unknown) {
      this.logger.warn('COOKIE_SECURE tiene un valor desconocido; se usa "auto".');
    }
  }

  /** Pone la cookie con el JWT; `Max-Age` = `exp` del token - ahora. */
  issue(req: CookieRequest, res: CookieResponse, accessToken: string): void {
    const options = this.baseOptions(req);
    const maxAgeMs = this.maxAgeMs(accessToken);
    if (maxAgeMs !== undefined) {
      options.maxAge = maxAgeMs;
    } else {
      this.logger.warn('El JWT no trae "exp"; se emite cookie de sesion.');
    }
    res.setHeader('Cache-Control', 'no-store');
    res.cookie(SESSION_COOKIE_NAME, accessToken, options);
  }

  /** Borra la cookie (mismos Path/Secure/SameSite/HttpOnly que la emision). */
  clear(req: CookieRequest, res: CookieResponse): void {
    res.setHeader('Cache-Control', 'no-store');
    res.clearCookie(SESSION_COOKIE_NAME, this.baseOptions(req));
  }

  private baseOptions(req: CookieRequest): Record<string, unknown> {
    const { mode } = resolveCookieSecureMode();
    return {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: isSecureCookie(mode, req.secure === true),
    };
  }

  private maxAgeMs(accessToken: string): number | undefined {
    const payload: unknown = this.jwtService.decode(accessToken);
    if (typeof payload !== 'object' || payload === null) return undefined;
    const exp = (payload as { exp?: unknown }).exp;
    if (typeof exp !== 'number') return undefined;
    const seconds = exp - Math.floor(Date.now() / 1000);
    return seconds > 0 ? seconds * 1000 : undefined;
  }
}
