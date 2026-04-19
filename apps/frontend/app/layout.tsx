import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import TanStackQueryProvider from '../components/TanStackQueryProvider';
import { OtelBrowserInit } from '../components/OtelBrowserInit';
import { Toaster } from '../components/ui/sonner';
import { AuthProvider } from '../contexts/AuthContext';
import { ThemeProvider } from 'next-themes';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin']
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin']
});

export const metadata: Metadata = {
  title: 'QuokkaQ - Queue Management System',
  description: 'Multi-tenant queue management system for organizations',
  robots: {
    index: false,
    follow: false
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
        >
          <OtelBrowserInit />
          <TanStackQueryProvider>
            <Toaster />
            <AuthProvider>{children}</AuthProvider>
          </TanStackQueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
