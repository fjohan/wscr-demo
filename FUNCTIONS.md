# Functional Capabilities

This document describes the repository’s core functional methods for collecting writing-session data, storing/retrieving it, analyzing revisions, and exporting outputs.

## Data Collection Methods

| File | Function | Inputs | Outputs |
|---|---|---|---|
| `webscriptlog_main.js` | `startRecording()` | Uses current global recorder state/UI. | Initializes a fresh capture session and starts listeners via `doRecording()`. |
| `webscriptlog_main.js` | `doRecording()` | No explicit args; uses `recorder`, global record objects. | Resets in-memory records (`header_record`, `text_record`, `cursor_record`, `key_record`, `scroll_record`) and attaches event listeners. |
| `webscriptlog_main.js` | `stopRecording()` | No explicit args; uses current in-memory records and `sid`. | Finalizes timestamps, compresses session JSON (`pako.deflate`), stores to IndexedDB, and optionally uploads to server (`php/putdata.php`). |
| `webscriptlog_main.js` | `recordInput()` | DOM input event on recorder (`this.value`, cursor positions). | Appends timestamped full-text snapshot into `text_record` and cursor position into `cursor_record`. |
| `webscriptlog_main.js` | `recordKeyDown(e)` | Keyboard event with key value and selection. | Appends keydown/repeat events to `key_record`; updates `cursor_record` for repeats. |
| `webscriptlog_main.js` | `recordKeyUp(e)` | Keyboard event with key value and selection. | Appends keyup events to `key_record` and cursor positions to `cursor_record`. |
| `webscriptlog_main.js` | `recordMouseDown(e)` / `recordMouseUp(e)` / `recordMouseMove(e)` | Mouse events and selection ranges. | Captures timestamped mouse activity in `key_record` and selection snapshots in `cursor_record`. |
| `webscriptlog_main.js` | `recordScroll()` | Scroll event (`this.scrollTop`). | Appends timestamped scroll position to `scroll_record`. |

## Storage + Retrieval Methods

| File | Function | Inputs | Outputs |
|---|---|---|---|
| `helpers_js/idbStore.js` | `idbStore.setItem(key, value)` | String key + value (compressed bytes or other serializable value). | Persists item in IndexedDB `app-storage/kv`. |
| `helpers_js/idbStore.js` | `idbStore.getItem(key)` | String key. | Returns stored value or `null`. |
| `helpers_js/idbStore.js` | `idbStore.keys()` / `clear()` / `removeItem(key)` | Optional key depending on method. | Enumerates keys or mutates local store (delete/clear). |
| `webscriptlog_main.js` | `fetchFromStorage()` | `sid`, `startlimit`, `endlimit` (from UI). | Fetches remote compressed records (`php/getdata.php`) and stores each as compressed bytes in IndexedDB. |
| `webscriptlog_main.js` | `fetchPlusFromStorage()` | `sid`, `startlimit` (forces `endlimit=1`). | Clears local cache, fetches one remote record, stores it, refreshes listbox, and loads it into active analysis state. |
| `webscriptlog_main.js` | `loadFromListbox()` | Selected local key from listbox. | Decompresses/parses stored JSON and repopulates active records (`header_record`, `text_record`, etc.), then rebuilds revision table. |
| `webscriptlog_main.js` | `getJsonFromIDB(key)` | Local key. | Returns decompressed JSON string from stored bytes/blob/string format. |
| `php/putdata.php` | `test_input($data, $pattern)` | Raw POST field + regex whitelist. | Sanitized/validated string or terminates request. |
| `php/getdata.php` | `test_input($data, $pattern)` | Raw POST field + regex whitelist. | Sanitized/validated string or terminates request. |

## Analysis Methods

