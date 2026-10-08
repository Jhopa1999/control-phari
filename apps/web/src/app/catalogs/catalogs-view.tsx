'use client';

import * as React from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CatalogItem } from '@/lib/api-client';
import {
  CatalogError,
  createCatalogItem,
  listCatalogItems,
  updateCatalogItem,
  type CatalogFilters,
} from '@/lib/catalog';
import {
  CatalogFormDialog,
  type CatalogFormValues,
} from './catalog-form-dialog';

type ActiveFilter = 'all' | 'active' | 'inactive';
type LoadState = 'loading' | 'success' | 'error';

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function CatalogsView() {
  const [items, setItems] = React.useState<CatalogItem[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');

  // Filtros aplicados (los que se envian al backend).
  const [catalogInput, setCatalogInput] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>('all');

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CatalogItem | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  const buildFilters = React.useCallback((): CatalogFilters => {
    const filters: CatalogFilters = {};
    const catalog = catalogInput.trim();
    if (catalog) filters.catalog = catalog;
    if (activeFilter === 'active') filters.active = true;
    if (activeFilter === 'inactive') filters.active = false;
    return filters;
  }, [catalogInput, activeFilter]);

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      const data = await listCatalogItems(buildFilters());
      setItems(data);
      setState('success');
    } catch {
      setState('error');
    }
  }, [buildFilters]);

  // Carga inicial.
  React.useEffect(() => {
    void load();
    // Solo al montar; los filtros se aplican con el boton Aplicar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleApplyFilters(event: React.FormEvent) {
    event.preventDefault();
    void load();
  }

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(item: CatalogItem) {
    setEditing(item);
    setDialogOpen(true);
  }

  async function handleSubmit(values: CatalogFormValues) {
    setSubmitting(true);
    try {
      if (editing) {
        await updateCatalogItem(editing.id, {
          label: values.label,
          active: values.active,
          sortOrder: values.sortOrder,
        });
        toast.success('Elemento actualizado.');
      } else {
        await createCatalogItem({
          catalog: values.catalog,
          code: values.code,
          label: values.label,
          active: values.active,
          sortOrder: values.sortOrder,
        });
        toast.success('Elemento creado.');
      }
      setDialogOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      const message =
        err instanceof CatalogError
          ? err.message
          : 'Ocurrio un error inesperado.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(item: CatalogItem) {
    setTogglingId(item.id);
    try {
      await updateCatalogItem(item.id, { active: !item.active });
      toast.success(item.active ? 'Elemento desactivado.' : 'Elemento activado.');
      await load();
    } catch (err) {
      const message =
        err instanceof CatalogError
          ? err.message
          : 'Ocurrio un error inesperado.';
      toast.error(message);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Maestras</h1>
          <p className="text-sm text-muted-foreground">
            Administra los valores reutilizables utilizados por el portal.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus aria-hidden="true" />
          Nuevo elemento
        </Button>
      </header>

      <form
        onSubmit={handleApplyFilters}
        className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end"
      >
        <div className="grid flex-1 gap-2">
          <Label htmlFor="filter-catalog">Catalogo</Label>
          <Input
            id="filter-catalog"
            placeholder="Todos"
            value={catalogInput}
            onChange={(e) => setCatalogInput(e.target.value)}
          />
        </div>
        <div className="grid gap-2 sm:w-48">
          <Label htmlFor="filter-active">Estado</Label>
          <Select
            value={activeFilter}
            onValueChange={(value) => setActiveFilter(value as ActiveFilter)}
          >
            <SelectTrigger id="filter-active">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="inactive">Inactivos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Aplicar
        </Button>
      </form>

      <section aria-live="polite" className="rounded-lg border bg-card">
        {state === 'loading' ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No fue posible comunicarse con el servidor.
            </p>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm font-medium">No hay elementos todavia.</p>
            <p className="text-sm text-muted-foreground">
              Crea el primer valor de una maestra para empezar.
            </p>
            <Button onClick={openCreate}>
              <Plus aria-hidden="true" />
              Nuevo elemento
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Catalogo</TableHead>
                <TableHead>Codigo</TableHead>
                <TableHead>Etiqueta</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Orden</TableHead>
                <TableHead>Actualizado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.catalog}</TableCell>
                  <TableCell>{item.code}</TableCell>
                  <TableCell>{item.label}</TableCell>
                  <TableCell>
                    {item.active ? (
                      <Badge variant="success">Activo</Badge>
                    ) : (
                      <Badge variant="secondary">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell>{item.sortOrder}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(item.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(item)}
                      >
                        Editar
                      </Button>
                      <Button
                        variant={item.active ? 'secondary' : 'default'}
                        size="sm"
                        disabled={togglingId === item.id}
                        onClick={() => void handleToggleActive(item)}
                      >
                        {item.active ? 'Desactivar' : 'Activar'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <CatalogFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        editing={editing}
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
