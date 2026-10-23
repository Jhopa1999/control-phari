'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type ThemeOption = 'light' | 'dark' | 'system';

const OPTIONS: ReadonlyArray<{ value: ThemeOption; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
];

/**
 * Control de tema (Fase D): menú accesible con «Claro», «Oscuro» y «Sistema».
 * El disparador es un botón de icono con `aria-label="Cambiar tema"` que
 * muestra el tema resuelto (sol/luna) o el monitor cuando la preferencia es
 * «Sistema». El ítem activo se marca con un check visible y `aria-current`.
 *
 * No añade persistencia: `useTheme` de next-themes ya guarda la preferencia
 * (clave `theme`) y resuelve el tema del sistema. Hasta montar no se conoce la
 * preferencia; para no desajustar la hidratación se muestra un icono neutro
 * estable (monitor) mientras tanto.
 */
export function ThemeToggle({ className }: { className?: string }): React.ReactElement {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Icono del disparador: antes de montar, un neutro estable; ya montado, el
  // monitor en «Sistema» o el icono del tema resuelto (sol/luna).
  const TriggerIcon = !mounted
    ? Monitor
    : theme === 'system'
      ? Monitor
      : resolvedTheme === 'dark'
        ? Moon
        : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Cambiar tema"
          className={className}
        >
          <TriggerIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = mounted && theme === value;
          return (
            <DropdownMenuItem
              key={value}
              aria-current={active ? 'true' : undefined}
              onSelect={() => setTheme(value)}
            >
              <Icon aria-hidden="true" />
              <span className="flex-1">{label}</span>
              {active ? <Check aria-hidden="true" className="text-muted-foreground" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
