import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Porão Vikings · Pedidos na mesa',
  description: 'Pedidos pagos na mesa, cozinha e bar em tempo real.',
  appleWebApp: { capable: true, title: 'Porão Vikings', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, themeColor: '#f6f2ea' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* fontes do tema cervejaria: títulos condensados e texto */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* letras: Arial em tudo (sem fontes externas) */}
      </head>
      <body>{children}</body>
    </html>
  );
}
