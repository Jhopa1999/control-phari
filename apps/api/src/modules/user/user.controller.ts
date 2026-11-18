import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { UserPasswordService } from './user-password.service';
import {
  ForcePasswordChangeDto,
  ForcePasswordChangeResponseDto,
} from './dto/force-password-change.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CurrentActor as CurrentActorType } from '../auth/current-actor';
import { CurrentUserGuard } from '../auth/current-user.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoleCode } from '../auth/role-code';

/**
 * API REST de User (entidad Plano B: administracion de area). Acceden ADMIN,
 * JEFE_AREA y LIDER_PROCESO; la jerarquia de creacion la aplica el servicio.
 */
@ApiTags('users')
@Controller('users')
@UseGuards(CurrentUserGuard, RolesGuard)
@Roles(RoleCode.ADMIN, RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly userPasswordService: UserPasswordService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista todos los usuarios (solo JEFE_AREA).' })
  @ApiResponse({ status: 200, description: 'Listado de usuarios.', type: [UserResponseDto] })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  findMany() {
    return this.userService.findMany();
  }

  @Post('force-password-change')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleCode.JEFE_AREA)
  @ApiOperation({
    summary:
      'Exige el cambio de contraseña en el próximo uso del portal a todos los usuarios o a una selección, o retira la exigencia (solo JEFE_AREA).',
  })
  @ApiBody({ type: ForcePasswordChangeDto })
  @ApiResponse({ status: 200, description: 'Resultado de la acción.', type: ForcePasswordChangeResponseDto })
  @ApiResponse({ status: 400, description: 'Cuerpo ambiguo o inválido.' })
  @ApiResponse({ status: 403, description: 'Solo el jefe de área.' })
  @ApiResponse({ status: 404, description: 'Algún usuario indicado no existe; no se aplicó nada.' })
  forcePasswordChange(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: ForcePasswordChangeDto,
  ) {
    return this.userPasswordService.forcePasswordChange(actor, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtiene un usuario con sus grants (solo JEFE_AREA).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Usuario encontrado.', type: UserResponseDto })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crea una identidad funcional (solo JEFE_AREA).' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'Usuario creado.', type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Datos de entrada invalidos.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 409, description: 'Ya existe el identifier.' })
  create(
    @CurrentActor() actor: CurrentActorType,
    @Body() dto: CreateUserDto,
  ) {
    return this.userService.create(actor, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita name/active (solo JEFE_AREA).' })
  @ApiBody({ type: UpdateUserDto })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Usuario actualizado.', type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Datos de entrada invalidos o id no UUID.' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  update(
    @CurrentActor() actor: CurrentActorType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.userService.update(actor, id, dto);
  }
}
