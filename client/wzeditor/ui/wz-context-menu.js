/**
 * Context menu for the WZ tree.
 * Type-aware menus matching Harepacker's ContextMenuManager.
 */

import { WzNode } from '../wz/wz-node.js';

let _menuEl = null;
let _onAction = null;

/** Show context menu at (x,y) for the given node */
export function showContextMenu(x, y, node, onAction) {
    hideContextMenu();
    _onAction = onAction;

    const items = buildMenuItems(node);
    if (items.length === 0) return;

    _menuEl = document.createElement('div');
    _menuEl.className = 'ctx-menu';
    _menuEl.style.left = x + 'px';
    _menuEl.style.top = y + 'px';

    for (const item of items) {
        if (item.separator) {
            const sep = document.createElement('div');
            sep.className = 'ctx-sep';
            _menuEl.appendChild(sep);
            continue;
        }
        if (item.submenu) {
            const sub = document.createElement('div');
            sub.className = 'ctx-item ctx-sub';
            sub.textContent = item.label;
            const arrow = document.createElement('span');
            arrow.className = 'ctx-arrow';
            arrow.textContent = '▶';
            sub.appendChild(arrow);

            const subMenu = document.createElement('div');
            subMenu.className = 'ctx-submenu';
            for (const si of item.submenu) {
                const el = document.createElement('div');
                el.className = 'ctx-item';
                el.textContent = si.label;
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    hideContextMenu();
                    _onAction(si.action, si.data);
                });
                subMenu.appendChild(el);
            }
            sub.appendChild(subMenu);
            _menuEl.appendChild(sub);
            continue;
        }
        const el = document.createElement('div');
        el.className = 'ctx-item' + (item.disabled ? ' disabled' : '');
        el.textContent = item.label;
        if (!item.disabled) {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                hideContextMenu();
                _onAction(item.action, item.data);
            });
        }
        _menuEl.appendChild(el);
    }

    document.body.appendChild(_menuEl);

    // Clamp to viewport
    const rect = _menuEl.getBoundingClientRect();
    if (rect.right > window.innerWidth) _menuEl.style.left = (window.innerWidth - rect.width - 4) + 'px';
    if (rect.bottom > window.innerHeight) _menuEl.style.top = (window.innerHeight - rect.height - 4) + 'px';

    // Close on click outside
    setTimeout(() => document.addEventListener('click', _closeHandler, { once: true }), 0);
}

function _closeHandler() { hideContextMenu(); }

export function hideContextMenu() {
    if (_menuEl) { _menuEl.remove(); _menuEl = null; }
}

const ADD_TYPES = [
    { label: 'Directory', data: 'dir' },
    { label: 'Image', data: 'image' },
    { label: 'Sub Property', data: 'sub' },
    { label: 'Int', data: 'int' },
    { label: 'Short', data: 'short' },
    { label: 'Long', data: 'long' },
    { label: 'Float', data: 'float' },
    { label: 'Double', data: 'double' },
    { label: 'String', data: 'string' },
    { label: 'Vector', data: 'vector' },
    { label: 'Canvas', data: 'canvas' },
    { label: 'Sound', data: 'sound' },
    { label: 'UOL', data: 'uol' },
    { label: 'Null', data: 'null' },
];

function buildMenuItems(node) {
    const items = [];
    const t = node.type;

    // Add submenu for containers
    if (['file', 'dir'].includes(t)) {
        items.push({
            label: 'Add',
            submenu: [
                { label: 'Directory', action: 'add', data: 'dir' },
                { label: 'Image', action: 'add', data: 'image' },
            ],
        });
        items.push({ separator: true });
        items.push({ label: 'Copy', action: 'copy' });
        items.push({ label: 'Paste', action: 'paste' });
        items.push({ separator: true });
        items.push({ label: 'Expand All', action: 'expandAll' });
        items.push({ label: 'Collapse All', action: 'collapseAll' });
        items.push({ separator: true });
        items.push({ label: 'Export XML Directory', action: 'exportDir' });
        items.push({ label: 'View XML', action: 'viewXml' });
        if (t === 'dir') {
            items.push({ separator: true });
            items.push({ label: 'Rename', action: 'rename' });
            items.push({ label: 'Remove', action: 'remove' });
        }
    } else if (t === 'image' || t === 'sub') {
        items.push({
            label: 'Add',
            submenu: ADD_TYPES.filter(at => !['dir', 'image'].includes(at.data)).map(at => ({
                label: at.label, action: 'add', data: at.data,
            })),
        });
        items.push({ separator: true });
        items.push({ label: 'Copy', action: 'copy' });
        items.push({ label: 'Paste', action: 'paste' });
        items.push({ separator: true });
        items.push({ label: 'Export XML', action: 'exportXml' });
        items.push({ label: 'View XML', action: 'viewXml' });
        items.push({ separator: true });
        items.push({ label: 'Sort Children', action: 'sortChildren' });
        items.push({ separator: true });
        items.push({ label: 'Rename', action: 'rename' });
        items.push({ label: 'Remove', action: 'remove' });
    } else if (t === 'canvas') {
        items.push({
            label: 'Add',
            submenu: ADD_TYPES.filter(at => !['dir', 'image'].includes(at.data)).map(at => ({
                label: at.label, action: 'add', data: at.data,
            })),
        });
        items.push({ separator: true });
        items.push({ label: 'Copy', action: 'copy' });
        items.push({ label: 'Paste', action: 'paste' });
        items.push({ separator: true });
        items.push({ label: 'Export XML', action: 'exportXml' });
        items.push({ label: 'View XML', action: 'viewXml' });
        items.push({ label: 'Save Image (PNG)', action: 'saveImage' });
        items.push({ label: 'Replace Image…', action: 'replaceImage' });
        items.push({ separator: true });
        items.push({ label: 'Rename', action: 'rename' });
        items.push({ label: 'Remove', action: 'remove' });
    } else if (t === 'sound') {
        items.push({ label: 'Copy', action: 'copy' });
        items.push({ separator: true });
        items.push({ label: 'Export XML', action: 'exportXml' });
        items.push({ label: 'View XML', action: 'viewXml' });
        items.push({ label: 'Save Sound', action: 'saveSound' });
        items.push({ label: 'Replace Sound…', action: 'replaceSound' });
        items.push({ separator: true });
        items.push({ label: 'Rename', action: 'rename' });
        items.push({ label: 'Remove', action: 'remove' });
    } else if (t === 'convex') {
        items.push({
            label: 'Add',
            submenu: [{ label: 'Vector', action: 'add', data: 'vector' }],
        });
        items.push({ separator: true });
        items.push({ label: 'Copy', action: 'copy' });
        items.push({ label: 'Paste', action: 'paste' });
        items.push({ separator: true });
        items.push({ label: 'Export XML', action: 'exportXml' });
        items.push({ label: 'View XML', action: 'viewXml' });
        items.push({ label: 'Rename', action: 'rename' });
        items.push({ label: 'Remove', action: 'remove' });
    } else {
        // Leaf nodes
        items.push({ label: 'Copy', action: 'copy' });
        items.push({ separator: true });
        items.push({ label: 'Export XML', action: 'exportXml' });
        items.push({ label: 'View XML', action: 'viewXml' });
        items.push({ separator: true });
        items.push({ label: 'Rename', action: 'rename' });
        items.push({ label: 'Remove', action: 'remove' });
    }

    return items;
}
