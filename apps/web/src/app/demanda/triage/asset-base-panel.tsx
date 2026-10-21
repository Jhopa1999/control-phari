'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Field, FieldSet, FormError } from '@/components/field';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioCards } from '@/components/ui/radio-cards';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Asset, CatalogItem, Request } from '@/lib/api-client';
import { associateAsset, TriageError } from '@/lib/triage';
import { AssetError, listAssets } from '@/lib/assets';
import { listCatalogItems } from '@/lib/catalog';

type Mode = 'existente' | 'nuevo';

/** Id de la sección y del formulario; el FormError lleva `${PANEL_ID}-error`. */
const PANEL_ID = 'triage-asset-base';
/** Valor «sin selección» para los Selects opcionales del activo nuevo. */
const NONE = '__none__';

const MODE_OPTIONS = [
  {
    value: 'existente' as const,
    label: 'Activo existente',
    description: 'Reutiliza un activo ya registrado (puede ser de otro proceso).',
  },
  {
    value: 'nuevo' as const,
    label: 'Activo nuevo',
    description: 'Crea el activo base bajo el proceso principal de la solicitud.',
  },
];

interface NewAssetValues {
  name: string;
  typeCode: string;
  technologyCode: string;
  sourceCode: string;
  frequencyCode: string;
  documentationRef: string;
  functionalDescription: string;
  dependencies: string;
}

const EMPTY_NEW: NewAssetValues = {
  name: '',
  typeCode: '',
  technologyCode: '',
  sourceCode: '',
  frequencyCode: '',
  documentationRef: '',
  functionalDescription: '',
  dependencies: '',
};

export interface AssetBasePanelProps {
  request: Request;
  /** Nombre del proceso principal de la solicitud (o null si está fuera de alcance). */
  processName: string | null;
  /** En REGISTRADA el panel se muestra pero no deja asociar todavía. */
  disabled: boolean;
  /** Se invoca tras asociar con éxito (la vista recarga la solicitud). */
  onAssociated: () => void;
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Control «Activo base» del triage (idea de negocio: toda solicitud se trabaja
 * sobre un activo base y el proceso no avanza sin él). Asocia un activo
 * existente XOR crea uno nuevo bajo el proceso principal de la solicitud. No
 * reimplementa reglas: el backend decide (400 XOR, 404 alcance, 409 estado) y
 * aquí solo se traduce su mensaje legible.
 */
export function AssetBasePanel({
  request,
  processName,
  disabled,
  onAssociated,
}: AssetBasePanelProps): React.ReactElement {
  const [assets, setAssets] = React.useState<Asset[]>([]);
  const [typeOptions, setTypeOptions] = React.useState<CatalogItem[]>([]);
  const [technologyOptions, setTechnologyOptions] = React.useState<CatalogItem[]>([]);
  const [sourceOptions, setSourceOptions] = React.useState<CatalogItem[]>([]);
  const [frequencyOptions, setFrequencyOptions] = React.useState<CatalogItem[]>([]);

  const [editing, setEditing] = React.useState(request.assetId === null);
  const [mode, setMode] = React.useState<Mode>('existente');
  const [assetId, setAssetId] = React.useState('');
  const [newAsset, setNewAsset] = React.useState<NewAssetValues>(EMPTY_NEW);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);

  // Si cambia la solicitud (o su activo), vuelve a mostrar el estado asociado.
  React.useEffect(() => {
    setEditing(request.assetId === null);
    setMode('existente');
    setAssetId('');
    setNewAsset(EMPTY_NEW);
    setNameError(null);
    setFormError(null);
  }, [request.id, request.assetId]);

  // Carga tolerante a fallo (como en triage/activos): si falla, los selectores
  // quedan vacíos y el control sigue operable con los datos disponibles.
  React.useEffect(() => {
    void listAssets()
      .then(setAssets)
      .catch(() => setAssets([]));
    const families = [
      ['ASSET_TYPE', setTypeOptions],
      ['TECHNOLOGY', setTechnologyOptions],
      ['SOURCE', setSourceOptions],
      ['FREQUENCY', setFrequencyOptions],
    ] as const;
    families.forEach(([catalog, set]) => {
      void listCatalogItems({ catalog, active: true })
        .then(set)
        .catch(() => set([]));
    });
  }, []);

  const associatedAsset = React.useMemo(
    () => assets.find((a) => a.id === request.assetId) ?? null,
    [assets, request.assetId],
  );

