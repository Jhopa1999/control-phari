/**
 * Clasificador PURO de errores de la prueba SMTP (design FEAT-001). Traduce el
 * error crudo de nodemailer/Office365 a un mensaje legible en espanol, con un
 * `hint` accionable y el `code` SMTP de 3 digitos cuando exista.
 *
 * NUNCA devuelve en `message`/`hint` el bloque de diagnostico
 * ([BeginDiagnosticData]...[EndDiagnosticData]), el Hostname, el stack ni
 * credenciales: solo texto corto y saneado.
 */
export interface SmtpErrorClassification {
  message: string;
  hint?: string;
  code?: string;
}

/** Lee de forma segura una propiedad string|number del error (sin `any`). */
function readProp(error: unknown, key: string): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const value = (error as Record<string, unknown>)[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

/** Reune el texto disponible del error de nodemailer para analizar. */
function collectRawText(error: unknown): string {
  const parts = [
    readProp(error, 'response'),
    readProp(error, 'message'),
    readProp(error, 'responseCode'),
    readProp(error, 'code'),
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);
  return parts.join(' ');
}

/** Primer codigo SMTP de 3 digitos (2xx-5xx) presente en el texto. */
function extractCode(raw: string): string | undefined {
  const match = raw.match(/\b([2345]\d{2})\b/);
  return match ? match[1] : undefined;
}

/**
 * Corta el volcado ilegible en el primer marcador conocido y conserva solo la
 * primera linea/frase no vacia. Evita filtrar el bloque de diagnostico.
 */
function sanitizeExcerpt(raw: string): string {
  const markers = ['[BeginDiagnosticData]', 'STOREDRV.', '[Hostname=', '[EndDiagnosticData]'];
  let cut = raw;
  for (const marker of markers) {
    const index = cut.indexOf(marker);
    if (index >= 0) {
      cut = cut.slice(0, index);
    }
  }
  // Primera frase/linea no vacia.
  const firstLine = cut
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const base = (firstLine ?? cut).trim();
  const sentence = base.split('. ')[0]?.trim() ?? base;
  return sentence;
}

/**
 * Clasifica el error de la prueba SMTP. Determinista y sin efectos: no hace IO,
 * no lanza. Devuelve siempre un `message` amable.
 */
export function classifySmtpError(error: unknown): SmtpErrorClassification {
  const raw = collectRawText(error);
  const code = extractCode(raw);
  const lower = raw.toLowerCase();

  // (a) El remitente no coincide con la cuenta autenticada.
  if (
    raw.includes('SendAsDenied') ||
    raw.includes('5.2.252') ||
    lower.includes('not allowed to send as')
  ) {
    return {
      message: 'El remitente no coincide con la cuenta autenticada.',
      hint: 'Iguala el Remitente (From) a la cuenta/Usuario autenticado del SMTP, o concede permisos de "enviar como" a esa cuenta.',
      ...(code ? { code } : {}),
    };
  }

  // (b) Error de seguridad SSL/TLS.
  if (
    lower.includes('wrong version number') ||
    lower.includes('ssl/record') ||
    /ssl|tls/i.test(raw)
  ) {
    return {
      message: 'Error de seguridad en la conexion (SSL/TLS).',
      hint: '587: desmarca conexion segura (STARTTLS); 465: marcala (SSL directo).',
      ...(code ? { code } : {}),
    };
  }

  // (c) Autenticacion rechazada.
  if (
    raw.includes('535') ||
    lower.includes('authentication unsuccessful') ||
    raw.includes('5.7.139')
  ) {
    return {
      message: 'Autenticacion rechazada por el servidor.',
      hint: 'Verifica usuario y contrasena correctos y que SMTP AUTH este habilitado; algunos servidores exigen una contrasena de aplicacion.',
      ...(code ? { code } : {}),
    };
  }

  // (d) Requiere contrasena de aplicacion.
  if (raw.includes('534') || lower.includes('app password')) {
    return {
      message: 'El servidor requiere una contrasena de aplicacion.',
      hint: 'La cuenta tiene MFA activo: genera una contrasena de aplicacion y usala en lugar de la contrasena normal.',
      ...(code ? { code } : {}),
    };
  }

  // (e) Problema de conexion/red.
  if (
    lower.includes('timeout') ||
    lower.includes('econnection') ||
    lower.includes('etimedout') ||
    lower.includes('enotfound') ||
    lower.includes('edns') ||
    lower.includes('econnrefused')
  ) {
    return {
      message: 'No se pudo conectar con el servidor SMTP.',
      hint: 'Revisa host y puerto, y que un firewall no bloquee la salida al servidor SMTP.',
      ...(code ? { code } : {}),
    };
  }

  // (f) Generico: extracto corto saneado como hint.
  const excerpt = sanitizeExcerpt(raw);
  const hintText = excerpt
    ? code
      ? `${excerpt} (codigo ${code}).`
      : `${excerpt}.`
    : undefined;
  return {
    message: 'No se pudo enviar el correo de prueba.',
    ...(hintText ? { hint: hintText } : {}),
    ...(code ? { code } : {}),
  };
}
