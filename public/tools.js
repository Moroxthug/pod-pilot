// Standalone image utilities — Remove Background and Upscale — usable on any uploaded
// image, unlike the chroma-key trick used for our own AI generations.
(function () {
  const state = { rmbgFile: null, upscaleFile: null, lastResultDesign: null };

  function wireDropzone(dropzoneId, emptyId, previewId, inputId, onFile) {
    const dropzone = document.getElementById(dropzoneId);
    const empty = document.getElementById(emptyId);
    const preview = document.getElementById(previewId);
    const input = document.getElementById(inputId);

    function setFile(file) {
      preview.src = URL.createObjectURL(file);
      empty.classList.add('hidden');
      preview.classList.remove('hidden');
      onFile(file);
    }

    dropzone.addEventListener('click', () => input.click());
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', () => {
      if (input.files.length) setFile(input.files[0]);
    });
  }

  function showResult(url) {
    document.getElementById('tool-result-card').style.display = 'block';
    document.getElementById('tool-result-img').src = url;
    document.getElementById('tool-result-download').href = url;
    document.getElementById('tool-result-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function wire() {
    wireDropzone('tool-rmbg-dropzone', 'tool-rmbg-empty', 'tool-rmbg-preview', 'tool-rmbg-input', file => {
      state.rmbgFile = file;
      document.getElementById('tool-rmbg-run-btn').disabled = false;
    });

    wireDropzone('tool-upscale-dropzone', 'tool-upscale-empty', 'tool-upscale-preview', 'tool-upscale-input', file => {
      state.upscaleFile = file;
      document.getElementById('tool-upscale-run-btn').disabled = false;
    });

    document.getElementById('tool-rmbg-run-btn').addEventListener('click', async () => {
      if (!state.rmbgFile) return;
      const btn = document.getElementById('tool-rmbg-run-btn');
      btn.disabled = true;
      btn.textContent = 'Removing…';
      try {
        const formData = new FormData();
        formData.append('image', state.rmbgFile);
        const res = await fetch('/api/tools/remove-background', { method: 'POST', body: formData });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Failed' }));
          alert(err.error || 'Failed');
          return;
        }
        const { design } = await res.json();
        state.lastResultDesign = design;
        showResult(design.url);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Remove Background';
      }
    });

    document.getElementById('tool-upscale-run-btn').addEventListener('click', async () => {
      if (!state.upscaleFile) return;
      const btn = document.getElementById('tool-upscale-run-btn');
      btn.disabled = true;
      btn.textContent = 'Upscaling…';
      try {
        const formData = new FormData();
        formData.append('image', state.upscaleFile);
        formData.append('factor', document.getElementById('tool-upscale-factor').value);
        const res = await fetch('/api/tools/upscale', { method: 'POST', body: formData });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Failed' }));
          alert(err.error || 'Failed');
          return;
        }
        const { design } = await res.json();
        state.lastResultDesign = design;
        showResult(design.url);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Upscale';
      }
    });

    document.getElementById('tool-result-use-btn').addEventListener('click', () => {
      if (!state.lastResultDesign) return;
      document.querySelector('.tab[data-tab="mockups"]').click();
      if (typeof setDesign === 'function') setDesign(state.lastResultDesign);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
