// Canvas editor — a Fabric.js-based design editor: add/edit text, upload images, browse the
// designs library, basic shapes, and inline AI generation, matching MyDesigns' Canvas tool.
(function () {
  const CANVAS_SIZE = 1200;
  let fc = null; // fabric.Canvas instance
  let initialized = false;

  function initCanvas() {
    if (initialized) return;
    initialized = true;

    fc = new fabric.Canvas('fabric-canvas', {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE
      // No backgroundColor: stays transparent so a save/export is a print-ready design
      // (only the objects), not an opaque white rectangle placed on top of the garment.
    });

    fc.on('selection:created', updateObjectControls);
    fc.on('selection:updated', updateObjectControls);
    fc.on('selection:cleared', updateObjectControls);

    wireRail();
    wireToolbar();
    loadDesignsGrid();
  }

  function wireRail() {
    document.querySelectorAll('.rail-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.rail-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const panel = btn.dataset.panel;
        document.querySelectorAll('[data-panel-content]').forEach(p => {
          p.classList.toggle('hidden', p.dataset.panelContent !== panel);
        });
      });
    });

    document.getElementById('canvas-add-text-btn').addEventListener('click', () => {
      const text = new fabric.Textbox('Your text here', {
        left: CANVAS_SIZE / 2 - 150,
        top: CANVAS_SIZE / 2 - 30,
        width: 300,
        fontSize: 60,
        fontFamily: 'Arial',
        fill: '#111111'
      });
      fc.add(text);
      fc.setActiveObject(text);
      fc.requestRenderAll();
    });

    document.getElementById('canvas-upload-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => addImageToCanvas(ev.target.result);
      reader.readAsDataURL(file);
      e.target.value = '';
    });

    document.querySelectorAll('[data-shape]').forEach(btn => {
      btn.addEventListener('click', () => {
        const shape = btn.dataset.shape;
        let obj;
        const common = { left: CANVAS_SIZE / 2 - 100, top: CANVAS_SIZE / 2 - 100, fill: '#7c5cff' };
        if (shape === 'rect') obj = new fabric.Rect({ ...common, width: 200, height: 200 });
        else if (shape === 'circle') obj = new fabric.Circle({ ...common, radius: 100 });
        else if (shape === 'triangle') obj = new fabric.Triangle({ ...common, width: 200, height: 200 });
        if (obj) {
          fc.add(obj);
          fc.setActiveObject(obj);
          fc.requestRenderAll();
        }
      });
    });

    document.getElementById('canvas-generate-btn').addEventListener('click', async () => {
      const promptEl = document.getElementById('canvas-generate-prompt');
      const prompt = promptEl.value.trim();
      if (!prompt) return;
      const btn = document.getElementById('canvas-generate-btn');
      btn.disabled = true;
      btn.textContent = 'Generating…';
      try {
        const res = await fetch('/api/designs/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Generation failed' }));
          alert(err.error || 'Generation failed');
          return;
        }
        const { design } = await res.json();
        await addImageToCanvas(design.url);
        loadDesignsGrid();
      } finally {
        btn.disabled = false;
        btn.textContent = 'Generate & Add';
      }
    });
  }

  async function addImageToCanvas(url) {
    const img = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
    const maxDim = CANVAS_SIZE * 0.5;
    const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
    img.set({
      left: CANVAS_SIZE / 2 - (img.width * scale) / 2,
      top: CANVAS_SIZE / 2 - (img.height * scale) / 2,
      scaleX: scale,
      scaleY: scale
    });
    fc.add(img);
    fc.setActiveObject(img);
    fc.requestRenderAll();
  }

  async function loadDesignsGrid() {
    const grid = document.getElementById('canvas-designs-grid');
    grid.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const res = await fetch('/api/designs/library');
      const { designs } = await res.json();
      if (!designs.length) {
        grid.innerHTML = '<p class="muted">No designs yet — upload or generate one first.</p>';
        return;
      }
      grid.innerHTML = designs.map(d => `<img src="${d.url}" data-url="${d.url}" alt="design" />`).join('');
      grid.querySelectorAll('img').forEach(imgEl => {
        imgEl.addEventListener('click', () => addImageToCanvas(imgEl.dataset.url));
      });
    } catch {
      grid.innerHTML = '<p class="muted">Failed to load designs.</p>';
    }
  }

  function updateObjectControls() {
    const active = fc.getActiveObject();
    const controls = document.getElementById('canvas-object-controls');
    const fontSizeInput = document.getElementById('canvas-font-size');
    const fillInput = document.getElementById('canvas-fill-color');

    if (!active) {
      controls.classList.add('hidden');
      return;
    }
    controls.classList.remove('hidden');

    const isText = active.type === 'textbox' || active.type === 'i-text';
    fontSizeInput.style.display = isText ? '' : 'none';
    if (isText) fontSizeInput.value = Math.round(active.fontSize || 60);

    const isShapeOrText = isText || ['rect', 'circle', 'triangle'].includes(active.type);
    fillInput.style.display = isShapeOrText ? '' : 'none';
    if (isShapeOrText && typeof active.fill === 'string') fillInput.value = toHex(active.fill);
  }

  function toHex(color) {
    if (color.startsWith('#')) return color.length === 7 ? color : '#111111';
    return '#111111';
  }

  function wireToolbar() {
    document.getElementById('canvas-font-size').addEventListener('input', e => {
      const active = fc.getActiveObject();
      if (active) {
        active.set('fontSize', Number(e.target.value));
        fc.requestRenderAll();
      }
    });

    document.getElementById('canvas-fill-color').addEventListener('input', e => {
      const active = fc.getActiveObject();
      if (active) {
        active.set('fill', e.target.value);
        fc.requestRenderAll();
      }
    });

    document.getElementById('canvas-delete-object').addEventListener('click', () => {
      const active = fc.getActiveObject();
      if (active) {
        fc.remove(active);
        fc.discardActiveObject();
        fc.requestRenderAll();
      }
    });

    document.getElementById('canvas-download-btn').addEventListener('click', () => {
      fc.discardActiveObject();
      fc.requestRenderAll();
      const dataUrl = fc.toDataURL({ format: 'png', multiplier: 1 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'pod-pilot-canvas.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    document.getElementById('canvas-save-btn').addEventListener('click', async () => {
      const btn = document.getElementById('canvas-save-btn');
      fc.discardActiveObject();
      fc.requestRenderAll();
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        const dataUrl = fc.toDataURL({ format: 'png', multiplier: 1 });
        const res = await fetch('/api/canvas/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Save failed' }));
          alert(err.error || 'Save failed');
          return;
        }
        const { design } = await res.json();
        if (typeof setDesign === 'function') setDesign(design);
        loadDesignsGrid();
        document.querySelector('.tab[data-tab="mockups"]').click();
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save as Design';
      }
    });
  }

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'canvas') initCanvas();
    });
  });
})();
