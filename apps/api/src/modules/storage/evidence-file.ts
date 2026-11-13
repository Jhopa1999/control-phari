/**
 * Reglas compartidas de archivos de evidencia (tareas y actividades
 * recurrentes): tipos permitidos, tamano maximo y nombre seguro.
 */

/** Archivo recibido por multipart (subconjunto de lo que entrega multer). */
export interface UploadedEvidenceFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Tamano maximo por defecto de una evidencia (8 MB; nginx admite 10 MB). */
export const DEFAULT_EVIDENCE_MAX_BYTES = 8 * 1024 * 1024;

/** Tipos permitidos: documentos de oficina, PDF, imagenes, texto y comprimidos. */
export const ALLOWED_EVIDENCE_TYPES: Readonly<Record<string, readonly string[]>> = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'text/plain': ['txt', 'log'],
  'text/csv': ['csv'],
  'text/markdown': ['md'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.ms-powerpoint': ['ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'application/zip': ['zip'],
};

/** Lee `EVIDENCE_MAX_BYTES` (entero > 0); si no es valido, el default. */
export function evidenceMaxBytes(raw: string | undefined): number {
  const parsed = raw?.trim() ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_EVIDENCE_MAX_BYTES;
}

/** Nombre seguro para la clave del objeto (sin rutas ni caracteres raros). */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'archivo';
  const cleaned = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(-120);
  return cleaned || 'archivo';
}

/** Extension en minusculas del nombre (sin punto) o cadena vacia. */
export function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index + 1).toLowerCase();
}

/**
 * Valida un archivo subido (vacio, tamano y tipo/extension) con las mismas
 * reglas que las evidencias de tareas. Devuelve el mensaje de error o null si
 * es valido; cada service lo traduce a su excepcion HTTP.
 */
export function validateEvidenceFile(
  file: UploadedEvidenceFile | undefined,
  maxBytes: number,
): string | null {
  if (!file || !file.buffer || file.size === 0) {
    return 'Selecciona un archivo para adjuntar.';
  }
  if (file.size > maxBytes) {
    return `El archivo supera el tamaño máximo permitido (${Math.floor(maxBytes / (1024 * 1024))} MB).`;
  }
  const allowedExtensions = ALLOWED_EVIDENCE_TYPES[file.mimetype];
  if (!allowedExtensions || !allowedExtensions.includes(extensionOf(file.originalname))) {
    return 'Tipo de archivo no permitido. Usa PDF, imágenes, texto, Office o ZIP.';
  }
  return null;
}
