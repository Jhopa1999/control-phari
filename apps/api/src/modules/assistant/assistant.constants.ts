/**
 * Constantes del asistente sin decoradores ni dependencias: las importa el
 * frontend en pruebas para comprobar que su validación coincide con la del
 * backend.
 */

/** Largo máximo de un mensaje de la persona. */
export const MAX_MESSAGE_LENGTH = 4000;

// ------------------------------------------------------------------ adjuntos

/** Adjuntos por mensaje. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

/**
 * Tamaños máximos. Bedrock (Converse) admite imágenes de hasta 3,75 MB y
 * documentos de hasta 4,5 MB; los archivos de texto se leen en el backend.
 */
export const MAX_IMAGE_BYTES = 3_750_000;
export const MAX_DOCUMENT_BYTES = 4_500_000;
export const MAX_TEXT_FILE_BYTES = 1_000_000;
/** Tope de la petición multipart: el mayor de los anteriores. */
export const MAX_UPLOAD_BYTES = MAX_DOCUMENT_BYTES;

/** Caracteres máximos del texto extraído de un adjunto (el que ve el modelo). */
export const MAX_ATTACHMENT_TEXT_CHARS = 20_000;

/** Adjuntos subidos y no enviados que una persona puede tener a la vez. */
export const MAX_UNSENT_ATTACHMENTS = 20;

/** Horas tras las que un adjunto no enviado se considera abandonado. */
export const UNSENT_ATTACHMENT_TTL_HOURS = 24;

/** Tipos de adjunto permitidos, por extensión. */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'] as const;
/** Documentos que lee el modelo (Converse). */
export const DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'xlsx'] as const;
/** Archivos de texto que se leen en el backend, sin modelo. */
export const TEXT_EXTENSIONS = ['csv', 'md', 'txt'] as const;

export const ATTACHMENT_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
  ...TEXT_EXTENSIONS,
] as const;
