/**
 * NOTA (design d.5): El transporter de Nodemailer YA NO se construye en el
 * arranque. Antes este archivo exponia `mailConfigProvider` (MAIL_CONFIG) y
 * `mailTransporterProvider` (MAIL_TRANSPORTER) cuyo `useFactory` llamaba a
 * `loadMailConfig()` en bootstrap, lo que ABORTABA el arranque si faltaba el
 * SMTP. Esos providers y tokens se eliminaron: `MailService` resuelve la
 * configuracion en runtime (`MailConfigResolver`) y crea un transporter POR
 * ENVIO. Asi el API arranca sin SMTP.
 *
 * Se deja este archivo intencionalmente sin providers para documentar el
 * cambio y no romper imports historicos por error (no hay otros consumidores,
 * verificado F1). La construccion del transporter vive ahora en
 * `MailService.createTransport(cfg)`.
 */
export {};
