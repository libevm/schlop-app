/**
 * WZ Editor — Main entry point.
 * Orchestrates file opening, tree rendering, property editing, preview, and export.
 */

import { WzNode } from './wz/wz-node.js';
import { parseWzFile } from './wz/wz-file.js';
import { parseXmlString, parseXmlDirectory, parseXmlImageLazy } from './wz/wz-xml-parser.js';
import { serializeImage, exportClassicXmlDirectory } from './wz/wz-xml-serializer.js';
import { parseImageFromReader } from './wz/wz-image.js';
import { WzBinaryReader } from './wz/wz-binary-reader.js';
import { generateWzKey } from './wz/wz-crypto.js';
import { getIvByMapleVersion } from './wz/wz-constants.js';
import { decodePixels, getDecompressedSize, inflate, rgbaToPngDataUrl } from './wz/wz-png.js';
import { createSoundBlobUrl } from './wz/wz-sound.js';
import { showContextMenu, hideContextMenu } from './ui/wz-context-menu.js';
import { promptDialog, confirmDialog } from './ui/wz-dialogs.js';
import { WzSearch } from './ui/wz-search.js';
import { UndoStack, editAction, addAction, removeAction, renameAction, reorderAction } from './ui/wz-undo.js';
import { showXmlView } from './ui/wz-xml-view.js';
import { repackWzFile } from './wz/wz-binary-writer.js';

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
    root: null,
    selectedNode: null,
    mapleVersion: 'AUTO',
    wzBuffer: null,
    sourceInfo: '',
    modifiedNodes: new Set(),
    detectedVersion: 0,
    // Virtual scroll
    flatNodes: [],
    scrollTop: 0,
    ROW_HEIGHT: 22,
    VISIBLE_BUFFER: 10,
    // Clipboard
    clipboard: null, // { node: WzNode, cut: boolean }
    // Undo
    undoStack: new UndoStack(200),
    // XML view
    xmlViewActive: false,
    // Export
    exporting: false,
};

// ─── DOM References ──────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const treeContainer = $('#tree-container');
const propEditor = $('#prop-editor');
const previewPanel = $('#preview-panel');
const statusText = $('#status-text');
const sourceInfo = $('#source-info');
const btnOpenWz = $('#btn-open-wz');
const btnOpenXml = $('#btn-open-xml');
const btnSave = $('#btn-save');
const btnExport = $('#btn-export');
const btnSaveWz = $('#btn-save-wz');
const btnImport = $('#btn-import');
const encryptionSelect = $('#encryption-select');
const btnUndo = $('#btn-undo');
const btnRedo = $('#btn-redo');
const btnSearch = $('#btn-search');
const progressWrap = $('#progress-wrap');
const progressFill = $('#progress-fill');
const progressText = $('#progress-text');
const fileInputWz = $('#file-input-wz');
const fileInputXml = $('#file-input-xml');
const dropOverlay = $('#drop-overlay');

// ─── Search ──────────────────────────────────────────────────────────────────

const search = new WzSearch($('#tree-panel'), {
    onNavigate: (node) => navigateToNode(node),
    getRoot: () => state.root,
});

// ─── Undo/Redo status ───────────────────────────────────────────────────────

state.undoStack.onChange = (canUndo, canRedo) => {
    btnUndo.disabled = !canUndo;
    btnRedo.disabled = !canRedo;
    btnUndo.title = canUndo ? `Undo: ${state.undoStack.undoLabel()} (Ctrl+Z)` : 'Undo (Ctrl+Z)';
    btnRedo.title = canRedo ? `Redo: ${state.undoStack.redoLabel()} (Ctrl+Y)` : 'Redo (Ctrl+Y)';
};

// ─── Event Handlers ──────────────────────────────────────────────────────────

encryptionSelect.addEventListener('change', () => {
    state.mapleVersion = encryptionSelect.value;
});

btnOpenWz.addEventListener('click', () => fileInputWz.click());
btnOpenXml.addEventListener('click', openXml);

fileInputWz.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) await openWzFile(file);
    fileInputWz.value = '';
});

fileInputXml.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) await openXmlFile(file);
    fileInputXml.value = '';
});

btnExport.addEventListener('click', exportAll);
btnSave.addEventListener('click', saveModified);
btnSaveWz.addEventListener('click', saveAsWz);
btnImport.addEventListener('click', importXml);
btnUndo.addEventListener('click', () => doUndo());
btnRedo.addEventListener('click', () => doRedo());
btnSearch.addEventListener('click', () => search.toggle());

// Drag & Drop
document.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropOverlay.classList.add('active');
});
document.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) dropOverlay.classList.remove('active');
});
document.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropOverlay.classList.remove('active');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.name.endsWith('.wz')) await openWzFile(file);
    else if (file.name.endsWith('.xml')) await openXmlFile(file);
});

setupResizer($('#resizer'), $('#tree-panel'));

// ─── File Opening ────────────────────────────────────────────────────────────

async function openWzFile(file) {
    setStatus(`Loading ${file.name} (${formatSize(file.size)})...`);
    try {
        const buffer = await file.arrayBuffer();
        state.wzBuffer = buffer;
        const encSetting = encryptionSelect.value;
        setStatus(`Parsing ${file.name}...`);

        const result = parseWzFile(buffer, file.name, encSetting, -1, (msg) => setStatus(msg));

        state.root = result.root;
        state.detectedVersion = result.version;
        state.mapleVersion = result.mapleVersion;
        if (encSetting === 'AUTO') encryptionSelect.value = result.mapleVersion;

        state.sourceInfo = `${file.name} (binary, ${result.mapleVersion}, v${result.version}${result.is64Bit ? ', 64-bit' : ''})`;
        onTreeLoaded();
    } catch (err) {
        setStatus(`Error: ${err.message}`);
        console.error(err);
    }
}

