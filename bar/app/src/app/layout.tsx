import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vikings Restaurante · Pedidos na mesa',
  description: 'Pedidos pagos na mesa, cozinha e bar em tempo real.',
  appleWebApp: { capable: true, title: 'Vikings', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, themeColor: '#f6f2ea' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* fontes do tema cervejaria: títulos condensados e texto */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@200..600&family=Onest:wght@300..700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
