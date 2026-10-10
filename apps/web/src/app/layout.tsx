import type { Metadata } from 'next';
import { Toaster } from '@/components/ui/sonner';
import { RouteGuard } from '@/components/route-guard';
import { ActorProvider } from '@/lib/actor-context';
import './globals.css';
export const metadata: Metadata = {
  title: 'Portal del area',
  description: 'Portal interno del area Analitica (control-phari).',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="es">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ActorProvider>
          <RouteGuard>{children}</RouteGuard>
        </ActorProvider>
        <Toaster />
      </body>
    </html>
  );
}
