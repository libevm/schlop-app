/**
 * Modal dialogs for the WZ Editor.
 * Simple promise-based dialogs for rename, add, confirm.
 */

/**
 * Show a text input dialog.
 * @param {string} title
 * @param {string} label
 * @param {string} [defaultValue='']
 * @returns {Promise<string|null>} entered value or null if cancelled
 */
export function promptDialog(title, label, defaultValue = '') {
    return new Promise((resolve) => {
        const overlay = createOverlay();
        const dialog = document.createElement('div');
        dialog.className = 'wz-dialog';

        dialog.innerHTML = `
            <div class="wz-dialog-title">${escHtml(title)}</div>
            <div class="wz-dialog-body">
                <label>${escHtml(label)}</label>
                <input type="text" class="wz-dialog-input" value="${escAttr(defaultValue)}">
            </div>
            <div class="wz-dialog-buttons">
                <button class="wz-dialog-btn cancel">Cancel</button>
                <button class="wz-dialog-btn ok">OK</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = dialog.querySelector('.wz-dialog-input');
        input.select();
        input.focus();

        function close(value) {
            overlay.remove();
            resolve(value);
        }

        dialog.querySelector('.ok').addEventListener('click', () => close(input.value));
        dialog.querySelector('.cancel').addEventListener('click', () => close(null));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') close(input.value);
            if (e.key === 'Escape') close(null);
        });
    });
}

/**
 * Show a select dialog (pick from a list).
 * @param {string} title
 * @param {string} label
 * @param {Array<{value: string, label: string}>} options
 * @returns {Promise<string|null>}
 */
export function selectDialog(title, label, options) {
    return new Promise((resolve) => {
        const overlay = createOverlay();
        const dialog = document.createElement('div');
        dialog.className = 'wz-dialog';

        const optHtml = options.map(o => `<option value="${escAttr(o.value)}">${escHtml(o.label)}</option>`).join('');
        dialog.innerHTML = `
            <div class="wz-dialog-title">${escHtml(title)}</div>
            <div class="wz-dialog-body">
                <label>${escHtml(label)}</label>
                <select class="wz-dialog-input">${optHtml}</select>
            </div>
            <div class="wz-dialog-buttons">
                <button class="wz-dialog-btn cancel">Cancel</button>
                <button class="wz-dialog-btn ok">OK</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const sel = dialog.querySelector('.wz-dialog-input');
        sel.focus();

        function close(value) { overlay.remove(); resolve(value); }

        dialog.querySelector('.ok').addEventListener('click', () => close(sel.value));
        dialog.querySelector('.cancel').addEventListener('click', () => close(null));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
        sel.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') close(sel.value);
            if (e.key === 'Escape') close(null);
        });
    });
}

/**
 * Show a confirmation dialog.
 * @param {string} title
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function confirmDialog(title, message) {
    return new Promise((resolve) => {
        const overlay = createOverlay();
        const dialog = document.createElement('div');
        dialog.className = 'wz-dialog';
        dialog.innerHTML = `
            <div class="wz-dialog-title">${escHtml(title)}</div>
            <div class="wz-dialog-body"><p>${escHtml(message)}</p></div>
            <div class="wz-dialog-buttons">
                <button class="wz-dialog-btn cancel">Cancel</button>
                <button class="wz-dialog-btn ok danger">Delete</button>
            </div>
        `;
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        dialog.querySelector('.ok').focus();

        function close(val) { overlay.remove(); resolve(val); }
        dialog.querySelector('.ok').addEventListener('click', () => close(true));
        dialog.querySelector('.cancel').addEventListener('click', () => close(false));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close(false);
            if (e.key === 'Enter') close(true);
        });
    });
}

function createOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'wz-dialog-overlay';
    return overlay;
}

function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
