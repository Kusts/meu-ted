export const THEME_SCRIPT = `
(function() {
  try {
    var storageKey = 'pi-theme';
    var stored = localStorage.getItem(storageKey);
    // P2-13: with no stored preference, follow prefers-color-scheme (light or dark).
    var theme = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    var resolved = theme;
    if (theme === 'system') {
      resolved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);
    root.style.colorScheme = resolved;
  } catch (e) {}
})();
`.trim();