async function openXml() {
    if (window.showDirectoryPicker) {
        try {
            const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            await openXmlDirectoryHandle(dirHandle);
            return;
        } catch (err) {
            if (err.name === 'AbortError') return;
        }
    }
    fileInputXml.click();
}

async function openXmlDirectoryHandle(dirHandle) {
    setStatus(`Scanning ${dirHandle.name}...`);
    const files = [];
    await collectXmlFiles(dirHandle, '', files);
    if (files.length === 0) { setStatus('No .xml files found.'); return; }
    setStatus(`Parsing ${files.length} XML files...`);
    const root = await parseXmlDirectory(files, dirHandle.name, (d, t) => setStatus(`Parsing XML: ${d}/${t}`));
    state.root = root;
    state.wzBuffer = null;
    state.sourceInfo = `${dirHandle.name} (xml, ${root.countImages()} images)`;
    onTreeLoaded();
}

async function collectXmlFiles(dirHandle, prefix, files) {
    for await (const [name, handle] of dirHandle.entries()) {
        const path = prefix ? `${prefix}/${name}` : name;
        if (handle.kind === 'directory') await collectXmlFiles(handle, path, files);
        else if (name.endsWith('.xml')) {
            files.push({ path, handle, getText: async () => { const f = await handle.getFile(); return f.text(); } });
        }
    }
}

async function openXmlFile(file) {
    setStatus(`Loading ${file.name}...`);
    try {
        const text = await file.text();
        state.root = parseXmlString(text, file.name);
        state.wzBuffer = null;
        state.sourceInfo = `${file.name} (xml)`;
        onTreeLoaded();
    } catch (err) {
        setStatus(`Error: ${err.message}`);
        console.error(err);
    }
}

function onTreeLoaded() {
    const welcome = $('#welcome');
    if (welcome) welcome.style.display = 'none';
    propEditor.style.display = 'none';
    previewPanel.innerHTML = '';
    sourceInfo.textContent = state.sourceInfo;
    btnExport.disabled = false;
    btnImport.disabled = false;
    btnSaveWz.disabled = false;
    state.modifiedNodes.clear();
    rebuildFlatList();
    renderTree();
    setStatus(`Loaded — ${state.root.countImages()} images`);
}

// ─── Virtual-Scroll Tree ─────────────────────────────────────────────────────

function rebuildFlatList() {
    state.flatNodes = [];
    if (!state.root) return;
    flattenNode(state.root, 0);
}

function flattenNode(node, depth) {
    state.flatNodes.push({ node, depth });
    if (node.expanded) {
        for (const child of node.children) {
            flattenNode(child, depth + 1);
        }
    }
}

function renderTree() {
    const containerHeight = treeContainer.clientHeight;
    const totalHeight = state.flatNodes.length * state.ROW_HEIGHT;
    const scrollTop = treeContainer.scrollTop;
    const startIdx = Math.max(0, Math.floor(scrollTop / state.ROW_HEIGHT) - state.VISIBLE_BUFFER);
    const visibleCount = Math.ceil(containerHeight / state.ROW_HEIGHT) + state.VISIBLE_BUFFER * 2;
    const endIdx = Math.min(state.flatNodes.length, startIdx + visibleCount);

    // Build HTML efficiently
    let html = `<div style="height:${totalHeight}px;position:relative;">`;
    for (let i = startIdx; i < endIdx; i++) {
        const { node, depth } = state.flatNodes[i];
        const isContainer = node.isContainer();
        const hasChildren = node.children.length > 0 || (!node.parsed && (node._binarySource || node._xmlGetText));
        const selected = state.selectedNode === node;
        const modified = node.modified;

        const toggleChar = !isContainer ? '&nbsp;' : (node.expanded ? '▼' : (hasChildren ? '▶' : '&nbsp;'));
        const valStr = !isContainer && node.type !== 'null' ? escHtml(truncate(node.getDisplayValue(), 50)) : '';
        const top = i * state.ROW_HEIGHT;

        html += `<div class="tree-node${selected ? ' selected' : ''}${modified ? ' modified' : ''}" `
            + `style="position:absolute;top:${top}px;left:0;right:0;padding-left:${depth * 16 + 6}px" `
            + `data-idx="${i}">`
            + `<span class="tree-toggle">${toggleChar}</span>`
            + `<span class="tree-icon">${node.getIcon()}</span>`
            + `<span class="tree-name">${escHtml(node.name)}</span>`
            + (valStr ? `<span class="tree-value">${valStr}</span>` : '')
            + `</div>`;
    }
    html += '</div>';
    treeContainer.innerHTML = html;
}

treeContainer.addEventListener('scroll', () => renderTree());

treeContainer.addEventListener('click', async (e) => {
    const row = e.target.closest('.tree-node');
    if (!row) return;
    const idx = parseInt(row.dataset.idx, 10);
    const entry = state.flatNodes[idx];
    if (!entry) return;
    const { node } = entry;

    state.selectedNode = node;
    state.xmlViewActive = false;

    if (node.isContainer()) {
        if (!node.parsed) await lazyParseNode(node);
        node.expanded = !node.expanded;
        rebuildFlatList();
    }
    renderTree();
    showProperties(node);
    showPreview(node);
});

// ─── Lazy Parsing ────────────────────────────────────────────────────────────

async function lazyParseNode(node) {
    if (node.parsed) return;

    if (node._xmlGetText) {
        setStatus(`Parsing ${node.name}...`);
        await parseXmlImageLazy(node);
        setStatus(`Parsed ${node.name} — ${node.children.length} properties`);
        return;
    }

    if (node._binarySource && state.wzBuffer) {
        setStatus(`Parsing ${node.name}...`);
        try {
            const src = node._binarySource;
            const wzKey = generateWzKey(getIvByMapleVersion(state.mapleVersion));
            const reader = new WzBinaryReader(state.wzBuffer, wzKey);
            reader.hash = src.hash;
            reader.header = { fStart: src.headerFStart, fSize: 0, ident: 'PKG1', copyright: '' };
            reader.pos = src.offset;
            const children = parseImageFromReader(reader, src.offset);
            for (const child of children) node.addChild(child);
            node.parsed = true;
            setStatus(`Parsed ${node.name} — ${node.children.length} properties`);
        } catch (err) {
            setStatus(`Error parsing ${node.name}: ${err.message}`);
            console.error(err);
        }
        return;
    }

    node.parsed = true;
}

