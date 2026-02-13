# AGENTS

ScriptLog.js is a browser app for recording writing sessions and replaying/analyzing them. The core workflow is: collect timestamped writing telemetry, persist logs, reload logs, then generate LIN/process/revision/final-text analyses. Most behavior is UI-driven from `index.html` templates and `ui.js` button wiring, with data processing concentrated in `webscriptlog_main.js` and `linear.js`.

## Agent rules
1. Preserve the existing logging contract (`header_records`, `text_records`, `cursor_records`, `key_records`, `scroll_records`) for backward compatibility.
2. Prioritize user-visible behavior in Playback/Analysis views over internal refactors.
3. Treat `loadFromListbox()` as the main "load + analyses" entrypoint and keep downstream analyses synchronized.
4. Keep replay, timeline slider, and process-graph playhead behavior aligned when modifying time interactions.
5. Use i18n keys (`i18n.js`) for user-facing strings; do not hardcode mixed-language labels.
6. Keep destructive actions guarded (for example, preserve double-click semantics on high-impact buttons).
7. When changing exports, maintain current file naming patterns and section headers unless explicitly requested.
8. Validate admin-only fetch assumptions against `sid` handling and PHP endpoints before changing server flows.
9. Prefer adding focused modules (as done for `linear.js`) over expanding monolithic files unless requested.

## How to use repository context docs
- Read `FUNCTIONALITY.md` first for canonical UI names, capabilities, and feature anchors; reference those names in plans and PR notes.
- Read `SCHEMA.md` before touching storage/export logic; treat it as the contract for persisted records and downloadable artifacts.
- If implementation and docs diverge, update docs in the same change so future sessions remain bootstrappable.
