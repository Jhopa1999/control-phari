import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

/*
 * Marca GIBO · Governance & Data (steering 25-marca-gibo.md). Es el ÚNICO lugar
 * a tocar para el logo corporativo. Los activos oficiales viven en
 * /public/brand/svg (copia de docs/branding/gibo). La variante positiva va
 * sobre fondo claro y la negativa sobre fondo oscuro; se elige por CSS
 * (`dark:`), nunca con filtros de inversión. Los SVG llevan margen transparente
 * en su viewBox, por eso se dimensionan por la altura. La usan el menú lateral,
 * la barra móvil, el login, las pantallas de carga y la de error global.
 * Seguro para servidor (sin hooks ni Radix).
 */

const ISOTIPO = {
  positivo: '/brand/svg/isotipo/gibo-isotipo-positivo.svg',
  negativo: '/brand/svg/isotipo/gibo-isotipo-negativo.svg',
} as const;

const WORDMARK = {
  positivo: '/brand/svg/wordmark/gibo-wordmark-positivo.svg',
  negativo: '/brand/svg/wordmark/gibo-wordmark-negativo.svg',
} as const;

/** 'inverse': siempre la variante negativa (sobre el menú marino, en ambos temas). */
export type BrandTone = 'auto' | 'inverse';

interface ThemedImageProps {
  tone?: BrandTone;
  sources: { positivo: string; negativo: string };
  width: number;
  height: number;
  className: string;
}

/** Par de imágenes decorativas: una por tema, alternadas con `dark:`. */
function ThemedImage({ sources, width, height, className, tone = 'auto' }: ThemedImageProps): React.ReactElement {
  if (tone === 'inverse') {
    return <Image src={sources.negativo} alt="" width={width} height={height} unoptimized className={className} />;
  }
  return (
    <>
      <Image
        src={sources.positivo}
        alt=""
        width={width}
        height={height}
        unoptimized
        className={cn(className, 'dark:hidden')}
      />
      <Image
        src={sources.negativo}
        alt=""
        width={width}
        height={height}
        unoptimized
        className={cn(className, 'hidden dark:block')}
      />
    </>
  );
}

/**
 * Isotipo (tres nodos, una órbita) para espacios cuadrados: riel del menú,
 * pantallas de carga y error. Decorativo: el nombre lo aporta el texto vecino.
 */
export function BrandMark({
  className,
  tone = 'auto',
}: {
  className?: string;
  tone?: BrandTone;
}): React.ReactElement {
  return (
    <span aria-hidden="true" className={cn('flex size-9 shrink-0 items-center justify-center', className)}>
      <ThemedImage sources={ISOTIPO} width={304} height={304} className="size-full" tone={tone} />
    </span>
  );
}

export interface BrandNameProps {
  className?: string;
  /** 'md' en menús y barras; 'lg' en las pantallas de acceso. */
  size?: 'md' | 'lg';
  /** Muestra «Governance & Data» bajo el wordmark. Por defecto true. */
  showTagline?: boolean;
  /** 'inverse' sobre el menú marino; 'auto' en el resto. */
  tone?: BrandTone;
}

/**
 * Wordmark GIBO con su tagline. El wordmark ya incluye el aro del isotipo, así
 * que no debe ir junto a BrandMark. El nombre accesible es «GIBO».
 */
export function BrandName({
  className,
  size = 'md',
  showTagline = true,
  tone = 'auto',
}: BrandNameProps): React.ReactElement {
  return (
    <span className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <span aria-hidden="true" className="flex">
        <ThemedImage
          sources={WORDMARK}
          tone={tone}
          width={844}
          height={304}
          className={cn('w-auto max-w-none', size === 'lg' ? 'h-14' : 'h-7')}
        />
      </span>
      <span className="sr-only">GIBO</span>
      {showTagline ? (
        // pl-[3px] compensa el margen transparente del viewBox del wordmark (36/304 de su alto).
        <span
          className={cn(
            'truncate pl-[3px] text-xs',
            tone === 'inverse' ? 'text-sidebar-muted-foreground' : 'text-muted-foreground',
          )}
        >Governance &amp; Data</span>
      ) : null}
    </span>
  );
}
