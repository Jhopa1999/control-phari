/**
 * Flujos de credencial que emiten un AuthToken de un solo uso. Es un conjunto
 * cerrado (no configuracion administrable): PASSWORD_RESET para el reset de
 * contrasena y USER_INVITATION para la invitacion/activacion de cuenta. El
 * `purpose` se persiste tal cual en la columna `purpose` de `auth_tokens`.
 */
export enum AuthTokenPurpose {
  PASSWORD_RESET = 'PASSWORD_RESET',
  USER_INVITATION = 'USER_INVITATION',
}
