'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Refleja en la URL (?requestId=) la solicitud elegida en las mesas de trabajo
 * (Triage, Priorización, Planificación y Controles), para compartir enlaces y
 * encadenar pasos (design §7.9 y §7.9.1). La fuente de verdad sigue siendo el
 * estado local de la vista: primero se fija el estado y después la URL.
 *
 * Usa useSearchParams: la página que lo usa envuelve la vista en <Suspense>.
 */
export function useRequestIdParam(): {
  requestId: string | null;
  setRequestId(id: string | null): void;
} {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  // `?requestId=` sin valor equivale a no tener selección.
  const requestId = searchParams.get('requestId') || null;

  const setRequestId = React.useCallback(
    (id: string | null) => {
      if (id) {
        router.replace(`${pathname}?requestId=${encodeURIComponent(id)}`, {
          scroll: false,
        });
      } else {
        router.replace(pathname, { scroll: false });
      }
    },
    [router, pathname],
  );

  return React.useMemo(
    () => ({ requestId, setRequestId }),
    [requestId, setRequestId],
  );
}
