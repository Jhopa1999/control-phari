'use client';

import * as React from 'react';
import { ListTree, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  DataTablePagination,
  ResultCount,
  SortableTableHead,
} from '@/components/data-table';
import { DataView, type DataViewState } from '@/components/data-view';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RowActions, RowActionsCell, type RowAction } from '@/components/row-actions';
import { StatusBadge } from '@/components/status-badge';
import { Toolbar } from '@/components/toolbar';
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
import { formatDateTime } from '@/lib/format';
import { compareNumber, compareText, type Comparator } from '@/lib/table-sort';
import { useClientTable } from '@/lib/use-client-table';
import { CatalogFormDialog, type CatalogFormValues } from './catalog-form-dialog';

type ActiveFilter = 'all' | 'active' | 'inactive';
type LoadState = 'loading' | 'success' | 'error';
type SortKey = 'catalog' | 'code' | 'label' | 'sortOrder';

const NOUN = { one: 'elemento', other: 'elementos' };
const COMPARATORS: Record<SortKey, Comparator<CatalogItem>> = {
  catalog: (a, b, direction) => compareText(a.catalog, b.catalog, direction),
  code: (a, b, direction) => compareText(a.code, b.code, direction),
  label: (a, b, direction) => compareText(a.label, b.label, direction),
  sortOrder: (a, b, direction) => compareNumber(a.sortOrder, b.sortOrder, direction),
};

