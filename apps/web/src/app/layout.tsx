import type { Metadata } from 'next';
import { Toaster } from '@/components/ui/sonner';
import { AppSidebar } from '@/components/app-sidebar';
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
          <div className="flex min-h-screen flex-col md:flex-row">
            <AppSidebar />
            <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
          </div>
        </ActorProvider>
        <Toaster />
      </body>
    </html>
  );
}
