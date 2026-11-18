import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  INestApplication,
  Module,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { configureApp } from '../../app.config';
import { INTERNAL_ERROR_MESSAGE, sanitizeMessage } from './all-exceptions.filter';

const UUID = '3f2b8c1e-9a4d-4e7b-8c55-1d2e3f4a5b6c';

class CrearDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsInt()
  @Min(1)
  count!: number;
}

@Controller('prueba-errores')
class PruebaErroresController {
  @Get('no-encontrado')
  noEncontrado(): never {
    throw new NotFoundException(`Tarea "${UUID}" no encontrada.`);
  }

  @Get('prohibido')
  prohibido(): never {
    throw new ForbiddenException();
  }

  @Get('con-codigo')
  conCodigo(): never {
    throw new ForbiddenException({
      statusCode: 403,
      code: 'PASSWORD_CHANGE_REQUIRED',
      message: 'Debes cambiar tu contraseña antes de continuar.',
      error: 'Forbidden',
    });
  }
  @Get('sin-sesion')
  sinSesion(): never {
    throw new UnauthorizedException();
  }

  @Get('propio')
  propio(): never {
    throw new HttpException('Mensaje propio sin cambios.', 409);
  }

  @Get('interno')
  interno(): never {
    throw new Error(`PrismaClientKnownRequestError: fallo en C:\\app\\prisma\\x.ts con ${UUID}`);
  }

  @Post('crear')
  crear(@Body() dto: CrearDto): CrearDto {
    return dto;
  }
}

@Module({ controllers: [PruebaErroresController] })
class PruebaModule {}

describe('AllExceptionsFilter (por HTTP real)', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    app = await NestFactory.create(PruebaModule, { logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    base = base.replace('[::1]', '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  async function call(path: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`${base}/prueba-errores/${path}`, init);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it('404: conserva el código y no muestra el UUID', async () => {
    const { status, body } = await call('no-encontrado');
    expect(status).toBe(404);
    expect(body.statusCode).toBe(404);
    expect(String(body.message)).not.toContain(UUID);
    expect(body.error).toBe('Not Found');
  });

  it('403 sin mensaje propio: texto por defecto en español y código 403', async () => {
    const { status, body } = await call('prohibido');
    expect(status).toBe(403);
    expect(body.message).toBe('No tienes permiso para realizar esta acción.');
  });

  it('401 sin mensaje propio: texto en español y código 401', async () => {
    const { status, body } = await call('sin-sesion');
    expect(status).toBe(401);
    expect(body.message).toBe('Tu sesión no es válida o caducó. Inicia sesión de nuevo.');
  });

  it('un mensaje propio en español se respeta tal cual y el código no cambia', async () => {
    const { status, body } = await call('propio');
    expect(status).toBe(409);
    expect(body.message).toBe('Mensaje propio sin cambios.');
  });

  it('403 con code propio: el filtro conserva el code', async () => {
    const { status, body } = await call('con-codigo');
    expect(status).toBe(403);
    expect(body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(body.message).toBe('Debes cambiar tu contraseña antes de continuar.');
  });
  it('error no HTTP: 500 genérico sin texto interno ni UUID', async () => {
    const { status, body } = await call('interno');
    expect(status).toBe(500);
    expect(body.message).toBe(INTERNAL_ERROR_MESSAGE);
    expect(JSON.stringify(body)).not.toMatch(/Prisma|prisma|app\\|[0-9a-f]{8}-/);
  });

  it('400 de validación: mensajes en español con tildes y misma forma', async () => {
    const { status, body } = await call('crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', count: 0, extra: true }),
    });
    expect(status).toBe(400);
    expect(Array.isArray(body.message)).toBe(true);
    const messages = body.message as string[];
    expect(messages).toContain('El campo «título» es obligatorio.');
    expect(messages).toContain('El campo no puede ser menor que 1.');
    expect(messages).toContain('Se envió un dato que no está permitido.');
    expect(messages.join(' ')).not.toMatch(/must|should|property/);
  });
});

describe('sanitizeMessage', () => {
  it('quita UUID entre comillas y rutas internas', () => {
    expect(sanitizeMessage(`No se encontró la tarea "${UUID}".`)).toBe('No se encontró la tarea.');
    expect(sanitizeMessage('Fallo en /app/dist/x.js al leer')).toBe('Fallo en al leer');
  });

  it('traduce los mensajes por defecto de Nest', () => {
    expect(sanitizeMessage('Forbidden resource')).toBe('No tienes permiso para realizar esta acción.');
    expect(sanitizeMessage('Too Many Requests')).toBe('Demasiados intentos. Inténtalo de nuevo en unos minutos.');
  });
});