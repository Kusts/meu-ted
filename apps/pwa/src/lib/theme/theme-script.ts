export const THEME_SCRIPT = `
(function() {
  try {
    var storageKey = 'pi-theme';
    var stored = localStorage.getItem(storageKey);
    var theme = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
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
