/* Item Description Maker — embeddable bundle.
   Exposes window.ItemDescriptionMaker.init(rootEl?) — call it once, after
   idm.html's markup exists in the DOM. Nothing else touches window. */
(function () {
  const STORAGE_KEY = 'idm_saved_items';

  // Saved items go through a storage adapter so the host page can decide
  // where they live. The default keeps the standalone tool's original
  // behaviour (this browser's localStorage); Chrab Corner passes a
  // Supabase-backed adapter instead, so items follow the DM across devices.
  // Every method may return a promise - the UI updates from an in-memory
  // cache and lets the write settle behind it.
  const localStorageAdapter = {
    list() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { return []; }
    },
    saveAll(items) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); },
  };

  // ---- formatting (5e.tools ve-stats markup generation) ----

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function parseInline(text) {
    let s = escapeHtml(text);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/\[\[(.+?)\]\]/g, '<a href="#">$1</a>');
    return s;
  }

  function renderRawBlock(block) {
    const lines = block.split('\n');
    if (lines.every((l) => l.trim().startsWith('> '))) {
      const content = lines.map((l) => l.trim().slice(2)).join(' ');
      return `<blockquote><p>${parseInline(content)}</p></blockquote>`;
    }
    if (lines.every((l) => l.trim().startsWith('- '))) {
      const items = lines.map((l) => `<li>${parseInline(l.trim().slice(2))}</li>`).join('');
      return `<ul>${items}</ul>`;
    }
    return `<p>${lines.map(parseInline).join('<br>')}</p>`;
  }

  // A "## Subtitle" block. The title carries its emphasis inline (<strong>)
  // rather than through 5etools' entry-title-inner class: this markup is
  // pasted into tooltips that ship none of that stylesheet, so anything
  // leaning on an external class renders as flat text there.
  function renderNamedBlock(lines) {
    const title = lines[0].trim().replace(/^##\s+/, '');
    const rest = lines.slice(1).join('\n');
    const paragraphs = rest.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const titleHtml = `<strong>${parseInline(title)}.</strong>`;
    if (paragraphs.length === 0) return `<p>${titleHtml}</p>`;
    // Paragraphs under a "##" heading get the same list/quote treatment as
    // ones outside it. They used to be flattened into <p>...<br>... , which
    // silently turned a bullet list written inside a section into literal
    // "- " text - only lists written outside any section ever rendered.
    const isStructured = (p) => p.split('\n').every((l) => /^\s*[->]\s/.test(l));
    if (isStructured(paragraphs[0])) {
      return [`<p>${titleHtml}</p>`, ...paragraphs.map(renderRawBlock)].join('\n');
    }
    const firstP = `<p>${titleHtml} ${paragraphs[0].split('\n').map(parseInline).join('<br>')}</p>`;
    const restHtml = paragraphs.slice(1).map(renderRawBlock);
    return [firstP, ...restHtml].join('\n');
  }

  function parseBody(text) {
    const lines = (text || '').split('\n');
    const blocks = [];
    let rawBuffer = [];
    function flushRaw() {
      if (rawBuffer.length === 0) return;
      rawBuffer.join('\n').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
        .forEach((s) => blocks.push({ type: 'raw', text: s }));
      rawBuffer = [];
    }
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^##\s+/.test(line.trim())) {
        flushRaw();
        const namedLines = [line];
        i += 1;
        while (i < lines.length && !/^##\s+/.test(lines[i].trim())) {
          namedLines.push(lines[i]);
          i += 1;
        }
        blocks.push({ type: 'named', lines: namedLines });
      } else {
        rawBuffer.push(line);
        i += 1;
      }
    }
    flushRaw();
    return blocks.map((b) => (b.type === 'named' ? renderNamedBlock(b.lines) : renderRawBlock(b.text))).join('\n');
  }

  // A feature used to render as a <table class="ve-stats"> stat block. The
  // tooltips these descriptions get pasted into strip tables outright, which
  // took the whole feature with them - name, stats, body, all invisible. So
  // a feature is now a bullet: its name (and subtitle) in bold at the top of
  // the item, everything else plain paragraphs beneath. Only <ul>/<li>,
  // <p>, <strong>, <em> and <br> are used anywhere, since those are what
  // survive.
  function generateFeatureHTML(feature) {
    const headingParts = [];
    if (feature.leadIn) headingParts.push(escapeHtml(feature.leadIn));
    if (feature.name) headingParts.push(escapeHtml(feature.name));
    const heading = headingParts.join(' ');
    const sourceHtml = feature.source ? ` <em>(${escapeHtml(feature.source)})</em>` : '';
    const subtitleHtml = feature.subtitle ? ` — <strong>${parseInline(feature.subtitle)}</strong>` : '';

    const statFields = [
      feature.castingTime ? { label: 'Casting Time', value: feature.castingTime } : null,
      feature.range ? { label: 'Range', value: feature.range } : null,
      feature.components ? { label: 'Components', value: feature.components } : null,
      feature.duration ? { label: 'Duration', value: feature.duration } : null,
    ].filter(Boolean);
    const statList = statFields.length
      ? `<ul>${statFields
          .map((f) => `<li><strong>${escapeHtml(f.label)}:</strong> ${parseInline(f.value)}</li>`)
          .join('')}</ul>`
      : '';

    const bodyHtml = feature.description ? parseBody(feature.description) : '';

    // A feature with nothing but a body (no name, no subtitle) shouldn't get
    // an empty bullet in front of it - it's just text at that point, and its
    // stats stand on their own.
    if (!heading && !subtitleHtml) return [statList, bodyHtml].filter(Boolean).join('\n');

    const bullet = `<ul>\n  <li><strong>${heading}</strong>${sourceHtml}${subtitleHtml}${statList ? `\n${statList}` : ''}</li>\n</ul>`;
    return [bullet, bodyHtml].filter(Boolean).join('\n');
  }

  function generateTextBlockHTML(block) {
    if (!block.content || !block.content.trim()) return '';
    return parseBody(block.content);
  }

  function generateItemHTML(item) {
    return (item.blocks || [])
      .map((block) => (block.type === 'feature' ? generateFeatureHTML(block) : generateTextBlockHTML(block)))
      .filter(Boolean)
      .join('\n');
  }

  // ---- app state / wiring ----

  function defaultFeatureBlock() {
    return { type: 'feature', leadIn: '', name: '', source: '', subtitle: '', castingTime: '', range: '', components: '', duration: '', description: '' };
  }
  function defaultTextBlock() { return { type: 'text', content: '' }; }
  function defaultItem() { return { __id: null, name: '', blocks: [defaultFeatureBlock()] }; }

  function init(root, options) {
    root = root || document;
    if (root.__idmInitialized) return;
    root.__idmInitialized = true;

    const storage = (options && options.storage) || localStorageAdapter;
    // The rendered list reads from this cache rather than from storage, so
    // a remote adapter doesn't turn every re-render into a round trip. It's
    // filled once below and then kept in step with each write.
    let savedItems = [];

    let state = defaultItem();

    const q = (id) => root.querySelector(`#${id}`);
    const el = {
      name: q('idm-f-name'),
      preview: q('idm-preview'),
      htmlOutput: q('idm-html-output'),
      savedList: q('idm-saved-list'),
      copyStatus: q('idm-copy-status'),
      syntaxHelp: q('idm-syntax-help'),
      blocksList: q('idm-blocks-list'),
      featureBlockTemplate: q('idm-feature-block-template'),
      textBlockTemplate: q('idm-text-block-template'),
    };

    function getSavedItems() { return savedItems; }

    // Optimistic: the cache and the list update immediately, the adapter's
    // write settles after. A failed write says so rather than silently
    // leaving the screen showing something that was never stored.
    function setSavedItems(items) {
      savedItems = items;
      Promise.resolve(storage.saveAll(items, root)).catch((err) => {
        console.error('[idm] saving items failed', err);
        showListError('Could not save: ' + errText(err));
        alert('Could not save your items: ' + errText(err));
      });
    }

    function moveBlock(idx, dir) {
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= state.blocks.length) return;
      const [b] = state.blocks.splice(idx, 1);
      state.blocks.splice(newIdx, 0, b);
      renderBlocks();
      updatePreview();
    }

    function removeBlock(idx) {
      state.blocks.splice(idx, 1);
      if (state.blocks.length === 0) state.blocks.push(defaultFeatureBlock());
      renderBlocks();
      updatePreview();
    }

    function renderBlocks() {
      el.blocksList.innerHTML = '';
      state.blocks.forEach((block, idx) => {
        let node, card;
        if (block.type === 'feature') {
          node = el.featureBlockTemplate.content.cloneNode(true);
          card = node.querySelector('.idm-feature-card');
          card.querySelector('.idm-feature-title').textContent = `Feature ${idx + 1}`;
          card.querySelectorAll('[data-field]').forEach((input) => {
            const field = input.dataset.field;
            input.value = block[field] || '';
            input.addEventListener('input', () => { block[field] = input.value; updatePreview(); });
          });
        } else {
          node = el.textBlockTemplate.content.cloneNode(true);
          card = node.querySelector('.idm-feature-card');
          card.querySelector('.idm-feature-title').textContent = `Text ${idx + 1}`;
          const contentInput = card.querySelector('[data-field="content"]');
          contentInput.value = block.content || '';
          contentInput.addEventListener('input', () => { block.content = contentInput.value; updatePreview(); });
        }
        card.querySelector('[data-action="up"]').addEventListener('click', () => moveBlock(idx, -1));
        card.querySelector('[data-action="down"]').addEventListener('click', () => moveBlock(idx, 1));
        card.querySelector('[data-action="remove"]').addEventListener('click', () => removeBlock(idx));
        el.blocksList.appendChild(card);
      });
    }

    function syncCommonFieldsFromState() { el.name.value = state.name || ''; renderBlocks(); }

    function updatePreview() {
      const html = generateItemHTML(state);
      el.preview.innerHTML = html;
      el.htmlOutput.value = html;
    }

    function errText(err) { return (err && err.message) ? err.message : String(err); }

    function showListError(message) {
      const li = document.createElement('li');
      li.className = 'idm-item-error';
      li.textContent = message;
      el.savedList.appendChild(li);
    }

    function renderSavedList() {
      const items = getSavedItems();
      el.savedList.innerHTML = '';
      items.forEach((record) => {
        const li = document.createElement('li');
        if (record.id === state.__id) li.classList.add('active');
        const nameSpan = document.createElement('span');
        nameSpan.className = 'idm-item-name';
        nameSpan.textContent = record.name || 'Untitled';
        nameSpan.addEventListener('click', () => loadItem(record));
        const delBtn = document.createElement('button');
        delBtn.className = 'idm-item-delete';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', (evt) => { evt.stopPropagation(); deleteItem(record.id); });
        li.appendChild(nameSpan);
        li.appendChild(delBtn);
        el.savedList.appendChild(li);
      });
    }

    function loadItem(record) {
      const merged = { ...defaultItem(), ...record.item };
      merged.blocks = record.item.blocks && record.item.blocks.length ? record.item.blocks : [defaultFeatureBlock()];
      merged.__id = record.id;
      state = merged;
      syncCommonFieldsFromState();
      updatePreview();
      renderSavedList();
    }

    function deleteItem(id) {
      const items = getSavedItems().filter((r) => r.id !== id);
      setSavedItems(items);
      if (state.__id === id) { state = defaultItem(); syncCommonFieldsFromState(); updatePreview(); }
      renderSavedList();
    }

    function saveCurrentItem() {
      const items = getSavedItems();
      const id = state.__id || `item_${Date.now()}`;
      const { __id, ...itemData } = state;
      const record = { id, name: state.name || 'Untitled', item: itemData };
      const idx = items.findIndex((r) => r.id === id);
      if (idx >= 0) items[idx] = record; else items.push(record);
      setSavedItems(items);
      state.__id = id;
      renderSavedList();
    }

    function exportAll() {
      const items = getSavedItems();
      const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'item-descriptions.json';
      a.click();
      URL.revokeObjectURL(url);
    }

    function importFile(file) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          if (!Array.isArray(imported)) throw new Error('not an array');
          const items = getSavedItems();
          imported.forEach((r) => {
            items.push({ id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: r.name || 'Untitled', item: r.item || r });
          });
          setSavedItems(items);
          renderSavedList();
        } catch (e) {
          alert('Could not import that file — expected JSON exported from this tool.');
        }
      };
      reader.readAsText(file);
    }

    function copyHtml() {
      const text = el.htmlOutput.value;
      const done = () => { el.copyStatus.hidden = false; setTimeout(() => { el.copyStatus.hidden = true; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(done));
      } else {
        fallbackCopy(done);
      }
    }
    function fallbackCopy(done) { el.htmlOutput.select(); document.execCommand('copy'); done(); }

    el.name.addEventListener('input', () => { state.name = el.name.value; });
    q('idm-btn-syntax-help').addEventListener('click', () => { el.syntaxHelp.hidden = !el.syntaxHelp.hidden; });
    q('idm-btn-add-feature').addEventListener('click', () => { state.blocks.push(defaultFeatureBlock()); renderBlocks(); updatePreview(); });
    q('idm-btn-add-text').addEventListener('click', () => { state.blocks.push(defaultTextBlock()); renderBlocks(); updatePreview(); });
    q('idm-btn-save').addEventListener('click', saveCurrentItem);
    q('idm-btn-new').addEventListener('click', () => { state = defaultItem(); syncCommonFieldsFromState(); updatePreview(); renderSavedList(); });
    q('idm-btn-export').addEventListener('click', exportAll);
    q('idm-import-file').addEventListener('change', (evt) => { if (evt.target.files[0]) importFile(evt.target.files[0]); evt.target.value = ''; });
    q('idm-btn-copy').addEventListener('click', copyHtml);

    syncCommonFieldsFromState();
    updatePreview();
    renderSavedList();

    // First paint shows an empty list; a remote adapter fills it in when its
    // fetch lands. Nothing else waits on this, so the editor is usable
    // immediately either way.
    Promise.resolve(storage.list(root))
      .then((items) => {
        savedItems = Array.isArray(items) ? items : [];
        renderSavedList();
      })
      .catch((err) => {
        console.error('[idm] loading saved items failed', err);
        // An empty list and a list that failed to load look identical, and
        // this one is worth knowing about before typing a whole item in:
        // say so in the list itself rather than only in a console nobody
        // has open on a phone.
        showListError('Could not load your saved items: ' + errText(err));
      });
  }

  window.ItemDescriptionMaker = { init };
})();
