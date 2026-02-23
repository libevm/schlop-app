/**
 * Unified in-memory model for all WZ data — whether from binary .wz or Harepacker XML.
 * Every node in the tree is a WzNode.
 */

let _nextId = 1;

export class WzNode {
    /**
     * @param {string} name
     * @param {string} type - 'file'|'dir'|'image'|'sub'|'int'|'short'|'long'|'float'|'double'
     *                        |'string'|'vector'|'canvas'|'sound'|'uol'|'null'|'convex'|'lua'
     */
    constructor(name, type) {
        this.id = _nextId++;
        this.name = name;
        this.type = type;

        // Value fields (type-dependent)
        this.value = null;       // number|string|null — for int/short/long/float/double/string/uol
        this.x = 0;             // vector
        this.y = 0;             // vector
        this.width = 0;         // canvas
        this.height = 0;        // canvas
        this.basedata = null;   // string (base64) — canvas PNG / sound data
        this.basehead = null;   // string (base64) — sound header
        this.soundLength = 0;   // sound duration ms

        // Tree structure
        this.children = [];
        this.parent = null;

        // UI state
        this.modified = false;
        this.expanded = false;
        this.parsed = false;    // for image nodes: has content been loaded?

        // Lazy loading sources (set by parsers)
        /** @type {{ buffer: ArrayBuffer, offset: number, length: number, wzKey: import('./wz-crypto.js').WzMutableKey, hash: number, headerFStart: number }|null} */
        this._binarySource = null;
        /** @type {FileSystemFileHandle|null} */
        this._xmlFileHandle = null;
    }

    /**
     * Add a child node
     */
    addChild(child) {
        child.parent = this;
        this.children.push(child);
    }

    /**
     * Remove a child node
     */
    removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
            this.children.splice(idx, 1);
            child.parent = null;
        }
    }

    /**
     * Find immediate child by name (case-insensitive)
     */
    getChild(name) {
        const lower = name.toLowerCase();
        return this.children.find(c => c.name.toLowerCase() === lower) || null;
    }

    /**
     * Get full path from root
     */
    getPath() {
        const parts = [];
        let node = this;
        while (node) {
            parts.unshift(node.name);
            node = node.parent;
        }
        return parts.join('/');
    }

    /**
     * Count all descendant images
     */
    countImages() {
        let count = 0;
        if (this.type === 'image') return 1;
        for (const child of this.children) {
            count += child.countImages();
        }
        return count;
    }

    /**
     * Whether this node can have children
     */
    isContainer() {
        return ['file', 'dir', 'image', 'sub', 'canvas', 'convex'].includes(this.type);
    }

    /**
     * Get a type icon emoji
     */
    getIcon() {
        switch (this.type) {
            case 'file': return '📦';
            case 'dir': return '📁';
            case 'image': return '📄';
            case 'sub': return '📂';
            case 'int': case 'short': case 'long': return '🔢';
            case 'float': case 'double': return '🔢';
            case 'string': return '📝';
            case 'vector': return '📐';
            case 'canvas': return '🖼️';
            case 'sound': return '🔊';
            case 'uol': return '🔗';
            case 'null': return '⬜';
            case 'convex': return '🔷';
            case 'lua': return '📜';
            default: return '❓';
        }
    }

    /**
     * Get display value for the property panel
     */
    getDisplayValue() {
        switch (this.type) {
            case 'int': case 'short': case 'long':
            case 'float': case 'double':
            case 'string': case 'uol':
                return String(this.value);
            case 'vector':
                return `(${this.x}, ${this.y})`;
            case 'canvas':
                return `${this.width}x${this.height}`;
            case 'sound':
                return `${this.soundLength}ms`;
            case 'null':
                return '(null)';
            case 'dir': case 'image': case 'sub': case 'file': case 'convex':
                return `${this.children.length} children`;
            default:
                return '';
        }
    }
}
