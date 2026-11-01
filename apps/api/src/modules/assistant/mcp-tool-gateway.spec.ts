import { formatSse } from './assistant.controller';
import {
  PROPOSAL_SUMMARY_FIELD,
  asProposalTool,
  isToolAllowed,
  missingRequired,
  toolLabel,
} from './assistant-tools';
import { clampToolResult, MAX_TOOL_RESULT_CHARS } from './mcp-tool-gateway';

describe('herramientas del asistente', () => {
  it('las de escritura solo se ofrecen si están en la lista de propuestas y no son destructivas', () => {
    expect(isToolAllowed('request.create', false)).toBe(true);
    expect(isToolAllowed('task.status.update', false)).toBe(true);
    // Decisiones, borrado y administración quedan fuera.
    const forbidden = [
      'request.approval.create',
      'plan.authorize',
      'plan.return',
      'task.accept',
      'governance.gate.approve',
      'grant.delete',
      'user.create',
      'catalog.create',
      'process.update',
    ];
    expect(forbidden.filter((name) => isToolAllowed(name, false))).toEqual([]);
    // Una tool de la lista marcada destructiva tampoco.
    expect(isToolAllowed('request.create', false, true)).toBe(false);
  });

  it('solo se ofrecen tools de lectura y nunca las de infraestructura', () => {
    expect(isToolAllowed('request.list', true)).toBe(true);
    expect(isToolAllowed('dev.actors.list', true)).toBe(false);
    expect(isToolAllowed('health.check', true)).toBe(false);
  });

  it('missingRequired revisa los campos obligatorios de primer nivel y de body', () => {
    const schema = {
      type: 'object',
      properties: { body: { type: 'object', required: ['title', 'mainProcessId'] } },
      required: ['body'],
    };
    expect(missingRequired(schema, {})).toEqual(['body']);
    expect(missingRequired(schema, { body: { title: 'x' } })).toEqual(['body.mainProcessId']);
    expect(missingRequired(schema, { body: { title: 'x', mainProcessId: 'p' } })).toEqual([]);
    expect(missingRequired(schema, { body: { title: '', mainProcessId: 'p' } })).toEqual([
      'body.title',
    ]);
  });

  it('asProposalTool avisa que no se ejecuta y exige el resumen sin tocar el original', () => {
    const tool = {
      name: 'request.create',
      description: 'Crea una solicitud',
      inputSchema: { type: 'object', properties: { body: {} }, required: ['body'] },
      readOnly: false,
    };
    const proposal = asProposalTool(tool);
    expect(proposal.description).toMatch(/NO se ejecuta/);
    expect(proposal.inputSchema.required).toEqual(['body', PROPOSAL_SUMMARY_FIELD]);
    expect(Object.keys(proposal.inputSchema.properties as object)).toEqual([
      'body',
      PROPOSAL_SUMMARY_FIELD,
    ]);
    expect(tool.inputSchema.required).toEqual(['body']);
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
