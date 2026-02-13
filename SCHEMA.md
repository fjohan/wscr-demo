# SCHEMA

## Scope
This document describes user-relevant data contracts: what a writing session contains, how it is stored/fetched, and what export artifacts mean.

## Core entity: Writing session
A session is a timestamped record bundle representing one writing attempt.

### Session object (JSON)
```json
{
  "header_records": { "starttime": 0, "endtime": 0 },
  "text_records":   { "<ts>": "<full text snapshot>" },
  "cursor_records": { "<ts>": "<start>:<end>" },
  "key_records":    { "<ts>": "<event>: <key or marker>" },
  "scroll_records": { "<ts>": "<scrollTop>" }
}
```

### Semantics by record set
- `header_records`
  - `starttime`, `endtime` are epoch milliseconds for the recording window.
- `text_records`
  - Full text snapshots keyed by timestamp; this is the authoritative source for text evolution.
- `cursor_records`
  - Selection/caret range encoded as `"start:end"` for each timestamp.
- `key_records`
  - Keyboard and mouse activity strings (examples: `keydown: a`, `keyup: Backspace`, `repeat: ArrowLeft`, `mousedown: yes`).
- `scroll_records`
  - Vertical scroll offsets for the editor/playback textarea.

## Persistent storage model

### Local persistence (IndexedDB)
- Database: `app-storage`
- Object store: `kv`
- Key: session id string (example pattern: `wslog_<code>_<dd-mm-yyyy>_<hh:mm:ss>`)
- Value: compressed bytes (deflate `Uint8Array`) of session JSON.
- Read path inflates bytes back to JSON string before parsing.

### Auxiliary local persistence
- `localStorage` key pattern: `highlights:<sessionKey>`
- Value: JSON array of ranges (`[{"start": n, "end": m}, ...]`) for Final Text Analysis highlights.

## Server exchange contracts

### Upload (`php/putdata.php`)
- Request fields:
  - `id`: user/session identifier
  - `response`: comma-separated integer byte stream (compressed session)
- Effect: inserts record row in server DB.

### Fetch (`php/getdata.php`)
- Request fields:
  - `id`, `startlimit`, `endlimit`
- Response format: line-based TSV, one row per session:
  - `<published_on>\t<user>\t<comma-separated bytes>\t<index>\n`
- Client reconstructs local key as `<index>_<user>_<published_on>`.

## Derived analysis models (user-visible)

### Replay cache model
Built from loaded records to drive Playback Window and controls:
- ordered `textTimes/textValues`
- ordered `cursorTimes/cursorValues`
- ordered `scrollTimes/scrollValues`
- computed `start/end/allEventTimes`

### LIN model
Generated token stream representing editing activity, including:
- markers: `<START>`, `<END>`
- text inserts and `<DELETE>/<DELETEk>`
- navigation `<LEFT>/<RIGHT>/<CR>`, `<NAV,pos>`, selections `<SEL,start,end>`
- pauses `<seconds>` based on pause threshold
- per-token `actualText` annotation for debug/reconstruction comparison

### Process graph model
Time-series structure for visualization:
- `textSeries`: `{time, product, process}`
- `cursorSeries`: `{time, position}`
- `pauseSeries`: `{time, pauseSec}`
- metadata: `start`, `end`, `maxChars`, `maxPauseSec`

## Export artifacts

### 1) Raw session export (`DOWNLOAD`)
- File: `<sessionKey>.txt`
- Content: full session JSON object.

### 2) Final text export (`DOWNLOAD FINAL TEXT`)
- File: `<sessionKey>_final.txt`
- Content: last value in `text_records`.

### 3) LIN diff export (`EXPORT DIFFS`)
- File: `wscr-<sourceId>-diffs.txt`
- Sections:
  - header metadata (`noteId`, `exportedAt`, format string, exporter version)
  - `[diffs]`: diff/cursor lines
  - `[linear_debug]`: mismatch checks + token reasons
  - `[linear_steps]`: stepwise token/reconstruction trace
  - `[logs]`: embedded full session JSON

### 4) Batch ZIP exports
- Raw bundle: `bundle_<sid>_<start-end>_<timestamp>.zip`
  - contains many `<sessionKey>.txt` full logs.
- Final-text bundle: `final_texts_<sid>_<start-end>_<timestamp>.zip`
  - contains many `<sessionKey>_final.txt` files
  - includes `manifest.json` with inclusion metadata.

## Contract constraints
- Backward compatibility depends on keeping the session JSON shape and key/value semantics unchanged.
- `text_records` ordering by numeric timestamp is required for replay and all analyses.
- Exports are treated as user-facing artifacts; section names/file naming are de facto interface contracts.
