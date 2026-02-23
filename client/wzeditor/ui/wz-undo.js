/**
 * Undo/Redo stack for the WZ Editor.
 * Stores actions as command objects with do/undo functions.
 */

/**
 * @typedef {Object} UndoAction
 * @property {string} label - Human-readable description
 * @property {() => void} redo - Execute / re-execute the action
 * @property {() => void} undo - Reverse the action
 */

export class UndoStack {
    constructor(maxSize = 100) {
        /** @type {UndoAction[]} */
        this.stack = [];
        this.pointer = -1; // points to last executed action
        this.maxSize = maxSize;
        /** @type {((canUndo: boolean, canRedo: boolean, label: string) => void)|null} */
        this.onChange = null;
    }

    /**
     * Push a new action (already executed).
     * @param {UndoAction} action
     */
    push(action) {
        // Discard redo history
        this.stack.splice(this.pointer + 1);
        this.stack.push(action);
        if (this.stack.length > this.maxSize) {
            this.stack.shift();
        } else {
            this.pointer++;
        }
        this._notify('push: ' + action.label);
    }

    undo() {
        if (!this.canUndo()) return null;
        const action = this.stack[this.pointer];
        action.undo();
        this.pointer--;
        this._notify('undo: ' + action.label);
        return action;
    }

    redo() {
        if (!this.canRedo()) return null;
        this.pointer++;
        const action = this.stack[this.pointer];
        action.redo();
        this._notify('redo: ' + action.label);
        return action;
    }

    canUndo() { return this.pointer >= 0; }
    canRedo() { return this.pointer < this.stack.length - 1; }

    undoLabel() { return this.canUndo() ? this.stack[this.pointer].label : ''; }
    redoLabel() { return this.canRedo() ? this.stack[this.pointer + 1].label : ''; }

    clear() {
        this.stack = [];
        this.pointer = -1;
        this._notify('clear');
    }

    _notify(reason) {
        if (this.onChange) this.onChange(this.canUndo(), this.canRedo(), reason);
    }
}

// ─── Action factories ────────────────────────────────────────────────────────

/**
 * Create an action for changing a node's value.
 * @param {import('../wz/wz-node.js').WzNode} node
 * @param {string} field - 'value', 'x', 'y', 'name', etc.
 * @param {*} oldVal
 * @param {*} newVal
 * @param {(node: import('../wz/wz-node.js').WzNode) => void} onApply - callback after do/undo
 */
export function editAction(node, field, oldVal, newVal, onApply) {
    return {
        label: `Edit ${node.name}.${field}`,
        redo() { node[field] = newVal; onApply(node); },
        undo() { node[field] = oldVal; onApply(node); },
    };
}

/**
 * Create an action for adding a child node.
 * @param {import('../wz/wz-node.js').WzNode} parent
 * @param {import('../wz/wz-node.js').WzNode} child
 * @param {(parent: import('../wz/wz-node.js').WzNode) => void} onApply
 */
export function addAction(parent, child, onApply) {
    return {
        label: `Add ${child.type} "${child.name}"`,
        redo() { parent.addChild(child); onApply(parent); },
        undo() { parent.removeChild(child); onApply(parent); },
    };
}

/**
 * Create an action for removing a child node.
 * @param {import('../wz/wz-node.js').WzNode} parent
 * @param {import('../wz/wz-node.js').WzNode} child
 * @param {number} index - original index in parent.children
 * @param {(parent: import('../wz/wz-node.js').WzNode) => void} onApply
 */
export function removeAction(parent, child, index, onApply) {
    return {
        label: `Remove "${child.name}"`,
        redo() { parent.removeChild(child); onApply(parent); },
        undo() { parent.children.splice(index, 0, child); child.parent = parent; onApply(parent); },
    };
}

/**
 * Create an action for renaming a node.
 * @param {import('../wz/wz-node.js').WzNode} node
 * @param {string} oldName
 * @param {string} newName
 * @param {(node: import('../wz/wz-node.js').WzNode) => void} onApply
 */
export function renameAction(node, oldName, newName, onApply) {
    return {
        label: `Rename "${oldName}" → "${newName}"`,
        redo() { node.name = newName; onApply(node); },
        undo() { node.name = oldName; onApply(node); },
    };
}

/**
 * Create an action for moving/reordering a child.
 * @param {import('../wz/wz-node.js').WzNode} parent
 * @param {number[]} oldOrder - array of child ids in original order
 * @param {number[]} newOrder - array of child ids in new order
 * @param {(parent: import('../wz/wz-node.js').WzNode) => void} onApply
 */
export function reorderAction(parent, oldOrder, newOrder, onApply) {
    function applyOrder(order) {
        const byId = new Map(parent.children.map(c => [c.id, c]));
        parent.children = order.map(id => byId.get(id)).filter(Boolean);
    }
    return {
        label: `Sort children of "${parent.name}"`,
        redo() { applyOrder(newOrder); onApply(parent); },
        undo() { applyOrder(oldOrder); onApply(parent); },
    };
}
