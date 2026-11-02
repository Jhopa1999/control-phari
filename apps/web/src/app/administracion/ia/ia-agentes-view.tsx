'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plug } from 'lucide-react';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { Section } from '@/components/section';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useActor } from '@/lib/actor-context';
import type {
  AiAgentConfig,
  AiConnectionTest,
  AiCredentialMode,
  AiGlobalConfig,
  AiModelCatalogEntry,
  UpdateAiAgentConfig,
  UpdateAiGlobalConfig,
} from '@/lib/api-client';
import {
  ApiError,
  getAiConfig,
  testAiAgent,
  updateAiAgent,
  updateAiConfig,
} from '@/lib/ai';
import { CatalogoModelosSection } from './catalogo-modelos-section';
import { ConsumoIaSection } from './consumo-ia-section';
import { PresupuestoIaForm } from './presupuesto-ia-form';

type LoadState = 'loading' | 'success' | 'error' | 'forbidden';

/** Secret write-only: 'keep' conserva, 'set' reemplaza, 'clear' limpia. */
type SecretMode = 'keep' | 'set' | 'clear';

const CREDENTIAL_MODE_LABELS: Record<AiCredentialMode, string> = {
  'iam-role': 'Rol IAM de la instancia (recomendado en producción)',
  'access-keys': 'Claves de acceso guardadas',
};

interface AgentFormErrors {
  temperature?: string;
  maxTokens?: string;
  timeoutMs?: string;
  form?: string | null;
}

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Ocurrió un error inesperado.';
}

/**
 * Configuración de agentes de IA (solo ADMIN): estado global de IA, credenciales
 * de AWS (el secret es write-only, como el password SMTP), y la configuración de
 * cada agente (hoy TRIAGE) con su modelo, región, prompt e inputs numéricos.
 * El modelo se elige del catálogo que expone el backend; nada se hardcodea en el
 * frontend. Calca ConfiguracionSmtpView: estados loading/success/error/forbidden
 * y el patrón conservar/definir/limpiar del secret.
 */
