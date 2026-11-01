import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  normalize,
  parseSections,
  searchSections,
  type HelpSection,
} from './help-search';
import type { HelpSearchResponseDto } from './dto/help.dto';

/**
 * Secciones de los documentos pensadas para quien desarrolla el portal (no
 * para quien lo usa): se excluyen de la ayuda para que no compitan con las de
 * uso. Se compara por inicio del encabezado, sin tildes.
 */
export const HELP_EXCLUDED_HEADINGS: ReadonlyArray<string> = [
  'Sincronía de documentación',
  'Límites de arquitectura',
  'Guards:',
  'El actor',
  'Credenciales por correo',
];

/** Si el encabezado (o su padre) pertenece a una sección técnica excluida. */
export function isExcluded(heading: string): boolean {
  const top = normalize(heading.split(' › ')[0]);
  return HELP_EXCLUDED_HEADINGS.some((h) => top.startsWith(normalize(h)));
}

/** Documentos de uso del portal que alimentan la ayuda, con su etiqueta legible. */
export const HELP_DOCUMENTS: ReadonlyArray<{ file: string; source: string }> = [
  { file: 'README.md', source: 'Visión general del portal' },
  { file: 'frontend-pantallas.md', source: 'Pantallas del portal' },
  { file: 'autenticacion-autorizacion.md', source: 'Roles y permisos' },
];

/**
 * Ayuda del portal (BL-032): busca en la documentación de uso (`docs/aplicacion`)
 * para que el asistente y los clientes del MCP respondan «¿cómo hago X?» sin
 * inventar. Los archivos se leen una vez y se conservan en memoria. La carpeta
 * puede cambiarse con `HELP_DOCS_DIR`; por defecto es `docs/aplicacion` de la
 * raíz del repositorio (la imagen de la API la incluye).
 */
@Injectable()
export class HelpService {
  private readonly logger = new Logger(HelpService.name);
  private sections: Promise<HelpSection[]> | null = null;

  private docsDir(): string {
    const configured = process.env.HELP_DOCS_DIR?.trim();
    if (configured) return configured;
    // .../apps/api/(dist|src)/modules/help -> raíz del repositorio.
    return path.resolve(__dirname, '..', '..', '..', '..', '..', 'docs', 'aplicacion');
  }

  private load(): Promise<HelpSection[]> {
    if (!this.sections) {
      this.sections = this.readAll();
    }
    return this.sections;
  }

  private async readAll(): Promise<HelpSection[]> {
    const dir = this.docsDir();
    const all: HelpSection[] = [];
    for (const doc of HELP_DOCUMENTS) {
      try {
        const markdown = await readFile(path.join(dir, doc.file), 'utf8');
        all.push(
          ...parseSections(doc.source, doc.file, markdown).filter(
            (s) => !isExcluded(s.heading),
          ),
        );
      } catch {
        this.logger.warn(`Ayuda: no se pudo leer ${doc.file} en ${dir}.`);
      }
    }
    return all;
  }

  async search(query: string, limit: number): Promise<HelpSearchResponseDto> {
    const sections = await this.load();
    return { query, results: searchSections(sections, query, limit) };
  }
}
