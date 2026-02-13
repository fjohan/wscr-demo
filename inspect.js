/* global messages */

(() => {
  function printMeasures(measures) {
    messages.value += 'Measures:\n';
    Object.entries(measures).forEach(([key, value]) => {
      if (value && typeof value === 'object') {
        messages.value += `${key}: ${JSON.stringify(value)}\n`;
      } else {
        messages.value += `${key}: ${value}\n`;
      }
    });
    messages.scrollTop = messages.scrollHeight;
  }

  window.inspectRecords = function inspectRecords() {
    const mode = document.getElementById('inspectMode')?.value || 'counts';
    if (mode === 'simple') {
      if (typeof window.inspectSimple === 'function') {
        window.inspectSimple();
        return;
      }
      messages.value += 'Inspect: simple-inspect.js not loaded.\n';
      return;
    }
    if (mode === 'measures') {
      if (window.wscrMeasures && typeof window.wscrMeasures.computeMeasures === 'function') {
        const logs = {
          header_records: window.header_record || {},
          text_records: window.text_record || {},
          cursor_records: window.cursor_record || {},
          key_records: window.key_record || {},
          scroll_records: window.scroll_record || {}
        };
        const measures = window.wscrMeasures.computeMeasures(logs, {
          linPauseThreshold: Number(document.getElementById('linPauseThreshold')?.value) || 0,
          pauseCriteriaSec: Number(document.getElementById('pauseCrit')?.value) || 0.3
        });
        printMeasures(measures);
        return;
      }
      messages.value += 'Inspect: measures.js not loaded.\n';
      return;
    }
    if (typeof window.inspectCounts === 'function') {
      window.inspectCounts();
      return;
    }
    messages.value += 'Inspect: count.js not loaded.\n';
  };
})();
