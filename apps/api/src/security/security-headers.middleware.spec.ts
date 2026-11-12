import { API_CSP, HSTS_VALUE, securityHeadersMiddleware } from './security-headers.middleware';

function apply(req: { secure?: boolean; path?: string }) {
  const headers: Record<string, string> = {};
  const next = jest.fn();
  securityHeadersMiddleware(
    req,
    { setHeader: (n: string, v: string) => void (headers[n] = v) },
    next,
  );
  expect(next).toHaveBeenCalledTimes(1);
  return headers;
}

describe('securityHeadersMiddleware', () => {
  it('pone las cabeceras base y la CSP de la API', () => {
    const h = apply({ path: '/health' });
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Referrer-Policy']).toBe('no-referrer');
    expect(h['Content-Security-Policy']).toBe(API_CSP);
  });

  it('HSTS solo si la peticion es segura', () => {
    expect(apply({ path: '/x' })['Strict-Transport-Security']).toBeUndefined();
    expect(apply({ path: '/x', secure: true })['Strict-Transport-Security']).toBe(HSTS_VALUE);
  });

  it('no aplica la CSP a /docs', () => {
    expect(apply({ path: '/docs' })['Content-Security-Policy']).toBeUndefined();
    expect(apply({ path: '/docs/swagger-ui.css' })['Content-Security-Policy']).toBeUndefined();
    expect(apply({ path: '/documents' })['Content-Security-Policy']).toBe(API_CSP);
  });
});
