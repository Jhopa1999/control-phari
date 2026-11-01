import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HELP_DOCUMENTS, HelpService, isExcluded } from './help.service';

/**
 * Ayuda del portal con la DOCUMENTACIÓN REAL del repositorio (docs/aplicacion):
 * protege que los documentos que alimentan la ayuda existan y contesten las
 * preguntas típicas, y que un directorio sin archivos no rompa el servicio.
 */
describe('HelpService · documentación real', () => {
  const service = new HelpService();

  it('carga los tres documentos de ayuda', async () => {
    const { results } = await service.search('pantallas del portal', 8);
    const files = new Set(results.map((r) => r.file));
    expect(HELP_DOCUMENTS.length).toBe(3);
    expect(files.size).toBeGreaterThan(0);
  });

  it('responde preguntas típicas con la sección correcta', async () => {
    const triage = await service.search('triage', 3);
    expect(triage.results[0].excerpt.toLowerCase()).toContain('triage');

    const roles = await service.search('qué roles existen y qué puede hacer cada uno', 4);
    expect(roles.results.map((r) => r.file)).toContain('autenticacion-autorizacion.md');

    const asistente = await service.search('asistente de IA conversación', 3);
    expect(asistente.results.map((r) => r.heading).join(' ')).toMatch(/Asistente/i);
  });

  it('una consulta sin coincidencias devuelve lista vacía, no error', async () => {
    const res = await service.search('zzzzqqqq', 4);
    expect(res).toEqual({ query: 'zzzzqqqq', results: [] });
  });
});

describe('HelpService · secciones técnicas', () => {
  it('no devuelve secciones pensadas para quien desarrolla el portal', async () => {
    const service = new HelpService();
    for (const q of ['sincronía de documentación hook', 'guards CurrentActor endpoint']) {
      const { results } = await service.search(q, 8);
      for (const r of results) expect(isExcluded(r.heading)).toBe(false);
    }
  });

  it('isExcluded compara el encabezado padre sin tildes', () => {
    expect(isExcluded('Sincronia de documentacion')).toBe(true);
    expect(isExcluded('Guards: cómo se protege cada endpoint')).toBe(true);
    expect(isExcluded('Demanda › Triage')).toBe(false);
  });
});

describe('HelpService · carpeta configurable', () => {
  let dir: string;
  const original = process.env.HELP_DOCS_DIR;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'ayuda-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (original === undefined) delete process.env.HELP_DOCS_DIR;
    else process.env.HELP_DOCS_DIR = original;
  });

  it('lee de HELP_DOCS_DIR y tolera que falten archivos', async () => {
    writeFileSync(path.join(dir, 'README.md'), '## Inicio\nCómo entrar al portal con tu usuario.');
    process.env.HELP_DOCS_DIR = dir;
    const res = await new HelpService().search('entrar usuario', 4);
    expect(res.results).toHaveLength(1);
    expect(res.results[0]).toMatchObject({ file: 'README.md', heading: 'Inicio' });
  });

  it('sin ningún archivo responde vacío', async () => {
    process.env.HELP_DOCS_DIR = dir;
    const res = await new HelpService().search('algo', 4);
    expect(res.results).toEqual([]);
  });
});
