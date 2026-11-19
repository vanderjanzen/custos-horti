// Dark/Light-Umschaltung. Gespeichert als Cookie, damit der Server die Seite gleich richtig rendert.

export type Theme = "dark" | "light";
export const THEME_COOKIE = "custos_theme";
const EVENT = "custos-theme";

export function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: theme }));
}

export function onThemeChange(cb: (t: Theme) => void) {
  const handler = (e: Event) => cb((e as CustomEvent<Theme>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
