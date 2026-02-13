/* -----------------------
   i18n core
   ----------------------- */
const I18N = {
  sv: {
    "ui.language": "Språk:",
    "tab.RECORD": "INSPELNING",
    "tab.REPLAY": "UPPSPELNING",
    "tab.ANALYZE": "ANALYS",
    "tab.SETTINGS": "INSTÄLLNINGAR",

    "btn.START": "START",
    "btn.STOP": "STOPP",
    "btn.REPLAY": "SPELA UPP",
    "btn.PAUSE_RESUME": "PAUS",
    "btn.PAUSE": "PAUS",
    "btn.RESUME": "FORTSÄTT",
    "btn.FETCH": "HÄMTA",
    "btn.FETCH_PLUS": "HÄMTA+",
    "btn.FETCH_TO_ZIP": "HÄMTA TILL ZIP",
    "btn.FETCH_FT_TO_ZIP": "HÄMTA SLUTTEXTER TILL ZIP",
    "btn.LOAD_MAKE_RT": "LADDA + ANALYSER",
    "btn.CLEAR": "RENSA",
    "btn.CLEAR_ALL": "RENSA ALLT",
    "btn.DOWNLOAD": "LADDA NER",
    "btn.DOWNLOAD_FINAL_TEXT": "LADDA NER SLUTTEXT",
    "btn.EXPORT_DIFFS": "EXPORTERA DIFFAR",
    "btn.EXPORT_PAUSES": "EXPORTERA PAUSER",
    "btn.INSPECT": "INSPEKTERA",
    "btn.FT_ANALYSIS": "FT ANALYS",

    "label.code": "Kod:",
    "label.codeHelp": "(6 bokstäver eller siffror):",
    "label.indexeddb": "IndexedDB",
    "label.start": "S",
    "label.end": "R",
    "label.selectFile": "Välj en webscriptlog-fil",
    "label.inspectMode": "Inspektera:",
    "label.linPauseThreshold": "LINear pause threshold (s):",
    "label.processPauseThreshold": "Pausgräns graf (s):",
    "label.replaySpeed": "Uppspelningshastighet:",
    "label.timeline": "Tidslinje:",

    "msg.sid.noid": "-ID- Inget id! Data sparas lokalt.",
    "msg.sid.withid": "-ID- Ditt id är: {sid}",
    "msg.saveMessage": "Sparat lokalt som {lsString} .\n",
    "msg.fromPhp": "Sparat på server.",

    "ph.recorder": "OBS! SKRIV DIN KOD ÖVERST! TACK!\n\nSkriv sedan din text här.",

    "heading.ftAnalysis": "Final text-analys",
    "heading.infoWindow": "Infofönster",
    "heading.replayWindow": "Uppspelningsfönster",
    "heading.linData": "LINear representation",
    "heading.linKeyData": "LIN (key)",
    "heading.progressGraph": "Processgraf",
    "heading.revisionTable": "Revideringstabell",
    "heading.settings": "Inställningar",

    "th.rowNumber": "Radnummer",
    "th.localDiff": "Lokal diff",
    "th.classification": "Klassificering",
    "th.location": "Plats",
    "th.newGroup": "Ny grupp",
    "th.groupDiff": "Gruppdiff",
    "th.timeSeconds": "Tid (s)",

    "opt.inspectCounts": "Mått (counts)",
    "opt.inspectMeasures": "Mått (measures)",
    "opt.inspectSimple": "Enkel",

    "hint.dblclick": "Dubbelklick"
  },

  en: {
    "ui.language": "Language:",
    "tab.RECORD": "RECORDING",
    "tab.REPLAY": "PLAYBACK",
    "tab.ANALYZE": "ANALYSIS",
    "tab.SETTINGS": "SETTINGS",

    "btn.START": "START",
    "btn.STOP": "STOP",
    "btn.REPLAY": "REPLAY",
    "btn.PAUSE_RESUME": "PAUSE",
    "btn.PAUSE": "PAUSE",
    "btn.RESUME": "RESUME",
    "btn.FETCH": "FETCH",
    "btn.FETCH_PLUS": "FETCH+",
    "btn.FETCH_TO_ZIP": "FETCH TO ZIP",
    "btn.FETCH_FT_TO_ZIP": "FETCH FINAL TEXTS TO ZIP",
    "btn.LOAD_MAKE_RT": "LOAD + ANALYSES",
    "btn.CLEAR": "CLEAR",
    "btn.CLEAR_ALL": "CLEAR ALL",
    "btn.DOWNLOAD": "DOWNLOAD",
    "btn.DOWNLOAD_FINAL_TEXT": "DOWNLOAD FINAL TEXT",
    "btn.EXPORT_DIFFS": "EXPORT DIFFS",
    "btn.EXPORT_PAUSES": "EXPORT PAUSES",
    "btn.INSPECT": "INSPECT",
    "btn.FT_ANALYSIS": "FT ANALYSIS",

    "label.code": "Code:",
    "label.codeHelp": "(6 letters or digits):",
    "label.indexeddb": "IndexedDB",
    "label.start": "S",
    "label.end": "R",
    "label.selectFile": "Select a webscriptlog-file",
    "label.inspectMode": "Inspect:",
    "label.linPauseThreshold": "LINear pause threshold (s):",
    "label.processPauseThreshold": "Graph pause threshold (s):",
    "label.replaySpeed": "Replay speed:",
    "label.timeline": "Timeline:",

    "msg.sid.noid": "-ID- No id! Data will be saved locally.",
    "msg.sid.withid": "-ID- Your id is: {sid}",
    "msg.saveMessage": "Saved locally as {lsString} .\n",
    "msg.fromPhp": "Saved on server.",

    "ph.recorder": "NOTE! WRITE YOUR CODE AT THE TOP! THANKS!\n\nThen write your text here.",

    "heading.ftAnalysis": "Final text-analysis",
    "heading.infoWindow": "Info window",
    "heading.replayWindow": "Replay Window",
    "heading.linData": "LINear representation",
    "heading.linKeyData": "LIN (key)",
    "heading.progressGraph": "Process Graph",
    "heading.revisionTable": "Revision table",
    "heading.settings": "Settings",

    "th.rowNumber": "Row Number",
    "th.localDiff": "Local Diff",
    "th.classification": "Classification",
    "th.location": "Location",
    "th.newGroup": "New Group",
    "th.groupDiff": "Group Diff",
    "th.timeSeconds": "Time (s)",

    "opt.inspectCounts": "Counts",
    "opt.inspectMeasures": "Measures",
    "opt.inspectSimple": "Simple",

    "hint.dblclick": "Double-click"
  }
};

let LANG = localStorage.getItem("lang") || "sv";

function t(key, params) {
  const dict = I18N[LANG] || I18N.sv;
  let s = dict[key] ?? I18N.sv[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });

  root.querySelectorAll("[data-i18n-attr]").forEach(el => {
    // "placeholder:key1;title:key2"
    const spec = el.getAttribute("data-i18n-attr").split(";");
    spec.forEach(pair => {
      const [attr, key] = pair.split(":").map(s => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    });
  });
}
