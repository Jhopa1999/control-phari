'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import Link from 'next/link';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/field';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Asset, Request } from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import { associateAsset, TriageError } from '@/lib/triage';
import { DisabledReason } from '@/components/disabled-reason';
import { AssetError, listAssets } from '@/lib/assets';

/** Id de la sección y del formulario; el FormError lleva `${PANEL_ID}-error`. */
const PANEL_ID = 'triage-asset-base';

export interface AssetBasePanelProps {
  request: Request;
  /** Nombre del proceso principal de la solicitud (o null si está fuera de alcance). */
  processName: string | null;
  /** En REGISTRADA el panel se muestra pero no deja asociar todavía. */
  disabled: boolean;
  /** Se invoca tras asociar con éxito (la vista recarga la solicitud). */
  onAssociated: () => void;
}

/**
 * Control «Activo base» del triage (idea de negocio: toda solicitud se trabaja
 * sobre un activo base y el proceso no avanza sin él). El triage NO crea
 * activos: solo asocia un activo EXISTENTE de la lista (ya filtrada por el
 * backend a los activos visibles para los procesos del actor). La creación de
 * activos vive en el módulo de Activos y la realiza el jefe de área. No
 * reimplementa reglas: el backend decide (404 alcance, 409 estado o activo no
 * habilitado para el proceso) y aquí solo se traduce su mensaje legible.
 */
export function AssetBasePanel({
  request,
  processName,
  disabled,
  onAssociated,
}: AssetBasePanelProps): React.ReactElement {
  const [assets, setAssets] = React.useState<Asset[]>([]);
  const [assetsLoaded, setAssetsLoaded] = React.useState(false);
  const [editing, setEditing] = React.useState(request.assetId === null);
  const [assetId, setAssetId] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const triggerRef = React.useRef<HTMLButtonElement>(null);

  // Si cambia la solicitud (o su activo), vuelve a mostrar el estado asociado.
  useResetOnChange([request.id, request.assetId], () => {
    setEditing(request.assetId === null);
    setAssetId('');
    setFormError(null);
  });

  // Carga tolerante a fallo: si falla, el selector queda vacío. La lista ya
  // viene filtrada por el backend a los activos visibles para el actor.
  React.useEffect(() => {
    void listAssets()
      .then(setAssets)
      .catch(() => setAssets([]))
      .finally(() => setAssetsLoaded(true));
  }, []);

  const { permissions } = useActor();
  const isJefe = (permissions?.grants ?? []).some((g) => g.roleCode === 'JEFE_AREA');

  const associatedAsset = React.useMemo(
    () => assets.find((a) => a.id === request.assetId) ?? null,
    [assets, request.assetId],
  );

  // D8: solo los ACTIVO se asocian (la API decide). El jefe, que es quien los
  // activa, ve además los no asociables, deshabilitados y con el motivo en texto.
  const associable = React.useMemo(() => assets.filter((a) => a.status === 'ACTIVO'), [assets]);
  const notAssociable = React.useMemo(
    () => (isJefe ? assets.filter((a) => a.status !== 'ACTIVO') : []),
    [assets, isJefe],
  );
  const noAssociable = assetsLoaded && associable.length === 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (disabled || submitting) return;
    setFormError(null);

    if (!assetId) {
      const message = 'Elige un activo existente.';
      setFormError(message);
      triggerRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await associateAsset(request.id, { assetId });
      toast.success('Activo base asociado.');
      onAssociated();
    } catch (err) {
      const message =
        err instanceof TriageError || err instanceof AssetError
          ? err.message
          : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  // Estado asociado: tarjeta de solo lectura con opción de cambiar el activo.
  if (request.assetId !== null && !editing) {
    return (
      <section
        id={PANEL_ID}
        aria-labelledby={`${PANEL_ID}-title`}
        className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4"
      >
        <h2 id={`${PANEL_ID}-title`} className="text-base font-semibold">
          Activo base
        </h2>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm">
            Activo asociado:{' '}
            <span className="font-medium">
              {associatedAsset?.name ?? 'Activo fuera de tu alcance'}
            </span>
          </p>
          {associatedAsset ? (
            <StatusBadge kind="asset" value={associatedAsset.status} className="w-fit" />
          ) : null}
          {associatedAsset && associatedAsset.status !== 'ACTIVO' ? (
            <p className="text-meta text-muted-foreground">
              Este activo no está activo; la asociación se conserva, pero no podrás elegirlo de
              nuevo si lo cambias.
            </p>
          ) : null}
        </div>
        <div className="flex justify-end border-t pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setEditing(true);
              setFormError(null);
            }}
          >
            Cambiar activo
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section
      id={PANEL_ID}
      aria-labelledby={`${PANEL_ID}-title`}
      className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${PANEL_ID}-title`} className="text-base font-semibold">
          Activo base
        </h2>
        <p className="text-meta text-muted-foreground">
          Toda solicitud se trabaja sobre un activo base. Es requisito para priorizar.
          {processName ? (
            <>
              {' '}
              Proceso principal:{' '}
              <span className="font-medium text-foreground">{processName}</span>.
            </>
          ) : null}
        </p>
      </div>

      <form
        id={`${PANEL_ID}-form`}
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-4"
      >
        <Field
          id={`${PANEL_ID}-existing`}
          label="Activo existente"
          help={
            'Solo se pueden asociar activos en estado Activo y habilitados para tus procesos. Un activo en borrador lo activa el jefe de área en el módulo de Activos. ¿No aparece? Debe crearlo el jefe de área.' +
            (isJefe ? ' Los de la lista «No asociables» están en borrador o retirados.' : '')
          }
        >
          {(control) => (
            <Select value={assetId} onValueChange={setAssetId} disabled={disabled}>
              <SelectTrigger ref={triggerRef} {...control} aria-label="Activo existente">
                <SelectValue
                  placeholder={noAssociable ? 'No hay activos en estado Activo' : 'Elige un activo'}
                />
              </SelectTrigger>
              <SelectContent>
                {associable.map((asset) => (
                  <SelectItem key={asset.id} value={asset.id}>
                    {asset.name}
                  </SelectItem>
                ))}
                {notAssociable.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel>No asociables</SelectLabel>
                    {notAssociable.map((asset) => (
                      <SelectItem key={asset.id} value={asset.id} disabled>
                        {asset.name} · {asset.status === 'RETIRADO' ? 'retirado' : 'en borrador'}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
              </SelectContent>
            </Select>
          )}
        </Field>

        {noAssociable ? (
          <DisabledReason id={`${PANEL_ID}-sin-activos`}>
            Pide al jefe de área que active un activo para asociarlo.
          </DisabledReason>
        ) : null}

        <FormError id={PANEL_ID} message={formError} />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <Button asChild type="button" variant="link" size="sm" className="px-0">
            <Link href="/activos/catalogo">Crear activo en el módulo de Activos</Link>
          </Button>
          <div className="flex justify-end gap-2">
            {request.assetId !== null ? (
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => {
                  setEditing(false);
                  setFormError(null);
                }}
              >
                Cancelar
              </Button>
            ) : null}
            <Button
              type="submit"
              loading={submitting}
              disabled={disabled || noAssociable}
              aria-describedby={noAssociable ? `${PANEL_ID}-sin-activos` : undefined}
            >
              {submitting ? 'Asociando…' : 'Asociar activo'}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
