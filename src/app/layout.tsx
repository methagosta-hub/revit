import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';
import { AuthProvider } from '@/components/auth/AuthProvider';
import OperationsLiveHub from '@/components/common/OperationsLiveHub';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'JAVAWASTHU MANAGEMENT - Company Hub',
  description: 'Sistem manajemen perusahaan dan proyek JAVAWASTHU MANAGEMENT',
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
            <main id="dahlia-main" className="flex min-w-0 max-w-full flex-1 flex-col pb-12">{children}</main>
          </div>
          <OperationsLiveHub />
        </AuthProvider>
      </body>
    </html>
  );
}
