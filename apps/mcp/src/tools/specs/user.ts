/** Tools de usuarios e identidad del actor. */
import type { ToolSpec } from '../spec.js';

export const USER_SPECS: ReadonlyArray<ToolSpec> = [
  {
    name: 'me.permissions',
    operation: 'GET /me/permissions',
    access: 'read',
    description:
      'Devuelve los permisos del actor actual (GET /me/permissions). Usa la ' +
      'identidad del modo configurado; en jwt vía login puede disparar el ' +
      'login perezoso.',
  },
  {
    name: 'user.list',
    operation: 'GET /users',
    access: 'read',
    description: 'Lista los usuarios (GET /users).',
  },
  {
    name: 'user.get',
    operation: 'GET /users/{id}',
    access: 'read',
    description: 'Obtiene un usuario por id (GET /users/{id}).',
  },
  {
    name: 'user.create',
    operation: 'POST /users',
    access: 'write',
    description:
      'Crea un usuario (POST /users). El cuerpo debe cumplir CreateUserDto; ' +
      'el backend valida los datos.',
  },
  {
    name: 'user.update',
    operation: 'PATCH /users/{id}',
    access: 'write',
    description:
      'Actualiza un usuario (PATCH /users/{id}). El cuerpo debe cumplir ' +
      'UpdateUserDto; el backend valida los datos.',
  },
];
