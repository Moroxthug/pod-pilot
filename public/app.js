const state = {
  design: null, // { id, url }
  templates: [],
  selectedTemplateIds: new Set(),
  batchSelectedTemplateIds: new Set(),
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
  document.getElementById('analysis-card').style.display = 'none';
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
  setDesign(data.design);
}

function setDesign(design) {
  state.design = design;
  dzPreview.src = design.url;
  dzEmpty.classList.add('hidden');
  dzPreview.classList.remove('hidden');
  clearBtn.classList.remove('hidden');
  updateGenerateButton();
  runAnalysis(design.url);
}

// ---------- Design analysis ----------
async function runAnalysis(designUrl) {
  const card = document.getElementById('analysis-card');
  const status = document.getElementById('analysis-status');
  card.style.display = 'block';
  status.textContent = 'Analyzing…';
  ['style', 'niche', 'colors', 'elements', 'strength', 'weakness', 'keywords'].forEach(k => {
    document.getElementById(`analysis-${k}`).textContent = '';
  });

  try {
    const res = await fetch('/api/designs/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ designUrl })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
      status.textContent = err.error || 'Analysis failed';
      return;
    }
    const { analysis } = await res.json();
    status.textContent = '';
    document.getElementById('analysis-style').textContent = analysis.style;
    document.getElementById('analysis-niche').textContent = analysis.niche;
    document.getElementById('analysis-colors').textContent = (analysis.colors || []).join(', ');
    document.getElementById('analysis-elements').textContent = (analysis.elements || []).join(', ');
    document.getElementById('analysis-strength').textContent = analysis.strength;
    document.getElementById('analysis-weakness').textContent = analysis.weakness;
    document.getElementById('analysis-keywords').textContent = (analysis.suggestedKeywords || []).join(', ');
  } catch (err) {
    status.textContent = 'Analysis failed';
  }
}

// ---------- Design generation (Generate / Edit / Remix) ----------
state.aiMode = 'generate';
state.remixSelectedUrls = new Set();

const AI_MODE_HINTS = {
  generate: 'Creates a new design from your description.',
  edit: 'Edits your currently loaded design based on your instruction (e.g. "change the background to navy blue").',
  remix: 'Blends the selected designs below into one new design based on your description.'
};
const AI_MODE_BUTTON_LABELS = {
  generate: 'Generate Design',
  edit: 'Edit Design',
  remix: 'Remix Designs'
};

document.querySelectorAll('.ai-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ai-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.aiMode = btn.dataset.mode;
    document.getElementById('ai-mode-hint').textContent = AI_MODE_HINTS[state.aiMode];
    document.getElementById('generate-design-btn').textContent = AI_MODE_BUTTON_LABELS[state.aiMode];
    document.getElementById('ai-remix-picker').classList.toggle('hidden', state.aiMode !== 'remix');
    if (state.aiMode === 'remix') loadRemixGrid();
  });
});

async function loadRemixGrid() {
  const grid = document.getElementById('ai-remix-grid');
  grid.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const res = await fetch('/api/designs/library');
    const { designs } = await res.json();
    if (!designs.length) {
      grid.innerHTML = '<p class="muted">No designs yet — generate or upload one first.</p>';
      return;
    }
    grid.innerHTML = designs.map(d => `<img src="${d.url}" data-url="${d.url}" alt="design" />`).join('');
    grid.querySelectorAll('img').forEach(imgEl => {
      imgEl.addEventListener('click', () => {
        const url = imgEl.dataset.url;
        if (state.remixSelectedUrls.has(url)) {
          state.remixSelectedUrls.delete(url);
          imgEl.classList.remove('selected');
        } else {
          state.remixSelectedUrls.add(url);
          imgEl.classList.add('selected');
        }
      });
    });
  } catch {
    grid.innerHTML = '<p class="muted">Failed to load designs.</p>';
  }
}

