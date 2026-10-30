'use client';
import * as React from 'react';
import Link from 'next/link';
import { Mail, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { Section } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useActor } from '@/lib/actor-context';
import type { AdminUser, SmtpConfig, SmtpTestResult, UpdateSmtpConfig } from '@/lib/api-client';
import {
  ApiError,
  getSmtpConfig,
  listAdminUsers,
  setAdminFlag,
  testSmtp,
  updateSmtpConfig,
} from '@/lib/smtp-config';
type LoadState = 'loading' | 'success' | 'error' | 'forbidden';
const SOURCE_LABELS: Record<SmtpConfig['source'], string> = {
  db: 'Base de datos',
  env: 'Variables de entorno',
  none: 'Correo deshabilitado',
};
interface FormErrors {
  host?: string;
  port?: string;
  fromAddress?: string;
  form?: string | null;
}
function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Ocurrio un error inesperado.';
}
/**
 * Configuracion del sistema (solo ADMIN): servidor SMTP en runtime y gestion de
 * administradores. El password es write-only: nunca se recibe del backend; un
 * control decide si se conserva, se reemplaza o se limpia (design e.2). NO hay
 * campo APP_WEB_URL (lo gestiona el entorno, design d.1).
 */
export function ConfiguracionSmtpView(): React.ReactElement {
  const { permissions, allowedModules, authUser } = useActor();
  const permissionsLoaded = permissions !== null;
  const settingsAllowed = allowedModules.has('systemSettings');
  const [config, setConfig] = React.useState<SmtpConfig | null>(null);
  const [loadedState, setState] = React.useState<LoadState>('loading');
  const state: LoadState = permissionsLoaded && !settingsAllowed ? 'forbidden' : loadedState;
  const [loadError, setLoadError] = React.useState<string | null>(null);
  // Campos del formulario SMTP.
  const [host, setHost] = React.useState('');
  const [port, setPort] = React.useState('');
  const [secure, setSecure] = React.useState(false);
  const [username, setUsername] = React.useState('');
  const [fromAddress, setFromAddress] = React.useState('');
  const [fromName, setFromName] = React.useState('');
  // Password write-only: 'keep' conserva, 'set' escribe uno nuevo, 'clear' limpia.
  const [passwordMode, setPasswordMode] = React.useState<'keep' | 'set' | 'clear'>('keep');
  const [password, setPassword] = React.useState('');
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [saving, setSaving] = React.useState(false);
  // Prueba de envio.
  const [testOpen, setTestOpen] = React.useState(false);
  const [testTo, setTestTo] = React.useState('');
  const [testing, setTesting] = React.useState(false);
  // Resultado de la ultima prueba (panel persistente que no se desvanece).
  const [lastTest, setLastTest] = React.useState<SmtpTestResult | null>(null);
  // Administradores del sistema.
  const [adminUsers, setAdminUsers] = React.useState<AdminUser[]>([]);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const fillForm = React.useCallback((c: SmtpConfig) => {
    setHost(c.host ?? '');
    setPort(c.port !== null ? String(c.port) : '');
    setSecure(c.secure);
    setUsername(c.username ?? '');
    setFromAddress(c.fromAddress ?? '');
    setFromName(c.fromName ?? '');
    setPasswordMode('keep');
    setPassword('');
  }, []);
  const fetchConfig = React.useCallback(() => {
    return Promise.all([getSmtpConfig(), listAdminUsers()])
      .then(([c, users]) => {
        setConfig(c);
        setAdminUsers(users);
        fillForm(c);
        setState('success');
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 403) {
          setState('forbidden');
          return;
        }
        setLoadError(err instanceof Error ? err.message : null);
        setState('error');
      });
  }, [fillForm]);
  const load = React.useCallback(
    (silent = false) => {
      if (!silent) setState('loading');
      return fetchConfig();
    },
    [fetchConfig],
  );
  React.useEffect(() => {
    if (!permissionsLoaded || !settingsAllowed) return;
    void fetchConfig();
  }, [permissionsLoaded, settingsAllowed, fetchConfig]);
  function validate(): FormErrors | null {
    const next: FormErrors = {};
    if (host.trim() === '') next.host = 'El host es obligatorio.';
    const portNum = Number(port);
    if (port.trim() === '' || !Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      next.port = 'El puerto debe ser un entero entre 1 y 65535.';
    }
    if (fromAddress.trim() === '' || !fromAddress.includes('@')) {
      next.fromAddress = 'La direccion remitente debe ser un correo valido.';
    }
    return Object.keys(next).length > 0 ? next : null;
  }
  async function handleSave(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const validation = validate();
    if (validation) {
      setErrors(validation);
      return;
    }
    setErrors({});
    setSaving(true);
    const body: UpdateSmtpConfig = {
      host: host.trim(),
      port: Number(port),
      secure,
      fromAddress: fromAddress.trim(),
    };
    if (username.trim() !== '') body.username = username.trim();
    if (fromName.trim() !== '') body.fromName = fromName.trim();
    // Mapeo del password write-only (design e.2):
    // - 'set' con valor => password nuevo (cifra en backend).
    // - 'clear' => clearPassword:true.
    // - 'keep' => no se envia nada (conserva).
    if (passwordMode === 'set' && password !== '') {
      body.password = password;
    } else if (passwordMode === 'clear') {
      body.clearPassword = true;
    }
    try {
      const saved = await updateSmtpConfig(body);
      setConfig(saved);
      fillForm(saved);
      toast.success('Configuracion SMTP guardada.');
    } catch (err) {
      const message = messageOf(err);
      setErrors({ form: message });
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }
  async function handleTest(): Promise<void> {
    if (testTo.trim() === '' || !testTo.includes('@')) {
      toast.error('Indica una direccion de destino valida.');
      return;
    }
    setTesting(true);
    try {
      const result = await testSmtp(testTo.trim());
      setLastTest(result);
      if (result.ok) {
        toast.success(result.message);
        setTestOpen(false);
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      const message = messageOf(err);
      setLastTest({ ok: false, message });
      toast.error(message);
    } finally {
      setTesting(false);
    }
  }
  async function handleToggleAdmin(user: AdminUser, next: boolean): Promise<void> {
    setTogglingId(user.id);
    try {
      await setAdminFlag(user.id, next);
      toast.success(
        next
          ? `${user.name} ahora es administrador del sistema.`
          : `${user.name} ya no es administrador del sistema.`,
      );
      await load(true);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setTogglingId(null);
    }
  }
  if (state === 'forbidden') {
    return (
      <PageLayout>
        <PageHeader
          title="Configuracion del sistema"
          description="Servidor SMTP y administradores del sistema."
        />
        <InlineNotice
          tone="neutral"
          title="Esta pantalla no esta disponible para tu rol."
          action={
            allowedModules.has('permissions') ? (
              <Link
                href="/gobierno/mis-permisos"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Ir a Mis permisos
              </Link>
            ) : undefined
          }
        >
          <p className="text-muted-foreground">
            La configuracion del sistema corresponde al rol de administrador.
          </p>
        </InlineNotice>
      </PageLayout>
    );
  }
  let content: React.ReactNode;
  if (state === 'loading') {
    content = (
      <div aria-busy="true" className="flex flex-col gap-6">
        <Skeleton className="h-80 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  } else if (state === 'error') {
    content = (
      <div className="rounded-lg border bg-card">
        <InlineNotice tone="danger" title="No fue posible cargar la configuracion.">
          <p className="text-muted-foreground">{loadError ?? 'Reintenta en unos momentos.'}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Reintentar
          </Button>
        </InlineNotice>
      </div>
    );
  } else {
    const source = config?.source ?? 'none';
    // Avisos de coherencia (ayuda visual en el frontend, NO bloquean Guardar):
    // la logica de negocio y el envio real los decide el backend.
    const portNum = Number(port);
    const warnSecure587 = secure && portNum === 587;
    const warnInsecure465 = !secure && portNum === 465;
    const fromDomain =
      fromAddress.includes('@') ? fromAddress.split('@').pop() ?? '' : '';
    const userDomain = username.includes('@') ? username.split('@').pop() ?? '' : '';
    const warnDomainMismatch =
      fromDomain !== '' && userDomain !== '' && fromDomain !== userDomain;
    content = (
      <>
        <Section
          title="Servidor SMTP"
          description="Se usa para enviar correos de reestablecimiento de contrasena e invitaciones."
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-meta text-muted-foreground">Fuente efectiva:</span>
              <StatusBadge kind="active" value={String(source !== 'none')} />
              <span className="text-sm">{SOURCE_LABELS[source]}</span>
            </div>
            {source === 'env' ? (
              <InlineNotice tone="info" title="La configuracion efectiva proviene del entorno.">
                <p className="text-muted-foreground">
                  No hay una fila completa en base de datos; mientras tanto se usan las variables de
                  entorno. Guarda la configuracion para gestionarla desde aqui.
                </p>
              </InlineNotice>
            ) : null}
            {source === 'none' ? (
              <InlineNotice tone="warning" title="El correo esta deshabilitado.">
                <p className="text-muted-foreground">
                  No hay configuracion valida ni en base de datos ni en el entorno. Las invitaciones
                  y los reestablecimientos no se enviaran hasta configurar el servidor.
                </p>
              </InlineNotice>
            ) : null}
            <form className="flex flex-col gap-4" onSubmit={handleSave} noValidate>
              <FormError id="smtp-form" message={errors.form ?? null} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="smtp-host" label="Host" required error={errors.host}>
                  <Input
                    value={host}
                    onChange={(e) => {
                      setHost(e.target.value);
                      setErrors((p) => ({ ...p, host: undefined }));
                    }}
                    placeholder="smtp.office365.com"
                  />
                </Field>
                <Field id="smtp-port" label="Puerto" required error={errors.port}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={port}
                    onChange={(e) => {
                      setPort(e.target.value);
                      setErrors((p) => ({ ...p, port: undefined }));
                    }}
                    placeholder="587"
                  />
                </Field>
              </div>
              <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={secure}
                  onChange={(e) => setSecure(e.target.checked)}
                />
                Puerto 465 = marca esta casilla (SSL directo). Puerto 587 = dejala desmarcada
                (STARTTLS).
              </label>
              {warnSecure587 ? (
                <InlineNotice
                  tone="warning"
                  role="status"
                  title="Revisa la conexion segura."
                >
                  <p className="text-muted-foreground">
                    El puerto 587 suele usar STARTTLS. Si la prueba falla, desmarca la casilla de
                    conexion segura.
                  </p>
                </InlineNotice>
              ) : null}
              {warnInsecure465 ? (
                <InlineNotice
                  tone="warning"
                  role="status"
                  title="Revisa la conexion segura."
                >
                  <p className="text-muted-foreground">
                    El puerto 465 suele requerir SSL directo. Si la prueba falla, marca la casilla de
                    conexion segura.
                  </p>
                </InlineNotice>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="smtp-username"
                  label="Usuario"
                  help="Opcional. Algunos relays no requieren autenticacion."
                >
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field
                  id="smtp-password"
                  label="Contrasena"
                  help={
                    config?.passwordSet
                      ? 'Hay una contrasena configurada. Puedes conservarla, cambiarla o limpiarla.'
                      : 'No hay contrasena configurada.'
                  }
                >
                  {(control) => (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-3 text-sm">
                        {config?.passwordSet ? (
                          <label className="flex cursor-pointer items-center gap-2">
                            <Checkbox
                              checked={passwordMode === 'keep'}
                              onChange={() => {
                                setPasswordMode('keep');
                                setPassword('');
                              }}
                            />
                            Conservar
                          </label>
                        ) : null}
                        <label className="flex cursor-pointer items-center gap-2">
                          <Checkbox
                            checked={passwordMode === 'set'}
                            onChange={() => setPasswordMode('set')}
                          />
                          {config?.passwordSet ? 'Cambiar' : 'Definir'}
                        </label>
                        {config?.passwordSet ? (
                          <label className="flex cursor-pointer items-center gap-2">
                            <Checkbox
                              checked={passwordMode === 'clear'}
                              onChange={() => {
                                setPasswordMode('clear');
                                setPassword('');
                              }}
                            />
                            Limpiar
                          </label>
                        ) : null}
                      </div>
                      <Input
                        {...control}
                        type="password"
                        value={passwordMode === 'set' ? password : ''}
                        disabled={passwordMode !== 'set'}
                        placeholder={
                          config?.passwordSet && passwordMode === 'keep'
                            ? 'configurada'
                            : 'Nueva contrasena'
                        }
                        autoComplete="new-password"
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  )}
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="smtp-from" label="Remitente (correo)" required error={errors.fromAddress}>
                  <Input
                    type="email"
                    value={fromAddress}
                    onChange={(e) => {
                      setFromAddress(e.target.value);
                      setErrors((p) => ({ ...p, fromAddress: undefined }));
                    }}
                    placeholder="notificaciones@tu-dominio"
                  />
                </Field>
                <Field id="smtp-from-name" label="Nombre del remitente" help="Opcional.">
                  <Input
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="Notificaciones"
                  />
                </Field>
              </div>
              {warnDomainMismatch ? (
                <InlineNotice
                  tone="warning"
                  role="status"
                  title="El remitente y el usuario tienen dominios distintos."
                >
                  <p className="text-muted-foreground">
                    El correo remitente y el usuario autenticado pertenecen a dominios diferentes.
                    Office365 suele rechazar el envio (SendAsDenied); usa un remitente del mismo
                    dominio que la cuenta autenticada.
                  </p>
                </InlineNotice>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <Button type="submit" loading={saving}>
                  Guardar configuracion
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const adminEmail = authUser?.identifier ?? '';
                    setTestTo(fromAddress.trim() || adminEmail);
                    setTestOpen(true);
                  }}
                >
                  <Send aria-hidden="true" />
                  Probar envio
                </Button>
              </div>
            </form>
            {lastTest !== null ? (
              <InlineNotice
                tone={lastTest.ok ? 'success' : 'danger'}
                role={lastTest.ok ? 'status' : 'alert'}
                title={lastTest.ok ? 'Conexion verificada' : 'La prueba fallo'}
              >
                <p>{lastTest.message}</p>
                {lastTest.hint ? (
                  <p className="text-muted-foreground">{lastTest.hint}</p>
                ) : null}
                {lastTest.code ? (
                  <p className="text-meta text-muted-foreground">
                    Codigo SMTP: {lastTest.code}
                  </p>
                ) : null}
              </InlineNotice>
            ) : null}
          </div>
        </Section>
        <Section
          title="Administradores del sistema"
          description="Los administradores pueden configurar el sistema. No se puede degradar al ultimo administrador activo."
          count={adminUsers.length}
        >
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table scrollLabel="Tabla de usuarios">
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Identificador</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Administrador</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="min-w-40 font-medium">{user.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {user.identifier}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <StatusBadge kind="active" value={String(user.active)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Switch
                          checked={user.isAdmin}
                          disabled={togglingId !== null}
                          onCheckedChange={(next) => void handleToggleAdmin(user, next)}
                          aria-label={`Administrador: ${user.name}`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
      </>
    );
  }
  return (
    <PageLayout>
      <PageHeader
        title="Configuracion del sistema"
        description="Servidor SMTP y administradores del sistema."
      />
      {content}
      <Dialog
        open={testOpen}
        onOpenChange={(open) => {
          setTestOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Probar envio de correo</DialogTitle>
            <DialogDescription>
              Te enviaremos un correo de prueba a esta direccion para confirmar que la configuracion
              funciona.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field
              id="smtp-test-to"
              label="Correo donde recibir la prueba"
              required
              help="Usa un buzon al que tengas acceso para confirmar que llega."
            >
              <Input
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="tu-correo@tu-dominio"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTestOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" loading={testing} onClick={() => void handleTest()}>
              <Mail aria-hidden="true" />
              Enviar prueba
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
