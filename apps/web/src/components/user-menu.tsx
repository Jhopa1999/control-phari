'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useActor } from '@/lib/actor-context';
import { initialsOf } from '@/lib/user-initials';
import { cn } from '@/lib/utils';

function Avatar({ name, className }: { name: string | null | undefined; className?: string }): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-link',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * Menú del usuario autenticado (esquina superior derecha, escritorio y móvil):
 * muestra nombre e identificador y permite cerrar sesión, siempre tras una
 * confirmación. Solo existe en modo jwt; en dev-header la identidad se elige
 * con el selector del menú lateral y este componente no se pinta.
 */
export function UserMenu({ className }: { className?: string }): React.ReactElement | null {
  const router = useRouter();
  const { authMode, authUser, logout } = useActor();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  if (authMode !== 'jwt') return null;

  const userName = authUser?.name ?? 'Usuario';

  function handleLogout(): void {
    setConfirmOpen(false);
    logout();
    router.replace('/login');
  }

  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-9 gap-2 rounded-full px-1 pointer-coarse:min-h-10 sm:pr-2.5"
            aria-label={`Menú de usuario: ${userName}`}
          >
            <Avatar name={authUser?.name} />
            <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{userName}</span>
            <ChevronDown aria-hidden="true" className="hidden size-4 text-muted-foreground sm:block" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <div role="group" aria-label="Usuario autenticado" className="flex items-center gap-3 px-2 py-2">
            <Avatar name={authUser?.name} className="size-10 text-sm" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{userName}</span>
              {authUser?.identifier ? (
                <span className="truncate text-xs text-muted-foreground">{authUser.identifier}</span>
              ) : null}
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem tone="danger" onSelect={() => setConfirmOpen(true)}>
            <LogOut aria-hidden="true" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>¿Cerrar sesión?</DialogTitle>
            <DialogDescription>
              Saldrás del portal y tendrás que iniciar sesión de nuevo para continuar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleLogout}>
              Cerrar sesión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