// ─── Property Editor ─────────────────────────────────────────────────────────

function showProperties(node) {
    propEditor.style.display = 'block';
    propEditor.innerHTML = '';

    const pathDiv = document.createElement('div');
    pathDiv.className = 'prop-path';
    pathDiv.textContent = node.getPath();
    propEditor.appendChild(pathDiv);

    const typeDiv = document.createElement('div');
    typeDiv.className = 'prop-type';
    typeDiv.textContent = `Type: ${node.type}`;
    propEditor.appendChild(typeDiv);

    addPropRow('Name', node.name, true);

    switch (node.type) {
        case 'int': case 'short': case 'long':
            addPropRow('Value', String(node.value ?? 0), false, 'number', (v) => {
                const oldVal = node.value, newVal = parseInt(v, 10);
                const act = editAction(node, 'value', oldVal, newVal, (n) => { markModified(n); rebuildFlatList(); renderTree(); showProperties(n); });
                act.redo(); state.undoStack.push(act);
            });
            break;
        case 'float': case 'double':
            addPropRow('Value', String(node.value ?? 0), false, 'number', (v) => {
                const oldVal = node.value, newVal = parseFloat(v);
                const act = editAction(node, 'value', oldVal, newVal, (n) => { markModified(n); rebuildFlatList(); renderTree(); showProperties(n); });
                act.redo(); state.undoStack.push(act);
            });
            break;
        case 'string': case 'uol':
            addPropRow('Value', String(node.value || ''), false, 'text', (v) => {
                const oldVal = node.value;
                const act = editAction(node, 'value', oldVal, v, (n) => { markModified(n); rebuildFlatList(); renderTree(); showProperties(n); });
                act.redo(); state.undoStack.push(act);
            });
            break;
        case 'vector':
            addPropRow('X', String(node.x), false, 'number', (v) => {
                const oldVal = node.x, newVal = parseInt(v, 10);
                const act = editAction(node, 'x', oldVal, newVal, (n) => { markModified(n); rebuildFlatList(); renderTree(); showProperties(n); });
                act.redo(); state.undoStack.push(act);
            });
            addPropRow('Y', String(node.y), false, 'number', (v) => {
                const oldVal = node.y, newVal = parseInt(v, 10);
                const act = editAction(node, 'y', oldVal, newVal, (n) => { markModified(n); rebuildFlatList(); renderTree(); showProperties(n); });
                act.redo(); state.undoStack.push(act);
            });
            break;
        case 'canvas':
            addPropRow('Width', String(node.width), true);
            addPropRow('Height', String(node.height), true);
            if (node._pngInfo) addPropRow('Format', String(node._pngInfo.format), true);
            break;
        case 'sound':
            addPropRow('Duration', String(node.soundLength) + ' ms', true);
            break;
        default:
            if (node.isContainer()) addPropRow('Children', String(node.children.length), true);
    }
}

function addPropRow(label, value, readOnly, type = 'text', onChange = null) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    row.appendChild(lbl);
    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    input.readOnly = readOnly;
    if (readOnly) input.style.opacity = '0.6';
    if (onChange) {
        input.addEventListener('change', () => { onChange(input.value); renderTree(); });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { onChange(input.value); renderTree(); } });
    }
    row.appendChild(input);
    propEditor.appendChild(row);
}

function markModified(node) {
    node.modified = true;
    state.modifiedNodes.add(node);
    // Mark parent image as modified too
    let p = node.parent;
    while (p) {
        if (p.type === 'image') { p.modified = true; state.modifiedNodes.add(p); break; }
        p = p.parent;
    }
    $('#status-modified').style.display = 'inline';
    $('#modified-count').textContent = state.modifiedNodes.size;
    btnSave.disabled = false;
}

// ─── Preview ─────────────────────────────────────────────────────────────────

async function showPreview(node) {
    previewPanel.innerHTML = '';

    // Canvas preview (binary source — decode PNG from WZ data)
    if (node.type === 'canvas' && node._pngInfo && state.wzBuffer) {
        previewPanel.innerHTML = '<div style="color:var(--text-muted)">Decoding image...</div>';
        try {
            const dataUrl = await decodeBinaryCanvas(node);
            previewPanel.innerHTML = '';
            const img = document.createElement('img');
            img.src = dataUrl;
            img.title = `${node.width}×${node.height} (format ${node._pngInfo.format})`;
            previewPanel.appendChild(img);

            // Store base64 for later XML export
            node.basedata = dataUrl.split(',')[1];
        } catch (err) {
            previewPanel.innerHTML = `<div style="color:var(--text-error)">Decode error: ${escHtml(err.message)}</div>`;
            console.error(err);
        }
        return;
    }

    // Canvas preview (XML source — already has base64)
    if (node.type === 'canvas' && node.basedata) {
        const img = document.createElement('img');
        img.src = `data:image/png;base64,${node.basedata}`;
        img.title = `${node.width}×${node.height}`;
        previewPanel.appendChild(img);
        return;
    }

    // Sound preview (binary source)
    if (node.type === 'sound' && node._soundInfo && state.wzBuffer) {
        try {
            const si = node._soundInfo;
            const soundBytes = new Uint8Array(state.wzBuffer, si.dataOffset, si.dataLength);
            const blobUrl = createSoundBlobUrl(soundBytes.slice());
            const audio = document.createElement('audio');
            audio.controls = true;
            audio.src = blobUrl;
            previewPanel.appendChild(audio);

            const info = document.createElement('div');
            info.style.cssText = 'color:var(--text-muted);margin-top:8px;font-size:11px;';
            info.textContent = `Duration: ${node.soundLength}ms • Size: ${formatSize(si.dataLength)}`;
            previewPanel.appendChild(info);
        } catch (err) {
            previewPanel.innerHTML = `<div style="color:var(--text-error)">Sound error: ${escHtml(err.message)}</div>`;
        }
        return;
    }

    // Sound preview (XML source — has base64 data)
    if (node.type === 'sound' && node.basedata) {
        const binary = atob(node.basedata);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blobUrl = createSoundBlobUrl(bytes);
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = blobUrl;
        previewPanel.appendChild(audio);
        return;
    }

    // Animation preview (canvas children with numbered names and delay)
    if (node.isContainer() && node.parsed) {
        const frames = [];
        for (const child of node.children) {
            if (child.type === 'canvas' && /^\d+$/.test(child.name)) {
                frames.push(child);
            }
        }
        if (frames.length >= 2) {
            frames.sort((a, b) => parseInt(a.name) - parseInt(b.name));
            showAnimationPreview(frames);
            return;
        }
    }
}

