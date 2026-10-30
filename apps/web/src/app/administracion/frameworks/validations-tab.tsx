'use client';

import * as React from 'react';
import { ClipboardCheck, ExternalLink, Plus } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { InlineNotice } from '@/components/inline-notice';
import { RowActionsCell } from '@/components/row-actions';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CatalogItem } from '@/lib/api-client';
import { formatCount, formatDateTime, orDash } from '@/lib/format';
import type { GateValidationSummary, ValidationRecord } from '@/lib/governance';

const VALIDATION_NOUN = { one: 'validación', other: 'validaciones' };
const BLOCKING_NOUN = { one: 'bloqueante sin resolver', other: 'bloqueantes sin resolver' };

function catalogLabel(items: CatalogItem[], code: string): string {
  return items.find((item) => item.code === code)?.label ?? code;
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Evidencia según su tipo: enlace (solo http/https), texto, documento del expediente o «—». */
function Evidence({ record }: { record: ValidationRecord }): React.ReactElement {
  const ref = record.evidenceRef;
  if (ref && isWebUrl(ref)) {
    return (
      <a
        href={ref}
        target="_blank"
        rel="noopener noreferrer"
        title={ref}
        className="inline-flex items-center gap-1 rounded-sm text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Enlace
        <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="sr-only"> (se abre en una pestaña nueva)</span>
      </a>
    );
  }
  if (ref) return <span className="wrap-break-word">{ref}</span>;
  if (record.evidenceDocumentId) return <span>Documento del expediente</span>;
  return <span>—</span>;
}

export interface ValidationsTabProps {
  validations: ValidationRecord[];
  typeCatalog: CatalogItem[];
  resultCatalog: CatalogItem[];
  /** Resumen de GC4 (validationSummary); null si el tablero no lo trae. */
  gc4Summary: GateValidationSummary | null;
  canReview: boolean;
  busy: boolean;
  /** Validación cuyo bloqueo se está resolviendo. */
  resolvingId: string | null;
  onRegister: () => void;
  onResolve: (validationId: string) => void;
}

/** Pestaña «Validaciones» de Controles de gobierno (design §11.18). */
export function ValidationsTab({
  validations,
  typeCatalog,
  resultCatalog,
  gc4Summary,
  canReview,
  busy,
  resolvingId,
  onRegister,
  onResolve,
}: ValidationsTabProps): React.ReactElement {
  const registerButton = (
    <Button type="button" onClick={onRegister}>
      <Plus aria-hidden="true" />
      Registrar validación
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-meta text-muted-foreground">
          Evidencias y pruebas del expediente. Registrarlas no aprueba ningún control.
        </p>
        {registerButton}
      </div>

      {gc4Summary ? (
        <InlineNotice tone={gc4Summary.approvable ? 'success' : 'info'}>
          {`Resumen GC4: ${formatCount(gc4Summary.total, VALIDATION_NOUN)}; ${formatCount(
            gc4Summary.blockingUnresolved,
            BLOCKING_NOUN,
          )}; ${
            gc4Summary.hasMandatoryApproving
              ? 'validación obligatoria presente'
              : 'falta la validación obligatoria'
          }. ${gc4Summary.approvable ? 'Aprobable según el servidor' : 'Aún no es aprobable'}.`}
        </InlineNotice>
      ) : null}

      <div className="overflow-hidden rounded-lg border bg-card">
        {validations.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="Aún no hay validaciones registradas."
            description="Registra las pruebas y evidencias de la solicitud para que el servidor evalúe GC4."
          />
        ) : (
          <Table scrollLabel="Tabla de validaciones">
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Caso</TableHead>
                <TableHead>Versión</TableHead>
                <TableHead>Ambiente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Bloqueante</TableHead>
                <TableHead>Evidencia</TableHead>
                {canReview ? <TableHead className="text-right">Acciones</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {validations.map((record) => {
                const unresolved = record.blocking && !record.blockingResolved;
                return (
                  <TableRow key={record.id}>
                    <TableCell className="whitespace-nowrap">
                      {catalogLabel(typeCatalog, record.validationTypeCode)}
                    </TableCell>
                    <TableCell className="min-w-48 max-w-[24rem] wrap-break-word">{record.testCase}</TableCell>
                    <TableCell className="whitespace-nowrap">{orDash(record.version)}</TableCell>
                    <TableCell className="whitespace-nowrap">{orDash(record.environment)}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatDateTime(record.executedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {catalogLabel(resultCatalog, record.resultCode)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {record.blocking ? (
                        <StatusBadge
                          kind="blocking"
                          value={record.blockingResolved ? 'RESUELTO' : 'SIN_RESOLVER'}
                        />
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-32 max-w-[16rem]">
                      <Evidence record={record} />
                    </TableCell>
                    {canReview ? (
                      <RowActionsCell>
                        {unresolved ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            loading={resolvingId === record.id}
                            disabled={busy}
                            onClick={() => onResolve(record.id)}
                          >
                            Resolver bloqueo
                          </Button>
                        ) : (
                          <span className="px-3 text-muted-foreground">—</span>
                        )}
                      </RowActionsCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
