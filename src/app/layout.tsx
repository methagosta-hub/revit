import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';
import { AuthProvider } from '@/components/auth/AuthProvider';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'DAHLIA Construction - Company Hub',
  description: 'Sistem manajemen perusahaan dan proyek DAHLIA Construction',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className={`${inter.className} bg-slate-50 text-slate-900 antialiased`}>
        <AuthProvider>
          <div className="flex min-h-screen flex-col xl:flex-row">
            <Sidebar />
            <main id="dahlia-main" className="flex min-w-0 max-w-full flex-1 flex-col">{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
