# FUNCTIONALITY

## Product summary
ScriptLog.js is a browser-based writing logger and playback tool. Users record writing sessions in a textarea, store sessions locally (IndexedDB), optionally sync/fetch sessions from a server, replay sessions with synchronized cursor/selection state, and run analysis views (LIN stream, process graph, revision table, final-text analysis).

## Canonical UI vocabulary
| Canonical name | User label / selector evidence | Area | Purpose |
|---|---|---|---|
| Tab Bar | `#tabs .tabbar`, labels from `tab.RECORD/REPLAY/ANALYZE/SETTINGS` | Global | Switch between primary work areas. |
| Recording Panel | template `#panel-RECORD` | RECORDING tab | Write and capture a new session. |
| Recorder | `#recorder` textarea | RECORDING tab | Input text that is logged over time. |
| User Code Field | `#userCode`, label `label.code` | RECORDING tab | 6-char code required before START is enabled. |
| Playback Panel | template `#panel-REPLAY` | PLAYBACK tab | Load, replay, inspect, and export sessions. |
| Playback Window | `#playback` textarea | PLAYBACK tab | Reconstructed text view during replay. |
| Session List | `#lb_load` | PLAYBACK tab | Choose local session key to load/analyze/export. |
| Remote Fetch Controls | `#div_fetch`, buttons `b_fetch*` | PLAYBACK tab | Fetch server sessions/ranges (admin mode). |
| LIN Data View | `#linoutput`, heading `heading.linData` | PLAYBACK tab | Tokenized linear representation of writing activity. |
| LIN Status Line | `#linstatus` | PLAYBACK tab | Shows token counts/mismatch stats. |
| Export Diffs Button | `#linExportDiffsBtn`, `btn.EXPORT_DIFFS` | PLAYBACK tab | Download LIN/debug/diff export text file. |
| LIN Compare Panel | `#lincompare` | PLAYBACK tab | Click token to compare reconstructed vs actual text. |
| LIN Debug Panel | `#lindebugWrap` / `#lindebug` | PLAYBACK tab | Expandable low-level LIN diagnostics. |
| Process Graph | `#processGraphSvg`, heading `heading.progressGraph` | PLAYBACK tab | Time graph of process/product/position/pause. |
| Replay Speed Control | `#replaySpeed`, label `label.replaySpeed` | PLAYBACK tab | Set replay speed (0.5x..10x). |
| Timeline Slider | `#replaySeek`, label `label.timeline` | PLAYBACK tab | Seek replay and process-graph playhead by time. |
| Replay Time Readout | `#replayTimeLabel` | PLAYBACK tab | Current vs total elapsed replay time. |
| Revision Table | `#sentenceDiffTable`, heading `heading.revisionTable` | PLAYBACK tab | Grouped diff rows; click group row to jump replay. |
| Analysis Panel | template `#panel-ANALYZE` | ANALYSIS tab | Textual stats and final-text analysis workflow. |
| Info Window | `#messages`, heading `heading.infoWindow` | ANALYSIS tab | Session/system messages and inspect output. |
| Pause Criteria Input | `#pauseCrit` | ANALYSIS tab | Pause threshold reused by analyses. |
| Final Text Analysis View | `#ftAnalysis`, `#content`, `#generate-table` | ANALYSIS tab | Character-level timing display and highlight-to-table workflow. |
| Settings Panel | template `#panel-SETTINGS` | SETTINGS tab | Language selection. |
| Language Picker | `#lang` | SETTINGS tab | Switch Swedish/English UI. |

## Capabilities by area

### Recording and collection
- Start/stop recording
  - User does: Enter 6-char code in User Code Field, click `START`, write in Recorder, click `STOP`.
  - App changes: Captures `header_records`, `text_records`, `cursor_records`, `key_records`, `scroll_records`; compresses and stores session in IndexedDB; optionally uploads to server when `sid` exists.
  - Constraints: `START` disabled until valid code (`checkUserCode`); no save if no text records.

