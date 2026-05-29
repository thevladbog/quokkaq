import './global.css';
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className='antialiased' lang='en' suppressHydrationWarning>
      <head>
        <link href='/favicon.ico' rel='icon' type='image/x-icon' />
      </head>
      <body className='bg-fd-background text-fd-foreground flex min-h-dvh min-h-screen flex-col'>
        {children}
      </body>
    </html>
  );
}
