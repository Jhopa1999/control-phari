import { PartialType } from '@nestjs/swagger';
import { CreateTaskDto } from './create-task.dto';

/**
 * Entrada para editar una tarea (design §3.4): mismos campos de ficha que
 * CreateTaskDto, excepto estado/progreso/aceptacion (se cambian por acciones
 * propias). `isMilestone` editable (dispara la regla hito en el service).
 */
export class UpdateTaskDto extends PartialType(CreateTaskDto) {}
