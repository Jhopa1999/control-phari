import * as React from 'react';
import { cn } from '@/lib/utils';

// Deshabilitado sin opacidad: los campos de solo lectura deben seguir legibles (§6).
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:border-ring aria-invalid:border-danger aria-invalid:focus-visible:outline-danger disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground read-only:bg-muted/60 pointer-coarse:h-10',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