- Capture granular writing telemetry
  - User does: Type, navigate, select, scroll, use mouse during recording.
  - App changes: Logs keydown/keyup/repeat and mouse actions with timestamps; stores full text snapshots on input and cursor ranges.
  - Constraints: Logging format is timestamp-keyed maps; this format is backward-compatibility critical.

### Session loading and source management
- Load a selected local session + generate analyses
  - User does: Pick Session List item and click `LOAD + ANALYSES`.
  - App changes: Reads/decompresses record from IndexedDB; populates global record objects; renders LIN, Process Graph, and Revision Table.
  - Constraints: Invalid JSON payload shows parse/read messages in Info Window.

- Import a session file
  - User does: Choose a `.txt` log file in file picker.
  - App changes: Parses JSON and populates current in-memory records; regenerates Process Graph and Revision Table.
  - Constraints: No persistence implied by import alone.

- Local list management
  - User does: `CLEAR` selected item or `CLEAR ALL` list.
  - App changes: Removes one/all IndexedDB keys; refreshes Session List.
  - Constraints: `CLEAR ALL` is wired to double-click to reduce accidental deletion.

### Replay and timeline interaction
- Replay controls
  - User does: `REPLAY`, `PAUSE/RESUME`, `STOP`, choose speed in Replay Speed Control.
  - App changes: Reconstructs Playback Window text, selection, and scroll over time; updates slider/time readout; draws synchronized graph playhead.
  - Constraints: `STOP` ends active playback but does not necessarily clear text; replay button gets active visual state while running.

- Time seeking
  - User does: Drag Timeline Slider or click Process Graph.
  - App changes: Moves replay state to absolute timestamp; updates Playback Window and graph playhead.
  - Constraints: Seeking pauses active replay and reanchors timing.

### LIN analysis and diagnostics
- Generate LIN representation (on load)
  - User does: Click `LOAD + ANALYSES`.
  - App changes: Produces token stream (`<START>`, text, `<DELETE>`, `<NAV,...>`, `<SEL,...>`, pauses, `<END>`), status metrics, debug trace.
  - Constraints: Uses heuristic reconstruction from key/cursor/text snapshots; mismatch counts are expected for some edge logs.

- Inspect token-level reconstruction
  - User does: Click a token in LIN Data View.
  - App changes: LIN Compare Panel shows reconstructed vs actual text at that token boundary.
  - Constraints: Comparison depends on `actualText` tags attached during build.

- Export diff/debug bundle
  - User does: Click `EXPORT DIFFS`.
  - App changes: Downloads text export with `[diffs]`, `[linear_debug]`, `[linear_steps]`, and full `[logs]` JSON.
  - Constraints: Export file is plain text, not JSON.

### Process/revision/final-text analyses
- Process Graph
  - User does: Load a session.
  - App changes: Draws process length, product length, cursor position, and pause dots over time.
  - Constraints: Pause dots use `pauseCrit`; right axis is character counts, left axis pause seconds.

- Revision Table drill-down
  - User does: View grouped rows and click a group row.
  - App changes: Jumps playback near group start time, restores nearby text/cursor/scroll state.
  - Constraints: Table collapses to “last in group” rows by default.

- Final Text Analysis workflow
  - User does: Click `FT ANALYSIS`; highlight spans in final text pane; click `Generate Table`.
  - App changes: Builds character-level timed spans from snapshot diffs; allows wrapping highlights (`.newspan`); persists/reloads highlight ranges in localStorage; emits a summary table.
  - Constraints: Highlight persistence key is tied to selected session key.

### Export and download
- Download current selected raw log
  - User does: Click `DOWNLOAD`.
  - App changes: Saves full JSON log as `<sessionKey>.txt`.

- Download current selected final text
  - User does: Click `DOWNLOAD FINAL TEXT`.
  - App changes: Extracts last `text_records` value and saves `<sessionKey>_final.txt`.

