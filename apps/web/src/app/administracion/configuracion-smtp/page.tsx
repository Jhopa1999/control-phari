import { ConfiguracionSmtpView } from './configuracion-smtp-view';
export const metadata = { title: 'Configuración SMTP' };
/**
 * Configuración del sistema (modulo systemSettings, solo ADMIN): servidor SMTP
 * en runtime y administradores del sistema. El control real lo aplica el
 * backend (@Roles(ADMIN)); el gating de la vista es cosmetico.
 */
export default function ConfiguracionSmtpPage(): React.ReactElement {
  return <ConfiguracionSmtpView />;
}
