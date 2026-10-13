import { BadRequestException, GoneException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AuthTokenModel } from '../../generated/prisma/models/AuthToken';
import { AuthTokenPurpose } from './auth-token-purpose';
import { generateToken, hashToken } from './auth-token.util';

/** Entrada para emitir un token de un solo uso. */
export interface IssueTokenInput {
  readonly userId: string;
  readonly purpose: AuthTokenPurpose;
  /** Vigencia del token en milisegundos (ya resuelta por el caller). */
  readonly ttlMs: number;
}

/** Resultado de emitir un token: la fila creada y el valor en CLARO. */
export interface IssuedToken {
  /** Fila persistida (solo guarda el hash del token). */
  readonly authToken: AuthTokenModel;
  /** Token en claro: viaja SOLO en el correo, nunca se persiste ni audita. */
  readonly token: string;
}

/** Mensaje generico de token invalido: no revela por que (no filtra internos). */
const INVALID_TOKEN = 'El enlace no es valido.';
/** Mensaje de token caducado o ya usado (410 Gone). */
const EXPIRED_TOKEN = 'El enlace ya no es valido: expiro o ya fue utilizado.';

/**
 * Emision y validacion de tokens de un solo uso (reset de contrasena e
 * invitacion/activacion). El token en claro usa alta entropia
 * (crypto.randomBytes >=32 bytes) y en BD SOLO se persiste su sha256; el valor
 * en claro se devuelve una unica vez para el correo. Las operaciones de
 * escritura reciben el cliente transaccional del caller para que el consumo y
 * la mutacion de dominio sean atomicos.
 */
@Injectable()
export class AuthTokenService {
  /**
   * Emite un token para `userId`/`purpose`. Invalida (marca como usados) los
   * tokens previos no usados del mismo purpose de ese usuario, de modo que un
   * reenvio deja un unico token vigente. Devuelve la fila creada y el token en
   * CLARO (para incluirlo en la URL del correo). Opera sobre el `tx` recibido.
   */
  async issue(
    tx: Prisma.TransactionClient,
    input: IssueTokenInput,
  ): Promise<IssuedToken> {
    const now = Date.now();

    // Invalida tokens previos no usados del mismo purpose: el reenvio sustituye
    // al anterior, nunca deja dos enlaces validos a la vez.
    await tx.authToken.updateMany({
      where: {
        userId: input.userId,
        purpose: input.purpose,
        usedAt: null,
      },
      data: { usedAt: new Date(now) },
    });

    const token = generateToken();
    const authToken = await tx.authToken.create({
      data: {
        userId: input.userId,
        purpose: input.purpose,
        tokenHash: hashToken(token),
        expiresAt: new Date(now + input.ttlMs),
      },
    });

    return { authToken, token };
  }

  /**
   * Valida y consume un token en claro dentro del `tx` recibido. Hashea el
   * valor recibido y busca por `tokenHash`. Un token inexistente o con un
   * purpose no permitido lanza 400 con mensaje generico (no distingue casos
   * para no filtrar informacion). Un token ya usado o caducado lanza 410. En
   * exito marca `usedAt` (un solo uso) y devuelve la fila.
   */
  async consume(
    tx: Prisma.TransactionClient,
    token: string,
    allowedPurposes: readonly AuthTokenPurpose[],
  ): Promise<AuthTokenModel> {
    const tokenHash = hashToken(token);
    const authToken = await tx.authToken.findFirst({ where: { tokenHash } });

    if (
      !authToken ||
      !allowedPurposes.includes(authToken.purpose as AuthTokenPurpose)
    ) {
      throw new BadRequestException(INVALID_TOKEN);
    }

    if (authToken.usedAt !== null || authToken.expiresAt.getTime() <= Date.now()) {
      throw new GoneException(EXPIRED_TOKEN);
    }

    await tx.authToken.update({
      where: { id: authToken.id },
      data: { usedAt: new Date() },
    });

    return authToken;
  }
}
