/* Item Description Maker — embeddable bundle.
   Exposes window.ItemDescriptionMaker.init(rootEl?) — call it once, after
   idm.html's markup exists in the DOM. Nothing else touches window. */
(function () {
  const STORAGE_KEY = 'idm_saved_items';

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

  function renderNamedBlock(lines) {
    const title = lines[0].trim().replace(/^##\s+/, '');
    const rest = lines.slice(1).join('\n');
    const paragraphs = rest.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const titleSpan = `<span class="entry-title-inner ">${parseInline(title)}.</span>`;
    if (paragraphs.length === 0) {
      return `<div class="ve-rd__b ve-rd__b--named ve-rd__b--3">\n<p>${titleSpan}</p>\n</div>`;
    }
    const firstP = `<p>${titleSpan} ${paragraphs[0].split('\n').map(parseInline).join('<br>')}</p>`;
    const restPs = paragraphs.slice(1).map((p) => `<p>${p.split('\n').map(parseInline).join('<br>')}</p>`);
    return `<div class="ve-rd__b ve-rd__b--named ve-rd__b--3">\n${[firstP, ...restPs].join('\n')}\n</div>`;
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

  function generateFeatureHTML(feature) {
    const leadInHtml = feature.leadIn ? `<h1 class="ve-stats__h-name ve-copyable ve-m-0">${escapeHtml(feature.leadIn)}</h1>` : '';
    const nameHtml = feature.name ? `<h1 class="ve-stats__h-name ve-copyable ve-m-0">${escapeHtml(feature.name)}</h1>` : '';
    const sourceHtml = feature.source ? `<p><a href="#">${escapeHtml(feature.source)}</a></p>` : '';
    const subtitleRow = feature.subtitle ? `    <tr>\n      <td colspan="6"><p><em>${parseInline(feature.subtitle)}</em></p></td>\n    </tr>` : '';
    const statFields = [
      feature.castingTime ? { label: 'Casting Time', value: feature.castingTime } : null,
      feature.range ? { label: 'Range', value: feature.range } : null,
      feature.components ? { label: 'Components', value: feature.components } : null,
      feature.duration ? { label: 'Duration', value: feature.duration } : null,
    ].filter(Boolean);
    const statRows = statFields.map((f, i) => {
      let cls = '';
      if (statFields.length === 1) cls = ' class="ve-pt-2 ve-pb-2"';
      else if (i === 0) cls = ' class="ve-pt-2"';
      else if (i === statFields.length - 1) cls = ' class="ve-pb-2"';
      return `    <tr>\n      <td colspan="6"${cls}><p><strong>${escapeHtml(f.label)}:</strong> ${parseInline(f.value)}</p></td>\n    </tr>`;
    }).join('\n');
    const bodyHtml = feature.description
      ? `    <tr>\n      <td colspan="6">\n        <div class="ve-rd__b ve-rd__b--2">\n${parseBody(feature.description)}\n        </div>\n      </td>\n    </tr>`
      : '';
    return `<table class="ve-w-100 ve-stats">
  <tbody>
    <tr>
      <th colspan="6" class="ve-stats__th-name ve-text-left ve-pb-0">
        <div class="ve-split-v-end">
          <div class="ve-flex-v-center">
            ${leadInHtml}
            ${nameHtml}
          </div>
          <div class="ve-stats__wrp-h-source ve-flex-v-baseline">
            ${sourceHtml}
          </div>
        </div>
      </th>
    </tr>
${[subtitleRow, statRows, bodyHtml].filter(Boolean).join('\n')}
  </tbody>
</table>`;
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

  function init(root) {
    root = root || document;
    if (root.__idmInitialized) return;
    root.__idmInitialized = true;

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

    function getSavedItems() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { return []; }
    }
    function setSavedItems(items) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }

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
  }

  window.ItemDescriptionMaker = { init };
})();