async function decodeBinaryCanvas(node) {
    const info = node._pngInfo;
    // Read compressed pixel data from the WZ buffer
    const compressed = new Uint8Array(state.wzBuffer, info.dataOffset, info.dataLength);
    // Check for listWz format vs standard zlib
    const header = (compressed[0] | (compressed[1] << 8));
    const isStdZlib = (header === 0x9C78 || header === 0xDA78 || header === 0x0178 || header === 0x5E78);

    let rawPixels;
    const expectedSize = getDecompressedSize(node.width, node.height, info.format);

    if (isStdZlib) {
        // Standard zlib — skip 2-byte header, inflate the rest
        rawPixels = await inflate(compressed.slice(2), expectedSize);
    } else {
        // listWz format — blocks encrypted with wzKey
        const wzKey = generateWzKey(getIvByMapleVersion(state.mapleVersion));
        const decrypted = decryptListWzBlocks(compressed, wzKey);
        // Decrypted data has a 2-byte zlib header, skip it
        rawPixels = await inflate(decrypted.slice(2), expectedSize);
    }

    const rgba = decodePixels(rawPixels, node.width, node.height, info.format);
    return rgbaToPngDataUrl(rgba, node.width, node.height);
}

function decryptListWzBlocks(data, wzKey) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const output = [];
    let pos = 0;
    while (pos < data.length) {
        if (pos + 4 > data.length) break;
        const blockSize = view.getInt32(pos, true);
        pos += 4;
        if (blockSize <= 0 || pos + blockSize > data.length) break;
        wzKey.ensureKeySize(blockSize);
        for (let i = 0; i < blockSize; i++) {
            output.push(data[pos + i] ^ wzKey.at(i));
        }
        pos += blockSize;
    }
    return new Uint8Array(output);
}

// ─── Animation Preview ──────────────────────────────────────────────────────

async function showAnimationPreview(frames) {
    previewPanel.innerHTML = '<div style="color:var(--text-muted)">Loading animation...</div>';

    // Try to decode all frames
    const decoded = [];
    for (const frame of frames) {
        try {
            let dataUrl;
            if (frame._pngInfo && state.wzBuffer) {
                dataUrl = await decodeBinaryCanvas(frame);
                frame.basedata = dataUrl.split(',')[1];
            } else if (frame.basedata) {
                dataUrl = `data:image/png;base64,${frame.basedata}`;
            } else {
                continue;
            }
            // Get delay from child property
            const delayNode = frame.children.find(c => c.name === 'delay');
            const delay = delayNode ? (delayNode.value || 100) : 100;
            // Get origin from child property
            const originNode = frame.children.find(c => c.name === 'origin');
            const ox = originNode ? originNode.x : 0;
            const oy = originNode ? originNode.y : 0;
            decoded.push({ dataUrl, delay, name: frame.name, ox, oy });
        } catch {
            // skip bad frames
        }
    }

    if (decoded.length < 2) {
        previewPanel.innerHTML = '<div style="color:var(--text-muted)">Could not decode animation frames</div>';
        return;
    }

    previewPanel.innerHTML = '';

    // Compute max frame dimensions so the container never resizes
    let maxW = 0, maxH = 0;
    for (const f of decoded) {
        // Peek at the image's natural size from the frame node
        const frameNode = frames.find(n => n.name === f.name);
        const w = frameNode ? frameNode.width : 0;
        const h = frameNode ? frameNode.height : 0;
        if (w > maxW) maxW = w;
        if (h > maxH) maxH = h;
    }
    // Fallback: if we couldn't get sizes, load the first image to measure
    if (maxW === 0 || maxH === 0) { maxW = 200; maxH = 200; }

    // Wrapper for centering
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:100%;';

    // Fixed-size stage so controls don't jump when frame sizes differ
    const stage = document.createElement('div');
    stage.style.cssText = `width:${maxW}px;height:${maxH}px;position:relative;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:repeating-conic-gradient(#333 0% 25%, #444 0% 50%) 50%/16px 16px;`;

    const img = document.createElement('img');
    img.src = decoded[0].dataUrl;
    img.style.cssText = 'image-rendering:pixelated;max-width:100%;max-height:100%;';
    stage.appendChild(img);
    wrapper.appendChild(stage);

    // Controls bar
    const controls = document.createElement('div');
    controls.className = 'anim-controls';

    let frameIdx = 0;
    let playing = true;
    let speed = 1.0;
    let animTimer = null;

    // Play/Pause button
    const playBtn = document.createElement('button');
    playBtn.textContent = '⏸';
    playBtn.title = 'Play / Pause';
    playBtn.classList.add('active');
    controls.appendChild(playBtn);

    // Prev frame
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '⏮';
    prevBtn.title = 'Previous frame';
    controls.appendChild(prevBtn);

    // Next frame
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '⏭';
    nextBtn.title = 'Next frame';
    controls.appendChild(nextBtn);

    // Speed control
    const speedLabel = document.createElement('span');
    speedLabel.className = 'anim-info';
    speedLabel.textContent = '1.0×';
    const speedSlider = document.createElement('input');
    speedSlider.type = 'range';
    speedSlider.min = '0.1';
    speedSlider.max = '3.0';
    speedSlider.step = '0.1';
    speedSlider.value = '1.0';
    speedSlider.title = 'Playback speed';

    const speedWrap = document.createElement('span');
    speedWrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
    speedWrap.appendChild(speedSlider);
    speedWrap.appendChild(speedLabel);
    controls.appendChild(speedWrap);

    // Frame info
    const frameInfo = document.createElement('span');
    frameInfo.className = 'anim-info';
    frameInfo.textContent = `Frame 1/${decoded.length} (${decoded[0].delay}ms)`;
    controls.appendChild(frameInfo);

    wrapper.appendChild(controls);
    previewPanel.appendChild(wrapper);

    function updateFrameDisplay() {
        const f = decoded[frameIdx];
        img.src = f.dataUrl;
        frameInfo.textContent = `Frame ${frameIdx + 1}/${decoded.length} (${f.delay}ms)`;
    }

    function scheduleNext() {
        if (!playing) return;
        const delay = Math.max(10, decoded[frameIdx].delay / speed);
        animTimer = setTimeout(() => {
            frameIdx = (frameIdx + 1) % decoded.length;
            updateFrameDisplay();
            scheduleNext();
        }, delay);
    }

    function stopTimer() { clearTimeout(animTimer); animTimer = null; }

    playBtn.addEventListener('click', () => {
        playing = !playing;
        playBtn.textContent = playing ? '⏸' : '▶';
        playBtn.classList.toggle('active', playing);
        if (playing) scheduleNext();
        else stopTimer();
    });

    prevBtn.addEventListener('click', () => {
        stopTimer();
        playing = false;
        playBtn.textContent = '▶';
        playBtn.classList.remove('active');
        frameIdx = (frameIdx - 1 + decoded.length) % decoded.length;
        updateFrameDisplay();
    });

    nextBtn.addEventListener('click', () => {
        stopTimer();
        playing = false;
        playBtn.textContent = '▶';
        playBtn.classList.remove('active');
        frameIdx = (frameIdx + 1) % decoded.length;
        updateFrameDisplay();
    });

    speedSlider.addEventListener('input', () => {
        speed = parseFloat(speedSlider.value);
        speedLabel.textContent = `${speed.toFixed(1)}×`;
        if (playing) { stopTimer(); scheduleNext(); }
    });

    // Start animation
    scheduleNext();

    // Clean up timer when preview changes
    const observer = new MutationObserver(() => {
        if (!previewPanel.contains(wrapper)) {
            stopTimer();
            observer.disconnect();
        }
    });
    observer.observe(previewPanel, { childList: true });
}

