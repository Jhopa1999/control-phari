/**
 * GUARD DE COBERTURA MCP vs CONTRATO (BL-032 F1).
 *
 * Falla si el catálogo del MCP y el contrato OpenAPI se desalinean:
 *  - una operación del contrato sin tool ni exclusión explícita,
 *  - una exclusión obsoleta (la operación no existe o ya tiene tool),
 *  - una tool sin operación en el contrato,
 *  - una tool sin anotaciones coherentes,
 *  - una tool GET que no es de solo lectura,
 *  - un cuerpo de forma libre (sin esquema),
 *  - más exclusiones PENDIENTE que el tope.
 *
 * Sin red: el api-client está mockeado; el contrato se lee del api-client.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { listOperations, loadOpenApi } from '../tools/openapi.js';
import { resolveOperation } from '../tools/register.js';
import { MANUAL_SPECS } from '../tools/manual.js';
import { TOOL_SPECS } from '../tools/specs/index.js';
import { EXCLUSIONS, MAX_PENDIENTES } from '../tools/exclusions.js';
import { parseOperation } from '../tools/spec.js';
import type { ToolSpec } from '../tools/spec.js';
import { connectInMemory, createMockApi } from './helpers.js';

const ALL_SPECS: ReadonlyArray<ToolSpec> = [...MANUAL_SPECS, ...TOOL_SPECS];
const operations = listOperations(loadOpenApi());
const toolOperations = new Set(ALL_SPECS.map((s) => s.operation));
const excludedOperations = new Set(EXCLUSIONS.map((e) => e.operation));

describe('cobertura del contrato', () => {
  it('toda operación del contrato tiene tool o exclusión explícita', () => {
    const missing = [...operations.keys()].filter(
      (op) => !toolOperations.has(op) && !excludedOperations.has(op),
    );
    assert.deepEqual(
      missing,
      [],
      `Operaciones sin tool ni exclusión (añade una entrada a tools/specs o a tools/exclusions.ts): ${missing.join(', ')}`,
    );
  });

  it('no hay exclusiones obsoletas ni duplicadas', () => {
    const obsolete = EXCLUSIONS.filter((e) => !operations.has(e.operation)).map(
      (e) => e.operation,
    );
    assert.deepEqual(obsolete, [], `Exclusiones de operaciones que ya no existen: ${obsolete.join(', ')}`);

    const exposed = EXCLUSIONS.filter((e) => toolOperations.has(e.operation)).map(
      (e) => e.operation,
    );
    assert.deepEqual(exposed, [], `Operaciones con tool Y exclusión (quita la exclusión): ${exposed.join(', ')}`);

    assert.equal(excludedOperations.size, EXCLUSIONS.length, 'Hay exclusiones duplicadas.');
  });

  it('cada exclusión lleva un motivo coherente con su tipo', () => {
    for (const e of EXCLUSIONS) {
      assert.ok(e.reason.trim().length >= 20, `Motivo insuficiente para ${e.operation}`);
      assert.equal(
        e.reason.startsWith('PENDIENTE'),
        e.kind === 'pendiente',
        `El motivo de ${e.operation} debe empezar por PENDIENTE si y solo si es pendiente.`,
      );
    }
  });

  it('el número de exclusiones PENDIENTE no supera el tope (y el tope está ajustado)', () => {
    const pending = EXCLUSIONS.filter((e) => e.kind === 'pendiente').length;
    assert.ok(
      pending <= MAX_PENDIENTES,
      `Hay ${pending} exclusiones PENDIENTE y el tope es ${MAX_PENDIENTES}: expón la operación en vez de excluirla.`,
    );
    assert.equal(
      pending,
      MAX_PENDIENTES,
      `Se expusieron operaciones pendientes: baja MAX_PENDIENTES a ${pending} (el tope solo puede bajar).`,
    );
  });
});

describe('catálogo de tools', () => {
  it('nombres y operaciones únicos; toda tool apunta a una operación del contrato', () => {
    const names = ALL_SPECS.map((s) => s.name);
    assert.equal(new Set(names).size, names.length, 'Nombres de tool duplicados.');
    assert.equal(toolOperations.size, ALL_SPECS.length, 'Dos tools apuntan a la misma operación.');
    for (const spec of ALL_SPECS) {
      assert.ok(
        operations.has(spec.operation),
        `La tool ${spec.name} apunta a una operación inexistente: ${spec.operation}`,
      );
    }
  });

  it('el acceso es coherente con el método (GET es de solo lectura y viceversa)', () => {
    for (const spec of ALL_SPECS) {
      const { method } = parseOperation(spec.operation);
      assert.equal(spec.access === 'read', method === 'GET', `Acceso incoherente en ${spec.name}`);
      assert.doesNotThrow(() => resolveOperation(operations, spec));
    }
  });

  it('resolveOperation rechaza operaciones inexistentes y accesos incoherentes', () => {
    assert.throws(() =>
      resolveOperation(operations, {
        name: 'x.y',
        operation: 'GET /no-existe',
        access: 'read',
        description: 'x',
      }),
    );
    assert.throws(() =>
      resolveOperation(operations, {
        name: 'x.y',
        operation: 'GET /users',
        access: 'write',
        description: 'x',
      }),
    );
  });

  it('expone 92 tools: las 47 originales y las 45 de lectura', () => {
    assert.equal(ALL_SPECS.length, 92);
  });
});

describe('tools/list (servidor real en memoria)', () => {
  let client: Client;
  before(async () => {
    ({ client } = await connectInMemory(createMockApi([])));
  });
  after(async () => {
    await client.close();
  });

  it('expone exactamente las tools del catálogo con su descripción', async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      ALL_SPECS.map((s) => s.name).sort(),
    );
    const byName = new Map(tools.map((t) => [t.name, t]));
    for (const spec of ALL_SPECS) {
      const tool = byName.get(spec.name);
      assert.equal(tool?.description, spec.description, `Descripción de ${spec.name}`);
      assert.equal(tool?.inputSchema.type, 'object', `inputSchema de ${spec.name}`);
    }
  });

  it('toda tool declara las tres anotaciones y son coherentes', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const spec = ALL_SPECS.find((s) => s.name === tool.name);
      assert.ok(spec);
      const { method } = parseOperation(spec.operation);
      const a = tool.annotations;
      assert.ok(a, `Falta annotations en ${tool.name}`);
      for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint'] as const) {
        assert.equal(typeof a[hint], 'boolean', `Falta ${hint} en ${tool.name}`);
      }
      assert.equal(a.readOnlyHint, method === 'GET', `readOnlyHint de ${tool.name}`);
      assert.equal(a.destructiveHint, spec.access === 'destructive', `destructiveHint de ${tool.name}`);
      assert.equal(a.idempotentHint, method !== 'POST', `idempotentHint de ${tool.name}`);
      if (a.readOnlyHint) assert.equal(a.destructiveHint, false);
    }
  });

  it('DELETE y plan.import son destructivas; las demás escrituras no', async () => {
    const { tools } = await client.listTools();
    const destructive = tools
      .filter((t) => t.annotations?.destructiveHint === true)
      .map((t) => t.name)
      .sort();
    assert.deepEqual(destructive, ['grant.delete', 'plan.import']);
  });

  it('ningún cuerpo es de forma libre: todo objeto del body declara propiedades', async () => {
    const { tools } = await client.listTools();
    const problems: string[] = [];

    const walk = (node: unknown, where: string): void => {
      if (Array.isArray(node)) {
        node.forEach((n, i) => walk(n, `${where}[${i}]`));
        return;
      }
      if (node === null || typeof node !== 'object') return;
      const schema = node as Record<string, unknown>;
      if (Object.keys(schema).length === 0) {
        problems.push(`${where}: esquema vacío (any)`);
      }
      if (schema.additionalProperties === true) {
        problems.push(`${where}: additionalProperties true`);
      }
      if (
        schema.additionalProperties !== null &&
        typeof schema.additionalProperties === 'object'
      ) {
        problems.push(`${where}: record sin esquema fijo`);
      }
      if (schema.type === 'object' && schema.properties === undefined) {
        problems.push(`${where}: objeto sin propiedades`);
      }
      if (schema.type === 'object' && schema.additionalProperties !== false) {
        problems.push(`${where}: objeto que admite claves libres`);
      }
      for (const [key, value] of Object.entries(schema)) {
        if (key === 'properties' && value && typeof value === 'object') {
          for (const [prop, child] of Object.entries(value)) {
            walk(child, `${where}.${prop}`);
          }
        } else if (key !== 'required' && key !== 'enum') {
          walk(value, `${where}.${key}`);
        }
      }
    };

    let withBody = 0;
    for (const tool of tools) {
      const body = (tool.inputSchema.properties as Record<string, unknown> | undefined)?.body;
      if (body === undefined) continue;
      withBody += 1;
      walk(body, `${tool.name}.body`);
    }
    assert.ok(withBody > 20, 'Se esperaban tools con body');
    assert.deepEqual(problems, []);
  });
});
