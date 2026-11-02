'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Field, FieldSet, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AiModelCatalogEntry, CreateAiModel, UpdateAiModel } from '@/lib/api-client';
import { ApiError, createAiModel, updateAiModel } from '@/lib/ai';
import { hasModelErrors, validateModel, type ModelErrors } from './ia-validation';
import { CAPABILITIES, TIERS } from './modelo-badges';

type Tier = AiModelCatalogEntry['tier'];

interface ModeloDialogProps {
  /** null = alta de un modelo nuevo; con valor = edición (el id no se cambia). */
  model: AiModelCatalogEntry | null;
  onClose: () => void;
  onSaved: (saved: AiModelCatalogEntry) => void;
}

function priceValue(text: string): number | null {
  const value = text.trim().replace(',', '.');
  return value === '' ? null : Number(value);
}

/**
 * Alta y edición de un modelo del catálogo. El id es inmutable tras el alta.
 * Precio vacío = «sin precio»: el consumo del modelo no suma al costo. Se monta
 * al abrir y se desmonta al cerrar, así cada apertura parte del modelo recibido.
 */
export function ModeloDialog({ model, onClose, onSaved }: ModeloDialogProps): React.ReactElement {
  const creating = model === null;
  const [modelId, setModelId] = React.useState(model?.id ?? '');
  const [label, setLabel] = React.useState(model?.label ?? '');
  const [tier, setTier] = React.useState<Tier>(model?.tier ?? 'other');
  const [caps, setCaps] = React.useState({
    supportsTemperature: model?.supportsTemperature ?? true,
    supportsTools: model?.supportsTools ?? false,
    supportsVision: model?.supportsVision ?? false,
    supportsDocuments: model?.supportsDocuments ?? false,
  });
  const [inputPrice, setInputPrice] = React.useState(
    model?.inputUsdPerMTok == null ? '' : String(model.inputUsdPerMTok),
  );
  const [outputPrice, setOutputPrice] = React.useState(
    model?.outputUsdPerMTok == null ? '' : String(model.outputUsdPerMTok),
  );
  const [sortOrder, setSortOrder] = React.useState(String(model?.sortOrder ?? 100));
  const [errors, setErrors] = React.useState<ModelErrors>({});
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const validation = validateModel({ modelId, label, inputPrice, outputPrice, sortOrder }, creating);
    if (hasModelErrors(validation)) {
      setErrors(validation);
      return;
    }
    setErrors({});
    setSaving(true);
    const common: UpdateAiModel = {
      label: label.trim(),
      tier,
      ...caps,
      inputUsdPerMTok: priceValue(inputPrice),
      outputUsdPerMTok: priceValue(outputPrice),
      sortOrder: Number(sortOrder),
    };
    try {
      const saved = creating
        ? await createAiModel({ ...common, modelId: modelId.trim(), label: label.trim() } as CreateAiModel)
        : await updateAiModel(model.id, common);
      toast.success(creating ? 'Modelo creado.' : 'Modelo guardado.');
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setErrors({ modelId: 'Ya existe un modelo con ese ID.' });
      } else {
        const message = err instanceof ApiError ? err.message : 'Ocurrió un error inesperado.';
        setErrors({ form: message });
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open && !saving ? onClose() : undefined)}>
      <DialogContent size="md" onInteractOutside={(e) => e.preventDefault()}>
        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{creating ? 'Nuevo modelo' : `Editar ${model.label}`}</DialogTitle>
            <DialogDescription>
              Los agentes solo pueden usar modelos habilitados del catálogo.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <FormError id="ai-model-form" message={errors.form ?? null} />
            <Field
              id="ai-model-id"
              label="ID del modelo"
              required={creating}
              help={
                creating
                  ? 'ID invocable en Bedrock (perfil de inferencia). No se podrá cambiar después.'
                  : 'No se puede cambiar.'
              }
              error={errors.modelId}
            >
              <Input
                value={modelId}
                readOnly={!creating}
                className={creating ? 'font-mono' : 'bg-muted font-mono'}
                autoComplete="off"
                onChange={(e) => {
                  setModelId(e.target.value);
                  setErrors((p) => ({ ...p, modelId: undefined }));
                }}
              />
            </Field>
            <Field id="ai-model-label" label="Nombre visible" required error={errors.label}>
              <Input
                value={label}
                autoComplete="off"
                onChange={(e) => {
                  setLabel(e.target.value);
                  setErrors((p) => ({ ...p, label: undefined }));
                }}
              />
            </Field>
            <Field id="ai-model-tier" label="Nivel">
              {(control) => (
                <Select value={tier} onValueChange={(v) => setTier(v as Tier)}>
                  <SelectTrigger {...control}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIERS) as Tier[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIERS[t].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <FieldSet id="ai-model-caps" kind="checkbox" legend="Capacidades">
              <div className="grid grid-cols-2 gap-2">
                {CAPABILITIES.map((cap) => (
                  <label
                    key={cap.key}
                    className="flex min-h-8 cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={caps[cap.key]}
                      onChange={(e) => setCaps((p) => ({ ...p, [cap.key]: e.target.checked }))}
                    />
                    {cap.label}
                  </label>
                ))}
              </div>
            </FieldSet>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="ai-model-input-price"
                label="Entrada (USD por millón de tokens)"
                help="Vacío = sin precio: no suma al costo."
                error={errors.inputPrice}
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.0001"
                  value={inputPrice}
                  onChange={(e) => {
                    setInputPrice(e.target.value);
                    setErrors((p) => ({ ...p, inputPrice: undefined }));
                  }}
                />
              </Field>
              <Field
                id="ai-model-output-price"
                label="Salida (USD por millón de tokens)"
                help="Vacío = sin precio: no suma al costo."
                error={errors.outputPrice}
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.0001"
                  value={outputPrice}
                  onChange={(e) => {
                    setOutputPrice(e.target.value);
                    setErrors((p) => ({ ...p, outputPrice: undefined }));
                  }}
                />
              </Field>
            </div>
            <Field
              id="ai-model-sort-order"
              label="Orden"
              help="Los menores aparecen primero."
              error={errors.sortOrder}
            >
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={sortOrder}
                onChange={(e) => {
                  setSortOrder(e.target.value);
                  setErrors((p) => ({ ...p, sortOrder: undefined }));
                }}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              {creating ? 'Crear modelo' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
