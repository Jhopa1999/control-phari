'use client';

import * as React from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { ResultCount } from '@/components/data-table';
import { DataCardList } from '@/components/data-card-list';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { IdChip } from '@/components/id-chip';
import { InlineNotice } from '@/components/inline-notice';
import { StatusBadge } from '@/components/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CatalogItem, Document } from '@/lib/api-client';
import { listCatalogItems } from '@/lib/catalog';
import { listDocumentsPage } from '@/lib/documents';
import { formatDate } from '@/lib/format';

type LoadState = 'loading' | 'success' | 'error';

const NOUN = { one: 'documento', other: 'documentos' };
/** Tope de documentos que se piden para la pestaña; el resto se ve en Documentos. */
const PAGE_SIZE = 50;

export interface DocumentosTabProps {
  assetId: string;
}

/**
 * Pestaña «Documentos» de la ficha del activo (solo lectura): documentos del
 * activo (GET /documents?assetId=). Solo se muestra a quien tiene el módulo de
 * documentos; el alcance lo aplica la API.
 */
export function DocumentosTab({ assetId }: DocumentosTabProps): React.ReactElement {
  const [rows, setRows] = React.useState<Document[]>([]);
  const [total, setTotal] = React.useState(0);
  const [truncated, setTruncated] = React.useState(false);
  const [categories, setCategories] = React.useState<CatalogItem[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<unknown>(null);

  const loadData = React.useCallback(() => {
    return Promise.all([
      listDocumentsPage({ assetId, page: 1, pageSize: PAGE_SIZE }),
      // La categoría solo da un nombre legible: si falla, se muestra el código.
      listCatalogItems({ catalog: 'DOC_CATEGORY', active: true }).catch(() => [] as CatalogItem[]),
    ])
      .then(([page, cats]) => {
        setRows(page.rows);
        setTotal(page.total);
        setTruncated(page.truncated || page.total > page.rows.length);
        setCategories(cats);
        setState('success');
      })
      .catch((err: unknown) => {
        setErrorMessage(err);
        setState('error');
      });
  }, [assetId]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  function retry(): void {
    setState('loading');
    void loadData();
  }

  const categoryLabel = React.useCallback(
    (code: string | null | undefined): string => {
      if (!code) return '—';
      return categories.find((c) => c.code === code)?.label ?? code;
    },
    [categories],
  );

  if (state === 'loading') {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="rounded-xl bg-card shadow-card">
        <ErrorState
          title="No fue posible cargar los documentos del activo."
          error={errorMessage}
          onRetry={retry}
        />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-xl bg-card shadow-card">
        <EmptyState
          icon={FileText}
          title="Este activo aún no tiene documentos."
          description="Los documentos vinculados a este activo aparecerán aquí."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {truncated ? (
        <InlineNotice tone="info">
          Se muestran los primeros {rows.length} documentos.{' '}
          <Link href="/activos/documentos" className="text-link underline underline-offset-4">
            Abre Documentos
          </Link>{' '}
          para ver el resto.
        </InlineNotice>
      ) : null}
      <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
        <Table scrollLabel="Documentos de este activo">
          <TableCaption>Documentos de este activo.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Documento</TableHead>
              <TableHead className="hidden lg:table-cell">Categoría</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Actualizado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="min-w-56 max-w-[28rem]">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <IdChip code={doc.code} />
                    <span className="font-medium text-foreground wrap-break-word">{doc.title}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {categoryLabel(doc.categoryCode)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <StatusBadge kind="document" value={doc.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(doc.updatedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <DataCardList
        label="Documentos de este activo"
        rows={rows}
        getKey={(doc) => doc.id}
        card={(doc) => ({
          code: <IdChip code={doc.code} />,
          title: (
            <span className="inline-flex min-h-11 items-center text-sm font-medium wrap-break-word">
              {doc.title}
            </span>
          ),
          badges: [<StatusBadge key="status" kind="document" value={doc.status} />],
          meta: [
            { label: 'Categoría', value: categoryLabel(doc.categoryCode) },
            { label: 'Actualizado', value: formatDate(doc.updatedAt) },
          ],
        })}
      />
      <ResultCount loading={false} total={total} filtered={total} noun={NOUN} />
    </div>
  );
}
