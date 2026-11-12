import {
  hasCsrfHeader,
  isSecureCookie,
  readSessionCookie,
  requiresCsrf,
  resolveCookieSecureMode,
} from './session-cookie';

describe('readSessionCookie', () => {
  it('devuelve undefined con cabecera vacia o ausente', () => {
    expect(readSessionCookie(undefined)).toBeUndefined();
    expect(readSessionCookie('')).toBeUndefined();
  });

  it('lee la cookie entre varias', () => {
    expect(readSessionCookie('a=1; portal_session=tok; b=2')).toBe('tok');
  });

  it('conserva "=" dentro del valor', () => {
    expect(readSessionCookie('portal_session=a=b==')).toBe('a=b==');
  });

  it('decodifica valores codificados', () => {
    expect(readSessionCookie('portal_session=a%20b')).toBe('a b');
  });

  it('con el nombre repetido gana la primera aparicion', () => {
    expect(readSessionCookie('portal_session=uno; portal_session=dos')).toBe('uno');
  });

  it('un valor malformado no lanza y devuelve undefined', () => {
    expect(() => readSessionCookie('portal_session=%E0%A4%A')).not.toThrow();
    expect(readSessionCookie('portal_session=%E0%A4%A')).toBeUndefined();
    expect(readSessionCookie('portal_session=%')).toBeUndefined();
  });

  it('ignora nombres parecidos y partes sin "="', () => {
    expect(readSessionCookie('xportal_session=1; portal_session')).toBeUndefined();
  });

  it('acepta la cabecera como arreglo', () => {
    expect(readSessionCookie(['a=1', 'portal_session=tok'])).toBe('tok');
  });
});

describe('Secure de la cookie', () => {
  it('auto por defecto (ausente, vacio o desconocido)', () => {
    expect(resolveCookieSecureMode(undefined)).toEqual({ mode: 'auto', unknown: false });
    expect(resolveCookieSecureMode('auto')).toEqual({ mode: 'auto', unknown: false });
    expect(resolveCookieSecureMode('raro')).toEqual({ mode: 'auto', unknown: true });
  });

  it('true y false se respetan', () => {
    expect(resolveCookieSecureMode('TRUE').mode).toBe('true');
    expect(resolveCookieSecureMode('false').mode).toBe('false');
  });

  it('decide Secure segun el modo y el protocolo', () => {
    expect(isSecureCookie('auto', true)).toBe(true);
    expect(isSecureCookie('auto', false)).toBe(false);
    expect(isSecureCookie('true', false)).toBe(true);
    expect(isSecureCookie('false', true)).toBe(false);
  });
});

describe('CSRF', () => {
  it('solo las escrituras lo exigen', () => {
    for (const m of ['POST', 'put', 'PATCH', 'DELETE']) {
      expect(requiresCsrf(m)).toBe(true);
    }
    for (const m of ['GET', 'HEAD', 'OPTIONS', undefined]) {
      expect(requiresCsrf(m)).toBe(false);
    }
  });

  it('exige el valor 1 en la cabecera propia', () => {
    expect(hasCsrfHeader({ 'x-portal-csrf': '1' })).toBe(true);
    expect(hasCsrfHeader({ 'x-portal-csrf': '0' })).toBe(false);
    expect(hasCsrfHeader({})).toBe(false);
  });
});
