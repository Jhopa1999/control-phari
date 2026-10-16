import { classifySmtpError } from './classify-smtp-error';
/**
 * Pruebas del clasificador puro de errores SMTP (FEAT-001). Verifican la
 * traduccion a mensajes legibles, la extraccion del codigo de 3 digitos y, de
 * forma transversal, que NUNCA se filtre el bloque de diagnostico, el Hostname,
 * el stack ni credenciales en el resultado.
 */

// Volcado real de Office365 del enunciado (recortado del cuerpo del diagnostico
// pero conservando los marcadores clave que el saneador debe cortar).
const OFFICE365_SEND_AS_DENIED =
  '554 5.2.252 SendAsDenied; notificaciones@transportesvigia.com not allowed to send as ' +
  'jhonatan.pacheco@pharitechservices.com; ' +
  'STOREDRV.Submission.Exception:SendAsDeniedException.MapiExceptionSendAsDenied; ' +
  'Failed to process message due to a permanent exception with message ' +
  '[BeginDiagnosticData]Cannot submit message. 1.84300:01000000, 5.71140:67000000 ' +
  '[EndDiagnosticData] [Hostname=BN8PR12MB4785.namprd12.prod.outlook.com]';

describe('classifySmtpError', () => {
  it('volcado real de Office365 (554 SendAsDenied) => remitente no coincide, code 554 y sin diagnostico', () => {
    const error = Object.assign(new Error(OFFICE365_SEND_AS_DENIED), {
      responseCode: 554,
      response: OFFICE365_SEND_AS_DENIED,
    });
    const result = classifySmtpError(error);
    expect(result.message).toBe('El remitente no coincide con la cuenta autenticada.');
    expect(result.code).toBe('554');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('BeginDiagnosticData');
    expect(serialized).not.toContain('Hostname');
    expect(serialized).not.toContain('SendAsDeniedException');
  });

  it('error SSL/TLS (wrong version number) => mensaje de seguridad', () => {
    const result = classifySmtpError(
      new Error('140...:SSL routines:ssl3_get_record:wrong version number ... ssl/record'),
    );
    expect(result.message).toBe('Error de seguridad en la conexion (SSL/TLS).');
    expect(result.hint).toContain('587');
  });

  it('535 Authentication unsuccessful => autenticacion rechazada, code 535', () => {
    const result = classifySmtpError(
      new Error('535 5.7.139 Authentication unsuccessful, the request did not meet the criteria'),
    );
    expect(result.message).toBe('Autenticacion rechazada por el servidor.');
    expect(result.code).toBe('535');
  });

  it('534 App Password => requiere contrasena de aplicacion', () => {
    const result = classifySmtpError(
      new Error('534 5.7.9 Application-specific password required. Please use an App Password.'),
    );
    expect(result.message).toBe('El servidor requiere una contrasena de aplicacion.');
    expect(result.code).toBe('534');
  });

  it('code ETIMEDOUT => problema de conexion', () => {
    const result = classifySmtpError(
      Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' }),
    );
    expect(result.message).toBe('No se pudo conectar con el servidor SMTP.');
    expect(result.hint).toContain('host');
  });

  it('error generico => mensaje generico con extracto corto en hint', () => {
    const result = classifySmtpError(new Error('algo raro'));
    expect(result.message).toBe('No se pudo enviar el correo de prueba.');
    expect(result.hint).toContain('algo raro');
  });

  it('transversal: ningun resultado filtra stack ni credenciales de ejemplo', () => {
    const credential = 'Erpseven2022';
    const samples: unknown[] = [
      Object.assign(new Error(`${OFFICE365_SEND_AS_DENIED} ${credential}`), {
        stack: `Error: boom\n    at ${credential}`,
        response: `${OFFICE365_SEND_AS_DENIED} ${credential}`,
      }),
      new Error(`535 Authentication unsuccessful password=${credential}`),
      Object.assign(new Error('timeout'), { code: 'ETIMEDOUT', stack: 'at secret' }),
    ];
    for (const sample of samples) {
      const serialized = JSON.stringify(classifySmtpError(sample));
      expect(serialized).not.toContain(credential);
      expect(serialized).not.toContain('stack');
      expect(serialized).not.toContain('BeginDiagnosticData');
    }
  });
});
