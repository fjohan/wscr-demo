
async function fetchToZip({ alsoStoreToIDB = false } = {}) {
  if (!sid) {
    console.log('sid is empty, not getting');
    return;
  }

  const startlimit = $("#startlimit").val();
  const endlimit   = $("#endlimit").val();
  const mydata = "id=" + sid + "&startlimit=" + startlimit + "&endlimit=" + endlimit;

  let response;
  try {
    response = await $.ajax({ url: getdataphp, type: "POST", data: mydata });
  } catch (err) {
    console.error("Fetch failed:", err);
    messages.value += "Något gick fel vid hämtning.\n";
    messages.scrollTop = messages.scrollHeight;
    return;
  }

  if (typeof response === 'string' && response.includes("0 results")) {
    messages.value += response + "\n";
    messages.scrollTop = messages.scrollHeight;
    return;
  }

  const lines = String(response).split('\n').filter(Boolean);
  if (!lines.length) {
    messages.value += "0 results\n";
    messages.scrollTop = messages.scrollHeight;
    return;
  }

  const zip = new JSZip();
  let added = 0;

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length !== 4) continue;

    const published_on = parts[0];
    const user = parts[1];
    const index = parts[3];
    const key = `${index}_${user}_${published_on}`; // same label as your listbox/dlFromListbox

    // Parse comma-separated compressed bytes
    const bytes = new Uint8Array(parts[2].split(',').map(Number));

    // Optionally store compressed bytes to IndexedDB (like fetchFromStorage)
    if (alsoStoreToIDB) {
      try { await idbStore.setItem(key, bytes); } catch (e) { console.warn('IDB store failed', key, e); }
    }

    // Inflate to JSON string (same as dlFromListbox uses)
    let jsonText;
    try {
      jsonText = pako.inflate(bytes, { to: 'string' });
    } catch (e) {
      console.error('Inflate failed for', key, e);
      continue;
    }

    // Add to ZIP as .txt (matching dlFromListbox naming/format)
    zip.file(`${key}.txt`, jsonText);
    added++;
  }

  if (added === 0) {
    messages.value += "Inga giltiga poster att zippa.\n";
    messages.scrollTop = messages.scrollHeight;
    return;
  }

  try {
    const blob = await zip.generateAsync(
      { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
      meta => $("#messageLabel").text(`Zipping ${Math.round(meta.percent)}%… ${meta.currentFile || ''}`)
    );

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipName = `bundle_${sid}_${startlimit}-${endlimit}_${stamp}.zip`;
    saveAs(blob, zipName);

    messages.value += `Zippade ${added} filer → ${zipName}\n`;
    messages.scrollTop = messages.scrollHeight;

    if (alsoStoreToIDB && typeof updateListbox === 'function') {
      await updateListbox();
    }
  } catch (e) {
    console.error("ZIP generation failed:", e);
    $("#messageLabel").text("Kunde inte skapa ZIP.");
  }
}