| File | Function | Inputs | Outputs |
|---|---|---|---|
| `webscriptlog_main.js` | `makeLINfile()` | In-memory `key_record`, `cursor_record`, `text_record`, `header_record`, pause threshold (`#pauseCrit`). | Builds a linearized process string (`linfile`/`linoutput`) and summary metrics (pauses, insertions, deletions, replacements, typing time). |
| `webscriptlog_main.js` | `processGraphFormat()` | `text_record`, `header_record`. | Produces timeline array with process/product counts and sends it to `drawSvg(data)` for graphing. |
| `webscriptlog_main.js` | `makeRevisionTable()` | `text_record`, `header_record`, diff engine (`myDmp`). | Builds grouped sentence-level diff table with classification, location, and playback anchor times. |
| `webscriptlog_main.js` | `classifyDiff(diff)` | Diff tuple array from diff-match-patch. | Returns change class: `INSERT`, `DELETE`, `REPLACE`, or `NOCHANGE`. |
| `webscriptlog_main.js` | `calculateLocation(diff, classification)` | Diff tuple array + classification. | Returns affected span `{start, end}` in current text. |
| `webscriptlog_main.js` | `checkNewGroup(classification, location, index)` | Classification/location plus current row index. | Returns boolean group boundary flag and updates group state for revision clustering. |
| `webscriptlog_main.js` | `computeSecondDiff(currentText, groupStartText, location)` | Current text, group baseline text. | Returns short HTML diff for group-level comparison. |
| `webscriptlog_main.js` | `makeFTAnalysis()` | `header_record.starttime`, `text_record`, diff engine. | Reconstructs final character stream with per-char timing metadata, computes per-step diff chunks, renders interactive span-based final-text analysis, and supports highlight extraction/table generation. |
| `webscriptlog_main.js` | `saveAllHighlights()` / `applyAllHighlights(ranges)` | DOM-highlight wrapper ranges. | Serializes/restores selected character-span ranges used in final-text analysis. |
| `viz.js` | `drawCumulativeVsPosition(textList)` | Character-level list with cumulative index metadata. | Renders cumulative-order vs final-position chart. |
| `viz.js` | `drawDiffStackedBarsOrdered(diffSteps)` / `drawDiffStackedBarsOrderedD3(diffSteps)` | Ordered diff chunks per step. | Renders stacked visualizations of unchanged/insert/delete chunk lengths across revision steps. |

## Export Methods

| File | Function | Inputs | Outputs |
|---|---|---|---|
| `webscriptlog_main.js` | `dlFromListbox()` | Selected local key. | Downloads full session JSON as `<key>.txt`. |
| `webscriptlog_main.js` | `dlFinalTextFromListbox()` | Selected local key. | Downloads final text snapshot as `<key>_final.txt`. |
| `fetchToZip.js` | `fetchToZip({ alsoStoreToIDB })` | `sid`, `startlimit`, `endlimit`, optional local-store flag. | Fetches remote sessions, inflates each JSON payload, and exports multi-file ZIP of full session texts (optionally caching compressed bytes locally). |
| `fetchFinalTextsToZip.js` | `fetchFinalTextsToZip({ alsoStoreToIDB })` | `sid`, `startlimit`, `endlimit`, optional local-store flag. | Fetches remote sessions, extracts final `text_records` entry per session, and exports ZIP of final texts plus manifest. |

## Data Flow

1. Collectors
`startRecording()`/`doRecording()` activate event collectors (`recordInput`, `recordKey*`, `recordMouse*`, `recordScroll`) and build timestamped in-memory records.

2. Storage
`stopRecording()` composes JSON (`header_records`, `text_records`, `cursor_records`, `key_records`, `scroll_records`), compresses it, writes to IndexedDB (`idbStore.setItem`), and optionally posts compressed bytes to `php/putdata.php` for MySQL storage.

3. Retrieval
Local: `loadFromListbox()` + `getJsonFromIDB()` read/decompress cached sessions.  
Remote: `fetchFromStorage()` / `fetchPlusFromStorage()` pull compressed rows from `php/getdata.php` and cache them in IndexedDB.

4. Analyses
Loaded records feed `makeLINfile()`, `processGraphFormat()`, `makeRevisionTable()`, and `makeFTAnalysis()` (plus `viz.js` plotting methods) to derive writing-process metrics, grouped revision structure, and character-level timing views.

5. Exports
`dlFromListbox()` and `dlFinalTextFromListbox()` export single-session artifacts; `fetchToZip()` and `fetchFinalTextsToZip()` export multi-session ZIP bundles (full JSON texts or final texts).
