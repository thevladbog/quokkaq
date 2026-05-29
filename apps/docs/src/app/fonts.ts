import { Open_Sans, Poppins } from 'next/font/google';

export const fontSans = Open_Sans({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
  display: 'swap'
});

export const fontDisplay = Poppins({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '600', '700'],
  variable: '--font-display',
  display: 'swap'
});
