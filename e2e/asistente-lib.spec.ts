import { expect, test } from '@playwright/test';
import {
  argEntries,
  COUNTER_VISIBLE_FROM,
  COUNTER_WARNING_FROM,
  MAX_MESSAGE_LENGTH,
  capitalize,
  classifyLink,
  counterAnnouncement,
  counterState,
  groupConversations,
  groupOf,
  proposalHref,
  runningText,
  toolsSummary,
} from '../apps/web/src/lib/assistant-format';
import { createSseParser } from '../apps/web/src/lib/assistant-sse';
import { MAX_MESSAGE_LENGTH as API_MAX_MESSAGE_LENGTH } from '../apps/api/src/modules/assistant/assistant.constants';

/**
 * Utilidades puras del chat del asistente (apps/web/src/lib/assistant-*.ts),
 * cargadas en Node como el resto de web-lib.spec.ts: parser SSE con eventos
 * fragmentados, agrupación del historial, contador y enlaces del Markdown.
 */
test.describe('assistant-sse', () => {
  test('entrega un evento completo aunque llegue partido en varios fragmentos', () => {
    const parser = createSseParser();
    expect(parser.push('event: text\nda')).toEqual([]);
    expect(parser.push('ta: {"delta":"Ho')).toEqual([]);
    expect(parser.push('la"}\n\n')).toEqual([{ event: 'text', data: { delta: 'Hola' } }]);
  });

  test('varios eventos en un mismo fragmento y fin de línea CRLF', () => {
    const parser = createSseParser();
    const events = parser.push(
      'event: tool\r\ndata: {"id":"t1","name":"request.list","label":"solicitudes","status":"running"}\r\n\r\n' +
        'event: done\r\ndata: {"messageId":"m1"}\r\n\r\n',
    );
    expect(events.map((e) => e.event)).toEqual(['tool', 'done']);
  });

  test('ignora comentarios, eventos desconocidos y JSON inválido sin romper el flujo', () => {
    const parser = createSseParser();
    const events = parser.push(
      ': keep-alive\n\nevent: raro\ndata: {}\n\nevent: text\ndata: {no-json\n\nevent: text\ndata: {"delta":"ok"}\n\n',
    );
    expect(events).toEqual([{ event: 'text', data: { delta: 'ok' } }]);
  });

  test('conserva saltos de línea dentro del texto serializado', () => {
    const parser = createSseParser();
    const [event] = parser.push('event: text\ndata: {"delta":"a\\nb"}\n\n');
    expect(event).toEqual({ event: 'text', data: { delta: 'a\nb' } });
  });
});

test.describe('propuestas de acción', () => {
  test('el parser entiende el evento proposal', () => {
    const [event] = createSseParser().push(
      'event: proposal\ndata: {"id":"p1","toolName":"request.create","title":"Crear solicitud","summary":"Crear X","args":{},"status":"PENDIENTE","resultId":null,"resultTitle":null,"error":null,"createdAt":"2026-11-02T10:00:00Z"}\n\n',
    );
    expect(event.event).toBe('proposal');
    expect((event.data as { id: string }).id).toBe('p1');
  });

  test('argEntries aplana body y omite vacíos', () => {
    expect(
      argEntries({
        id: 'abc',
        body: { title: 'Reporte', note: '', owner: null, tags: ['a', 'b'], extra: { deep: 1 } },
      }),
    ).toEqual([
      ['id', 'abc'],
      ['title', 'Reporte'],
      ['tags', 'a, b'],
      ['extra.deep', '1'],
    ]);
    expect(argEntries({})).toEqual([]);
  });

  test('proposalHref lleva a la solicitud afectada y solo a ella', () => {
    const ID = '22030f4f-e5a8-463b-abf1-d5d507d69975';
    const link = `/demanda/solicitudes/${ID}`;
    expect(proposalHref({ toolName: 'request.create', args: {}, resultId: ID })).toBe(link);
    expect(proposalHref({ toolName: 'request.update', args: { id: ID }, resultId: 'otro' })).toBe(link);
    expect(proposalHref({ toolName: 'request.triage.create', args: { id: ID }, resultId: 'x' })).toBe(link);
    // Sin id válido o en tools sin pantalla propia: sin enlace.
    expect(proposalHref({ toolName: 'request.create', args: {}, resultId: null })).toBeNull();
    expect(proposalHref({ toolName: 'request.update', args: { id: '../x' }, resultId: null })).toBeNull();
    expect(proposalHref({ toolName: 'task.create', args: {}, resultId: ID })).toBeNull();
  });
});

