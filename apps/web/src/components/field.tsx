'use client';

import * as React from 'react';
import { CircleAlert } from 'lucide-react';
import { InlineNotice } from '@/components/inline-notice';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/*
 * Campos de formulario (design §7.7 y §9).
 *
 * - Obligatorio: asterisco aria-hidden + aria-required en el control. NUNCA el
 *   atributo HTML `required`: activaría la validación nativa del navegador y
 *   cambiaría el comportamiento (el E2E de Maestras espera el mensaje propio).
 * - Validación al enviar; todos los errores a la vez; el error de un campo se
 *   limpia al editarlo.
 * - Regla combinada (NIT 6b): cuando un mensaje cubre varios campos (p. ej.
 *   «Catálogo y código son obligatorios.»), va en FormError, y aria-invalid y el
 *   aria-describedby hacia ese FormError se ponen SOLO en los campos implicados
 *   que incumplen la regla, nunca en los que ya están bien. Con children como
 *   elemento, Field conserva el aria-describedby y el aria-invalid propios del
 *   control; con children como función, la vista los añade a las props.
 * - Los errores del backend no marcan campos: van en FormError y se conserva
 *   el toast.
 */

/** Props que Field pasa al control. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}

type FieldElementProps = Partial<FieldControlProps>;

export interface FieldProps {
  id: string;
  label: React.ReactNode;
  /** Asterisco aria-hidden + aria-required en el control. */
  required?: boolean;
  /** Ayuda bajo el control; id `${id}-help`. */
  help?: React.ReactNode;
  /** Error de una regla de este campo; id `${id}-error`. */
  error?: string | null;
  labelHidden?: boolean;
  className?: string;
  /**
   * Elemento: se clona fusionando aria-describedby. Función: se llama con las
   * props del control (en Select, se esparcen en SelectTrigger).
   */
  children: React.ReactElement<FieldElementProps> | ((control: FieldControlProps) => React.ReactNode);
}

function joinIds(...ids: Array<string | undefined>): string | undefined {
  const joined = ids.filter(Boolean).join(' ');
  return joined === '' ? undefined : joined;
}

function FieldMessage({ id, error, children }: { id: string; error?: boolean; children: React.ReactNode }): React.ReactElement {
  if (error) {
    return (
      <p id={id} className="flex gap-1 text-meta text-danger">
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>{children}</span>
      </p>
    );
  }
  return (
    <p id={id} className="text-meta text-muted-foreground">
      {children}
    </p>
  );
}

/** Etiqueta + control + ayuda + error, enlazados por id. */
export function Field({
  id,
  label,
  required = false,
  help,
  error,
  labelHidden = false,
  className,
  children,
}: FieldProps): React.ReactElement {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control: FieldControlProps = {
    id,
    'aria-describedby': joinIds(helpId, errorId),
    'aria-invalid': error ? true : undefined,
    'aria-required': required ? true : undefined,
  };
  let rendered: React.ReactNode;
  if (typeof children === 'function') {
    rendered = children(control);
  } else {
    const own = children.props;
    rendered = React.cloneElement(children, {
      id,
      'aria-describedby': joinIds(helpId, errorId, own['aria-describedby']),
      'aria-invalid': error ? true : own['aria-invalid'],
      'aria-required': required ? true : own['aria-required'],
    });
  }
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id} className={labelHidden ? 'sr-only' : undefined}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      {rendered}
      {help ? <FieldMessage id={`${id}-help`}>{help}</FieldMessage> : null}
      {error ? (
        <FieldMessage id={`${id}-error`} error>
          {error}
        </FieldMessage>
      ) : null}
    </div>
  );
}

export interface FieldSetProps {
  id: string;
  legend: React.ReactNode;
  /** 'radio' → role="radiogroup"; 'checkbox' → grupo de casillas (rol implícito group). */
  kind?: 'radio' | 'checkbox';
  required?: boolean;
  /** Id `${id}-help`. */
  help?: React.ReactNode;
  /** Id `${id}-error`. */
  error?: string | null;
  /** RadioCards o lista de Checkbox. */
  children: React.ReactNode;
}

/**
 * Grupo de radios o casillas con legend visible. aria-required solo en
 * radiogroup (no es válido en group): las listas de casillas obligatorias
 * añaden «(obligatorio)» sr-only a la legend.
 */
export function FieldSet({
  id,
  legend,
  kind,
  required = false,
  help,
  error,
  children,
}: FieldSetProps): React.ReactElement {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <fieldset
      id={id}
      role={kind === 'radio' ? 'radiogroup' : undefined}
      aria-labelledby={`${id}-legend`}
      aria-required={kind === 'radio' && required ? true : undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={joinIds(helpId, errorId)}
      className="grid gap-1.5"
    >
      <legend id={`${id}-legend`} className="mb-1.5 text-meta font-medium">
        {legend}
        {required ? <span aria-hidden="true"> *</span> : null}
        {required && kind === 'checkbox' ? <span className="sr-only"> (obligatorio)</span> : null}
      </legend>
      {children}
      {help ? <FieldMessage id={`${id}-help`}>{help}</FieldMessage> : null}
      {error ? (
        <FieldMessage id={`${id}-error`} error>
          {error}
        </FieldMessage>
      ) : null}
    </fieldset>
  );
}

export interface FormErrorProps {
  /** Id del formulario: el aviso lleva `${id}-error`. */
  id: string;
  message: string | null;
}

/**
 * Error de una regla combinada o del backend (role=alert), con id
 * `${formId}-error`: destino del aria-describedby de los campos implicados que
 * incumplen la regla (ver el comentario del inicio).
 */
export function FormError({ id, message }: FormErrorProps): React.ReactElement | null {
  if (!message) return null;
  return (
    <InlineNotice id={`${id}-error`} tone="danger" role="alert">
      {message}
    </InlineNotice>
  );
}

/** «Los campos con * son obligatorios.» */
export function RequiredHint(): React.ReactElement {
  return <p className="text-meta text-muted-foreground">Los campos con * son obligatorios.</p>;
}