// ─── Export ──────────────────────────────────────────────────────────────────

async function exportAll() {
    if (!state.root) return;

    if (window.showDirectoryPicker) {
        try {
            const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            setStatus('Exporting...');
            showProgress(0, state.root.countImages(), '');
            const count = await exportClassicXmlDirectory(state.root, dirHandle, {
                includeBase64: true,
                onProgress: (done, total, name) => showProgress(done, total, name),
            });
            hideProgress();
            setStatus(`Exported ${count} images`);
        } catch (err) {
            hideProgress();
            if (err.name === 'AbortError') return;
            setStatus(`Export error: ${err.message}`);
            console.error(err);
        }
    } else {
        if (state.selectedNode && state.selectedNode.type === 'image') {
            const xml = serializeImage(state.selectedNode);
            downloadBlob(xml, state.selectedNode.name + '.xml', 'text/xml');
            setStatus(`Exported ${state.selectedNode.name}`);
        } else {
            setStatus('Directory export requires Chromium. Select an image node to export single XML.');
        }
    }
}

async function saveAsWz() {
    if (!state.root) return;

    try {
        setStatus('Repacking WZ binary...');
        const totalImages = state.root.countImages();
        showProgress(0, totalImages * 2, 'Preparing...');

        // Use detected encryption or current selection
        const mv = state.mapleVersion === 'AUTO' ? 'BMS' : state.mapleVersion;
        const wzKey = generateWzKey(getIvByMapleVersion(mv));
        const version = state.detectedVersion || 83;

        // Run the repack (synchronous but with progress callbacks via setTimeout batching)
        const buffer = repackWzFile(state.root, {
            mapleVersion: mv,
            gameVersion: version,
            is64Bit: false,
            wzKey,
            originalBuffer: state.wzBuffer,
            onProgress: (done, total, name) => showProgress(done, total, name),
        });

        hideProgress();

        // Download the result
        const suggestedName = state.root.name.endsWith('.wz') ? state.root.name : state.root.name + '.wz';

        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({
                suggestedName,
                types: [{ description: 'WZ File', accept: { 'application/octet-stream': ['.wz'] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(buffer);
            await writable.close();
            setStatus(`Saved ${suggestedName} (${formatSize(buffer.byteLength)})`);
        } else {
            const blob = new Blob([buffer], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = suggestedName;
            a.click();
            URL.revokeObjectURL(url);
            setStatus(`Downloaded ${suggestedName} (${formatSize(buffer.byteLength)})`);
        }
    } catch (err) {
        hideProgress();
        setStatus(`WZ save error: ${err.message}`);
        console.error(err);
    }
}

async function saveModified() {
    if (state.modifiedNodes.size === 0) { setStatus('Nothing to save.'); return; }

    // Find modified image nodes (we serialize at the image level)
    const modifiedImages = new Set();
    for (const node of state.modifiedNodes) {
        let n = node;
        while (n) {
            if (n.type === 'image') { modifiedImages.add(n); break; }
            n = n.parent;
        }
    }

    // Quick-save: if images have file handles (opened from XML directory)
    let savedCount = 0;
    for (const imgNode of modifiedImages) {
        if (imgNode._xmlFileHandle) {
            try {
                const xml = serializeImage(imgNode);
                const writable = await imgNode._xmlFileHandle.createWritable();
                await writable.write(xml);
                await writable.close();
                savedCount++;
            } catch (err) {
                console.error(`Error saving ${imgNode.name}:`, err);
            }
        }
    }

    if (savedCount > 0) {
        // Clear modified flags for saved images
        for (const imgNode of modifiedImages) {
            if (imgNode._xmlFileHandle) clearModifiedFlags(imgNode);
        }
        state.modifiedNodes = new Set([...state.modifiedNodes].filter(n => n.modified));
        updateModifiedCount();
        renderTree();
        setStatus(`Saved ${savedCount} image(s) in-place`);
        return;
    }

    // Fallback: if no file handles, offer to export
    if (modifiedImages.size === 1) {
        const img = [...modifiedImages][0];
        const xml = serializeImage(img);
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: img.name + '.xml',
                    types: [{ description: 'XML', accept: { 'text/xml': ['.xml'] } }],
                });
                const writable = await handle.createWritable();
                await writable.write(xml);
                await writable.close();
                clearModifiedFlags(img);
                state.modifiedNodes = new Set([...state.modifiedNodes].filter(n => n.modified));
                updateModifiedCount();
                renderTree();
                setStatus(`Saved ${img.name}`);
            } catch (err) {
                if (err.name !== 'AbortError') setStatus(`Save error: ${err.message}`);
            }
        } else {
            downloadBlob(xml, img.name + '.xml', 'text/xml');
            setStatus(`Downloaded ${img.name}.xml`);
        }
    } else {
        setStatus(`${modifiedImages.size} images modified. Use "Export All" to save.`);
    }
}

function clearModifiedFlags(node) {
    node.modified = false;
    for (const c of node.children) clearModifiedFlags(c);
}

function updateModifiedCount() {
    const count = state.modifiedNodes.size;
    $('#status-modified').style.display = count > 0 ? 'inline' : 'none';
    $('#modified-count').textContent = count;
    btnSave.disabled = count === 0;
}

// ─── Import ──────────────────────────────────────────────────────────────────

async function importXml() {
    if (!state.root) { setStatus('Open a file first.'); return; }
    const target = state.selectedNode;
    if (!target || !target.isContainer()) {
        setStatus('Select a directory, image, or sub-property to import into.');
        return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xml';
    input.multiple = true;
    input.addEventListener('change', async () => {
        let imported = 0;
        for (const file of input.files) {
            try {
                const text = await file.text();
                const parsed = parseXmlString(text, file.name);
                // If parsed is a file node, add its children; if image/sub, add it directly
                const nodesToAdd = parsed.type === 'file' ? parsed.children : [parsed];
                for (const node of nodesToAdd) {
                    if (target.getChild(node.name)) {
                        console.warn(`Skipping duplicate: ${node.name}`);
                        continue;
                    }
                    target.addChild(node);
                    markModified(node);
                    imported++;
                }
            } catch (err) {
                console.error(`Error importing ${file.name}:`, err);
            }
        }
        if (imported > 0) {
            target.expanded = true;
            target.parsed = true;
            rebuildFlatList();
            renderTree();
        }
        setStatus(`Imported ${imported} node(s)`);
    });
    input.click();
}

// ─── Context Menu Actions ────────────────────────────────────────────────────

treeContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const row = e.target.closest('.tree-node');
    if (!row) return;
    const idx = parseInt(row.dataset.idx, 10);
    const entry = state.flatNodes[idx];
    if (!entry) return;

    state.selectedNode = entry.node;
    renderTree();
    showProperties(entry.node);

    showContextMenu(e.clientX, e.clientY, entry.node, handleContextAction);
});