test.describe('assistant-format', () => {
  test('el límite del mensaje coincide con el del backend', () => {
    expect(MAX_MESSAGE_LENGTH).toBe(API_MAX_MESSAGE_LENGTH);
  });

  test('umbrales del contador', () => {
    expect(counterState(COUNTER_VISIBLE_FROM - 1)).toBe('hidden');
    expect(counterState(COUNTER_VISIBLE_FROM)).toBe('normal');
    expect(counterState(COUNTER_WARNING_FROM)).toBe('warning');
    expect(counterState(MAX_MESSAGE_LENGTH)).toBe('warning');
    expect(counterState(MAX_MESSAGE_LENGTH + 1)).toBe('over');
  });

  test('anuncia solo al cruzar un umbral, no por cada tecla', () => {
    expect(counterAnnouncement('hidden', 'hidden')).toBeNull();
    expect(counterAnnouncement('normal', 'normal')).toBeNull();
    expect(counterAnnouncement('hidden', 'normal')).toMatch(/500/);
    expect(counterAnnouncement('normal', 'warning')).toMatch(/100/);
    expect(counterAnnouncement('warning', 'over')).toMatch(/límite/);
    expect(counterAnnouncement('over', 'warning')).toBeNull();
  });

  test('resumen de herramientas con singular, plural y fallos', () => {
    const t = (status: 'done' | 'error' | 'running') => ({ label: 'x', status });
    expect(toolsSummary([t('done')])).toBe('Consultó 1 fuente');
    expect(toolsSummary([t('done'), t('done'), t('done')])).toBe('Consultó 3 fuentes');
    expect(toolsSummary([t('done'), t('error')])).toBe('Consultó 2 fuentes · 1 no respondió');
  });

  test('texto de la herramienta en curso con contador desde la segunda', () => {
    expect(runningText([{ label: 'solicitudes', status: 'running' }])).toBe('Consultando solicitudes…');
    expect(
      runningText([
        { label: 'solicitudes', status: 'done' },
        { label: 'portafolio', status: 'running' },
      ]),
    ).toBe('Consultando portafolio… (2 de 2)');
    expect(capitalize('solicitudes')).toBe('Solicitudes');
  });

  test('el historial se agrupa por antigüedad, de más reciente a más antiguo', () => {
    const now = new Date(2026, 10, 15, 12, 0, 0);
    const day = (offset: number): string => new Date(2026, 10, 15 - offset, 9, 0, 0).toISOString();
    expect(groupOf(day(0), now)).toBe('hoy');
    expect(groupOf(day(1), now)).toBe('ayer');
    expect(groupOf(day(5), now)).toBe('semana');
    expect(groupOf(day(30), now)).toBe('anteriores');

    const groups = groupConversations(
      [
        { id: 'viejo', updatedAt: day(30) },
        { id: 'hoy-1', updatedAt: day(0) },
        { id: 'ayer', updatedAt: day(1) },
      ],
      now,
    );
    expect(groups.map((g) => g.label)).toEqual(['Hoy', 'Ayer', 'Anteriores']);
    expect(groupConversations([], now)).toEqual([]);
  });

  test('solo se enlazan rutas del portal y http(s); lo demás no es enlace', () => {
    expect(classifyLink('/solicitudes/1')).toBe('internal');
    expect(classifyLink('//evil.example.com')).toBe('unsafe');
    expect(classifyLink('https://ejemplo.com')).toBe('external');
    expect(classifyLink('http://ejemplo.com')).toBe('external');
    expect(classifyLink('javascript:alert(1)')).toBe('unsafe');
    expect(classifyLink('data:text/html,hola')).toBe('unsafe');
    expect(classifyLink(undefined)).toBe('unsafe');
  });
});
