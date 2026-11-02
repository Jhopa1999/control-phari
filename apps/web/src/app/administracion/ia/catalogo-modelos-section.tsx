'use client';

import * as React from 'react';
import { Box, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataCardList } from '@/components/data-card-list';
import { EmptyState } from '@/components/empty-state';
import { InlineNotice } from '@/components/inline-notice';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
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
import type { AiAgentConfig, AiModelCatalogEntry } from '@/lib/api-client';
import { ApiError, listAiModels, updateAiModel } from '@/lib/ai';
import { ModeloDialog } from './modelo-dialog';
import { CapabilityBadges, ModelTierBadge, PriceText } from './modelo-badges';

interface CatalogoModelosSectionProps {
  /** Agentes, para avisar al deshabilitar un modelo que alguno usa. */
  agents: AiAgentConfig[];
  /** Se llama tras crear, editar o (des)habilitar, con el catálogo completo. */
  onChanged: (models: AiModelCatalogEntry[]) => void;
}

type LoadState = 'loading' | 'success' | 'error';

/**
 * Catálogo de modelos de IA (GET/POST/PATCH /admin/ai/models): lista con nivel,
 * capacidades y precio; alta y edición en diálogo; habilitar/deshabilitar con
 * confirmación solo si un agente usa el modelo.
 */
