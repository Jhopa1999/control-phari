'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import type { MarkdownViewProps } from './markdown-view-content';

export type { MarkdownViewProps } from './markdown-view-content';

/**
 * `react-markdown` + `remark-gfm` pesan bastante y solo se usan en los
 * diálogos de documentos: se cargan bajo demanda, fuera del bundle inicial.
 * La implementación vive en markdown-view-content.tsx.
 */
const MarkdownViewContent = dynamic(
  () =>
    import('./markdown-view-content').then((mod) => mod.MarkdownViewContent),
  {
    ssr: false,
    loading: () => (
      <div role="status" aria-label="Cargando contenido" className="flex flex-col gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    ),
  },
);

/** Renderiza Markdown (GFM) con las clases del design system. */
export function MarkdownView({ content, className }: MarkdownViewProps): React.ReactElement {
  return <MarkdownViewContent content={content} className={className} />;
}