async function handleContextAction(action, data) {
    const node = state.selectedNode;
    if (!node) return;

    switch (action) {
        case 'add': await addNode(node, data); break;
        case 'remove': await removeNode(node); break;
        case 'rename': await renameNode(node); break;
        case 'exportXml': exportNodeXml(node); break;
        case 'exportDir': await exportNodeDir(node); break;
        case 'saveImage': saveCanvasImage(node); break;
        case 'saveSound': saveSoundFile(node); break;
        case 'sortChildren': sortChildren(node); break;
        case 'expandAll': expandAll(node); break;
        case 'collapseAll': collapseAll(node); break;
        case 'copy': copyNode(node); break;
        case 'paste': await pasteNode(node); break;
        case 'viewXml': toggleXmlView(node); break;
    }
}

async function addNode(parent, type) {
    const name = await promptDialog('Add ' + type, 'Name:', type === 'image' ? 'new.img' : 'new');
    if (name === null) return;

    const newNode = new WzNode(name, type);
    newNode.parsed = true;
    if (type === 'int' || type === 'short' || type === 'long') newNode.value = 0;
    else if (type === 'float' || type === 'double') newNode.value = 0.0;
    else if (type === 'string' || type === 'uol') newNode.value = '';
    else if (type === 'canvas') { newNode.width = 1; newNode.height = 1; }

    const refreshParent = (p) => { p.expanded = true; p.parsed = true; markModified(newNode); rebuildFlatList(); renderTree(); };
    const action = addAction(parent, newNode, refreshParent);
    action.redo();
    state.undoStack.push(action);
    setStatus(`Added ${type} "${name}"`);
}

async function removeNode(node) {
    if (!node.parent) { setStatus('Cannot remove root.'); return; }
    const ok = await confirmDialog('Remove Node', `Delete "${node.name}" and all its children?`);
    if (!ok) return;

    const parent = node.parent;
    const index = parent.children.indexOf(node);
    const refresh = (p) => {
        markModified(p);
        if (state.selectedNode === node) { state.selectedNode = p; showProperties(p); }
        rebuildFlatList(); renderTree();
    };
    const action = removeAction(parent, node, index, refresh);
    action.redo();
    state.undoStack.push(action);
    setStatus(`Removed "${node.name}"`);
}

