// Dashboard overview — greeting, quick stats, quick actions, and recent designs.
// Matches the "Home" landing page pattern from MyDesigns instead of dropping straight
// into a tool tab with no context.
(function () {
  function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  async function loadStats() {
    document.getElementById('dashboard-greeting').textContent = `${greeting()} — here's your workspace`;
    try {
      const res = await fetch('/api/dashboard/stats');
      if (!res.ok) return;
      const data = await res.json();

      document.getElementById('stat-designs').textContent = data.designCount;
      document.getElementById('stat-mockups').textContent = data.mockupsGenerated;
      document.getElementById('stat-templates').textContent = data.templateCount;
      document.getElementById('stat-presets').textContent = data.pricingPresetCount;

      const grid = document.getElementById('dashboard-recent-grid');
      if (data.recentDesigns && data.recentDesigns.length) {
        grid.innerHTML = data.recentDesigns.map(d => `<img src="${d.url}" alt="design" title="${d.source || ''}" />`).join('');
        grid.querySelectorAll('img').forEach((imgEl, i) => {
          imgEl.style.cursor = 'pointer';
          imgEl.addEventListener('click', () => {
            const design = data.recentDesigns[i];
            document.querySelector('.tab[data-tab="mockups"]').click();
            if (typeof setDesign === 'function') setDesign({ id: design.id, url: design.url });
          });
        });
      }
    } catch {
      // stats are a nice-to-have — leave placeholders on failure
    }
  }

  function wireQuickActions() {
    document.querySelectorAll('.quick-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.dataset.gotoTab;
        const tabBtn = document.querySelector(`.tab[data-tab="${tabName}"]`);
        if (tabBtn) tabBtn.click();
        const focusId = btn.dataset.focus;
        if (focusId) {
          setTimeout(() => {
            const el = document.getElementById(focusId);
            if (el) {
              const input = el.querySelector('input, textarea');
              if (input) input.focus();
            }
          }, 50);
        }
      });
    });
  }

  function init() {
    wireQuickActions();
    loadStats();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