document.getElementById('generate-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById('generate-design-btn');

  const body = { prompt: form.prompt.value, mode: state.aiMode };
  if (state.aiMode === 'edit') {
    if (!state.design) {
      alert('Load or generate a design first, then switch to Edit.');
      return;
    }
    body.referenceUrls = [state.design.url];
  } else if (state.aiMode === 'remix') {
    if (state.remixSelectedUrls.size === 0) {
      alert('Select at least one design to remix.');
      return;
    }
    body.referenceUrls = Array.from(state.remixSelectedUrls);
  }

  btn.disabled = true;
  btn.textContent = 'Working…';
  try {
    const res = await fetch('/api/designs/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Generation failed' }));
      alert(err.error || 'Generation failed');
      return;
    }
    const data = await res.json();
    setDesign(data.design);
  } finally {
    btn.disabled = false;
    btn.textContent = AI_MODE_BUTTON_LABELS[state.aiMode];
  }
});

// ---------- Templates ----------
async function loadTemplates() {
  const res = await fetch('/api/templates');
  const data = await res.json();
  state.templates = data.templates;
  renderTemplatePicker('template-picker', state.selectedTemplateIds, updateGenerateButton);
  renderTemplatePicker('batch-template-picker', state.batchSelectedTemplateIds, updateBatchRunButton);
  renderTemplateManager();
}

