import type { Metadata, Viewport } from 'next';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RouteGuard } from '@/components/route-guard';
import { ThemeProvider } from '@/components/theme-provider';
import { ActorProvider } from '@/lib/actor-context';
import { inter, montserrat } from './fonts';
import './globals.css';

// Marca GIBO: íconos y manifiesto desde public/brand (paquete de marca).
export const metadata: Metadata = {
  title: { default: 'GIBO', template: '%s · GIBO' },
  description: 'GIBO · Governance & Data. Portal interno.',
  icons: {
    icon: [
      { url: '/brand/app-icon/favicon.ico', sizes: '48x48' },
      { url: '/brand/app-icon/favicon.svg', type: 'image/svg+xml', sizes: 'any' },
    ],
    apple: '/brand/app-icon/apple-touch-icon.png',
  },
  manifest: '/brand/app-icon/site.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0F2557',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    // suppressHydrationWarning: next-themes escribe la clase de tema en <html>
    // antes de la hidratación (script anti-flash), lo que difiere del HTML del
    // servidor solo en ese atributo.
    <html lang="es" className={`${inter.variable} ${montserrat.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          <ActorProvider>
            <TooltipProvider delayDuration={300}>
              <RouteGuard>{children}</RouteGuard>
            </TooltipProvider>
          </ActorProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
