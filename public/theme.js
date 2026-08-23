// Dark/light mode toggle. The initial theme is already applied by the inline script in
// <head> (before first paint) — this just wires up the toggle button and persists changes.
(function () {
  function applyToggleUI(theme) {
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');
    const label = document.getElementById('theme-toggle-label');
    const isDark = theme === 'dark';
    sunIcon.classList.toggle('hidden', isDark);
    moonIcon.classList.toggle('hidden', !isDark);
    label.textContent = isDark ? 'Dark mode' : 'Light mode';
  }

  function init() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyToggleUI(current);

    document.getElementById('theme-toggle-btn').addEventListener('click', () => {
      const now = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', now);
      localStorage.setItem('pp-theme', now);
      applyToggleUI(now);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