function renderTemplatePicker(containerId, selectedSet, onChange) {
  const picker = document.getElementById(containerId);
  picker.innerHTML = '';
  const sorted = [...state.templates].sort((a, b) => (a.style === 'photo' ? -1 : 0) - (b.style === 'photo' ? -1 : 0));
  for (const tpl of sorted) {
    const el = document.createElement('div');
    el.className = 'template-option';
    if (selectedSet.has(tpl.id)) el.classList.add('selected');
    const styleBadge = tpl.style === 'photo' ? '<span class="style-badge">Photo</span>' : '';
    el.innerHTML = `<img src="${tpl.baseImage}" alt="${tpl.garmentName} ${tpl.colorName}" />
      ${styleBadge}
      <div class="label">${tpl.garmentName}<br>${tpl.colorName}</div>`;
    el.addEventListener('click', () => {
      if (selectedSet.has(tpl.id)) {
        selectedSet.delete(tpl.id);
        el.classList.remove('selected');
      } else {
        selectedSet.add(tpl.id);
        el.classList.add('selected');
      }
      onChange();
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

document.getElementById('download-all-btn').addEventListener('click', () => {
  downloadMockupsZip(state.lastMockups, document.getElementById('download-all-btn'), 'Download All (.zip)');
});

async function downloadMockupsZip(mockups, btn, idleLabel) {
  if (!mockups || !mockups.length) return;
  btn.disabled = true;
  btn.textContent = 'Zipping…';
  try {
    const res = await fetch('/api/mockups/zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mockups })
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
    btn.textContent = idleLabel;
  }
}

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

// ---------- Batch processing ----------
const batchRunBtn = document.getElementById('batch-run-btn');

function updateBatchRunButton() {
  const prompts = getBatchPrompts();
  batchRunBtn.disabled = !(prompts.length > 0 && state.batchSelectedTemplateIds.size > 0);
}

function getBatchPrompts() {
  const raw = document.querySelector('#batch-form textarea[name="prompts"]').value;
  return raw.split('\n').map(s => s.trim()).filter(Boolean);
}

document.querySelector('#batch-form textarea[name="prompts"]').addEventListener('input', updateBatchRunButton);

batchRunBtn.addEventListener('click', async () => {
  const prompts = getBatchPrompts();
  const templateIds = Array.from(state.batchSelectedTemplateIds);
  if (!prompts.length || !templateIds.length) return;

  batchRunBtn.disabled = true;
  const progress = document.getElementById('batch-progress');
  const resultsCard = document.getElementById('batch-results-card');
  const resultsList = document.getElementById('batch-results-list');
  resultsCard.style.display = 'block';
  resultsList.innerHTML = '';

  const allMockups = [];

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    progress.textContent = `${i + 1} / ${prompts.length}: ${prompt.slice(0, 40)}…`;

    const item = document.createElement('div');
    item.className = 'batch-item';
    item.innerHTML = `
      <div class="batch-item-header">
        <img alt="" />
        <div>
          <div class="batch-item-title">${escapeHtml(prompt)}</div>
          <div class="batch-item-sub" data-role="sub"></div>
        </div>
        <div class="batch-item-status" data-role="status">generating…</div>
      </div>
      <div class="batch-mockup-row" data-role="mockups"></div>
    `;
    resultsList.appendChild(item);
    const img = item.querySelector('img');
    const sub = item.querySelector('[data-role="sub"]');
    const status = item.querySelector('[data-role="status"]');
    const mockupRow = item.querySelector('[data-role="mockups"]');

    try {
      const genRes = await fetch('/api/designs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      if (!genRes.ok) throw new Error((await genRes.json().catch(() => ({}))).error || 'Generation failed');
      const { design } = await genRes.json();
      img.src = design.url;

      status.textContent = 'analyzing…';
      analyzeInBackground(design.url, sub);

      status.textContent = 'making mockups…';
      const mockRes = await fetch('/api/mockups/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designUrl: design.url, templateIds })
      });
      if (!mockRes.ok) throw new Error((await mockRes.json().catch(() => ({}))).error || 'Mockup generation failed');
      const { mockups } = await mockRes.json();
      allMockups.push(...mockups);
      mockupRow.innerHTML = mockups.map(m => `<img src="${m.url}" alt="${m.garmentName} ${m.colorName}" title="${m.garmentName} ${m.colorName}" />`).join('');
      status.textContent = 'done';
    } catch (err) {
      status.textContent = `error: ${err.message}`;
    }
  }

  progress.textContent = `Done — ${prompts.length} designs, ${allMockups.length} mockups`;
  state.lastBatchMockups = allMockups;
  batchRunBtn.disabled = false;
});

async function analyzeInBackground(designUrl, subEl) {
  try {
    const res = await fetch('/api/designs/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ designUrl })
    });
    if (!res.ok) return;
    const { analysis } = await res.json();
    subEl.textContent = `${analysis.style} · ${analysis.niche}`;
  } catch {
    // best-effort — batch shouldn't stall on analysis failures
  }
}

document.getElementById('batch-download-all-btn').addEventListener('click', () => {
  downloadMockupsZip(state.lastBatchMockups, document.getElementById('batch-download-all-btn'), 'Download All Mockups (.zip)');
});

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Trend research ----------
document.getElementById('trends-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById('trends-run-btn');
  const container = document.getElementById('trends-results');
  btn.disabled = true;
  btn.textContent = 'Researching…';
  container.innerHTML = '<p class="muted">Searching the live web for current trends — this can take 15–30s…</p>';
  try {
    const res = await fetch('/api/trends/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ focus: form.focus.value })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Research failed' }));
      container.innerHTML = `<p class="muted">${err.error || 'Research failed'}</p>`;
      return;
    }
    const { trends } = await res.json();
    container.innerHTML = `<div class="trend-grid">${trends.map(renderTrendCard).join('')}</div>`;
    container.querySelectorAll('[data-use-angle]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelector('.tab[data-tab="mockups"]').click();
        const promptInput = document.querySelector('#generate-form input[name="prompt"]');
        promptInput.value = btn.dataset.useAngle;
        promptInput.focus();
      });
    });
  } catch (err) {
    container.innerHTML = '<p class="muted">Research failed.</p>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Research Trends';
  }
});

function renderTrendCard(t) {
  const level = (t.competitionLevel || 'medium').toLowerCase();
  return `
    <div class="trend-card">
      <span class="trend-competition ${level}">${t.competitionLevel || 'Medium'} competition</span>
      <h3>${escapeHtml(t.niche || '')}</h3>
      <p class="trend-why">${escapeHtml(t.whyTrending || '')}</p>
      <p class="trend-angle">"${escapeHtml(t.designAngle || '')}"</p>
      <div class="trend-keywords">${(t.keywords || []).map(k => `<span class="tag-pill">${escapeHtml(k)}</span>`).join('')}</div>
      <button class="btn primary" data-use-angle="${escapeHtml(t.designAngle || t.niche || '')}">Generate This Design</button>
    </div>
  `;
}

loadTemplates();
