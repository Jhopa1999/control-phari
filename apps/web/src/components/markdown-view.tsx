'use client';

import * as React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

export interface MarkdownViewProps {
  /** Markdown en texto plano; se escapa el HTML crudo (anti-XSS). */
  content: string;
  className?: string;
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

/**
 * Renderiza Markdown (GFM: tablas, task lists, autolinks, tachado) con las
 * clases del design system. No se habilita HTML crudo (sin `rehype-raw`): se
 * conserva el escape por defecto de `react-markdown` para evitar XSS.
 */
export function MarkdownView({ content, className }: MarkdownViewProps): React.ReactElement {
  return (
    <div className={cn('flex flex-col gap-3 text-sm wrap-break-word', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
