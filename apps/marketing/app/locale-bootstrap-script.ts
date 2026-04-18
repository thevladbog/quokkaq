import { MARKETING_LOCALE_STORAGE_KEY } from './theme-constants';

/**
 * До гидрации: если в localStorage сохранён en|ru, а URL с другим префиксом — заменяем путь.
 * Cookie NEXT_LOCALE выставит nextra proxy при следующем запросе.
 */
export const LOCALE_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(MARKETING_LOCALE_STORAGE_KEY)};var s=localStorage.getItem(k);if(s!=='en'&&s!=='ru')return;var p=location.pathname;var m=p.match(/^\\/(en|ru)(\\/|$)/);if(!m)return;var cur=m[1];if(cur===s)return;var rest=p.slice(cur.length+1);if(rest.charAt(0)!=='/')rest='/'+rest;var next='/'+s+(rest==='/'?'':rest);if(next!==p)location.replace(next);}catch(e){}})();`;
