/**
 * Hotfix de seguridad: ninguna tool del MCP anuncia ni documenta campos de
 * credenciales (passwordHash, tokenHash...) en sus descripciones ni en su
 * esquema de salida. El MCP solo reenvía respuestas de la API, que ya las
 * excluye (ver apps/api/src/security/sensitive-fields.ts).
 *
 * Las claves de ENTRADA como `password` (configuración SMTP) son legítimas y
 * no se revisan aquí: se revisa lo que describe o devuelve cada tool.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { connectInMemory, createMockApi } from './helpers.js';
import type { RecordedCall } from './helpers.js';

const SENSITIVE = [
  'passwordHash',
  'tokenHash',
  'resetToken',
  'passwordCiphertext',
  'awsSecretAccessKeyCipher',
];

let client: Client;
beforeEach(async () => {
  const calls: RecordedCall[] = [];
  ({ client } = await connectInMemory(createMockApi(calls)));
});
afterEach(async () => {
  await client.close();
});

describe('tools sin campos sensibles', () => {
  it('descripciones y esquemas de salida no mencionan credenciales', async () => {
    const { tools } = await client.listTools();
    assert.ok(tools.length > 0);
    const offenders: string[] = [];
    for (const tool of tools) {
      const text = JSON.stringify({
        description: tool.description,
        title: tool.title,
        outputSchema: tool.outputSchema,
      });
      for (const key of SENSITIVE) {
        if (text.includes(key)) offenders.push(`${tool.name}: ${key}`);
      }
    }
    assert.deepEqual(offenders, []);
  });
});