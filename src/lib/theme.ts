export type Theme = 'light' | 'dark';

export const THEME_KEY = 'glorpies-theme';

/** Runs in <head> before the first paint: the saved theme, else the system's, so there's no flash. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}`;
