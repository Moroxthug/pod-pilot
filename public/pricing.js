// Profit/pricing calculator — per-size cost vs. price with live profit/margin, bulk-edit
// tools (margin % or flat markup applied to all rows), and saved presets, matching MyDesigns'
// pricing step (they compute against real print-provider costs; here the user enters their
// own known cost per size since we don't broker fulfillment).
(function () {
  const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
  let rows = SIZES.map(size => ({ size, cost: 0, price: 0 }));
  let loadedPresetId = null;

  function renderTable() {
    const tbody = document.getElementById('pricing-table-body');
    tbody.innerHTML = rows.map((row, i) => {
      const profit = row.price - row.cost;
      const margin = row.price > 0 ? (profit / row.price) * 100 : 0;
      const cls = profit > 0 ? 'good' : (profit < 0 ? 'bad' : '');
      return `
        <tr>
          <td>${row.size}</td>
          <td><input type="number" step="0.01" min="0" class="pricing-cost-input" data-row="${i}" value="${row.cost}" /></td>
          <td><input type="number" step="0.01" min="0" class="pricing-price-input" data-row="${i}" value="${row.price}" /></td>
          <td class="pricing-cell ${cls}">$${profit.toFixed(2)}</td>
          <td class="pricing-cell ${cls}">${margin.toFixed(0)}%</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.pricing-cost-input').forEach(input => {
      input.addEventListener('input', e => {
        rows[Number(e.target.dataset.row)].cost = Number(e.target.value) || 0;
        renderTable();
      });
    });
    tbody.querySelectorAll('.pricing-price-input').forEach(input => {
      input.addEventListener('input', e => {
        rows[Number(e.target.dataset.row)].price = Number(e.target.value) || 0;
        renderTable();
      });
    });

    const totalProfit = rows.reduce((sum, r) => sum + (r.price - r.cost), 0);
    const avgMargin = rows.length
      ? rows.reduce((sum, r) => sum + (r.price > 0 ? ((r.price - r.cost) / r.price) * 100 : 0), 0) / rows.length
      : 0;
    document.getElementById('pricing-total-profit').textContent = `$${totalProfit.toFixed(2)} total`;
    document.getElementById('pricing-avg-margin').textContent = `${avgMargin.toFixed(0)}% avg`;
  }

  function applyMarginToAll(marginPct) {
    rows = rows.map(r => ({ ...r, price: r.cost > 0 ? Number((r.cost / (1 - marginPct / 100)).toFixed(2)) : r.price }));
    renderTable();
  }

  function applyMarkupToAll(markup) {
    rows = rows.map(r => ({ ...r, price: Number((r.cost + markup).toFixed(2)) }));
    renderTable();
  }

  async function loadPresets() {
    const select = document.getElementById('pricing-preset-select');
    try {
      const res = await fetch('/api/pricing/presets');
      const { presets } = await res.json();
      select.innerHTML = '<option value="">— none —</option>' +
        presets.map(p => `<option value="${p.id}">${escapePricingHtml(p.name)}</option>`).join('');
      select.dataset.presets = JSON.stringify(presets);
    } catch {
      // non-fatal — presets are a convenience, not required to use the calculator
    }
  }

  function escapePricingHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function wire() {
    renderTable();
    loadPresets();

    document.getElementById('pricing-apply-margin-btn').addEventListener('click', () => {
      const val = Number(document.getElementById('pricing-margin-input').value);
      if (val > 0 && val < 100) applyMarginToAll(val);
    });

    document.getElementById('pricing-apply-markup-btn').addEventListener('click', () => {
      const val = Number(document.getElementById('pricing-markup-input').value);
      if (val >= 0) applyMarkupToAll(val);
    });

    document.getElementById('pricing-preset-select').addEventListener('change', e => {
      const presets = JSON.parse(e.target.dataset.presets || '[]');
      const preset = presets.find(p => p.id === e.target.value);
      if (!preset) {
        loadedPresetId = null;
        return;
      }
      loadedPresetId = preset.id;
      document.getElementById('pricing-product-name').value = preset.name;
      rows = SIZES.map(size => {
        const found = preset.sizes.find(s => s.size === size);
        return found ? { size, cost: found.cost, price: found.price } : { size, cost: 0, price: 0 };
      });
      renderTable();
    });

    document.getElementById('pricing-save-preset-btn').addEventListener('click', async () => {
      const name = document.getElementById('pricing-product-name').value.trim();
      if (!name) {
        alert('Enter a garment/product name first');
        return;
      }
      const btn = document.getElementById('pricing-save-preset-btn');
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        const res = await fetch('/api/pricing/presets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, sizes: rows })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Save failed' }));
          alert(err.error || 'Save failed');
          return;
        }
        await loadPresets();
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save as Preset';
      }
    });

    document.getElementById('pricing-delete-preset-btn').addEventListener('click', async () => {
      if (!loadedPresetId) {
        alert('Load a preset first');
        return;
      }
      await fetch(`/api/pricing/presets/${loadedPresetId}`, { method: 'DELETE' });
      loadedPresetId = null;
      await loadPresets();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
