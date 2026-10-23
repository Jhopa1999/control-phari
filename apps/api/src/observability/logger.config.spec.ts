import type { IncomingMessage, ServerResponse } from 'node:http';
import { genReqId, REQUEST_ID_HEADER } from './logger.config';

/**
 * Objetos req/res minimos tipados, sin librerias de mocking. `res.setHeader`
 * registra las cabeceras fijadas para poder verificar la propagacion.
 */
function createReq(
  headers: Record<string, string | string[] | undefined>,
): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

function createRes(): { res: ServerResponse; headers: Record<string, unknown> } {
  const headers: Record<string, unknown> = {};
  const res = {
    headersSent: false,
    setHeader(name: string, value: unknown): void {
      headers[name.toLowerCase()] = value;
    },
  } as unknown as ServerResponse;
  return { res, headers };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('genReqId (correlacion x-request-id)', () => {
  it('reutiliza el x-request-id entrante cuando viene (string no vacio)', () => {
    const req = createReq({ [REQUEST_ID_HEADER]: 'incoming-correlation-id' });
    const { res, headers } = createRes();

    const id = genReqId(req, res);

    expect(id).toBe('incoming-correlation-id');
    expect(headers[REQUEST_ID_HEADER]).toBe('incoming-correlation-id');
  });

  it('reutiliza el primer valor no vacio cuando el header llega como array', () => {
    const req = createReq({ [REQUEST_ID_HEADER]: ['', '  ', 'segundo'] });
    const { res, headers } = createRes();

    const id = genReqId(req, res);

    expect(id).toBe('segundo');
    expect(headers[REQUEST_ID_HEADER]).toBe('segundo');
  });

  it('genera un UUID cuando no viene el header', () => {
    const req = createReq({});
    const { res, headers } = createRes();

    const id = genReqId(req, res);

    expect(id).toMatch(UUID_RE);
    expect(headers[REQUEST_ID_HEADER]).toBe(id);
  });

  it('genera un UUID cuando el header entrante esta vacio o en blanco', () => {
    const req = createReq({ [REQUEST_ID_HEADER]: '   ' });
    const { res } = createRes();

    const id = genReqId(req, res);

    expect(id).toMatch(UUID_RE);
  });

  it('genera ids distintos en llamadas sucesivas sin header entrante', () => {
    const { res: res1 } = createRes();
    const { res: res2 } = createRes();

    const first = genReqId(createReq({}), res1);
    const second = genReqId(createReq({}), res2);

    expect(first).not.toBe(second);
  });
});
