import { MARKETING_THEME_STORAGE_KEY } from './theme-constants';

/** Inline theme init — injected via `useServerInsertedHTML` in `MarketingThemeProvider` (React 19–safe). */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(MARKETING_THEME_STORAGE_KEY)};var s=localStorage.getItem(k);var t=s==='light'||s==='dark'||s==='system'?s:'system';var sys=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var r=t==='system'?sys:t;var d=document.documentElement;d.classList.remove('light','dark');d.classList.add(r);d.style.colorScheme=r;}catch(e){}})();`;
