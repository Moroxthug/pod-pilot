const state = {
  design: null, // { id, url }
  templates: [],
  selectedTemplateIds: new Set(),
  lastMockups: null
};

// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
  });
});

// ---------- Design upload ----------
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const dzEmpty = document.getElementById('dropzone-empty');
const dzPreview = document.getElementById('design-preview');
const clearBtn = document.getElementById('clear-design');
const generateBtn = document.getElementById('generate-btn');

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length) uploadDesign(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) uploadDesign(fileInput.files[0]);
});
clearBtn.addEventListener('click', e => {
  e.stopPropagation();
  state.design = null;
  dzEmpty.classList.remove('hidden');
  dzPreview.classList.add('hidden');
  clearBtn.classList.add('hidden');
  updateGenerateButton();
});

async function uploadDesign(file) {
  const formData = new FormData();
  formData.append('design', file);
  const res = await fetch('/api/designs', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    alert(err.error || 'Upload failed');
    return;
  }
  const data = await res.json();
  state.design = data.design;
  dzPreview.src = data.design.url;
  dzEmpty.classList.add('hidden');
  dzPreview.classList.remove('hidden');
  clearBtn.classList.remove('hidden');
  updateGenerateButton();
}

// ---------- Templates ----------
async function loadTemplates() {
  const res = await fetch('/api/templates');
  const data = await res.json();
  state.templates = data.templates;
  renderTemplatePicker();
  renderTemplateManager();
}

function renderTemplatePicker() {
  const picker = document.getElementById('template-picker');
  picker.innerHTML = '';
  for (const tpl of state.templates) {
    const el = document.createElement('div');
    el.className = 'template-option';
    el.innerHTML = `<img src="${tpl.baseImage}" alt="${tpl.garmentName} ${tpl.colorName}" />
      <div class="label">${tpl.garmentName}<br>${tpl.colorName}</div>`;
    el.addEventListener('click', () => {
      if (state.selectedTemplateIds.has(tpl.id)) {
        state.selectedTemplateIds.delete(tpl.id);
        el.classList.remove('selected');
      } else {
        state.selectedTemplateIds.add(tpl.id);
        el.classList.add('selected');
      }
      updateGenerateButton();
    });
    picker.appendChild(el);
  }
}

function renderTemplateManager() {
  const defaultGrid = document.getElementById('default-template-grid');
  const customGrid = document.getElementById('custom-template-grid');
  const defaults = state.templates.filter(t => t.source === 'default');
  const custom = state.templates.filter(t => t.source === 'upload');

  defaultGrid.innerHTML = defaults.map(t => `
    <div class="template-card">
      <img src="${t.baseImage}" alt="${t.garmentName} ${t.colorName}" />
      <div class="label">${t.garmentName} — ${t.colorName}</div>
    </div>
  `).join('');

  customGrid.innerHTML = custom.length ? custom.map(t => `
    <div class="template-card" data-id="${t.id}">
      <button class="remove-btn" data-remove="${t.id}">×</button>
      <img src="${t.baseImage}" alt="${t.garmentName} ${t.colorName}" />
      <div class="label">${t.garmentName} — ${t.colorName}</div>
    </div>
  `).join('') : '<p class="muted">None yet.</p>';

  customGrid.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await fetch(`/api/templates/${btn.dataset.remove}`, { method: 'DELETE' });
      state.selectedTemplateIds.delete(btn.dataset.remove);
      loadTemplates();
    });
  });
}

document.getElementById('template-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData();
  formData.append('image', form.image.files[0]);
  formData.append('garmentName', form.garmentName.value);
  formData.append('colorName', form.colorName.value);

  const canvas = 2000;
  const xPct = Number(form.x.value) / 100;
  const yPct = Number(form.y.value) / 100;
  const wPct = Number(form.w.value) / 100;
  const hPct = Number(form.h.value) / 100;
  const printArea = {
    x: Math.round(xPct * canvas),
    y: Math.round(yPct * canvas),
    w: Math.round(wPct * canvas),
    h: Math.round(hPct * canvas)
  };
  formData.append('printArea', JSON.stringify(printArea));

  const res = await fetch('/api/templates', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to add template' }));
    alert(err.error || 'Failed to add template');
    return;
  }
  form.reset();
  form.x.value = 35; form.y.value = 31; form.w.value = 30; form.h.value = 35;
  loadTemplates();
});

// ---------- Generate mockups ----------
function updateGenerateButton() {
  generateBtn.disabled = !(state.design && state.selectedTemplateIds.size > 0);
}

generateBtn.addEventListener('click', async () => {
  generateBtn.disabled = true;
  generateBtn.textContent = 'Generating…';
  try {
    const res = await fetch('/api/mockups/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        designUrl: state.design.url,
        templateIds: Array.from(state.selectedTemplateIds)
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Generation failed' }));
      alert(err.error || 'Generation failed');
      return;
    }
    const data = await res.json();
    state.lastMockups = data.mockups;
    renderResults(data.mockups);
  } finally {
    generateBtn.textContent = 'Generate Mockups';
    updateGenerateButton();
  }
});

function renderResults(mockups) {
  const card = document.getElementById('results-card');
  const grid = document.getElementById('results-grid');
  card.style.display = 'block';
  grid.innerHTML = mockups.map(m => `
    <div class="result-item">
      <img src="${m.url}" alt="${m.garmentName} ${m.colorName}" />
      <div class="label">${m.garmentName} — ${m.colorName}</div>
    </div>
  `).join('');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.getElementById('download-all-btn').addEventListener('click', async () => {
  if (!state.lastMockups || !state.lastMockups.length) return;
  const btn = document.getElementById('download-all-btn');
  btn.disabled = true;
  btn.textContent = 'Zipping…';
  try {
    const res = await fetch('/api/mockups/zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mockups: state.lastMockups })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Zip failed' }));
      alert(err.error || 'Zip failed');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pod-pilot-mockups.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Download All (.zip)';
  }
});

// ---------- Listing generator ----------
document.getElementById('listing-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const keywords = form.keywords.value.split(',').map(s => s.trim()).filter(Boolean);
  const res = await fetch('/api/listing/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords, style: form.style.value, niche: form.niche.value })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed' }));
    alert(err.error || 'Failed');
    return;
  }
  const data = await res.json();
  document.getElementById('listing-result').style.display = 'block';
  document.getElementById('listing-title').value = data.title;
  document.getElementById('listing-description').value = data.description;
  document.getElementById('listing-tags').innerHTML = data.tags.map(t => `<span class="tag-pill">${t}</span>`).join('');
});

loadTemplates();