export function IaAgentesView(): React.ReactElement {
  const { permissions, allowedModules } = useActor();
  const permissionsLoaded = permissions !== null;
  const aiAllowed = allowedModules.has('aiSettings');

  const [loadedState, setState] = React.useState<LoadState>('loading');
  const state: LoadState = permissionsLoaded && !aiAllowed ? 'forbidden' : loadedState;
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [global, setGlobal] = React.useState<AiGlobalConfig | null>(null);
  const [agents, setAgents] = React.useState<AiAgentConfig[]>([]);
  const [models, setModels] = React.useState<AiModelCatalogEntry[]>([]);
  /** Cambia al guardar el presupuesto para que el consumo se recargue. */
  const [usageReloadKey, setUsageReloadKey] = React.useState(0);

  const agentNames = React.useMemo(
    () => Object.fromEntries(agents.map((a) => [a.code, a.displayName])),
    [agents],
  );
  const modelLabels = React.useMemo(
    () => Object.fromEntries(models.map((m) => [m.id, m.label])),
    [models],
  );

  // --- Estado global (switch + credenciales) ---
  const [enabled, setEnabled] = React.useState(false);
  const [credentialMode, setCredentialMode] =
    React.useState<AiCredentialMode>('iam-role');
  const [accessKeyId, setAccessKeyId] = React.useState('');
  const [secretMode, setSecretMode] = React.useState<SecretMode>('keep');
  const [secret, setSecret] = React.useState('');
  const [savingGlobal, setSavingGlobal] = React.useState(false);
  const [globalFormError, setGlobalFormError] = React.useState<string | null>(null);

  const fillGlobal = React.useCallback((g: AiGlobalConfig) => {
    setEnabled(g.enabled);
    setCredentialMode(g.credentialMode);
    setAccessKeyId('');
    setSecretMode('keep');
    setSecret('');
  }, []);

  const loadData = React.useCallback(() => {
    return getAiConfig()
      .then((config) => {
        setGlobal(config.global);
        setAgents(config.agents);
        setModels(config.models);
        fillGlobal(config.global);
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
  }, [fillGlobal]);
  const load = React.useCallback(async () => {
    setState('loading');
    await loadData();
  }, [loadData]);

  React.useEffect(() => {
    if (!permissionsLoaded) return;
    if (!aiAllowed) return;
    void loadData();
  }, [permissionsLoaded, aiAllowed, loadData]);

  async function handleSaveGlobal(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setGlobalFormError(null);
    setSavingGlobal(true);
    const body: UpdateAiGlobalConfig = {
      enabled,
      credentialMode,
    };
    if (credentialMode === 'access-keys') {
      if (accessKeyId.trim() !== '') body.awsAccessKeyId = accessKeyId.trim();
      // Secret write-only, mismo mapeo que el password SMTP:
      // 'set' con valor => reemplaza; 'clear' => clearCredentials; 'keep' => nada.
      if (secretMode === 'set' && secret !== '') {
        body.awsSecretAccessKey = secret;
      } else if (secretMode === 'clear') {
        body.clearCredentials = true;
      }
    }
    try {
      const saved = await updateAiConfig(body);
      setGlobal(saved);
      fillGlobal(saved);
      toast.success('Configuración de IA guardada.');
    } catch (err) {
      const message = messageOf(err);
      setGlobalFormError(message);
      toast.error(message);
    } finally {
      setSavingGlobal(false);
    }
  }

  if (state === 'forbidden') {
    return (
      <PageLayout>
        <PageHeader
          title="Agentes de IA"
          description="Configuración de IA y de sus agentes."
        />
        <InlineNotice
          tone="neutral"
          title="Esta pantalla no está disponible para tu rol."
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
            La configuración de agentes de IA corresponde al rol de administrador.
          </p>
        </InlineNotice>
      </PageLayout>
    );
  }

  let content: React.ReactNode;
  if (state === 'loading') {
    content = (
      <div aria-busy="true" className="flex flex-col gap-6">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  } else if (state === 'error') {
    content = (
      <div className="rounded-lg border bg-card">
        <InlineNotice tone="danger" title="No fue posible cargar la configuración de IA.">
          <p className="text-muted-foreground">{loadError ?? 'Reintenta en unos momentos.'}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Reintentar
          </Button>
        </InlineNotice>
      </div>
    );
  } else {
    content = (
      <>
        <Section
          title="IA global"
          description="Enciende o apaga la IA en toda la plataforma y define cómo se autentica con AWS Bedrock."
        >
          <form className="flex flex-col gap-4" onSubmit={handleSaveGlobal} noValidate>
            <FormError id="ai-global-form" message={globalFormError} />
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">IA encendida</span>
                <span className="text-meta text-muted-foreground">
                  Con la IA apagada, la mesa de triage no ofrece sugerencias.
                </span>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                aria-label="IA encendida globalmente"
              />
            </div>

            <Field
              id="ai-credential-mode"
              label="Modo de credenciales"
              help="En producción se recomienda el rol IAM de la instancia; las claves solo se guardan en modo access-keys."
            >
              {(control) => (
                <Select
                  value={credentialMode}
                  onValueChange={(v) => setCredentialMode(v as AiCredentialMode)}
                >
                  <SelectTrigger {...control}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="iam-role">
                      {CREDENTIAL_MODE_LABELS['iam-role']}
                    </SelectItem>
                    <SelectItem value="access-keys">
                      {CREDENTIAL_MODE_LABELS['access-keys']}
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>

            {credentialMode === 'access-keys' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="ai-access-key-id"
                  label="AWS Access Key ID"
                  help={
                    global?.accessKeyIdLast4
                      ? `Hay un Access Key ID guardado (••••${global.accessKeyIdLast4}). Déjalo vacío para conservarlo.`
                      : 'No hay un Access Key ID guardado.'
                  }
                >
                  <Input
                    value={accessKeyId}
                    onChange={(e) => setAccessKeyId(e.target.value)}
                    autoComplete="off"
                    placeholder={
                      global?.accessKeyIdLast4 ? `••••${global.accessKeyIdLast4}` : 'AKIA…'
                    }
                  />
                </Field>
                <Field
                  id="ai-secret"
                  label="AWS Secret Access Key"
                  help={
                    global?.secretSet
                      ? 'Hay un secret guardado. Puedes conservarlo, cambiarlo o limpiarlo.'
                      : 'No hay un secret guardado.'
                  }
                >
                  {(control) => (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-3 text-sm">
                        {global?.secretSet ? (
                          <label className="flex cursor-pointer items-center gap-2">
                            <Checkbox
                              checked={secretMode === 'keep'}
                              onChange={() => {
                                setSecretMode('keep');
                                setSecret('');
                              }}
                            />
                            Conservar
                          </label>
                        ) : null}
                        <label className="flex cursor-pointer items-center gap-2">
                          <Checkbox
                            checked={secretMode === 'set'}
                            onChange={() => setSecretMode('set')}
                          />
                          {global?.secretSet ? 'Cambiar' : 'Definir'}
                        </label>
                        {global?.secretSet ? (
                          <label className="flex cursor-pointer items-center gap-2">
                            <Checkbox
                              checked={secretMode === 'clear'}
                              onChange={() => {
                                setSecretMode('clear');
                                setSecret('');
                              }}
                            />
                            Limpiar
                          </label>
                        ) : null}
                      </div>
                      <Input
                        {...control}
                        type="password"
                        value={secretMode === 'set' ? secret : ''}
                        disabled={secretMode !== 'set'}
                        placeholder={
                          global?.secretSet && secretMode === 'keep'
                            ? 'configurado'
                            : 'Nuevo secret'
                        }
                        autoComplete="new-password"
                        onChange={(e) => setSecret(e.target.value)}
                      />
                    </div>
                  )}
                </Field>
              </div>
            ) : (
              <InlineNotice tone="info" title="Autenticación por rol IAM.">
                <p className="text-muted-foreground">
                  No se guardan claves en la plataforma: el SDK usa el rol IAM de la instancia.
                  Cambia a «Claves de acceso guardadas» solo si tu entorno lo requiere.
                </p>
              </InlineNotice>
            )}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={savingGlobal}>
                Guardar IA global
              </Button>
            </div>
          </form>
        </Section>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <ConsumoIaSection
            reloadKey={usageReloadKey}
            agentNames={agentNames}
            modelLabels={modelLabels}
          />
          {global ? (
            <PresupuestoIaForm
              global={global}
              onSaved={(saved) => {
                setGlobal(saved);
                setUsageReloadKey((k) => k + 1);
              }}
            />
          ) : null}
        </div>

        <Section
          title="Agentes"
          description="Cada agente usa un modelo del catálogo permitido y su propio prompt base."
          count={agents.length}
        >
          <div className="flex flex-col gap-6">
            {agents.length === 0 ? (
              <InlineNotice tone="neutral" title="No hay agentes configurados.">
                <p className="text-muted-foreground">
                  Aún no se ha creado ningún agente de IA.
                </p>
              </InlineNotice>
            ) : (
              agents.map((agent) => (
                <AgentCard
                  key={agent.code}
                  agent={agent}
                  models={models}
                  onSaved={(saved) =>
                    setAgents((prev) =>
                      prev.map((a) => (a.code === saved.code ? saved : a)),
                    )
                  }
                />
              ))
            )}
          </div>
        </Section>

        <CatalogoModelosSection
          agents={agents}
          onChanged={(all) => setModels(all.filter((m) => m.enabled))}
        />
      </>
    );
  }

  return (
    <PageLayout>
      <PageHeader title="Agentes de IA" description="Configuración de IA y de sus agentes." />
      {content}
    </PageLayout>
  );
}

/** Reglas de cliente para los inputs numéricos de un agente (evaluadas todas). */
function validateAgent(values: {
  temperature: string;
  maxTokens: string;
  timeoutMs: string;
}): AgentFormErrors {
  const errors: AgentFormErrors = {};
  const temp = Number(values.temperature);
  if (values.temperature.trim() === '' || !Number.isFinite(temp) || temp < 0 || temp > 1) {
    errors.temperature = 'La temperatura debe estar entre 0 y 1.';
  }
  const tokens = Number(values.maxTokens);
  if (
    values.maxTokens.trim() === '' ||
    !Number.isInteger(tokens) ||
    tokens < 1 ||
    tokens > 8192
  ) {
    errors.maxTokens = 'El máximo de tokens debe ser un entero entre 1 y 8192.';
  }
  const timeout = Number(values.timeoutMs);
  if (
    values.timeoutMs.trim() === '' ||
    !Number.isInteger(timeout) ||
    timeout < 1000 ||
    timeout > 60000
  ) {
    errors.timeoutMs = 'El timeout debe ser un entero entre 1000 y 60000 ms.';
  }
  return errors;
}

interface AgentCardProps {
  agent: AiAgentConfig;
  models: AiModelCatalogEntry[];
  onSaved: (saved: AiAgentConfig) => void;
}

/**
 * Tarjeta de configuración de un agente: switch enabled, selector de modelo
 * (del catálogo), región, prompt base, inputs numéricos y botón «Probar
 * conexión» (resultado en InlineNotice, ok/fallo sin lanzar excepción).
 */
function AgentCard({ agent, models, onSaved }: AgentCardProps): React.ReactElement {
  const [enabled, setEnabled] = React.useState(agent.enabled);
  const [model, setModel] = React.useState(agent.model);
  const [region, setRegion] = React.useState(agent.region);
  const [basePrompt, setBasePrompt] = React.useState(agent.basePrompt);
  const [temperature, setTemperature] = React.useState(String(agent.temperature));
  const [maxTokens, setMaxTokens] = React.useState(String(agent.maxTokens));
  const [timeoutMs, setTimeoutMs] = React.useState(String(agent.timeoutMs));
  const [errors, setErrors] = React.useState<AgentFormErrors>({});
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [lastTest, setLastTest] = React.useState<AiConnectionTest | null>(null);

  // El modelo guardado puede no estar en el catálogo (p. ej. se retiró de la
  // lista cerrada): se ofrece igual para no perder el valor vigente al guardar.
  const modelInCatalog = models.some((m) => m.id === model);

  async function handleSave(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const validation = validateAgent({ temperature, maxTokens, timeoutMs });
    if (validation.temperature || validation.maxTokens || validation.timeoutMs) {
      setErrors(validation);
      return;
    }
    setErrors({});
    setSaving(true);
    const body: UpdateAiAgentConfig = {
      enabled,
      region: region.trim(),
      model,
      basePrompt,
      temperature: Number(temperature),
      maxTokens: Number(maxTokens),
      timeoutMs: Number(timeoutMs),
    };
    try {
      const saved = await updateAiAgent(agent.code, body);
      onSaved(saved);
      toast.success(`Agente ${saved.displayName} guardado.`);
    } catch (err) {
      const message = messageOf(err);
      setErrors({ form: message });
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(): Promise<void> {
    setTesting(true);
    try {
      const result = await testAiAgent(agent.code);
      setLastTest(result);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } catch (err) {
      const message = messageOf(err);
      setLastTest({ ok: false, message });
      toast.error(message);
    } finally {
      setTesting(false);
    }
  }

  const prefix = `ai-agent-${agent.code}`;

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border bg-card p-4"
      onSubmit={handleSave}
      noValidate
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-base font-semibold">{agent.displayName}</h3>
          <span className="text-meta text-muted-foreground">Code: {agent.code}</span>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label={`Agente ${agent.displayName} encendido`}
          />
          Encendido
        </label>
      </div>

      <FormError id={`${prefix}-form`} message={errors.form ?? null} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${prefix}-model`} label="Modelo">
          {(control) => (
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger {...control}>
                <SelectValue placeholder="Elige un modelo" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                    {m.tier === 'default' ? ' · recomendado' : m.tier === 'premium' ? ' · premium' : ''}
                  </SelectItem>
                ))}
                {!modelInCatalog ? (
                  <SelectItem value={model}>{model} (fuera del catálogo)</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field id={`${prefix}-region`} label="Región de AWS">
          <Input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="us-east-2"
            autoComplete="off"
          />
        </Field>
      </div>

      <Field id={`${prefix}-prompt`} label="Prompt base">
        <Textarea
          value={basePrompt}
          onChange={(e) => setBasePrompt(e.target.value)}
          rows={6}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          id={`${prefix}-temperature`}
          label="Temperatura"
          error={errors.temperature}
        >
          <Input
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            max={1}
            value={temperature}
            onChange={(e) => {
              setTemperature(e.target.value);
              setErrors((p) => ({ ...p, temperature: undefined }));
            }}
          />
        </Field>
        <Field id={`${prefix}-max-tokens`} label="Máximo de tokens" error={errors.maxTokens}>
          <Input
            type="number"
            inputMode="numeric"
            step={1}
            min={1}
            max={8192}
            value={maxTokens}
            onChange={(e) => {
              setMaxTokens(e.target.value);
              setErrors((p) => ({ ...p, maxTokens: undefined }));
            }}
          />
        </Field>
        <Field id={`${prefix}-timeout`} label="Timeout (ms)" error={errors.timeoutMs}>
          <Input
            type="number"
            inputMode="numeric"
            step={1000}
            min={1000}
            max={60000}
            value={timeoutMs}
            onChange={(e) => {
              setTimeoutMs(e.target.value);
              setErrors((p) => ({ ...p, timeoutMs: undefined }));
            }}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={saving}>
          Guardar agente
        </Button>
        <Button type="button" variant="outline" loading={testing} onClick={() => void handleTest()}>
          <Plug aria-hidden="true" />
          Probar conexión
        </Button>
      </div>

      {lastTest !== null ? (
        <InlineNotice
          tone={lastTest.ok ? 'success' : 'danger'}
          role={lastTest.ok ? 'status' : 'alert'}
          title={lastTest.ok ? 'Conexión verificada' : 'La prueba falló'}
        >
          <p>{lastTest.message}</p>
        </InlineNotice>
      ) : null}
    </form>
  );
}
