/**
 * Utilidades puras de los adjuntos del chat del asistente (BL-032 F4a): validar
 * un archivo en el cliente (respuesta inmediata; la validación real vive en la
 * API), formatear tamaños y armar los textos de ayuda y de error.
 */

export interface AttachmentLimitsView {
  maxFiles: number;
  maxImageBytes: number;
  maxDocumentBytes: number;
  maxTextBytes: number;
  maxTextChars: number;
  extensions: string[];
}

/** Valores de respaldo mientras el estado del asistente no ha cargado. */
export const FALLBACK_LIMITS: AttachmentLimitsView = {
  maxFiles: 5,
  maxImageBytes: 3_750_000,
  maxDocumentBytes: 4_500_000,
  maxTextBytes: 1_000_000,
  maxTextChars: 20_000,
  extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf', 'docx', 'xlsx', 'csv', 'md', 'txt'],
};

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const TEXT_EXTENSIONS = ['csv', 'md', 'txt'];

export type AttachmentFileKind = 'imagen' | 'pdf' | 'word' | 'hoja' | 'texto';

export function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index + 1).toLowerCase();
}

/** Tipo de archivo para el icono y la etiqueta. */
export function fileKindOf(name: string): AttachmentFileKind {
  const ext = extensionOf(name);
  if (IMAGE_EXTENSIONS.includes(ext)) return 'imagen';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'word';
  if (ext === 'xlsx' || ext === 'csv') return 'hoja';
  return 'texto';
}

const KIND_LABELS: Record<AttachmentFileKind, string> = {
  imagen: 'Imagen',
  pdf: 'PDF',
  word: 'Word',
  hoja: 'Hoja de cálculo',
  texto: 'Texto',
};

export function fileKindLabel(name: string): string {
  return KIND_LABELS[fileKindOf(name)];
}

/** «2,1 MB», «340 KB», «512 B». Decimal (1 MB = 1 000 000 B), como los límites del servidor. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toLocaleString('es', { maximumFractionDigits: 2 })} MB`;
  }
  if (bytes >= 1_000) {
    return `${Math.round(bytes / 1_000).toLocaleString('es')} KB`;
  }
  return `${bytes} B`;
}

/** Tamaño máximo permitido para el archivo, según su tipo. */
export function maxBytesFor(name: string, limits: AttachmentLimitsView): number {
  const ext = extensionOf(name);
  if (IMAGE_EXTENSIONS.includes(ext)) return limits.maxImageBytes;
  if (TEXT_EXTENSIONS.includes(ext)) return limits.maxTextBytes;
  return limits.maxDocumentBytes;
}

export const TYPES_HELP =
  'Imágenes (PNG, JPEG, WebP, GIF) y documentos (PDF, Word, Excel, CSV, Markdown, TXT).';

/** Motivo por el que un archivo no se puede adjuntar, o null si es válido. */
export function validateAttachmentFile(
  file: { name: string; size: number },
  limits: AttachmentLimitsView,
): string | null {
  if (!limits.extensions.includes(extensionOf(file.name))) {
    return 'Este tipo de archivo no está permitido. Usa imágenes (PNG, JPEG, WebP, GIF) o documentos (PDF, Word, Excel, CSV, Markdown, TXT).';
  }
  if (file.size <= 0) {
    return 'El archivo está vacío.';
  }
  const max = maxBytesFor(file.name, limits);
  if (file.size > max) {
    return `Pesa ${formatFileSize(file.size)} y el máximo para este tipo es ${formatFileSize(max)}.`;
  }
  return null;
}

/** Texto de ayuda de los límites (junto al contador del compositor). */
export function limitsSummary(limits: AttachmentLimitsView): string {
  return `Hasta ${limits.maxFiles} archivos · imágenes de hasta ${formatFileSize(limits.maxImageBytes)} y documentos de hasta ${formatFileSize(limits.maxDocumentBytes)}`;
}

/** Valor del atributo `accept` del selector de archivos. */
export function acceptAttribute(limits: AttachmentLimitsView): string {
  return limits.extensions.map((ext) => `.${ext}`).join(',');
}

export type AttachmentStatus = 'subiendo' | 'extrayendo' | 'listo' | 'error';

/** Lo mínimo de un adjunto del compositor que necesitan los textos de estado. */
export interface AttachmentStatusView {
  status: AttachmentStatus;
}

/**
 * Razón visible por la que no se puede enviar aún (o null). Mientras haya
 * adjuntos en curso o con error, Enviar queda no disponible.
 */
export function sendBlockReason(items: ReadonlyArray<AttachmentStatusView>): string | null {
  const pending = items.filter((i) => i.status === 'subiendo' || i.status === 'extrayendo').length;
  if (pending > 0) {
    return pending === 1
      ? 'Espera a que termine de leerse 1 adjunto para enviar.'
      : `Espera a que terminen de leerse ${pending} adjuntos para enviar.`;
  }
  if (items.some((i) => i.status === 'error')) {
    return 'Hay un adjunto con error. Quítalo o reinténtalo.';
  }
  return null;
}

/** Etiqueta corta del estado, para el chip y los lectores de pantalla. */
export function statusLabel(status: AttachmentStatus, progress: number | null, edited: boolean): string {
  switch (status) {
    case 'subiendo':
      return progress === null ? 'Subiendo…' : `Subiendo… ${progress} %`;
    case 'extrayendo':
      return 'Leyendo contenido…';
    case 'listo':
      return edited ? 'Listo · editado' : 'Listo';
    case 'error':
      return 'Error';
  }
}

/** Resumen de los archivos rechazados al soltar o elegir varios a la vez. */
export function rejectedTitle(count: number, firstName: string): string {
  return count === 1 ? `No se puede adjuntar ${firstName}` : `No se adjuntaron ${count} archivos`;
}
