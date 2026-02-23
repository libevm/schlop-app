/**
 * Search panel for the WZ tree.
 * Searches by name, value, or both with optional regex.
 */

/**
 * @typedef {Object} SearchResult
 * @property {import('../wz/wz-node.js').WzNode} node
 * @property {string} matchField - 'name' | 'value'
 * @property {string} matchText
 */

export class WzSearch {
    /**
     * @param {HTMLElement} container - Element to render the search UI into
     * @param {object} callbacks
     * @param {(node: import('../wz/wz-node.js').WzNode) => void} callbacks.onNavigate
     * @param {() => import('../wz/wz-node.js').WzNode|null} callbacks.getRoot
     */
    constructor(container, callbacks) {
        this.container = container;
        this.callbacks = callbacks;
        this.results = [];
        this.currentIdx = -1;
        this.visible = false;
        this._build();
    }

    _build() {
        this.el = document.createElement('div');
        this.el.className = 'search-panel';
        this.el.style.display = 'none';
        this.el.innerHTML = `
            <div class="search-bar">
                <input type="text" class="search-input" placeholder="Search nodes…">
                <select class="search-field">
                    <option value="both">Name + Value</option>
                    <option value="name">Name only</option>
                    <option value="value">Value only</option>
                </select>
                <label class="search-opt"><input type="checkbox" class="search-regex"> Regex</label>
                <label class="search-opt"><input type="checkbox" class="search-case"> Match case</label>
                <button class="search-btn search-prev" title="Previous (Shift+Enter)">▲</button>
                <button class="search-btn search-next" title="Next (Enter)">▼</button>
                <button class="search-btn search-close" title="Close (Esc)">✕</button>
                <span class="search-count"></span>
            </div>
            <div class="search-results"></div>
        `;
        this.container.prepend(this.el);

        this.input = this.el.querySelector('.search-input');
        this.fieldSel = this.el.querySelector('.search-field');
        this.regexCb = this.el.querySelector('.search-regex');
        this.caseCb = this.el.querySelector('.search-case');
        this.countEl = this.el.querySelector('.search-count');
        this.resultsEl = this.el.querySelector('.search-results');

        this.input.addEventListener('input', () => this._debounceSearch());
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.shiftKey ? this.prev() : this.next(); e.preventDefault(); }
            if (e.key === 'Escape') this.hide();
        });
        this.fieldSel.addEventListener('change', () => this._doSearch());
        this.regexCb.addEventListener('change', () => this._doSearch());
        this.caseCb.addEventListener('change', () => this._doSearch());
        this.el.querySelector('.search-prev').addEventListener('click', () => this.prev());
        this.el.querySelector('.search-next').addEventListener('click', () => this.next());
        this.el.querySelector('.search-close').addEventListener('click', () => this.hide());
    }

    show() {
        this.visible = true;
        this.el.style.display = '';
        this.input.focus();
        this.input.select();
    }

    hide() {
        this.visible = false;
        this.el.style.display = 'none';
        this.results = [];
        this.currentIdx = -1;
        this.resultsEl.innerHTML = '';
        this.countEl.textContent = '';
    }

    toggle() { this.visible ? this.hide() : this.show(); }

    next() {
        if (this.results.length === 0) return;
        this.currentIdx = (this.currentIdx + 1) % this.results.length;
        this._highlightResult();
    }

    prev() {
        if (this.results.length === 0) return;
        this.currentIdx = (this.currentIdx - 1 + this.results.length) % this.results.length;
        this._highlightResult();
    }

    _debounceSearch() {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this._doSearch(), 200);
    }

    _doSearch() {
        const query = this.input.value.trim();
        if (!query) {
            this.results = [];
            this.currentIdx = -1;
            this.countEl.textContent = '';
            this.resultsEl.innerHTML = '';
            return;
        }

        const root = this.callbacks.getRoot();
        if (!root) return;

        const field = this.fieldSel.value;
        const useRegex = this.regexCb.checked;
        const matchCase = this.caseCb.checked;

        let matcher;
        try {
            if (useRegex) {
                const flags = matchCase ? '' : 'i';
                const re = new RegExp(query, flags);
                matcher = (s) => re.test(s);
            } else {
                const q = matchCase ? query : query.toLowerCase();
                matcher = (s) => (matchCase ? s : s.toLowerCase()).includes(q);
            }
        } catch {
            this.countEl.textContent = 'Invalid regex';
            return;
        }

        this.results = [];
        const MAX = 500;
        this._searchNode(root, field, matcher, MAX);
        this.currentIdx = this.results.length > 0 ? 0 : -1;

        this.countEl.textContent = this.results.length >= MAX
            ? `${MAX}+ matches`
            : `${this.results.length} match${this.results.length !== 1 ? 'es' : ''}`;

        this._renderResults();
        if (this.currentIdx >= 0) this._highlightResult();
    }

    /** @param {import('../wz/wz-node.js').WzNode} node */
    _searchNode(node, field, matcher, max) {
        if (this.results.length >= max) return;

        const nameMatch = (field === 'name' || field === 'both') && matcher(node.name);
        const valStr = node.getDisplayValue();
        const valMatch = (field === 'value' || field === 'both') && valStr && matcher(valStr);

        if (nameMatch) {
            this.results.push({ node, matchField: 'name', matchText: node.name });
        } else if (valMatch) {
            this.results.push({ node, matchField: 'value', matchText: valStr });
        }

        for (const child of node.children) {
            if (this.results.length >= max) break;
            this._searchNode(child, field, matcher, max);
        }
    }

    _renderResults() {
        this.resultsEl.innerHTML = '';
        const frag = document.createDocumentFragment();
        for (let i = 0; i < Math.min(this.results.length, 100); i++) {
            const r = this.results[i];
            const el = document.createElement('div');
            el.className = 'search-result-item';
            el.dataset.idx = i;

            const path = r.node.getPath();
            const shortPath = path.length > 60 ? '…' + path.slice(-58) : path;
            el.innerHTML = `<span class="sr-path">${escHtml(shortPath)}</span>`;
            if (r.matchField === 'value') {
                el.innerHTML += ` <span class="sr-val">= ${escHtml(truncate(r.matchText, 40))}</span>`;
            }

            el.addEventListener('click', () => {
                this.currentIdx = i;
                this._highlightResult();
            });
            frag.appendChild(el);
        }
        if (this.results.length > 100) {
            const more = document.createElement('div');
            more.className = 'search-result-item sr-more';
            more.textContent = `… and ${this.results.length - 100} more`;
            frag.appendChild(more);
        }
        this.resultsEl.appendChild(frag);
    }

    _highlightResult() {
        // Remove previous highlight
        this.resultsEl.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
        const items = this.resultsEl.querySelectorAll('.search-result-item');
        if (items[this.currentIdx]) {
            items[this.currentIdx].classList.add('active');
            items[this.currentIdx].scrollIntoView({ block: 'nearest' });
        }
        // Navigate to node
        const result = this.results[this.currentIdx];
        if (result) {
            this.callbacks.onNavigate(result.node);
        }
        this.countEl.textContent = `${this.currentIdx + 1}/${this.results.length}`;
    }
}

function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function truncate(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }
