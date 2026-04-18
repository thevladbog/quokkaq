import { MARKETING_THEME_STORAGE_KEY } from './theme-constants';

/** Must match `MARKETING_THEME_STORAGE_KEY` in `theme-constants.ts` (literal is inlined for CodeQL). */
const THEME_STORAGE_KEY_LITERAL = 'quokkaq-marketing-theme';
if (MARKETING_THEME_STORAGE_KEY !== THEME_STORAGE_KEY_LITERAL) {
  throw new Error(
    'Theme bootstrap script key out of sync with theme-constants.ts (MARKETING_THEME_STORAGE_KEY)',
  );
}

/** Inline theme init — injected via `useServerInsertedHTML` in `MarketingThemeProvider` (React 19–safe). */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k='quokkaq-marketing-theme';var s=localStorage.getItem(k);var t=s==='light'||s==='dark'||s==='system'?s:'system';var sys=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var r=t==='system'?sys:t;var d=document.documentElement;d.classList.remove('light','dark');d.classList.add(r);d.style.colorScheme=r;}catch(e){}})();`;
