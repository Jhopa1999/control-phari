import * as React from 'react';
import { cn } from '@/lib/utils';

// Mismos estilos que Input; crece con el contenido hasta 384 px y luego desplaza.
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        'flex min-h-20 max-h-96 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm field-sizing-content placeholder:text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:border-ring aria-invalid:border-danger aria-invalid:focus-visible:outline-danger disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground read-only:bg-muted/60',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
