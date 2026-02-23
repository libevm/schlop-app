# WZ Editor

Browser-based WZ file editor. Runs via `bun run client:wzeditor` on port 5175. All parsing, editing, and serialization is client-side — the server only serves static files.

## What It Does

- Opens `.wz` binary files (auto-detects GMS/EMS/BMS encryption and version, supports 64-bit format)
- Opens Harepacker-exported XML (classic directory, single file, `<xmldump>` — all three formats auto-detected)
- Browse the full tree: directories, images, all property types (int, short, long, float, double, string, vector, canvas, sound, uol, null, convex, sub)
- Preview images (8 pixel formats including DXT3/DXT5), play sounds, animate sprite sequences with playback controls
- Edit values, add/remove/rename nodes, sort children, copy/paste/cut with undo/redo
- Search by name/value with regex and case-sensitive options
- Export as Harepacker-compatible Classic XML directory (parallel, 16 concurrent writers)
- Save as repacked `.wz` binary
- Quick-save modified XML images in-place via File System Access API

## File Map

```
client/wzeditor/                 21 files, ~6,300 lines
├── index.html                   Layout, toolbar, status bar, progress bar
├── wzeditor.js                  App entry: state, tree, properties, preview, export/save, undo, copy/paste
├── styles.css                   Dark theme (Catppuccin Mocha)
├── wz/                          Pure JS engine (no DOM, Worker-safe)
│   ├── wz-node.js               Unified WzNode model
│   ├── wz-binary-reader.js      DataView wrapper with WZ-specific reads
│   ├── wz-binary-writer.js      Repack WzNode tree → .wz binary
│   ├── wz-constants.js          Encryption IVs, AES key, offset constant
│   ├── wz-crypto.js             Pure-JS AES-256-ECB for WZ key schedule
│   ├── wz-tool.js               Version hash, 64-bit detection
│   ├── wz-file.js               Parse .wz header + directory tree
│   ├── wz-image.js              Parse image properties (all types)
│   ├── wz-png.js                8 pixel formats → RGBA → PNG data URL
│   ├── wz-sound.js              Sound bytes → Blob URL
│   ├── wz-xml-parser.js         Harepacker XML → WzNode (Format A/B/C)
│   ├── wz-xml-serializer.js     WzNode → Classic XML, parallel directory export
│   └── wz-worker.js             Web Worker for heavy parsing
└── ui/
    ├── wz-context-menu.js       Type-aware right-click menus
    ├── wz-search.js             Search panel with regex/case/field options
    ├── wz-dialogs.js            Promise-based modals
    ├── wz-undo.js               Undo/redo stack + action factories
    └── wz-xml-view.js           Raw XML viewer with clipboard copy

tools/dev/serve-wzeditor.mjs     Static file server (~60 lines)
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Arrow keys | Navigate tree |
| Enter / Click | Expand/collapse |
| Delete | Remove node |
| F2 | Rename |
| Ctrl+S | Save modified |
| Ctrl+E | Export all XML |
| Ctrl+I | Import XML |
| Ctrl+F | Toggle search |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Ctrl+C / Ctrl+V / Ctrl+X | Copy / Paste / Cut |

## Key Design Choices

- **Zero npm dependencies** for core — all browser-native APIs (File, DataView, DOMParser, DecompressionStream, OffscreenCanvas, File System Access)
- **Pure-JS AES-256-ECB** because Web Crypto lacks ECB mode (~150 lines)
- **Lazy image parsing** — only parses image contents on expand (double-click)
- **Virtual-scroll tree** — renders only visible rows for large WZ files (Map.wz = 2,847 images)
- **Parallel XML export** — 16 concurrent file writers via worker pool pattern
- **`beforeunload` guard** during export to prevent accidental data loss
- **Unmodified images bypass serialization** in WZ repack — original binary bytes are copied directly
