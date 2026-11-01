import { formatSse } from './assistant.controller';
import {
  isToolAllowed,
  toolLabel,
} from './assistant-tools';
import { clampToolResult, MAX_TOOL_RESULT_CHARS } from './mcp-tool-gateway';

describe('herramientas del asistente', () => {
  it('solo se ofrecen tools de lectura y nunca las de infraestructura', () => {
    expect(isToolAllowed('request.list', true)).toBe(true);
    expect(isToolAllowed('request.create', false)).toBe(false);
    expect(isToolAllowed('dev.actors.list', true)).toBe(false);
    expect(isToolAllowed('health.check', true)).toBe(false);
  });

  it('la etiqueta depende de la familia de la tool', () => {
    expect(toolLabel('request.triage.get')).toBe('solicitudes');
    expect(toolLabel('area-control.attention')).toBe('control del área');
    expect(toolLabel('weekly-report.list')).toBe('reportes semanales');
    expect(toolLabel('algo.desconocido')).toBe('datos del portal');
  });

  it('un resultado grande se recorta con aviso; uno pequeño no cambia', () => {
    const small = 'x'.repeat(10);
    expect(clampToolResult(small)).toBe(small);
    const big = clampToolResult('x'.repeat(MAX_TOOL_RESULT_CHARS + 500));
    expect(big.length).toBeLessThan(MAX_TOOL_RESULT_CHARS + 200);
    expect(big).toMatch(/recortado/);
  });
});

describe('formato SSE', () => {
  it('serializa evento y datos como JSON con linea en blanco final', () => {
    expect(formatSse({ event: 'text', data: { delta: 'hola\nmundo' } })).toBe(
      'event: text\ndata: {"delta":"hola\\nmundo"}\n\n',
    );
  });
});