function messageOf(err: unknown): string {
  return err instanceof CatalogError
    ? err.message
    : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

function isActiveFilter(value: string): value is ActiveFilter {
  return value === 'all' || value === 'active' || value === 'inactive';
}

/**
 * Maestras (design §11.22, patrón A). La usan /catalogs y
 * /administracion/maestras. Los filtros van al servidor y solo se aplican con
 * «Aplicar» (o Enter); orden y paginación en cliente sobre lo recibido.
 */
export function CatalogsView(): React.ReactElement {
  const [items, setItems] = React.useState<CatalogItem[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Valores de los filtros; se envían al backend al pulsar «Aplicar».
  const [catalogInput, setCatalogInput] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>('all');

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CatalogItem | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  const buildFilters = React.useCallback((): CatalogFilters => {
    const filters: CatalogFilters = {};
    const catalog = catalogInput.trim();
    if (catalog) filters.catalog = catalog;
    if (activeFilter === 'active') filters.active = true;
    if (activeFilter === 'inactive') filters.active = false;
    return filters;
  }, [catalogInput, activeFilter]);

  const loadData = React.useCallback(() => {
    return listCatalogItems(buildFilters())
      .then((data) => {
        setItems(data);
        setState('success');
      })
      .catch((err: unknown) => {
        setErrorMessage(messageOf(err));
        setState('error');
      });
  }, [buildFilters]);
  const load = React.useCallback(async () => {
    setState('loading');
    await loadData();
  }, [loadData]);

  // Carga inicial.
  React.useEffect(() => {
    void loadData();
    // Solo al montar; los filtros se aplican con el botón «Aplicar».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const table = useClientTable({
    rows: items,
    comparators: COMPARATORS,
    // Orden de la API por defecto.
    defaultSort: null,
    pageSize: 25,
  });

  function handleApplyFilters(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void load();
  }

  function openCreate(): void {
    setEditing(null);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(item: CatalogItem): void {
    setEditing(item);
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(values: CatalogFormValues): Promise<void> {
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        // Al editar se envían solo etiqueta, activo y orden.
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
      // Fallo: el diálogo sigue abierto, con el error en línea y el toast.
      const message = messageOf(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(item: CatalogItem): Promise<void> {
    setTogglingId(item.id);
    try {
      await updateCatalogItem(item.id, { active: !item.active });
      toast.success(item.active ? 'Elemento desactivado.' : 'Elemento activado.');
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setTogglingId(null);
    }
  }

  function rowActions(item: CatalogItem): RowAction[] {
    const toggleLabel = item.active ? 'Desactivar' : 'Activar';
    return [
      { key: 'edit', label: 'Editar', onSelect: () => openEdit(item), placement: 'inline' },
      {
        key: 'toggle',
        label: toggleLabel,
        placement: 'inline',
        busy: togglingId === item.id,
        busyLabel: toggleLabel,
        onSelect: () => void handleToggleActive(item),
      },
    ];
  }

  let viewState: DataViewState;
  if (state === 'loading') viewState = 'loading';
  else if (state === 'error') viewState = 'error';
  // Sin filtro en cliente: con o sin filtros de servidor, una lista vacía es el
  // estado vacío (el E2E lo espera también con filtros).
  else if (table.total === 0) viewState = 'empty';
  else viewState = 'ready';

  const newButton = (
    <Button type="button" onClick={openCreate}>
      <Plus aria-hidden="true" />
      Nuevo elemento
    </Button>
  );

  return (
    <PageLayout>
      <PageHeader
        title="Maestras"
        description="Valores reutilizables que usan los formularios del portal."
        actions={newButton}
      />

      <form onSubmit={handleApplyFilters}>
        <Toolbar
          label="Filtros de maestras"
          end={
            state !== 'error' ? (
              <ResultCount
                loading={state === 'loading'}
                total={table.total}
                filtered={table.filtered}
                noun={NOUN}
              />
            ) : null
          }
        >
          <div className="grid w-full gap-1.5 sm:w-auto">
            <Label htmlFor="filter-catalog">Catálogo</Label>
            <Input
              id="filter-catalog"
              placeholder="Todos"
              className="w-full sm:w-56"
              value={catalogInput}
              onChange={(e) => setCatalogInput(e.target.value)}
            />
          </div>
          <div className="grid w-full gap-1.5 sm:w-auto">
            <Label htmlFor="filter-active">Estado</Label>
            <Select
              value={activeFilter}
              onValueChange={(value) => {
                if (isActiveFilter(value)) setActiveFilter(value);
              }}
            >
              <SelectTrigger id="filter-active" className="w-full sm:w-40">
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
        </Toolbar>
      </form>

      <DataView
        state={viewState}
        loading={{ rows: 6, columns: 7 }}
        error={{
          title: 'No fue posible cargar los elementos.',
          message: errorMessage,
          onRetry: () => void load(),
        }}
        empty={{
          icon: ListTree,
          title: 'No hay elementos todavía.',
          description: 'Crea el primer valor de una maestra o ajusta los filtros.',
          action: newButton,
        }}
      >
        <Table density="compact" scrollLabel="Tabla de elementos de maestras">
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="Catálogo"
                sortKey="catalog"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <SortableTableHead
                label="Código"
                sortKey="code"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <SortableTableHead
                label="Etiqueta"
                sortKey="label"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <TableHead>Estado</TableHead>
              <SortableTableHead
                label="Orden"
                sortKey="sortOrder"
                sort={table.sort}
                onSort={table.toggleSort}
                align="right"
              />
              <TableHead>Actualizado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.pageRows.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium whitespace-nowrap">{item.catalog}</TableCell>
                <TableCell className="whitespace-nowrap">{item.code}</TableCell>
                <TableCell className="min-w-40">{item.label}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <StatusBadge kind="active" value={String(item.active)} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{item.sortOrder}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {formatDateTime(item.updatedAt)}
                </TableCell>
                <RowActionsCell>
                  <RowActions rowLabel={item.label} actions={rowActions(item)} />
                </RowActionsCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <DataTablePagination
          id="maestras-paginacion"
          page={table.page}
          pageCount={table.pageCount}
          from={table.from}
          to={table.to}
          filtered={table.filtered}
          pageSize={table.pageSize ?? 25}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          noun={NOUN}
        />
      </DataView>

      <CatalogFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            setFormError(null);
          }
        }}
        editing={editing}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={(values) => void handleSubmit(values)}
      />
    </PageLayout>
  );
}
