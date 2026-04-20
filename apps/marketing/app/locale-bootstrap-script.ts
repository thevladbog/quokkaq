import { MARKETING_LOCALE_STORAGE_KEY } from './theme-constants';

/** Must match `MARKETING_LOCALE_STORAGE_KEY` in `theme-constants.ts` (literal is inlined for CodeQL). */
const LOCALE_STORAGE_KEY_LITERAL = 'quokkaq-marketing-locale';
if (MARKETING_LOCALE_STORAGE_KEY !== LOCALE_STORAGE_KEY_LITERAL) {
  throw new Error(
    'Locale bootstrap script key out of sync with theme-constants.ts (MARKETING_LOCALE_STORAGE_KEY)'
  );
}

/**
 * До гидрации: если в localStorage сохранён en|ru, а URL с другим префиксом — заменяем путь.
 * При следующем полном запросе cookie NEXT_LOCALE может быть выставлена прокси.
 */
export const LOCALE_BOOTSTRAP_SCRIPT = `(function(){try{var k='quokkaq-marketing-locale';var s=localStorage.getItem(k);if(s!=='en'&&s!=='ru')return;var p=location.pathname;var m=p.match(/^\\/(en|ru)(\\/|$)/);if(!m)return;var cur=m[1];if(cur===s)return;var rest=p.slice(cur.length+1);if(rest.charAt(0)!=='/')rest='/'+rest;var next='/'+s+(rest==='/'?'':rest);if(next!==p)location.replace(next);}catch(e){}})();`;