async function renameNode(node) {
    const oldName = node.name;
    const newName = await promptDialog('Rename', 'New name:', oldName);
    if (newName === null || newName === oldName) return;

    const refresh = (n) => { markModified(n); rebuildFlatList(); renderTree(); showProperties(n); };
    const action = renameAction(node, oldName, newName, refresh);
    action.redo();
    state.undoStack.push(action);
    setStatus(`Renamed to "${newName}"`);
}

function exportNodeXml(node) {
    if (node.type === 'image') {
        const xml = serializeImage(node);
        downloadBlob(xml, node.name + '.xml', 'text/xml');
        setStatus(`Exported ${node.name}`);
    } else {
        // Export as XML fragment
        const { serializeImage: si } = { serializeImage };
        // Create a temporary image wrapper
        const tmpImg = new WzNode(node.name + '.img', 'image');
        tmpImg.addChild(node);
        tmpImg.parsed = true;
        const xml = serializeImage(tmpImg);
        // Restore parent
        tmpImg.removeChild(node);
        downloadBlob(xml, node.name + '.xml', 'text/xml');
        setStatus(`Exported ${node.name}`);
    }
}

async function exportNodeDir(node) {
    if (!window.showDirectoryPicker) {
        setStatus('Directory export requires Chromium.');
        return;
    }
    try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        setStatus('Exporting...');
        showProgress(0, node.countImages(), '');
        const count = await exportClassicXmlDirectory(node, dirHandle, {
            includeBase64: true,
            onProgress: (done, total, name) => showProgress(done, total, name),
        });
        hideProgress();
        setStatus(`Exported ${count} images`);
    } catch (err) {
        hideProgress();
        if (err.name !== 'AbortError') setStatus(`Export error: ${err.message}`);
    }
}

async function saveCanvasImage(node) {
    if (!node.basedata) {
        // Try to decode first
        if (node._pngInfo && state.wzBuffer) {
            try {
                const dataUrl = await decodeBinaryCanvas(node);
                node.basedata = dataUrl.split(',')[1];
            } catch { setStatus('Could not decode image.'); return; }
        } else {
            setStatus('No image data available.'); return;
        }
    }
    const binary = atob(node.basedata);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'image/png' });

    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: node.name + '.png',
                types: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            setStatus(`Saved ${node.name}.png`);
        } catch (err) {
            if (err.name !== 'AbortError') setStatus(`Save error: ${err.message}`);
        }
    } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = node.name + '.png'; a.click();
        URL.revokeObjectURL(url);
        setStatus(`Downloaded ${node.name}.png`);
    }
}

function saveSoundFile(node) {
    let bytes;
    if (node._soundInfo && state.wzBuffer) {
        bytes = new Uint8Array(state.wzBuffer, node._soundInfo.dataOffset, node._soundInfo.dataLength).slice();
    } else if (node.basedata) {
        const binary = atob(node.basedata);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } else {
        setStatus('No sound data available.'); return;
    }
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = node.name + '.mp3'; a.click();
    URL.revokeObjectURL(url);
    setStatus(`Downloaded ${node.name}.mp3`);
}

function sortChildren(node) {
    node.children.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    markModified(node);
    rebuildFlatList();
    renderTree();
    setStatus(`Sorted children of "${node.name}"`);
}

function expandAll(node) {
    function expand(n) {
        if (n.isContainer() && n.parsed) { n.expanded = true; for (const c of n.children) expand(c); }
    }
    expand(node);
    rebuildFlatList();
    renderTree();
}

function collapseAll(node) {
    function collapse(n) {
        n.expanded = false;
        for (const c of n.children) collapse(c);
    }
    collapse(node);
    rebuildFlatList();
    renderTree();
}

// ─── Keyboard Navigation ─────────────────────────────────────────────────────

treeContainer.setAttribute('tabindex', '0');
treeContainer.addEventListener('keydown', async (e) => {
    if (!state.selectedNode || state.flatNodes.length === 0) return;

    const curIdx = state.flatNodes.findIndex(f => f.node === state.selectedNode);
    if (curIdx === -1) return;

    switch (e.key) {
        case 'ArrowDown': {
            e.preventDefault();
            const next = Math.min(curIdx + 1, state.flatNodes.length - 1);
            selectByIndex(next);
            break;
        }
        case 'ArrowUp': {
            e.preventDefault();
            const prev = Math.max(curIdx - 1, 0);
            selectByIndex(prev);
            break;
        }
        case 'ArrowRight': {
            e.preventDefault();
            const node = state.selectedNode;
            if (node.isContainer() && !node.expanded) {
                if (!node.parsed) await lazyParseNode(node);
                node.expanded = true;
                rebuildFlatList();
                renderTree();
            }
            break;
        }
        case 'ArrowLeft': {
            e.preventDefault();
            const node = state.selectedNode;
            if (node.expanded) {
                node.expanded = false;
                rebuildFlatList();
                renderTree();
            } else if (node.parent) {
                const parentIdx = state.flatNodes.findIndex(f => f.node === node.parent);
                if (parentIdx >= 0) selectByIndex(parentIdx);
            }
            break;
        }
        case 'Delete': {
            e.preventDefault();
            if (state.selectedNode.parent) await removeNode(state.selectedNode);
            break;
        }
        case 'F2': {
            e.preventDefault();
            await renameNode(state.selectedNode);
            break;
        }
    }
});

// Global keyboard shortcuts
document.addEventListener('keydown', async (e) => {
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case 's': e.preventDefault(); await saveModified(); break;
            case 'e': e.preventDefault(); await exportAll(); break;
            case 'i': e.preventDefault(); await importXml(); break;
            case 'f': e.preventDefault(); search.toggle(); break;
            case 'z': e.preventDefault(); doUndo(); break;
            case 'y': e.preventDefault(); doRedo(); break;
            case 'c': {
                // Only handle copy if focus is NOT in an input/textarea
                if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') break;
                e.preventDefault();
                copyNode(state.selectedNode);
                break;
            }
            case 'v': {
                if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') break;
                e.preventDefault();
                await pasteNode(state.selectedNode);
                break;
            }
            case 'x': {
                if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') break;
                e.preventDefault();
                cutNode(state.selectedNode);
                break;
            }
        }
    }
});

