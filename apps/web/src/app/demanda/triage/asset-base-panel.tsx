'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/field';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Asset, Request } from '@/lib/api-client';
import { associateAsset, TriageError } from '@/lib/triage';
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
  const [editing, setEditing] = React.useState(request.assetId === null);
  const [assetId, setAssetId] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const triggerRef = React.useRef<HTMLButtonElement>(null);

  // Si cambia la solicitud (o su activo), vuelve a mostrar el estado asociado.
  React.useEffect(() => {
    setEditing(request.assetId === null);
    setAssetId('');
    setFormError(null);
  }, [request.id, request.assetId]);

  // Carga tolerante a fallo: si falla, el selector queda vacío. La lista ya
  // viene filtrada por el backend a los activos visibles para el actor.
  React.useEffect(() => {
    void listAssets()
      .then(setAssets)
      .catch(() => setAssets([]));
  }, []);

  const associatedAsset = React.useMemo(
    () => assets.find((a) => a.id === request.assetId) ?? null,
    [assets, request.assetId],
  );

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
          help="Solo se listan activos habilitados para tus procesos. ¿No aparece? Debe crearlo el jefe de área en el módulo de Activos."
        >
          {(control) => (
            <Select value={assetId} onValueChange={setAssetId} disabled={disabled}>
              <SelectTrigger ref={triggerRef} {...control} aria-label="Activo existente">
                <SelectValue placeholder="Elige un activo" />
              </SelectTrigger>
              <SelectContent>
                {assets.map((asset) => (
                  <SelectItem key={asset.id} value={asset.id}>
                    {asset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

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
            <Button type="submit" loading={submitting} disabled={disabled}>
              {submitting ? 'Asociando…' : 'Asociar activo'}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