  function optionalSelect(
    id: string,
    label: string,
    placeholder: string,
    value: string,
    options: CatalogItem[],
    onChange: (code: string) => void,
  ): React.ReactElement {
    return (
      <Field id={id} label={label}>
        {(control) => (
          <Select
            value={value === '' ? NONE : value}
            onValueChange={(v) => onChange(v === NONE ? '' : v)}
          >
            <SelectTrigger {...control}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{placeholder}</SelectItem>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.code}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    );
  }

  function setNew<K extends keyof NewAssetValues>(key: K, value: NewAssetValues[K]): void {
    setNewAsset((v) => ({ ...v, [key]: value }));
    if (key === 'name') setNameError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (disabled || submitting) return;
    setFormError(null);

    if (mode === 'existente') {
      if (!assetId) {
        const message = 'Elige un activo existente.';
        setFormError(message);
        triggerRef.current?.focus();
        return;
      }
    } else if (newAsset.name.trim() === '') {
      setNameError('El nombre del activo es obligatorio.');
      nameRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'existente') {
        await associateAsset(request.id, { assetId });
      } else {
        await associateAsset(request.id, {
          newAsset: {
            name: newAsset.name.trim(),
            typeCode: trimOrUndefined(newAsset.typeCode),
            technologyCode: trimOrUndefined(newAsset.technologyCode),
            sourceCode: trimOrUndefined(newAsset.sourceCode),
            frequencyCode: trimOrUndefined(newAsset.frequencyCode),
            documentationRef: trimOrUndefined(newAsset.documentationRef),
            functionalDescription: trimOrUndefined(newAsset.functionalDescription),
            dependencies: trimOrUndefined(newAsset.dependencies),
          },
        });
      }
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
        </p>
      </div>

      <form
        id={`${PANEL_ID}-form`}
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-4"
      >
        <FieldSet id={`${PANEL_ID}-mode`} kind="radio" legend="Modo de asociación">
          <RadioCards
            name={`${PANEL_ID}-mode`}
            idPrefix={`${PANEL_ID}-mode`}
            options={MODE_OPTIONS}
            value={mode}
            onValueChange={(value) => {
              setMode(value as Mode);
              setFormError(null);
              setNameError(null);
            }}
            disabled={disabled}
          />
        </FieldSet>

        {mode === 'existente' ? (
          <Field id={`${PANEL_ID}-existing`} label="Activo existente">
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
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-meta text-muted-foreground">
              Se creará en el proceso principal de la solicitud:{' '}
              <span className="font-medium text-foreground">
                {processName ?? 'proceso fuera de tu alcance'}
              </span>
            </p>
            <Field id={`${PANEL_ID}-name`} label="Nombre" required error={nameError}>
              <Input
                ref={nameRef}
                value={newAsset.name}
                placeholder="Conector de mantenimiento"
                disabled={disabled}
                onChange={(e) => setNew('name', e.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              {optionalSelect(
                `${PANEL_ID}-type`,
                'Tipo',
                'Sin tipo',
                newAsset.typeCode,
                typeOptions,
                (v) => setNew('typeCode', v),
              )}
              {optionalSelect(
                `${PANEL_ID}-technology`,
                'Tecnología',
                'Sin tecnología',
                newAsset.technologyCode,
                technologyOptions,
                (v) => setNew('technologyCode', v),
              )}
              {optionalSelect(
                `${PANEL_ID}-source`,
                'Fuente',
                'Sin fuente',
                newAsset.sourceCode,
                sourceOptions,
                (v) => setNew('sourceCode', v),
              )}
              {optionalSelect(
                `${PANEL_ID}-frequency`,
                'Frecuencia',
                'Sin frecuencia',
                newAsset.frequencyCode,
                frequencyOptions,
                (v) => setNew('frequencyCode', v),
              )}
            </div>
            <Field id={`${PANEL_ID}-doc-ref`} label="Referencia documental">
              <Input
                value={newAsset.documentationRef}
                placeholder="Repositorio, ruta o enlace (opcional)"
                disabled={disabled}
                onChange={(e) => setNew('documentationRef', e.target.value)}
              />
            </Field>
            <Field id={`${PANEL_ID}-functional`} label="Descripción funcional">
              <Textarea
                value={newAsset.functionalDescription}
                placeholder="Qué resuelve este activo (opcional)"
                disabled={disabled}
                onChange={(e) => setNew('functionalDescription', e.target.value)}
              />
            </Field>
            <Field id={`${PANEL_ID}-dependencies`} label="Dependencias">
              <Textarea
                value={newAsset.dependencies}
                placeholder="Dependencias u observaciones (opcional)"
                disabled={disabled}
                onChange={(e) => setNew('dependencies', e.target.value)}
              />
            </Field>
          </div>
        )}

        <FormError id={PANEL_ID} message={formError} />

        <div className="flex justify-end gap-2 border-t pt-4">
          {request.assetId !== null ? (
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => {
                setEditing(false);
                setFormError(null);
                setNameError(null);
              }}
            >
              Cancelar
            </Button>
          ) : null}
          <Button type="submit" loading={submitting} disabled={disabled}>
            {submitting ? 'Asociando…' : 'Asociar activo'}
          </Button>
        </div>
      </form>
    </section>
  );
}