function selectByIndex(idx) {
    const entry = state.flatNodes[idx];
    if (!entry) return;
    state.selectedNode = entry.node;
    renderTree();
    showProperties(entry.node);
    showPreview(entry.node);
    // Scroll into view
    const top = idx * state.ROW_HEIGHT;
    if (top < treeContainer.scrollTop) treeContainer.scrollTop = top;
    else if (top + state.ROW_HEIGHT > treeContainer.scrollTop + treeContainer.clientHeight) {
        treeContainer.scrollTop = top - treeContainer.clientHeight + state.ROW_HEIGHT;
    }
}

/** Navigate to a node: expand all ancestors, rebuild flat list, scroll to it */
async function navigateToNode(node) {
    // Expand all ancestors
    const ancestors = [];
    let p = node.parent;
    while (p) { ancestors.unshift(p); p = p.parent; }
    for (const a of ancestors) {
        if (!a.parsed && a.isContainer()) await lazyParseNode(a);
        a.expanded = true;
    }
    rebuildFlatList();
    const idx = state.flatNodes.findIndex(f => f.node === node);
    if (idx >= 0) selectByIndex(idx);
}

// ─── Undo / Redo ─────────────────────────────────────────────────────────

function doUndo() {
    const action = state.undoStack.undo();
    if (action) setStatus(`Undo: ${action.label}`);
}

function doRedo() {
    const action = state.undoStack.redo();
    if (action) setStatus(`Redo: ${action.label}`);
}

// ─── Copy / Paste / Cut ──────────────────────────────────────────────────

/**
 * Deep-clone a WzNode and all its children (excluding binary/file handle sources).
 */
function cloneNode(node) {
    const copy = new WzNode(node.name, node.type);
    copy.value = node.value;
    copy.x = node.x;
    copy.y = node.y;
    copy.width = node.width;
    copy.height = node.height;
    copy.basedata = node.basedata;
    copy.basehead = node.basehead;
    copy.soundLength = node.soundLength;
    copy.parsed = node.parsed;
    for (const child of node.children) {
        copy.addChild(cloneNode(child));
    }
    return copy;
}

function copyNode(node) {
    if (!node) { setStatus('No node selected.'); return; }
    state.clipboard = { node: cloneNode(node), cut: false, sourceNode: null };
    setStatus(`Copied "${node.name}"`);
}

function cutNode(node) {
    if (!node) { setStatus('No node selected.'); return; }
    if (!node.parent) { setStatus('Cannot cut root node.'); return; }
    state.clipboard = { node: cloneNode(node), cut: true, sourceNode: node };
    setStatus(`Cut "${node.name}" — paste to move`);
}

async function pasteNode(target) {
    if (!state.clipboard) { setStatus('Clipboard is empty.'); return; }
    if (!target) { setStatus('No target selected.'); return; }

    // Find the container to paste into
    let container = target;
    if (!container.isContainer()) {
        container = container.parent;
    }
    if (!container) { setStatus('Cannot paste here.'); return; }

    // Ensure container is parsed
    if (!container.parsed) await lazyParseNode(container);

    const pastedNode = cloneNode(state.clipboard.node);

    // If name already exists, auto-rename
    let name = pastedNode.name;
    let counter = 1;
    while (container.getChild(name)) {
        name = `${pastedNode.name}_${counter}`;
        counter++;
    }
    pastedNode.name = name;

    // If this was a cut, remove the source node
    if (state.clipboard.cut && state.clipboard.sourceNode && state.clipboard.sourceNode.parent) {
        const src = state.clipboard.sourceNode;
        const srcParent = src.parent;
        const srcIndex = srcParent.children.indexOf(src);
        srcParent.removeChild(src);
        markModified(srcParent);
        state.clipboard = null; // cut is one-time
    }

    const refreshParent = (p) => {
        p.expanded = true;
        p.parsed = true;
        markModified(pastedNode);
        rebuildFlatList();
        renderTree();
    };
    const action = addAction(container, pastedNode, refreshParent);
    action.redo();
    state.undoStack.push(action);
    setStatus(`Pasted "${pastedNode.name}" into "${container.name}"`);
}

// ─── XML View ────────────────────────────────────────────────────────────

function toggleXmlView(node) {
    if (!node) return;
    state.xmlViewActive = !state.xmlViewActive;
    if (state.xmlViewActive) {
        showXmlView(previewPanel, node, { onModified: () => { markModified(node); renderTree(); } });
    } else {
        showPreview(node);
    }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function setStatus(text) { statusText.textContent = text; }

function showProgress(done, total, label) {
    state.exporting = true;
    progressWrap.style.display = 'flex';
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    progressFill.style.width = pct + '%';
    progressText.textContent = `${done} / ${total} (${pct}%)${label ? ' — ' + label : ''}`;
}

function hideProgress() {
    state.exporting = false;
    progressWrap.style.display = 'none';
    progressFill.style.width = '0%';
    progressText.textContent = '';
}

// Warn user if they try to leave/reload during an export
window.addEventListener('beforeunload', (e) => {
    if (state.exporting) {
        e.preventDefault();
        e.returnValue = '';
    }
});

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(1) + ' GB';
}

function downloadBlob(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
}

function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(s, max) {
    return s.length > max ? s.substring(0, max) + '…' : s;
}

function setupResizer(resizer, panel) {
    let startX, startWidth;
    resizer.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        startWidth = panel.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        const onMove = (e) => { panel.style.width = (startWidth + e.clientX - startX) + 'px'; };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            renderTree();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

// ─── Init ────────────────────────────────────────────────────────────────────

setStatus('Ready — open a .wz or .xml file to begin');
