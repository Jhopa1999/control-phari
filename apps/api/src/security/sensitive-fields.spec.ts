import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  SENSITIVE_RESPONSE_KEYS,
  stripSensitive,
} from './sensitive-fields';
import { SensitiveFieldsInterceptor } from './sensitive-fields.interceptor';

describe('stripSensitive', () => {
  it('quita claves sensibles en cualquier nivel, también en arreglos', () => {
    const { value, removed } = stripSensitive({
      ok: 1,
      users: [{ id: 'a', passwordHash: 'x', nested: { tokenHash: 'y' } }],
      password: 'z',
    });
    expect(JSON.stringify(value)).toBe(
      JSON.stringify({ ok: 1, users: [{ id: 'a', nested: {} }] }),
    );
    expect(removed.sort()).toEqual(
      ['password', 'users[0].nested.tokenHash', 'users[0].passwordHash'].sort(),
    );
  });

  it('cubre todas las claves declaradas', () => {
    const body = Object.fromEntries(
      SENSITIVE_RESPONSE_KEYS.map((k) => [k, 'x']),
    );
    expect(stripSensitive(body).value).toEqual({});
  });

  it('no copia ni altera lo que no tiene claves sensibles', () => {
    const body = { a: [1, { b: 2 }], d: new Date(0) };
    const { value, removed } = stripSensitive(body);
    expect(value).toBe(body);
    expect(removed).toEqual([]);
  });

  it('deja intactos Date, Buffer y primitivos', () => {
    const d = new Date(0);
    const b = Buffer.from('hola');
    const { value } = stripSensitive({ d, b, n: null, s: 'passwordHash' });
    expect(value).toEqual({ d, b, n: null, s: 'passwordHash' });
    expect((value as { b: Buffer }).b).toBe(b);
  });

  it('tolera referencias circulares', () => {
    const a: Record<string, unknown> = { passwordHash: 'x' };
    a.self = a;
    expect(() => stripSensitive(a)).not.toThrow();
  });

  it('conserva accessToken del login', () => {
    const { value } = stripSensitive({ accessToken: 't', user: { id: '1' } });
    expect(value).toEqual({ accessToken: 't', user: { id: '1' } });
  });
});

describe('SensitiveFieldsInterceptor', () => {
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', url: '/users?x=1' }),
    }),
  } as unknown as ExecutionContext;

  it('elimina el hash y registra WARN con la ruta', async () => {
    const interceptor = new SensitiveFieldsInterceptor();
    const warn = jest
      .spyOn(
        (interceptor as unknown as { logger: { warn: (m: string) => void } }).logger,
        'warn',
      )
      .mockImplementation(() => undefined);
    const handler: CallHandler = {
      handle: () => of([{ id: 'u1', passwordHash: '$2b$secret' }]),
    };
    const out = await lastValueFrom(interceptor.intercept(ctx, handler));
    expect(JSON.stringify(out)).not.toContain('passwordHash');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('GET /users');
    expect(String(warn.mock.calls[0][0])).not.toContain('$2b$secret');
  });

  it('no registra nada si la respuesta es limpia', async () => {
    const interceptor = new SensitiveFieldsInterceptor();
    const warn = jest
      .spyOn(
        (interceptor as unknown as { logger: { warn: (m: string) => void } }).logger,
        'warn',
      )
      .mockImplementation(() => undefined);
    const body = { id: 'u1' };
    const out = await lastValueFrom(
      interceptor.intercept(ctx, { handle: () => of(body) }),
    );
    expect(out).toBe(body);
    expect(warn).not.toHaveBeenCalled();
  });

  it('deja pasar respuestas vacías o no objeto', async () => {
    const interceptor = new SensitiveFieldsInterceptor();
    for (const v of [undefined, null, 'texto', 5]) {
      await expect(
        lastValueFrom(interceptor.intercept(ctx, { handle: () => of(v) })),
      ).resolves.toBe(v);
    }
  });
});

/**
 * Contrato: ningún schema alcanzable desde una respuesta de OpenAPI declara
 * una propiedad sensible (los DTO de entrada sí pueden llevar `password`).
 */
describe('contrato OpenAPI sin campos sensibles en respuestas', () => {
  type Schema = {
    $ref?: string;
    properties?: Record<string, Schema>;
    items?: Schema;
    allOf?: Schema[];
    oneOf?: Schema[];
    anyOf?: Schema[];
    additionalProperties?: Schema | boolean;
  };
  type Spec = {
    paths: Record<
      string,
      Record<
        string,
        { responses?: Record<string, { content?: Record<string, { schema?: Schema }> }> }
      >
    >;
    components: { schemas: Record<string, Schema> };
  };
  const spec = JSON.parse(
    readFileSync(join(__dirname, '../../openapi/openapi.json'), 'utf8'),
  ) as Spec;

  it('ninguna respuesta alcanza passwordHash, tokenHash, etc.', () => {
    const offenders: string[] = [];
    const visited = new Set<string>();
    const walk = (s: Schema | boolean | undefined, where: string): void => {
      if (!s || typeof s === 'boolean') return;
      if (s.$ref) {
        const name = s.$ref.split('/').pop() as string;
        if (visited.has(name)) return;
        visited.add(name);
        walk(spec.components.schemas[name], `${where} -> ${name}`);
        return;
      }
      for (const [prop, child] of Object.entries(s.properties ?? {})) {
        if (SENSITIVE_RESPONSE_KEYS.includes(prop)) {
          offenders.push(`${where}.${prop}`);
        }
        walk(child, `${where}.${prop}`);
      }
      walk(s.items, where);
      walk(s.additionalProperties, where);
      for (const c of [...(s.allOf ?? []), ...(s.oneOf ?? []), ...(s.anyOf ?? [])]) {
        walk(c, where);
      }
    };
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        for (const [code, resp] of Object.entries(op.responses ?? {})) {
          for (const media of Object.values(resp.content ?? {})) {
            walk(media.schema, `${method.toUpperCase()} ${path} ${code}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});