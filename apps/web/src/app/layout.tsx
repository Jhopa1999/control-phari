import type { Metadata } from 'next';
import Link from 'next/link';
import { Boxes, LayoutGrid } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Plantilla de Portales',
  description: 'Plantilla reutilizable para portales internos.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="es">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="flex shrink-0 flex-col border-b bg-card md:w-64 md:border-b-0 md:border-r">
            <div className="flex items-center gap-2 px-6 py-4">
              <Boxes className="size-5 text-primary" aria-hidden="true" />
              <span className="font-semibold">Portal Interno</span>
            </div>
            <nav aria-label="Navegacion principal" className="px-3 pb-4">
              <Link
                href="/catalogs"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                <LayoutGrid className="size-4" aria-hidden="true" />
                Maestras
              </Link>
            </nav>
          </aside>
          <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
