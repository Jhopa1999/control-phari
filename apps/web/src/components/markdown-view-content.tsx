'use client';

import * as React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { classifyLink } from '@/lib/assistant-format';
import { cn } from '@/lib/utils';

export interface MarkdownViewProps {
  /** Markdown en texto plano; se escapa el HTML crudo (anti-XSS). */
  content: string;
  className?: string;
  /**
   * chat: respuestas del asistente (texto de lectura, enlaces internos con
   * next/link, tablas con scroll enfocable, sin h1/h2). default no cambia.
   */
  variant?: 'default' | 'chat';
}

/**
 * Mapa de etiquetas → clases Tailwind del design system. Se usa el prop
 * `components` de `react-markdown` porque no existe `@tailwindcss/typography`.
 * En los render props se destructura solo lo que se usa (noUnusedParameters).
 */
const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-2 text-xl font-semibold tracking-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-2 text-lg font-semibold tracking-tight">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="mt-1 text-base font-semibold">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-1 text-sm font-semibold">{children}</h4>,
  p: ({ children }) => (
    <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="ml-5 list-disc space-y-1 text-sm text-muted-foreground marker:text-muted-foreground">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="ml-5 list-decimal space-y-1 text-sm text-muted-foreground marker:text-muted-foreground">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-md border bg-muted/60 p-3 text-sm [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-4 text-sm text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <table className="block w-full overflow-x-auto border-collapse text-sm">
      {children}
    </table>
  ),
  thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-border last:border-0">{children}</tr>
  ),
  th: ({ children }) => <th className="px-3 py-2 text-left font-semibold">{children}</th>,
  td: ({ children }) => (
    <td className="px-3 py-2 align-top text-muted-foreground">{children}</td>
  ),
  hr: () => <hr className="my-2 border-border" />,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
};

const LINK_CLASS =
  'text-link underline underline-offset-4 hover:text-link/80 focus-visible:outline-2 focus-visible:outline-ring';

/**
 * Variante chat: parte del mapa por defecto y ajusta lo que cambia en una
 * conversación. Los enlaces solo se activan si son rutas del portal o
 * http(s); javascript:, data: y similares se muestran como texto.
 */
const chatComponents: Components = {
  ...components,
  // Nunca h1/h2 dentro del chat: rompería la jerarquía de la página.
  h1: ({ children }) => <h3 className="mt-1 text-base font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-1 text-base font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-1 text-sm font-semibold">{children}</h4>,
  h4: ({ children }) => <h4 className="mt-1 text-sm font-semibold">{children}</h4>,
  p: ({ children }) => <p className="text-sm leading-relaxed text-foreground">{children}</p>,
  ul: ({ children }) => (
    <ul className="ml-5 list-disc space-y-1 text-sm leading-relaxed text-foreground marker:text-muted-foreground">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="ml-5 list-decimal space-y-1 text-sm leading-relaxed text-foreground marker:text-muted-foreground">
      {children}
    </ol>
  ),
  a: ({ children, href }) => {
    const kind = classifyLink(href);
    if (kind === 'internal' && href) {
      return (
        <Link href={href} className={LINK_CLASS}>
          {children}
        </Link>
      );
    }
    if (kind === 'external') {
      return (
        <a href={href} target="_blank" rel="noreferrer noopener" className={LINK_CLASS}>
          {children}
          <ExternalLink className="ml-1 inline size-3 align-baseline" aria-hidden="true" />
          <span className="sr-only"> (se abre en una pestaña nueva)</span>
        </a>
      );
    }
    return <span>{children}</span>;
  },
  pre: ({ children }) => (
    <pre
      tabIndex={0}
      className="overflow-x-auto rounded-md border bg-muted/60 p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring [&>code]:bg-transparent [&>code]:p-0"
    >
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div
      role="region"
      aria-label="Tabla de la respuesta"
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-ring"
    >
      <table className="w-full border-collapse text-sm tabular-nums">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/40">{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 align-top text-foreground first:min-w-40 first:whitespace-normal">
      {children}
    </td>
  ),
};

/**
 * Renderiza Markdown (GFM: tablas, task lists, autolinks, tachado) con las
 * clases del design system. No se habilita HTML crudo (sin ehype-raw): se
 * conserva el escape por defecto de eact-markdown para evitar XSS.
 */
export function MarkdownViewContent({
  content,
  className,
  variant = 'default',
}: MarkdownViewProps): React.ReactElement {
  const isChat = variant === 'chat';
  return (
    <div
      className={cn(
        'flex flex-col text-sm wrap-break-word',
        isChat ? 'gap-2.5' : 'gap-3',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={isChat ? chatComponents : components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}