- Batch fetch/export ZIP (inferred admin flow)
  - User does: Use `FETCH TO ZIP` or `FETCH FINAL TEXTS TO ZIP`.
  - App changes: Fetches server rows by range; zips raw logs or final texts (with manifest for final-text ZIP).
  - Inferred: Fetch controls are shown when `sid` contains `admin` (`webscriptlog_main.js`, `#div_fetch`).

## Data artifacts (user-level)
- Session log artifact (`.txt` JSON): full writing session with header + event/timeline maps.
- Final text artifact (`_final.txt`): last text snapshot only.
- LIN diff export artifact (`wscr-*-diffs.txt`): mixed diagnostic export with diff lines, LIN debug, reconstruction steps, and embedded logs.
- ZIP bundles:
  - Raw logs ZIP: multiple session `.txt` files.
  - Final texts ZIP: multiple `_final.txt` files + `manifest.json`.
- Local highlight artifact (browser localStorage): per-session highlight ranges used by Final Text Analysis.

## Data flow
1. Collectors: Recorder event handlers capture key/cursor/text/scroll timestamps while typing.
2. Storage: Session JSON is compressed (deflate) and stored in IndexedDB; optionally uploaded to server as comma-separated byte list.
3. Load path: Selected session is decompressed/parsing into in-memory records.
4. Analyses: LIN build, Process Graph model/drawing, Revision Table grouping, and Final Text Analysis derive views from loaded records.
5. Exports: Raw log download, final-text download, LIN diff export text, and server-range ZIP exports.

## Implementation anchors
| UI part / capability | Code touchpoints (anchors) |
|---|---|
| Tab/panel framework | `ui.js`, `index.html` (`#tabs`, templates `#panel-*`) |
| Button definitions + wiring | `ui.js` (`UI` constant, IDs `b_*`) |
| Recording lifecycle | `webscriptlog_main.js` (`startRecording`, `stopRecording`, event recorders), selectors `#recorder`, `#userCode` |
| IndexedDB local store | `helpers_js/idbStore.js`, plus calls in `webscriptlog_main.js` (`updateListbox`, `clearListbox`, `emptyListbox`) |
| Load + analyses entrypoint | `webscriptlog_main.js` (`loadFromListbox`) |
| Replay/timeline controls | `webscriptlog_main.js` (`replay*`, `applyPlaybackAt`), selectors `#playback`, `#replaySeek`, `#replaySpeed`, `#replayTimeLabel` |
| Process Graph + playhead click-seek | `webscriptlog_main.js` (`processGraphFormat`, `drawSvg`), selector `#processGraphSvg` |
| LIN render/debug/export | `linear.js`, selectors `#linoutput`, `#linstatus`, `#lincompare`, `#lindebug`, `#linExportDiffsBtn` |
| Revision Table | `webscriptlog_main.js` (`makeRevisionTable`, `playFromRow`), selector `#sentenceDiffTable` |
| Final Text Analysis + highlights | `webscriptlog_main.js` (`makeFTAnalysis`, highlight helpers), selectors `#content`, `#generate-table`, `#table-container` |
| Server fetch/upload contracts | `php/getdata.php`, `php/putdata.php`, `fetchToZip.js`, `fetchFinalTextsToZip.js` |
| Localization labels | `i18n.js` (`I18N` dictionary keys used in templates/buttons) |

## Agent command vocabulary
Use these canonical names in future requests:
- "Move **LIN Data View** above **Process Graph** in the **Playback Panel**."
- "Add JSON export to **Export Diffs Button** output."
- "Add a new tab after **Analysis Panel** for cohort summaries."
- "Change **Replay Speed Control** options to include 8x."
- "Make clicking **Revision Table** rows also sync the **Timeline Slider**."
- "Add filter controls to **Session List** without changing storage format."
- "Expose mismatch counts from **LIN Status Line** in **Info Window**."

Future tasks should reference these canonical names to avoid ambiguity between tabs, controls, and analysis outputs.