export function CatalogoModelosSection({
  agents,
  onChanged,
}: CatalogoModelosSectionProps): React.ReactElement {
  const [state, setState] = React.useState<LoadState>('loading');
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [models, setModels] = React.useState<AiModelCatalogEntry[]>([]);
  const [attempt, setAttempt] = React.useState(0);
  const [dialog, setDialog] = React.useState<{ model: AiModelCatalogEntry | null } | null>(null);
  const [pendingToggle, setPendingToggle] = React.useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = React.useState<AiModelCatalogEntry | null>(null);
  const onChangedRef = React.useRef(onChanged);
  React.useEffect(() => {
    onChangedRef.current = onChanged;
  });

  React.useEffect(() => {
    let cancelled = false;
    listAiModels()
      .then((list) => {
        if (cancelled) return;
        setModels(list);
        setState('success');
        onChangedRef.current(list);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : null);
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  function retry(): void {
    setState('loading');
    setAttempt((a) => a + 1);
  }

  function applyList(next: AiModelCatalogEntry[]): void {
    setModels(next);
    onChanged(next);
  }

  function agentsUsing(model: AiModelCatalogEntry): AiAgentConfig[] {
    return agents.filter((a) => a.model === model.id);
  }

  async function setEnabled(model: AiModelCatalogEntry, enabled: boolean): Promise<void> {
    setPendingToggle(model.id);
    try {
      const saved = await updateAiModel(model.id, { enabled });
      applyList(models.map((m) => (m.id === saved.id ? saved : m)));
      toast.success(enabled ? `${saved.label} habilitado.` : `${saved.label} deshabilitado.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Ocurrió un error inesperado.');
    } finally {
      setPendingToggle(null);
    }
  }

  function handleToggle(model: AiModelCatalogEntry, enabled: boolean): void {
    if (!enabled && agentsUsing(model).length > 0) {
      setConfirmDisable(model);
      return;
    }
    void setEnabled(model, enabled);
  }

  function handleSaved(saved: AiModelCatalogEntry): void {
    const exists = models.some((m) => m.id === saved.id);
    applyList(exists ? models.map((m) => (m.id === saved.id ? saved : m)) : [...models, saved]);
    setDialog(null);
  }

  const toggle = (model: AiModelCatalogEntry): React.ReactElement => (
    <Switch
      checked={model.enabled}
      disabled={pendingToggle === model.id}
      aria-busy={pendingToggle === model.id || undefined}
      onCheckedChange={(checked) => handleToggle(model, checked)}
      aria-label={`Modelo ${model.label} habilitado`}
    />
  );

  const editButton = (model: AiModelCatalogEntry): React.ReactElement => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Editar ${model.label}`}
      onClick={() => setDialog({ model })}
    >
      <Pencil aria-hidden="true" />
    </Button>
  );

  let body: React.ReactNode;
  if (state === 'loading') {
    body = (
      <div aria-busy="true" className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  } else if (state === 'error') {
    body = (
      <div className="rounded-xl bg-card shadow-card">
        <InlineNotice tone="danger" title="No fue posible cargar el catálogo de modelos.">
          <p className="text-muted-foreground">{loadError ?? 'Reintenta en unos momentos.'}</p>
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            Reintentar
          </Button>
        </InlineNotice>
      </div>
    );
  } else if (models.length === 0) {
    body = (
      <div className="rounded-xl bg-card shadow-card">
        <EmptyState
          icon={Box}
          title="Aún no hay modelos"
          description="Da de alta el primer modelo para poder asignarlo a un agente."
          action={
            <Button type="button" onClick={() => setDialog({ model: null })}>
              <Plus aria-hidden="true" />
              Nuevo modelo
            </Button>
          }
        />
      </div>
    );
  } else {
    body = (
      <div className="rounded-xl bg-card shadow-card">
        <div className="hidden md:block">
          <Table scrollLabel="Modelos de IA">
            <TableHeader>
              <TableRow>
                <TableHead>Modelo</TableHead>
                <TableHead>Nivel</TableHead>
                <TableHead>Capacidades</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead className="text-right">Orden</TableHead>
                <TableHead>Habilitado</TableHead>
                <TableHead>
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((model) => (
                <TableRow key={model.id}>
                  <TableCell className="max-w-72">
                    <div className="font-medium">{model.label}</div>
                    <div className="font-mono text-meta break-all text-muted-foreground">
                      {model.id}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ModelTierBadge tier={model.tier} />
                  </TableCell>
                  <TableCell>
                    <CapabilityBadges model={model} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-sm">
                      <span>
                        <span className="text-meta text-muted-foreground">Entrada </span>
                        <PriceText value={model.inputUsdPerMTok} />
                      </span>
                      <span>
                        <span className="text-meta text-muted-foreground">Salida </span>
                        <PriceText value={model.outputUsdPerMTok} />
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{model.sortOrder}</TableCell>
                  <TableCell>{toggle(model)}</TableCell>
                  <TableCell className="text-right">{editButton(model)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DataCardList
          label="Modelos de IA"
          rows={models}
          getKey={(model) => model.id}
          card={(model) => ({
            title: <span className="font-medium">{model.label}</span>,
            subtitle: <span className="font-mono break-all">{model.id}</span>,
            badges: [<ModelTierBadge key="tier" tier={model.tier} />],
            note: (
              <div className="flex items-center justify-between gap-3 text-sm text-foreground">
                <span>Habilitado</span>
                {toggle(model)}
              </div>
            ),
            meta: [
              { label: 'Capacidades', value: <CapabilityBadges model={model} /> },
              { label: 'Entrada', value: <PriceText value={model.inputUsdPerMTok} /> },
              { label: 'Salida', value: <PriceText value={model.outputUsdPerMTok} /> },
              { label: 'Orden', value: model.sortOrder },
            ],
            actions: editButton(model),
          })}
        />
      </div>
    );
  }

  const disabling = confirmDisable;
  const users = disabling ? agentsUsing(disabling) : [];

  return (
    <div id="catalogo-modelos" className="scroll-mt-20">
      <Section
        title="Catálogo de modelos"
        description="Modelos que los agentes pueden usar y su precio por millón de tokens."
        count={state === 'success' ? models.length : undefined}
        actions={
          <Button type="button" onClick={() => setDialog({ model: null })}>
            <Plus aria-hidden="true" />
            Nuevo modelo
          </Button>
        }
      >
        {body}
      </Section>

      {dialog ? (
        <ModeloDialog
          model={dialog.model}
          onClose={() => setDialog(null)}
          onSaved={handleSaved}
        />
      ) : null}

      <ConfirmDialog
        open={disabling !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDisable(null);
        }}
        title={`¿Deshabilitar ${disabling?.label ?? 'el modelo'}?`}
        description={`Lo usan: ${users.map((a) => a.displayName).join(', ')}. Dejará de ofrecerse en el catálogo; revisa su configuración para elegir otro modelo.`}
        confirmLabel="Deshabilitar"
        onConfirm={async () => {
          if (disabling) await setEnabled(disabling, false);
        }}
      />
    </div>
  );
}
