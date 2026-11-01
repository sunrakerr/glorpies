export type Theme = 'light' | 'dark';

export const THEME_KEY = 'glorpies-theme';
export const DEFAULT_THEME: Theme = 'dark';

/** Runs in <head> before the first paint: the saved theme, else dark, so there's no flash. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark')t='${DEFAULT_THEME}';document.documentElement.dataset.theme=t}catch(e){}`;
