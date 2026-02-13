/* global messages, keySet, myDmp, current_text, playback, recorder, lb_load, d3, linoutput */

function startRecording() {
  if (recorder.recording) {
    messages.value += 'Already recording!\n';
    recorder.focus();
    return;
  }
  recorder.value = '';
  doRecording();
}

function continueRecording() {
  doRecording();
}

function doRecording() {
  header_record = {};
  key_record = {};
  text_record = {};
  text_record_keeper = {};
  cursor_record = {};
  cursor_record_keeper = {};
  current_text = '';
  keySet = new Set();
  recorder.addEventListener('keydown', recordKeyDown, false);
  recorder.addEventListener('keyup', recordKeyUp, false);
  recorder.addEventListener('mousedown', recordMouseDown, false);
  recorder.addEventListener('mouseup', recordMouseUp, false);
  recorder.addEventListener('mousemove', recordMouseMove, false);
  recorder.addEventListener('input', recordInput, false);
  recorder.addEventListener('scroll', recordScroll, false);
  recorder.style.borderColor = "white";
  recorder.readOnly = false;
  recorder.focus();
  recorder.recording = true;
  $('#b_record').prop('disabled', true);
  $('#b_recstop').prop('disabled', false);
  $('#userCode').prop('disabled', true);
  header_record['starttime'] = (new Date()).getTime();
  messages.value = 'Recording started at ' + header_record['starttime'] + '.\n';
}


// Requires: idbStore (the KV wrapper), pako, updateListbox()

async function stopRecording() {
  if (!recorder.recording) {
    messages.value += 'Not recording!\n'; // localize
    return;
  }

  header_record['endtime'] = (new Date()).getTime();
  recorder.recording = false;
  recorder.readOnly = true;
  recorder.style.borderColor = "lightskyblue";
  messages.value += 'Recording ended at ' + header_record['endtime'] + '.\n';

  recorder.removeEventListener('keydown',   recordKeyDown,  false);
  recorder.removeEventListener('keyup',     recordKeyUp,    false);
  recorder.removeEventListener('mousedown', recordMouseDown,false);
  recorder.removeEventListener('mouseup',   recordMouseUp,  false);
  recorder.removeEventListener('mousemove', recordMouseMove,false);
  recorder.removeEventListener('input',     recordInput,    false);
  recorder.removeEventListener('scroll',    recordScroll,   false);

  $('#b_record').prop('disabled', false);
  $('#b_recstop').prop('disabled', true);
  $('#userCode').prop('disabled', false);

  if (Object.keys(text_record).length < 1) {
    messages.value += 'No text records!!\n'; // localize
    return;
  }

  // Build the key (same as before)
  const d = new Date();
  const lsString =
    "wslog_" + i_code.value + "_" +
    ("0" + d.getDate()).slice(-2) + "-" +
    ("0" + (d.getMonth() + 1)).slice(-2) + "-" +
    d.getFullYear() + "_" +
    ("0" + d.getHours()).slice(-2) + ":" +
    ("0" + d.getMinutes()).slice(-2) + ":" +
    ("0" + d.getSeconds()).slice(-2);

  // Prepare the payload once
  const jsonStr = JSON.stringify({
    header_records: header_record,
    text_records:   text_record,
    cursor_records: cursor_record,
    key_records:    key_record,
    scroll_records: scroll_record
  }, null, '\t');

  // Compress to Uint8Array (deflate – matches your server)
  let compressed;
  try {
    compressed = pako.deflate(jsonStr); // Uint8Array
  } catch (e) {
    console.error('Compression failed:', e);
    $("#messageLabel").text("Kunde inte komprimera data."); // localize
    return;
  }

  // Save locally to IndexedDB (store compressed bytes)
  console.log('saving to IndexedDB');
  try {
    await idbStore.setItem(lsString, compressed);
    //const saveMessage = 'Sparat lokalt som ' + lsString + '.\n';
    const saveMessage = t("msg.saveMessage", { lsString });
    messages.value += saveMessage;
    $("#messageLabel").text(saveMessage);
    messages.scrollTop = messages.scrollHeight;
    await updateListbox();
  } catch (e) {
    console.error('IDB save failed:', e);
    $("#messageLabel").text("Kan ej spara lokalt! (IndexedDB-fel)"); // localize
    return; // bail out if we can’t even store locally
  }

  // Optional: upload to server if we have an id
  if (sid == '') {
    console.log('sid is empty, not putting');
    return;
  }

  try {
    const myid = sid + "-" + i_code.value;

    // Send as comma-separated ints (mirrors your PHP fetch format)
    const responseParam = Array.from(compressed).join(',');

    const mydata = "id=" + encodeURIComponent(myid) +
                   "&response=" + encodeURIComponent(responseParam);

    console.log("key_record_length: " + Object.keys(key_record).length);
    console.log("compressed data length (bytes): " + compressed.length);

    const jqxhr = $.ajax({
      url: "php/putdata.php",
      type: "post",
      data: mydata
    });

    jqxhr.done(function (response, textStatus, jqXHR) {
      const status = "Svaren har lagrats.";
      const phprt  = jqXHR.responseText; // ok, so we actually ignore the real php response here and write a localized string instead
      //const phprt = t("msg.fromPhp");
      console.log('Success : ' + textStatus + ' : ' + phprt);
      $("#messageLabel").append(phprt);
    });

    jqxhr.fail(function (jqXHR, textStatus, errorThrown) {
      const status = "Något gick fel :(";
      console.error("The following error occured: ", textStatus, errorThrown);
      console.log("Status:", jqXHR.status);
      console.log("Response:", jqXHR.responseText);
      $("#messageLabel").append(errorThrown);
    });
  } catch (e) {
    console.error('Upload failed:', e);
    $("#messageLabel").append(" Uppladdning misslyckades.");
  }
}

async function updateListbox() {
  const select = lb_load || document.getElementById('lb_load');
  if (!select) return;

  const keys = await idbStore.keys();
  keys.sort();

  let listbox = '';
  for (let i = 0; i < keys.length; i++) {
    listbox += `<option value="${i}">${keys[i]}</option>`;
  }
  select.innerHTML = listbox;

  console.log(`indexedDB Entries: ${keys.length}`);
}

function myItems(jsonString){
  var json = JSON.parse(jsonString);
  json.table.rows.forEach(line => {
      if (line.c[1].v.startsWith(tag)) {
      dates = line.c[0].f;
      delt = line.c[1].v;
      response = line.c[2].v;
      localStorage.setItem(delt, response);
      console.log(delt);
      }
      });
}

// Assumes: idbStore, pako, emptyListbox(), updateListbox(), loadFromListbox() are defined

async function fetchPlusFromStorage() {
  if (sid == '') {
    console.log('sid is empty, not getting');
    return;
  }

  try {
    // 1) Clear IDB + listbox
    await emptyListbox(); // your async version that calls idbStore.clear() + updateListbox()

    // 2) Prepare request params (force a single record)
    const startlimit = $("#startlimit").val();
    $("#endlimit").val(1);
    const endlimit = 1;

    const mydata = "id=" + sid + "&startlimit=" + startlimit + "&endlimit=" + endlimit;

    // 3) Fetch (await the jqXHR)
    const response = await $.ajax({
      url: getdataphp,
      type: "POST",
      data: mydata
    });

    // 4) Handle "no results"
    if (typeof response === 'string' && response.includes("0 results")) {
      messages.value += response + "\n";
      return;
    }

    // 5) Parse response: expect at most one non-empty line (but handle safely)
    const lines = String(response).split('\n');

    for (const line of lines) {
      if (!line) continue;
      const rarr = line.split('\t');
      if (rarr.length !== 4) continue;

      // rarr[0] = published_on, rarr[1] = user, rarr[2] = "1,2,3,...", rarr[3] = index
      const key = `${rarr[3]}_${rarr[1]}_${rarr[0]}`;

      // Convert comma-separated ints -> Uint8Array
      const bytes = new Uint8Array(rarr[2].split(',').map(Number));

      // Store COMPRESSED bytes directly in IDB
      await idbStore.setItem(key, bytes);

      // We only asked for one record; break after the first good line
      break;
    }

    // 6) Refresh listbox and select the first item
    await updateListbox();

    if (lb_load && lb_load.options.length > 0) {
      // Your updateListbox sets option.value to the index ("0", "1", ...), text = key
      lb_load.selectedIndex = 0;

      // 7) Load selected item (async)
      await loadFromListbox();
    }

    // 8) Clear playback UI (unchanged)
    playback.value = '';

  } catch (err) {
    const status = "Något gick fel :(";
    console.error("The following error occurred:", err);
    messages.value += status + "\n";
  }
}

// Assumes: pako is available, idbStore is loaded.
// Keeps your existing jQuery ajax call.

function fetchFromStorage() {
  if (sid == '') {
    console.log('sid is empty, not getting');
    return;
  }
  var startlimit = $("#startlimit").val();
  var endlimit = $("#endlimit").val();
  var mydata = "id=" + sid + "&startlimit=" + startlimit + "&endlimit=" + endlimit;

  var request = $.ajax({
    url: getdataphp,
    type: 'POST',
    data: mydata
  });

  request.done(async function (response, textStatus, jqXHR) {
    if (response.includes("0 results")) {
      messages.value += response + "\n";
      return;
    }

    const lines = response.split('\n');

    // Process sequentially to keep memory spikes low
    for (const line of lines) {
      if (!line) continue;
      const rarr = line.split('\t');
      if (rarr.length !== 4) continue;

      // rarr[0] = published_on, rarr[1] = user, rarr[2] = "1,2,3,...", rarr[3] = index
      const key = `${rarr[3]}_${rarr[1]}_${rarr[0]}`;

      // Convert "1,2,3" -> Uint8Array
      // Make sure to map(Number) to avoid string bytes
      const bytes = new Uint8Array(rarr[2].split(',').map(Number));

      // Store the **compressed** bytes directly in IndexedDB.
      // (Much smaller than inflating to string.)
      await idbStore.setItem(key, bytes);
    }

    await updateListbox(); // now reads keys from IDB
  });

  request.fail(function (jqXHR, textStatus, errorThrown) {
    const status = "Något gick fel :(";
    console.error("The following error occured: ", textStatus, errorThrown);
  });
}

// Make this async wherever you call it: `await loadFromListbox();`
async function loadFromListbox() {
  replayStop(false);
  if (!lb_load || lb_load.selectedIndex < 0) return;

  // Your listbox shows the key as its text (same as before)
  const key = lb_load.options[lb_load.selectedIndex].text;

  // Read + inflate (or pass through if stored as string)
  const jsonStr = await getJsonFromIDB(key);
  if (!jsonStr) {
    messages.value += `Key "${key}" not found.\n`;
    messages.scrollTop = messages.scrollHeight;
    return;
  }

  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    console.error('Failed to parse JSON for key:', key, e);
    messages.value += `Could not parse data for "${key}".\n`;
    messages.scrollTop = messages.scrollHeight;
    return;
  }

  // Assign your records (unchanged)
  header_record = data.header_records;
  text_record   = data.text_records;
  cursor_record = data.cursor_records;
  key_record    = data.key_records;
  scroll_record = data.scroll_records;

  messages.value += `Read ${Object.keys(text_record || {}).length} text records.\n`;
  messages.scrollTop = messages.scrollHeight;

  groupTime = -1;
  if (window.wscrLinear && typeof window.wscrLinear.renderFromGlobals === 'function') {
    window.wscrLinear.renderFromGlobals();
  } else {
    makeLINfile();
  }
  if (window.wscrLinearKey && typeof window.wscrLinearKey.renderFromGlobals === 'function') {
    window.wscrLinearKey.renderFromGlobals();
  }
  processGraphFormat();
  makeRevisionTable();
}

async function clearListbox() {
  if (lb_load.selectedIndex < 0) {
    return;
  }

  const slString = lb_load.options[lb_load.selectedIndex].text;

  try {
    await idbStore.removeItem(slString);
    messages.value += 'Removing ' + slString + '.\n';
    await updateListbox();
  } catch (err) {
    console.error("Failed to remove item:", err);
    messages.value += 'Error removing ' + slString + '.\n';
  }
}

async function emptyListbox() {
  try {
    // Clear the IndexedDB store
    await idbStore.clear();

    // Refresh the UI
    await updateListbox();
    console.log("All items removed from IndexedDB.");
  } catch (err) {
    console.error("Failed to clear IndexedDB:", err);
  }
}

async function dlFromListbox() {
  if (!lb_load || lb_load.selectedIndex < 0) return;

  const key = lb_load.options[lb_load.selectedIndex].text;

  try {
    const jsonStr = await getJsonFromIDB(key);
    if (!jsonStr) {
      messages.value += `No data for "${key}".\n`;
      messages.scrollTop = messages.scrollHeight;
      return;
    }

    const blob = new Blob([jsonStr], { type: "text/plain;charset=utf-8" });
    saveAs(blob, key + ".txt");
  } catch (err) {
    console.error("Download failed:", err);
    messages.value += `Download failed for "${key}".\n`;
    messages.scrollTop = messages.scrollHeight;
  }
}

async function dlFinalTextFromListbox() {
  if (!lb_load || lb_load.selectedIndex < 0) return;

  const key = lb_load.options[lb_load.selectedIndex].text;

  try {
    const jsonStr = await getJsonFromIDB(key);
    if (!jsonStr) {
      messages.value += `No data for "${key}".\n`;
      messages.scrollTop = messages.scrollHeight;
      return;
    }

    const obj = JSON.parse(jsonStr);
    const tr = obj?.text_records || {};
    const lastKey = Object.keys(tr).at(-1);

    if (!lastKey) {
      messages.value += `No text_records found in "${key}".\n`;
      messages.scrollTop = messages.scrollHeight;
      return;
    }

    const finalText = tr[lastKey] ?? '';
    const blob = new Blob([finalText], { type: "text/plain;charset=utf-8" });
    saveAs(blob, key + "_final.txt");
  } catch (err) {
    console.error("Final text download failed:", err);
    messages.value += `Final text download failed for "${key}".\n`;
    messages.scrollTop = messages.scrollHeight;
  }
}

function debugInspect() {

}

function makeLINfile() {
  //linfile = "LINFILE:\n";
  linfile = "";
  lastKtime = header_record['starttime'];
  nKeydowns = 0;
  firstKdown = 0;
  finalKup = 0;
  numberOfPauses = 0;
  totalPauseTime = 0;
  var pauseCriteria = $("#pauseCrit").val();
  for (var k in key_record) {
    key07 = key_record[k].substring(0, 7);
    passed = (k - lastKtime) / 1000.0;
    // keydown and mousedown may be pauses
    if (key07 === "keydown" ||
        key07 === "mousedo") {
      if (passed >= pauseCriteria && firstKdown > 0) { // hard-coded pause crit ¯\(°_o)/¯ - not anymore!
        numberOfPauses += 1;
        totalPauseTime += passed;
        linfile += "<span class='linred'>&lt;" + passed + "&gt;</span>";
      }
    }

    // lin file        
    if (key07 === "mousedo") {
      linfile += "<span class='linred'>&lt;MOUSE&gt;</span>";
      /*for (kcr in cursor_record) {
        if (kcr > k) {
        fcr = cursor_record[kcr];
        console.log(fcr);
        break;
        }
        }
        st_en = fcr.split(':');
        for (ktr in text_record) {
        if (ktr > k) {
        ftr = text_record[ktr];
        ftr_part = ftr.slice(parseInt(st_en[0])-10,parseInt(st_en[1])+10);
        console.log(st_en+'|'+ftr_part+'|');
        break;
        }
        }*/
    }

    if (key07 === "keydown") {
      if (firstKdown === 0) {
        firstKdown = k;
      }
      nKeydowns += 1;
      keyString = key_record[k].substring(9);
      if (keyString.length > 1) { // hack :p
        keyString = "<span class='linred'>&lt;" + keyString.toUpperCase() + "&gt;</span>";
      }
      //linfile += keyString;
      for (kcr in cursor_record) {
        if (kcr > k) {
          fcr = cursor_record[kcr];
          //console.log(fcr);
          break;
        }
      }
      st_en = fcr.split(':');
      for (ktr in text_record) {
        if (ktr > k) {
          ftr = text_record[ktr];
          sti = parseInt(st_en[0]);
          eni = parseInt(st_en[1]);
          ftr_part = ftr.slice(sti-20,eni) + "|" + ftr.slice(eni,eni+20);
          //console.log(st_en+'|'+ftr_part+'|');
          break;
        }
      }
      linfile += "<span title='" + ftr_part + "'>" + keyString + "</span>";
    }

    if (key07 === "repeat:") {
      keyString = key_record[k].substring(8);
      if (keyString.length > 1) { // hack :p
        keyString = "<span class='linred'>&lt;" + keyString.toUpperCase() + "&gt;</span>";
      }
      linfile += keyString;
    }

    if (key07 === 'keyup: ') {
      finalKup = k;
    }
    // only in verbose
    //messages.value += k + ': ' + key_record[k] + ' - ' + passed + '\n';
    lastKtime = k;
  }
  messages.value += 'Typing time: '
    + (finalKup - firstKdown) / 1000 + '\n';

  // only in verbose
  //    for (var k in cursor_record) {
  //        messages.value += k + ': ' + cursor_record[k] + '\n';
  //    }

  insertions = 0;
  deletions = 0;
  replacements = 0;
  current_text = "";
  for (var k in text_record) {
    edited_text = text_record[k];
    var commonlength = myDmp.diff_commonPrefix(current_text, edited_text);
    text1 = current_text.substring(commonlength);
    text2 = edited_text.substring(commonlength);

    // Trim off common suffix (speedup).
    commonlengths = myDmp.diff_commonSuffix(text1, text2);
    //var commonsuffix = text1.substring(text1.length - commonlengths);
    text1 = text1.substring(0, text1.length - commonlengths);
    text2 = text2.substring(0, text2.length - commonlengths);

    if (text1.length === 0 && text2.length > 0) {
      insertions += 1;
    }
    if (text1.length > 0 && text2.length === 0) {
      deletions += 1;
    }
    if (text1.length > 0 && text2.length > 0) {
      replacements += 1;
    }

    current_text = edited_text;
    // only in verbose
    //messages.value += k + ': ' + text_record[k] + ' - ' + text1 + ':' + text2 + '\n';
    //messages.value += text1 + ':' + text2 + '\n';
  }
  linoutput.innerHTML = linfile;
  //messages.value += linfile + '\n';
}

/* the following three should allow for saving+reapplying ranges */
function getHighlightedCharSpans() {
  return Array.from(
    document.querySelectorAll('#content span[time-bef][time-aft]')
  );
}

function saveAllHighlights() {
  const wrappers = Array.from(document.querySelectorAll('#content .newspan'));
  const allChars = getHighlightedCharSpans();

  const ranges = wrappers.map(wrapper => {
    const chars = wrapper.querySelectorAll('span[time-bef][time-aft]');
    if (!chars.length) return null;

    const start = allChars.indexOf(chars[0]);
    const end = allChars.indexOf(chars[chars.length - 1]) + 1;

    if (start < 0 || end <= start) return null;

    return { start, end };
  }).filter(Boolean);

  return ranges;
}

function applyAllHighlights(ranges) {
  if (!Array.isArray(ranges) || ranges.length === 0) return;

  // Flattened character stream in document order (works even if some are already wrapped)
  const spans = Array.from(document.querySelectorAll('#content span[time-bef][time-aft]'));
  if (spans.length === 0) return;

  // 1) (Optional but recommended) unwrap existing highlights first
  //    so indices refer to the plain character stream
  const existing = Array.from(document.querySelectorAll('#content .newspan'));
  for (const wrapper of existing) {
    const parent = wrapper.parentNode;
    while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
    parent.removeChild(wrapper);
  }

  // Recompute after unwrapping (DOM changed)
  const flat = Array.from(document.querySelectorAll('#content span[time-bef][time-aft]'));

  // 2) Normalize + sort descending so wrapping doesn't shift later indices
  const normalized = ranges
    .map(r => ({
      start: Math.max(0, Math.min(r.start, flat.length)),
      end: Math.max(0, Math.min(r.end, flat.length))
    }))
    .map(r => (r.start <= r.end ? r : ({ start: r.end, end: r.start })))
    .filter(r => r.end > r.start)
    .sort((a, b) => b.start - a.start);

  // 3) Wrap each range
  for (const r of normalized) {
    const startSpan = flat[r.start];
    const endSpan = flat[r.end - 1];
    if (!startSpan || !endSpan) continue;

    const range = document.createRange();
    range.setStartBefore(startSpan);
    range.setEndAfter(endSpan);

    const wrapper = document.createElement('span');
    wrapper.className = 'newspan';
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
  }
}

function makeFTAnalysis() {
  const dmp = new diff_match_patch();

  // Build ftr = { starttime: "", ...text_record }
  const hr = {};
  hr[header_record['starttime']] = '';
  const ftr = Object.assign(hr, text_record);


	// Convert to array + sort by real time
	let cumulative = 0;

	const textData = Object.keys(ftr)
		.map((key) => ({
			realTime: +key,
			text: ftr[key]
		}))
		.sort((a, b) => a.realTime - b.realTime)
		.map((item, index) => {
			//cumulative += (index + 1) * 1000; // fake/debug time
			cumulative = index; // fake/debug time

			return {
				time: item.realTime,        // original timestamp
				cumulative: cumulative,     // fake/debug timeline
				length: item.text.length,
				text: item.text
			};
		});

	/* Convert to array + (important) sort by time
	const textData = Object.keys(ftr)
		.map((key) => ({
			time: +key,
			length: ftr[key].length,
			text: ftr[key],
		}))
		.sort((a, b) => a.time - b.time);

	// fake time for easier debugging
	let cumulative = 0;
	const textData = Object.keys(ftr).map((key, index) => {
		cumulative += (index + 1) * 1000; // increment grows with index
		return {
			time: cumulative,
			length: ftr[key].length,
			text: ftr[key]
		};
	});*/

	// Diff logic
	const textList = [];
	let currentPosition = 0;

	const diffSteps = []; // one entry per diff between snapshots

	textData.forEach((item, index) => {
		if (index === 0) return;

		const prevText = textData[index - 1].text;
		const currentText = item.text;

		const diffs = dmp.diff_main(prevText, currentText);
		dmp.diff_cleanupSemantic(diffs);

		/*let unchangedLen = 0;
		let insertLen = 0;
		let deleteLen = 0;

		diffs.forEach(([operation, text]) => {
			const L = text.length;
			if (operation === 0) unchangedLen += L;
			else if (operation === 1) insertLen += L;
			else if (operation === -1) deleteLen += L;
		});

		diffSteps.push({
			time: item.time,                 // real time of this snapshot
			cumulative: item.cumulative,     // fake/debug time if you want
			unchangedLen,
			insertLen,
			deleteLen
		});*/

		const chunks = diffs.map(([op, txt]) => ({ op, len: txt.length }))
			.filter(c => c.len > 0);

		diffSteps.push({
			time: item.time,
			cumulative: item.cumulative,
			chunks
		});

		//console.log('----------');
		//console.log(diffs);
    currentPosition = 0;
    diffs.forEach(([operation, text]) => {
      if (operation === 0) {
        // Unchanged: advance by length (NOT reset)
        currentPosition += text.length;
      } else if (operation === 1) {
        // Insertion
        const timeSincePrev = item.time - textData[index - 1].time;
        const timeUntilNext = (textData[index + 1] ? textData[index + 1].time : item.time) - item.time;

        for (const char of text) {
          //textList.splice(currentPosition, 0, [item.time, char, timeSincePrev, timeUntilNext]);
          textList.splice(currentPosition, 0, [item.time, item.cumulative, char, timeSincePrev, timeUntilNext]);
          currentPosition++;
        }
      } else if (operation === -1) {
        // Deletion
        for (let i = 0; i < text.length; i++) {
          textList.splice(currentPosition, 1);
					// we may need currentPosition-- here; but is *seems* it is not needed.
					// we can't create a diff that contains multiple deletions
        }
      }
      //console.log(operation, text, currentPosition);
    });
  });

  // Render final text
  const contentDiv = document.getElementById("content");
  const labelDiv = document.getElementById("label");
  const tableContainer = document.getElementById("table-container");

  // Clear previous run output (prevents duplicate listeners + duplicated spans)
  contentDiv.innerHTML = "";
  if (tableContainer) tableContainer.innerHTML = "";

  reconstructedText = '';
  textList.forEach(([time, cumulative, char, timeSincePrev, timeUntilNext]) => {
    const span = document.createElement("span");
    span.textContent = char;
    reconstructedText = reconstructedText + char;
    span.setAttribute("data-time", time);
    span.setAttribute("data-cumulative", cumulative);
    span.setAttribute("time-bef", timeSincePrev);
    span.setAttribute("time-aft", timeUntilNext);
    contentDiv.appendChild(span);
  });

  // test that reconstructed text match final text
  tmp_keys = Object.keys(ftr);
  if (reconstructedText == ftr[tmp_keys[tmp_keys.length-1]]) {
  	console.log('MATCH');
	} else {
  	console.log('NO MATCH');
  }

  //drawCumulativeVsPosition(textList);

  //drawDiffStackedBars(diffSteps, false);

  //drawDiffStackedBarsOrdered(diffSteps);
  //drawDiffStackedBarsOrderedD3(diffSteps);

	// this loads any existing spans from localStorage
	loadHighlightsFromLocalStorage();

  // Hover via delegation
  contentDiv.addEventListener("mouseover", (e) => {
    const span = e.target.closest('#content span[time-bef][time-aft]');
    if (!span) return;
    //labelDiv.textContent = `B: ${span.getAttribute("time-bef")} A: ${span.getAttribute("time-aft")}`;
    labelDiv.textContent = `B: ${span.getAttribute('time-bef')} A: ${span.getAttribute('time-aft')} C: ${span.getAttribute('data-cumulative')}`;

  });

  contentDiv.addEventListener("mouseout", (e) => {
    const span = e.target.closest('#content span[time-bef][time-aft]');
    if (!span) return;
    labelDiv.textContent = "Time: -";
  });

  function getCharSpan(node) {
    if (!node) return null;
    const el = (node.nodeType === Node.TEXT_NODE) ? node.parentElement : node;
    return el?.closest?.('#content span[time-bef][time-aft]') || null;
  }

  // Wrap selection (snap to whole char spans)
  contentDiv.addEventListener("mouseup", (e) => {
    if (e.target.closest(".newspan")) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const original = selection.getRangeAt(0);
    if (original.collapsed) return;

    const startSpan = getCharSpan(original.startContainer);
    const endSpan = getCharSpan(original.endContainer);
    if (!startSpan || !endSpan) return;

    // Optional: don't wrap if boundary is already wrapped
    if (startSpan.closest(".newspan") || endSpan.closest(".newspan")) return;

    const range = document.createRange();
    range.setStartBefore(startSpan);
    range.setEndAfter(endSpan);

    const wrapper = document.createElement("span");
    wrapper.className = "newspan";

    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);

    selection.removeAllRanges();
  });

  // Unwrap on click (works for single-letter selections too)
  contentDiv.addEventListener("click", (e) => {
    const wrapper = e.target.closest(".newspan");
    if (!wrapper) return;

    const parent = wrapper.parentNode;
    while (wrapper.firstChild) {
      parent.insertBefore(wrapper.firstChild, wrapper);
    }
    parent.removeChild(wrapper);
  });

  // Table generation (robust for 1-letter selections)
  const btn = document.getElementById("generate-table");
  if (btn) {
    btn.addEventListener("click", generateTable);
  }

	async function saveHighlightsToLocalStorage() {
		const key = lb_load.options[lb_load.selectedIndex].text; // your text id
		const ranges = saveAllHighlights(); // returns [{start,end}, ...]
		const storageKey = `highlights:${key}`;

		localStorage.setItem(storageKey, JSON.stringify(ranges));
    // needs await and handling in listbox
		//await idbStore.setItem(storageKey, JSON.stringify(ranges)); 
	}

	function loadHighlightsFromLocalStorage() {
		const key = lb_load.options[lb_load.selectedIndex].text;
		const storageKey = `highlights:${key}`;

		const raw = localStorage.getItem(storageKey);
		if (!raw) return;

		let ranges;
		try {
			ranges = JSON.parse(raw);
		} catch {
			return;
		}

		applyAllHighlights(ranges);
	}



  async function generateTable() {
    // save highlights to localStorage
		await saveHighlightsToLocalStorage();

    const container = document.getElementById("content");
    const wrappers = container.getElementsByClassName("newspan");
    const tableContainer = document.getElementById("table-container");

    if (!tableContainer) return;

    if (wrappers.length === 0) {
      tableContainer.innerHTML = "<p>No newspan elements found.</p>";
      return;
    }

    let tableHTML =
      "<table><thead><tr><th>Content</th><th>Time Before</th><th>Time After</th></tr></thead><tbody>";

    Array.from(wrappers).forEach((wrapper) => {
      const content = wrapper.textContent;

      const chars = wrapper.querySelectorAll("span[time-bef][time-aft]");
      if (!chars.length) return;

      const timeBef = chars[0].getAttribute("time-bef");
      const timeAft = chars[chars.length - 1].getAttribute("time-aft");

      tableHTML += `<tr><td>${content}</td><td>${timeBef}</td><td>${timeAft}</td></tr>`;
    });

    tableHTML += "</tbody></table>";
    tableContainer.innerHTML = tableHTML;
  }
}

// inspectRecords is now defined in inspect.js

let sentenceDiffTable = '';
//const myDmp = new diff_match_patch();

// Initialize the table with sentence diffs, classifications, locations, grouping, second diff, and row number
let recordKeys = '';
let prevClassification = '';
let prevStartLocation = -1;
let prevEndLocation = -1;
let groupStartText = '';
let previousRow = '';
//let groupPrevTime = 0;
let groupStartTime = 0;

function makeRevisionTable() {

  sentenceDiffTable = document.getElementById('sentenceDiffTable').getElementsByTagName('tbody')[0];
  sentenceDiffTable.innerHTML='';
  text_record["0"] = '';
  recordKeys = Object.keys(text_record);

  for (let i = 1; i < recordKeys.length; i++) {
    const previousText = text_record[recordKeys[i - 1]];
    const currentText = text_record[recordKeys[i]];

    const diff = myDmp.diff_main(previousText, currentText);
    myDmp.diff_cleanupSemantic(diff);

    //const prettyHtml = myDmp.diff_prettyHtml(diff);
    const prettyHtml = diff_prettyHtml_short(diff, 20);
    const classification = classifyDiff(diff);
    const location = calculateLocation(diff, classification);
    const isNewGroup = checkNewGroup(classification, location, i - 1);
    const secondDiff = computeSecondDiff(currentText, groupStartText, location);

    if (isNewGroup) {
      //groupPrevTime = recordKeys[i-1];
      groupStartTime = recordKeys[i];
      previousRow.className = 'last-in-group';
    }

    const row = sentenceDiffTable.insertRow();
    const cell1 = row.insertCell(0);
    const cell2 = row.insertCell(1);
    const cell3 = row.insertCell(2);
    const cell4 = row.insertCell(3);
    const cell5 = row.insertCell(4);
    const cell6 = row.insertCell(5);
    const cell7 = row.insertCell(6);

    cell1.textContent = i;
    cell2.innerHTML = prettyHtml;
    cell3.textContent = classification;
    cell3.className = classification.toLowerCase(); // Apply styling based on classification
    cell4.textContent = location.start+'-'+location.end;
    cell5.textContent = isNewGroup ? 'Yes' : 'No';
    cell5.className = isNewGroup ? 'new-group' : '';
    cell6.innerHTML = secondDiff;
    //cell7.textContent = (recordKeys[i] - header_record['starttime']) / 1000.0;
    //cell7.id = recordKeys[i];
    cell7.textContent = (groupStartTime - header_record['starttime']) / 1000.0;
    cell7.id = groupStartTime;

    previousRow = row;
  }
  previousRow.className = 'last-in-group';

  const rows = sentenceDiffTable.getElementsByTagName('tr');

  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].classList.contains('last-in-group')) {
      rows[i].style.display = 'none';
    }
  }

  delete text_record["0"];

  const playFromRows = sentenceDiffTable.getElementsByClassName('last-in-group');

  for (let i = 0; i < playFromRows.length; i++) {
    playFromRows[i].addEventListener('click', playFromRow, false);
  }
  
}

let groupTime = -1;

function playFromRow(e) {
  groupTime = Number(e.srcElement.parentElement.cells[6].id);
  replaySeekToAbsolute(groupTime);

  let textTime = -1;

  for (var t in text_record) {
    if (t < groupTime) {
      textTime = t;
    }
  }

  if (textTime > -1) {
    playback.value = text_record[textTime];
  } else {
    playback.value = ''; // this needs to modified for when we have initial text
  }

  let cursorTime = -1;

  for (var t in cursor_record) {
    if (t < groupTime) {
      cursorTime = t;
    }
  }
  if (cursorTime > -1) {
    val_indices = cursor_record[cursorTime].split(":");
    playback.setSelectionRange(val_indices[0], val_indices[1]);
  }

  let scrollTime = -1;

  for (var t in scroll_record) {
    if (t < groupTime) {
      scrollTime = t;
    }
  }
  if (scrollTime > -1) {
    playback.scrollTop = scroll_record[scrollTime];
  }
  playback.focus();

  //console.log(groupTime);
}

function diff_prettyHtml_short(diffs, context) {
  var html = [];
  var pattern_amp = /&/g;
  var pattern_lt = /</g;
  var pattern_gt = />/g;
  var pattern_para = /\n/g;
  for (var x = 0; x < diffs.length; x++) {
    var op = diffs[x][0];    // Operation (insert, delete, equal)
    var data = diffs[x][1];  // Text of change.
    var text = data.replace(pattern_amp, '&amp;').replace(pattern_lt, '&lt;')
      .replace(pattern_gt, '&gt;').replace(pattern_para, '&para;<br>');
    switch (op) {
      case DIFF_INSERT:
        html[x] = '<ins style="background:#e6ffe6;">' + text + '</ins>';
        break;
      case DIFF_DELETE:
        html[x] = '<del style="background:#ffe6e6;">' + text + '</del>';
        break;
      case DIFF_EQUAL:
        if (x === 0) {
          html[x] = '<span>' + text.substring(text.length-context) + '</span>';
        } else {
          html[x] = '<span>' + text.substring(0, context) + '</span>';
        }
        break;
    }
  }
  return html.join('');
};

function classifyDiff(diff) {
  let hasInsertion = false;
  let hasDeletion = false;

  for (const d of diff) {
    if (d[0] === 1) {
      hasInsertion = true;
    } else if (d[0] === -1) {
      hasDeletion = true;
    }
  }

  if (hasInsertion && hasDeletion) {
    return 'REPLACE';
  } else if (hasInsertion) {
    return 'INSERT';
  } else if (hasDeletion) {
    return 'DELETE';
  } else {
    return 'NOCHANGE';
  }
}

function calculateLocation(diff, classification) {
  let start = -1;
  let end = -1;

  if (classification === 'INSERT' || classification === 'DELETE') {
    if (diff.length === 1) {
      start = 0;
      end = diff[0][1].length;
    } else {
      start = diff[0][1].length;
      end = start + diff[1][1].length;
    }
  } else if (classification === 'REPLACE') {
    if (diff.length === 2) {
      start = 0;
      end = diff[0][1].length;
    } else {
      start = diff[0][1].length;
      end = start + diff[2][1].length;
    }
  }

  return { start, end };
}

function checkNewGroup(classification, location, index) {
  const isNewClassification = classification !== prevClassification;

  let isNewLocation = false;
  if (classification === 'INSERT') {
    isNewLocation = location.start !== prevEndLocation;
  }
  if (classification === 'REPLACE') {
    isNewLocation = location.start !== prevEndLocation;
  }
  if (classification === 'DELETE') {
    isNewLocation = location.end !== prevStartLocation;
  }

  const isNewGroup = isNewClassification || isNewLocation;

  // Update previous classification and end location for the next iteration
  prevClassification = classification;
  prevStartLocation = location.start;
  prevEndLocation = location.end;

  // Update group start text if a new group is formed
  if (isNewGroup) {
    groupStartText = text_record[recordKeys[index]];
  }

  return isNewGroup;
}

function computeSecondDiff(currentText, groupStartText, location) {
  const secondDiff = myDmp.diff_main(groupStartText, currentText);
  myDmp.diff_cleanupSemantic(secondDiff);

  //return myDmp.diff_prettyHtml_short(secondDiff);
  return diff_prettyHtml_short(secondDiff, 20);
}

function computeRevisionGroupsForGraph(textRecord, sessionEndTs) {
  const keys = Object.keys(textRecord || {})
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  if (keys.length < 2) return [];

  const groups = [];
  let prevClassification = '';
  let prevStartLocation = -1;
  let prevEndLocation = -1;
  let currentGroup = null;

  for (let i = 1; i < keys.length; i++) {
    const ts = Number(keys[i]);
    const previousText = String(textRecord[keys[i - 1]] || '');
    const currentText = String(textRecord[keys[i]] || '');
    const diff = myDmp.diff_main(previousText, currentText);
    myDmp.diff_cleanupSemantic(diff);
    const classification = classifyDiff(diff);
    const location = calculateLocation(diff, classification);

    const isNewClassification = classification !== prevClassification;
    let isNewLocation = false;
    if (classification === 'INSERT') isNewLocation = location.start !== prevEndLocation;
    if (classification === 'REPLACE') isNewLocation = location.start !== prevEndLocation;
    if (classification === 'DELETE') isNewLocation = location.end !== prevStartLocation;
    const isNewGroup = isNewClassification || isNewLocation;

    if (!currentGroup) {
      currentGroup = { startTs: ts, endTs: ts, classification };
    } else if (isNewGroup) {
      currentGroup.endTs = ts;
      groups.push(currentGroup);
      currentGroup = { startTs: ts, endTs: ts, classification };
    } else {
      currentGroup.endTs = ts;
    }

    prevClassification = classification;
    prevStartLocation = location.start;
    prevEndLocation = location.end;
  }

  if (currentGroup) {
    currentGroup.endTs = Math.max(currentGroup.endTs, Number(sessionEndTs) || currentGroup.endTs);
    groups.push(currentGroup);
  }

  return groups
    .filter((g) => g.classification === 'INSERT' || g.classification === 'DELETE')
    .map((g) => ({
      startTs: Number(g.startTs),
      endTs: Number(g.endTs),
      kind: g.classification.toLowerCase()
    }))
    .filter((g) => Number.isFinite(g.startTs) && Number.isFinite(g.endTs))
    .map((g) => ({
      ...g,
      endTs: g.endTs <= g.startTs ? g.startTs + 1 : g.endTs
    }));
}

function getProcessPauseThreshold() {
  const processInput = document.getElementById('processPauseThreshold');
  const fallbackInput = document.getElementById('pauseCrit');
  const raw = processInput?.value ?? fallbackInput?.value ?? 0.3;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 0.3;
}

function processGraphFormat(drawGraph = true) {
  const textTimes = sortedNumericKeys(text_record);
  const cursorTimes = sortedNumericKeys(cursor_record);
  const scrollTimes = sortedNumericKeys(scroll_record);
  const keyTimes = sortedNumericKeys(key_record);

  current_text = '';
  processlength = 0;

  if (textTimes.length === 0) {
    if (drawGraph) drawSvg(null);
    buildReplayCache();
    const slider = document.getElementById('replaySeek');
    const label = document.getElementById('replayTimeLabel');
    if (slider) {
      slider.max = '1000';
      slider.value = '0';
    }
    if (label) {
      label.textContent = '0.000s / 0.000s';
    }
    return null;
  }

  const textSeries = [];
  for (const t of textTimes) {
    const edited_text = text_record[t];

    const commonlength = myDmp.diff_commonPrefix(current_text, edited_text);
    let text1 = current_text.substring(commonlength);
    let text2 = edited_text.substring(commonlength);

    const commonlengths = myDmp.diff_commonSuffix(text1, text2);
    text1 = text1.substring(0, text1.length - commonlengths);
    text2 = text2.substring(0, text2.length - commonlengths);

    processlength += text2.length;
    textSeries.push({
      time: Number(t),
      product: edited_text.length,
      process: processlength
    });
    current_text = edited_text;
  }

  const cursorSeries = cursorTimes.map((t) => ({
    time: Number(t),
    position: parseCursorPosition(cursor_record[t])
  }));

  const allEventTimes = Array.from(
    new Set([...textTimes, ...cursorTimes, ...scrollTimes, ...keyTimes])
  ).sort((a, b) => a - b);

  const thresholdSec = getProcessPauseThreshold();
  const pauseSeries = [];
  const pauseAllSeries = [];
  for (let i = 1; i < allEventTimes.length; i++) {
    const gapSec = (allEventTimes[i] - allEventTimes[i - 1]) / 1000;
    if (gapSec > 0) {
      pauseAllSeries.push({ time: allEventTimes[i], pauseSec: gapSec });
    }
    if (gapSec > thresholdSec) {
      pauseSeries.push({ time: allEventTimes[i], pauseSec: gapSec });
    }
  }

  let start = Number(header_record?.starttime);
  if (!Number.isFinite(start)) start = allEventTimes[0] ?? textSeries[0].time;
  let end = Number(header_record?.endtime);
  if (!Number.isFinite(end)) end = allEventTimes[allEventTimes.length - 1] ?? textSeries[textSeries.length - 1].time;
  if (!Number.isFinite(start)) start = textSeries[0].time;
  if (!Number.isFinite(end)) end = textSeries[textSeries.length - 1].time;
  if (end < start) end = start;

  const plausiblePauseSeries = pauseSeries.filter((p) => Number.isFinite(p.pauseSec) && p.pauseSec >= 0 && p.pauseSec <= 3600);

  const maxChars = Math.max(
    1,
    ...textSeries.map((d) => Math.max(d.product, d.process)),
    ...cursorSeries.map((d) => d.position)
  );
  const maxPauseSec = Math.max(1, ...plausiblePauseSeries.map((d) => d.pauseSec));
  const revisionGroups = computeRevisionGroupsForGraph(text_record, end);

  const model = {
    start,
    end,
    textSeries,
    cursorSeries,
    pauseSeries: plausiblePauseSeries,
    pauseAllSeries,
    pauseThresholdSec: thresholdSec,
    revisionGroups,
    maxChars,
    maxPauseSec
  };

  lastProcessModel = model;

  if (drawGraph) {
    drawSvg(model);
  }

  buildReplayCache();
  updateReplayControlsForTime(Number.isFinite(replayState.currentTs) ? replayState.currentTs : getReplayStartMark());
  return model;
}

function recordKeyDown(e) {
  var myTime = (new Date()).getTime();
  var selStart = this.selectionStart;
  var selEnd = this.selectionEnd;
  if (!keySet.has(e.key)) {
    keySet.add(e.key);
    key_record[myTime] = "keydown: " + e.key;
    // only in verbose
    //messages.value += myTime + ': (d, ' + selStart + ', ' + selEnd + ') ' + '\n';
    /*if (e.repeat) {
      return
      }*/
  } else {
    key_record[myTime] = "repeat: " + e.key;
    // only in verbose        
    //messages.value += myTime + ': (r, ' + selStart + ', ' + selEnd + ') ' + '\n';
    cursor_record[myTime] = selStart + ':' + selEnd;
  }
  //messages.scrollTop = messages.scrollHeight;
}

function recordKeyUp(e) {
  var myTime = (new Date()).getTime();
  var selStart = this.selectionStart;
  var selEnd = this.selectionEnd;
  if (keySet.delete(e.key)) {
    key_record[myTime] = "keyup: " + e.key;
    cursor_record[myTime] = selStart + ':' + selEnd;
    // only in verbose        
    //messages.value += myTime + ': (u, ' + selStart + ', ' + selEnd + ') ' + '\n';
    //messages.scrollTop = messages.scrollHeight;
  }
}

function recordMouseDown(e) {
  var myTime = (new Date()).getTime();
  var selStart = this.selectionStart;
  var selEnd = this.selectionEnd;
  key_record[myTime] = "mousedown: yes";
  cursor_record[myTime] = selStart + ':' + selEnd;
  // only in verbose        
  //messages.value += myTime + ': (md, ' + selStart + ', ' + selEnd + ') ' + '\n';
  //messages.scrollTop = messages.scrollHeight;
}

function recordMouseUp(e) {
  var myTime = (new Date()).getTime();
  var selStart = this.selectionStart;
  var selEnd = this.selectionEnd;
  key_record[myTime] = "mouseup: yes";
  cursor_record[myTime] = selStart + ':' + selEnd;
  // only in verbose        
  //messages.value += myTime + ': (mu, ' + selStart + ', ' + selEnd + ') ' + '\n';
  //messages.scrollTop = messages.scrollHeight;
}

function recordMouseMove(e) {
  if (e.buttons > 0 && e.buttons < 5) {
    var myTime = (new Date()).getTime();
    var selStart = this.selectionStart;
    var selEnd = this.selectionEnd;
    key_record[myTime] = "mousemove: yes";
    cursor_record[myTime] = selStart + ':' + selEnd;
    // only in verbose        
    //messages.value += myTime + ': (mm, ' + selStart + ', ' + selEnd + ') ' + '\n';
    //messages.scrollTop = messages.scrollHeight;
  }
}

function recordInput() {
  var myTime = (new Date()).getTime();
  var selStart = this.selectionStart;
  var selEnd = this.selectionEnd;
  var edited_text = this.value;

  var commonlength = myDmp.diff_commonPrefix(current_text, edited_text);
  //var commonprefix = current_text.substring(0, commonlength);
  text1 = current_text.substring(commonlength);
  text2 = edited_text.substring(commonlength);

  // Trim off common suffix (speedup).
  commonlengths = myDmp.diff_commonSuffix(text1, text2);
  //var commonsuffix = text1.substring(text1.length - commonlengths);
  text1 = text1.substring(0, text1.length - commonlengths);
  text2 = text2.substring(0, text2.length - commonlengths);

  /*
     messages.value += myTime + ': (i, '
     + selStart + ', '
     + selEnd + ') '
     + 'Old: ' + text1 + ' '
     + 'New: ' + text2 + ' '
     + 'Diff: ' + commonlength
     + '\n';
   */

  text_record[myTime] = edited_text;
  // more compact, needs another replay function
  //text_record[myTime] = commonlength + ':' + text1 + ':' + text2;
  cursor_record[myTime] = selStart + ':' + selEnd;
  current_text = edited_text;
  // only in verbose
  //messages.value += myTime + ': (i, ' + Object.keys(text_record).length + ') \n';
  //messages.scrollTop = messages.scrollHeight;
  messages.value += text1 + ':' + text2 + ' ';

}

function recordScroll() {
  var myTime = (new Date()).getTime();
  var myScrollTop = this.scrollTop;
  scroll_record[myTime] = myScrollTop;
  // only in verbose        
  //messages.value += myTime + ': (s, ' + myScrollTop + ') ' + '\n';
  //messages.scrollTop = messages.scrollHeight;
}

let replayCache = null;
let replayState = {
  isPlaying: false,
  isPaused: false,
  currentTs: null,
  startTs: null,
  endTs: null,
  anchorTs: null,
  anchorPerf: null,
  speed: 1,
  rafId: null
};

let graphInteractionState = null;
let lastProcessModel = null;

function sortedNumericKeys(obj) {
  return Object.keys(obj || {})
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
}

function parseCursorPosition(value) {
  if (typeof value !== 'string') return 0;
  const parts = value.split(':');
  if (parts.length < 2) return 0;
  const end = Number(parts[1]);
  return Number.isFinite(end) ? end : 0;
}

function lastIndexLE(arr, target) {
  let lo = 0;
  let hi = arr.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= target) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

function getReplayStartMark() {
  if (!replayCache || !replayCache.ready) return 0;
  if (groupTime !== -1) return Math.max(replayCache.start, groupTime);
  return replayCache.start;
}

function buildReplayCache() {
  const textTimes = sortedNumericKeys(text_record);
  const cursorTimes = sortedNumericKeys(cursor_record);
  const scrollTimes = sortedNumericKeys(scroll_record);
  const keyTimes = sortedNumericKeys(key_record);

  const textValues = textTimes.map((t) => text_record[t]);
  const cursorValues = cursorTimes.map((t) => cursor_record[t]);
  const scrollValues = scrollTimes.map((t) => scroll_record[t]);

  const allEventTimes = Array.from(
    new Set([...textTimes, ...cursorTimes, ...scrollTimes, ...keyTimes])
  ).sort((a, b) => a - b);

  let start = Number(header_record?.starttime);
  if (!Number.isFinite(start)) start = allEventTimes[0];

  let end = Number(header_record?.endtime);
  if (!Number.isFinite(end)) end = allEventTimes[allEventTimes.length - 1];
  if (!Number.isFinite(end)) end = start;
  if (!Number.isFinite(start)) start = end;
  if (!Number.isFinite(start)) start = 0;
  if (!Number.isFinite(end)) end = start;
  if (end < start) end = start;

  replayCache = {
    ready: allEventTimes.length > 0 || textTimes.length > 0 || cursorTimes.length > 0 || scrollTimes.length > 0,
    start,
    end,
    textTimes,
    textValues,
    cursorTimes,
    cursorValues,
    scrollTimes,
    scrollValues,
    allEventTimes
  };

  return replayCache;
}

function getSelectedReplaySpeed() {
  const el = document.getElementById('replaySpeed');
  const speed = Number(el?.value ?? 1);
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

function updatePauseButtonLabel() {
  const btn = document.getElementById('b_pause');
  if (!btn) return;
  if (replayState.isPlaying && replayState.isPaused) {
    btn.textContent = t('btn.RESUME');
  } else {
    btn.textContent = t('btn.PAUSE');
  }
}

function updateReplayButtonActiveState() {
  const btn = document.getElementById('b_replay');
  if (!btn) return;
  const isActive = replayState.isPlaying && !replayState.isPaused;
  btn.classList.toggle('is-active-replay', isActive);
}

function focusPlaybackNoScroll() {
  if (!playback || typeof playback.focus !== 'function') return;
  try {
    playback.focus({ preventScroll: true });
  } catch (e) {
    // Older browsers may not support preventScroll.
  }
}

function formatSecondsLabel(ms) {
  return `${(ms / 1000).toFixed(3)}s`;
}

function updateReplayControlsForTime(ts) {
  if (!replayCache) return;
  const slider = document.getElementById('replaySeek');
  const label = document.getElementById('replayTimeLabel');
  if (!slider || !label) return;

  const duration = Math.max(1, Math.round(replayCache.end - replayCache.start));
  slider.max = String(duration);

  const clamped = Math.max(replayCache.start, Math.min(replayCache.end, ts));
  slider.value = String(Math.round(clamped - replayCache.start));
  label.textContent = `${formatSecondsLabel(clamped - replayCache.start)} / ${formatSecondsLabel(replayCache.end - replayCache.start)}`;
}

function updateGraphPlayhead(ts) {
  if (!graphInteractionState) return;
  const { x, width, playhead } = graphInteractionState;
  const cx = Math.max(0, Math.min(width, x(ts)));
  playhead.attr('x1', cx).attr('x2', cx);
}

function applyPlaybackAt(ts) {
  if (!replayCache || !replayCache.ready) return;

  const clampedTs = Math.max(replayCache.start, Math.min(replayCache.end, ts));

  const ti = lastIndexLE(replayCache.textTimes, clampedTs);
  playback.value = ti >= 0 ? replayCache.textValues[ti] : '';

  const ci = lastIndexLE(replayCache.cursorTimes, clampedTs);
  if (ci >= 0) {
    const val = replayCache.cursorValues[ci];
    const parts = String(val).split(':');
    if (parts.length >= 2) {
      const start = Number(parts[0]);
      const end = Number(parts[1]);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        try {
          playback.setSelectionRange(start, end);
        } catch (e) {
          // Ignore invalid selection ranges.
        }
      }
    }
  }

  const si = lastIndexLE(replayCache.scrollTimes, clampedTs);
  if (si >= 0) playback.scrollTop = Number(replayCache.scrollValues[si]) || 0;

  replayState.currentTs = clampedTs;
  updateReplayControlsForTime(clampedTs);
  updateGraphPlayhead(clampedTs);
}

function replaySeekToAbsolute(ts) {
  buildReplayCache();
  if (!replayCache || !replayCache.ready) return;

  const clampedTs = Math.max(replayCache.start, Math.min(replayCache.end, ts));
  if (replayState.isPlaying && !replayState.isPaused) {
    replayState.isPaused = true;
    if (replayState.rafId != null) cancelAnimationFrame(replayState.rafId);
    replayState.rafId = null;
  }

  applyPlaybackAt(clampedTs);
  replayState.anchorTs = clampedTs;
  replayState.anchorPerf = performance.now();
  updatePauseButtonLabel();
  updateReplayButtonActiveState();
}

function replayTick(now) {
  if (!replayState.isPlaying || replayState.isPaused || !replayCache?.ready) return;

  const elapsedMs = (now - replayState.anchorPerf) * replayState.speed;
  const ts = replayState.anchorTs + elapsedMs;

  if (ts >= replayState.endTs) {
    applyPlaybackAt(replayState.endTs);
    replayState.isPlaying = false;
    replayState.isPaused = false;
    replayState.rafId = null;
    updatePauseButtonLabel();
    updateReplayButtonActiveState();
    return;
  }

  applyPlaybackAt(ts);
  replayState.rafId = requestAnimationFrame(replayTick);
}

function replayNormal() {
  replayStart(getSelectedReplaySpeed());
}

function replayFast() {
  replayStart(10);
}

function replayPauseResume() {
  if (!replayState.isPlaying) {
    replayStart(getSelectedReplaySpeed());
    return;
  }

  if (replayState.isPaused) {
    replayState.isPaused = false;
    replayState.anchorTs = replayState.currentTs ?? getReplayStartMark();
    replayState.anchorPerf = performance.now();
    replayState.rafId = requestAnimationFrame(replayTick);
    focusPlaybackNoScroll();
  } else {
    replayState.isPaused = true;
    if (replayState.rafId != null) cancelAnimationFrame(replayState.rafId);
    replayState.rafId = null;
  }
  updatePauseButtonLabel();
  updateReplayButtonActiveState();
}

function replayStart(speed = 1) {
  replayStop(false);
  if (recorder.recording) {
    stopRecording();
  }
  buildReplayCache();
  if (!replayCache || !replayCache.ready) return;

  const startTs = getReplayStartMark();
  const endTs = replayCache.end;
  const effectiveSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1;

  replayState.isPlaying = true;
  replayState.isPaused = false;
  replayState.startTs = startTs;
  replayState.endTs = endTs;
  replayState.currentTs = startTs;
  replayState.anchorTs = startTs;
  replayState.anchorPerf = performance.now();
  replayState.speed = effectiveSpeed;
  updatePauseButtonLabel();
  updateReplayButtonActiveState();

  applyPlaybackAt(startTs);
  focusPlaybackNoScroll();
  replayState.rafId = requestAnimationFrame(replayTick);
}

function replayStop(resetToStart = false) {
  if (replayState.rafId != null) cancelAnimationFrame(replayState.rafId);
  replayState.rafId = null;
  replayState.isPlaying = false;
  replayState.isPaused = false;
  updatePauseButtonLabel();
  updateReplayButtonActiveState();

  if (resetToStart) {
    buildReplayCache();
    if (replayCache && replayCache.ready) {
      applyPlaybackAt(getReplayStartMark());
    }
  }
}

function drawSvg(model) {
  const svgRoot = d3.select('#processGraphSvg');
  if (svgRoot.empty()) return;
  svgRoot.selectAll('*').remove();
  graphInteractionState = null;

  if (!model || !model.textSeries || model.textSeries.length === 0) {
    return;
  }

  const margin = { top: 20, right: 68, bottom: 48, left: 60 };
  const outerW = Number(svgRoot.attr('width')) || 960;
  const outerH = Number(svgRoot.attr('height')) || 500;
  const width = outerW - margin.left - margin.right;
  const height = outerH - margin.top - margin.bottom;

  const svg = svgRoot
    .attr('width', outerW)
    .attr('height', outerH)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain([model.start, model.end === model.start ? model.start + 1 : model.end])
    .range([0, width]);

  const yLeft = d3.scaleLinear()
    .domain([0, Math.max(1, model.maxPauseSec)])
    .range([height, 0]);

  const yRight = d3.scaleLinear()
    .domain([0, Math.max(1, model.maxChars)])
    .range([height, 0]);

  svg.append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(0,${height})`)
    .call(
      d3.axisBottom(x)
        .ticks(8)
        .tickFormat('')
        .tickSize(-height)
    );

  svg.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(yLeft).ticks(6).tickSize(-width).tickFormat(''));

  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(8).tickFormat((d) => ((d - model.start) / 1000).toFixed(1)));

  svg.append('g')
    .call(d3.axisLeft(yLeft).ticks(6));

  svg.append('g')
    .attr('transform', `translate(${width},0)`)
    .call(d3.axisRight(yRight).ticks(6));

  if (Array.isArray(model.revisionGroups) && model.revisionGroups.length) {
    svg.append('g')
      .attr('class', 'revision-group-hints')
      .selectAll('rect')
      .data(model.revisionGroups)
      .enter()
      .append('rect')
      .attr('x', (d) => Math.max(0, Math.min(width, x(d.startTs))))
      .attr('y', 0)
      .attr('width', (d) => {
        const x0 = Math.max(0, Math.min(width, x(d.startTs)));
        const x1 = Math.max(0, Math.min(width, x(d.endTs)));
        return Math.max(1, x1 - x0);
      })
      .attr('height', height)
      .attr('fill', (d) => (d.kind === 'insert' ? '#22c55e' : '#ef4444'))
      .attr('opacity', 0.08);
  }

  const processLine = d3.line()
    .x((d) => x(d.time))
    .y((d) => yRight(d.process));

  const productLine = d3.line()
    .x((d) => x(d.time))
    .y((d) => yRight(d.product));

  const positionLine = d3.line()
    .x((d) => x(d.time))
    .y((d) => yRight(d.position));

  svg.append('path')
    .datum(model.textSeries)
    .attr('fill', 'none')
    .attr('stroke', '#1f77b4')
    .attr('stroke-width', 2)
    .attr('d', processLine);

  svg.append('path')
    .datum(model.textSeries)
    .attr('fill', 'none')
    .attr('stroke', '#2ca02c')
    .attr('stroke-width', 2)
    .attr('d', productLine);

  svg.append('path')
    .datum(model.cursorSeries)
    .attr('fill', 'none')
    .attr('stroke', '#2ca02c')
    .attr('stroke-width', 1.6)
    .attr('stroke-dasharray', '6,4')
    .attr('opacity', 0.85)
    .attr('d', positionLine);

  svg.selectAll('.pause-dot')
    .data(model.pauseSeries)
    .enter()
    .append('circle')
    .attr('class', 'pause-dot')
    .attr('cx', (d) => x(d.time))
    .attr('cy', (d) => yLeft(d.pauseSec))
    .attr('r', 3)
    .attr('fill', '#f59e0b');

  svg.append('text')
    .attr('x', width / 2)
    .attr('y', height + 36)
    .attr('text-anchor', 'middle')
    .text('Time (s)');

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', -40)
    .attr('text-anchor', 'middle')
    .text('Pause (s)');

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', width + 54)
    .attr('text-anchor', 'middle')
    .text('Characters');

  const legend = svg.append('g').attr('transform', 'translate(10, 10)');
  const legendItems = [
    { label: 'Process', color: '#1f77b4', dash: null },
    { label: 'Product', color: '#2ca02c', dash: null },
    { label: 'Position', color: '#2ca02c', dash: '6,4' },
    { label: 'Pause', color: '#f59e0b', dash: null }
  ];
  legendItems.forEach((item, idx) => {
    const y = idx * 18;
    legend.append('line')
      .attr('x1', 0)
      .attr('x2', 18)
      .attr('y1', y)
      .attr('y2', y)
      .attr('stroke', item.color)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', item.dash || null);
    legend.append('text')
      .attr('x', 24)
      .attr('y', y + 4)
      .style('font-size', '12px')
      .text(item.label);
  });

  const playhead = svg.append('line')
    .attr('class', 'playhead')
    .attr('y1', 0)
    .attr('y2', height)
    .attr('x1', 0)
    .attr('x2', 0);

  svg.append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'transparent')
    .style('cursor', 'crosshair')
    .on('click', function (event) {
      const px = d3.pointer(event, this)[0];
      const targetTs = x.invert(Math.max(0, Math.min(width, px)));
      replaySeekToAbsolute(targetTs);
    });

  graphInteractionState = { x, width, playhead };

  const initialTs = Number.isFinite(replayState.currentTs) ? replayState.currentTs : model.start;
  updateGraphPlayhead(initialTs);
}

function buildPauseAnalysisText(model) {
  if (!model || !model.pauseAllSeries) return 'No pause data.\n';
  const rows = [];
  rows.push(`threshold_sec: ${model.pauseThresholdSec ?? 0}`);
  rows.push(`count_all_pauses: ${model.pauseAllSeries.length}`);
  rows.push(`count_visible_pauses: ${model.pauseSeries?.length ?? 0}`);
  rows.push('');
  rows.push('index\\tgap_sec\\ttime_ms\\tseconds_from_start');
  const start = Number.isFinite(model.start) ? model.start : 0;
  model.pauseAllSeries.forEach((p, idx) => {
    const timeMs = Number(p.time);
    const gap = Number(p.pauseSec);
    const fromStart = Number.isFinite(timeMs) ? (timeMs - start) / 1000 : 0;
    rows.push(`${idx + 1}\\t${gap.toFixed(3)}\\t${Math.round(timeMs)}\\t${fromStart.toFixed(3)}`);
  });
  return rows.join('\\n') + '\\n';
}

function downloadProcessPauseAnalysis() {
  const model = lastProcessModel || processGraphFormat(false);
  const text = buildPauseAnalysisText(model);
  const lb = document.getElementById('lb_load');
  const sourceId =
    lb && lb.selectedIndex >= 0 && lb.options[lb.selectedIndex]
      ? lb.options[lb.selectedIndex].text
      : 'imported';
  const filename = `wscr-${sourceId}-pauses.txt`;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  saveAs(blob, filename);
}

var openFile = function (event) {
  replayStop(false);
  var input = event.target;

  var reader = new FileReader();
  reader.onload = function () {
    file_text = reader.result;
    try {
      header_record = JSON.parse(file_text).header_records;
      text_record = JSON.parse(file_text).text_records;
      cursor_record = JSON.parse(file_text).cursor_records;
      key_record = JSON.parse(file_text).key_records;
      scroll_record = JSON.parse(file_text).scroll_records || {};
      messages.value += 'Read ' + Object.keys(text_record).length + ' text records.\n';
      messages.scrollTop = messages.scrollHeight;
      groupTime = -1;
      if (window.wscrLinearKey && typeof window.wscrLinearKey.renderFromGlobals === 'function') {
        window.wscrLinearKey.renderFromGlobals();
      }
      processGraphFormat();
      makeRevisionTable();
    } catch (err) {
      messages.value += "Not a ScriptLog.js file, can't read.\n";
      messages.scrollTop = messages.scrollHeight;
    }
    //console.log(reader.result.substring(0, 200));
  };
  reader.readAsText(input.files[0]);
};

/*
   function hideshowOther() {
   $("#hidable").toggle();
   }
 */

// https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
      )
}

// from stackoverflowverse - lost where
function getUrlParameter(name) {
  name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
  var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
  var results = regex.exec(location.search);
  return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

function checkUserCode(input) {
	//const validPattern = /[^\p{L}\p{N}]/gu; // Matches non-alphanumeric UTF-8 characters
  const validPattern = /[^a-zA-Z0-9]/g; // only allow ASCII letters + digits
            
  const originalValue = input.value;
  const sanitizedValue = originalValue.replace(validPattern, ''); // Remove invalid characters

  // Check if invalid chars were removed
  if (originalValue !== sanitizedValue) {
    // Show native tooltip
    input.setCustomValidity('Only letters and numbers are allowed.');
    input.reportValidity();
    // Clear it so the field doesn't stay invalid
    setTimeout(() => input.setCustomValidity(''), 1000);
  }
            
  input.value = sanitizedValue; // Update input field

	if (sanitizedValue.length === 6) {
  	$('#b_record').prop('disabled', false);
  } else {
  	$('#b_record').prop('disabled', true);
	}
}

// Helper: read from IDB and return the JSON string (handles Uint8Array / Blob / string)
async function getJsonFromIDB(key) {
  const val = await idbStore.getItem(key);
  if (val == null) return null;

  let bytes;
  if (val instanceof Uint8Array) {
    bytes = val;
  } else if (val instanceof Blob) {
    const buf = await val.arrayBuffer();
    bytes = new Uint8Array(buf);
  } else if (typeof val === 'string') {
    // Already a JSON string (e.g., old localStorage data migrated)
    return val;
  } else if (val && val.bytes instanceof Uint8Array) {
    // If you stored { bytes, ...meta }
    bytes = val.bytes;
  } else {
    // Fallback: treat as JSON-serializable object
    return JSON.stringify(val);
  }

  // Inflate gzip -> string
  return pako.inflate(bytes, { to: 'string' });
}

//var my_uuidv4;
var sid;
var getdataphp = "php/getdata.php";


function init() {

  initUI();

  sid = getUrlParameter("sid");
  sid = sid.replace(/\W/g, '');
  if (sid != '') {
    sessionStorage.setItem('sid', sid);
  }
  if (sid == '') {
    sid = sessionStorage.getItem('sid');
    if (sid === null) {
      sid = '';
    }
  }

  const sidtext = sid
    ? t("msg.sid.withid", { sid })
    : t("msg.sid.noid");

  document.querySelectorAll(".sidLabel").forEach(el => {
    el.textContent = sidtext;
  });


  /*sidtext = "-ID- "
    if (sid == '') {
      sidtext = sidtext+"No id! Data will be saved locally.";
    } else {
      sidtext = sidtext+"Your id is: "+sid
    }
  $(".sidLabel").text(sidtext);*/
  console.log("sid="+sid);

  /*setTimeout(() => {
    window.history.pushState(
    "",
    "Page Title",
    window.location.href.split("?")[0]
  //"anything goes?"
  );

  // window.location.replace(window.location.href.split("?")[0])
  }, 0);*/

  if (sid.includes("admin")) {
    $("#div_fetch").css('display','');
  }

  //my_uuidv4 = uuidv4();
  recorder = document.getElementById("recorder");
  //recorder = document.getElementById("recordingLog");
  playback = document.getElementById("playback");
  messages = document.getElementById("messages");

  recorder.readOnly = true;
  //recorder.recording = false;
  recorder.style.borderColor = "lightskyblue";
  recorder.style.fontFamily = "Calibri, Georgia, serif";
  //recorder.style.fontSize = "large";
  playback.style.fontFamily = "Calibri, Georgia, serif";
  //playback.style.fontSize = "large";
  //playback.readOnly = true;
  //playback.disabled = true;
  messages.readOnly = true;


  lb_load = document.getElementById("lb_load");
  linoutput = document.getElementById("linoutput");
	i_code = document.getElementById("userCode");

  header_record = {};
  key_record = {};
  text_record = {};
  text_record_keeper = {};
  cursor_record = {};
  cursor_record_keeper = {};
  scroll_record = {};
  scroll_record_keeper = {};
  current_text = '';
  file_text = '';
  myDmp = new diff_match_patch();

  updateListbox();

  const replaySpeedSel = document.getElementById('replaySpeed');
  if (replaySpeedSel) {
    replaySpeedSel.addEventListener('change', () => {
      const speed = getSelectedReplaySpeed();
      if (replayState.isPlaying && !replayState.isPaused) {
        replayState.speed = speed;
        replayState.anchorTs = replayState.currentTs ?? getReplayStartMark();
        replayState.anchorPerf = performance.now();
      }
    });
  }

  const replaySeek = document.getElementById('replaySeek');
  if (replaySeek) {
    replaySeek.addEventListener('input', () => {
      buildReplayCache();
      if (!replayCache || !replayCache.ready) return;
      const offset = Number(replaySeek.value) || 0;
      replaySeekToAbsolute(replayCache.start + offset);
    });
  }

  const processPauseThreshold = document.getElementById('processPauseThreshold');
  if (processPauseThreshold) {
    processPauseThreshold.addEventListener('input', () => {
      processGraphFormat();
    });
  }

  const processPauseExportBtn = document.getElementById('processPauseExportBtn');
  if (processPauseExportBtn) {
    processPauseExportBtn.addEventListener('click', () => {
      downloadProcessPauseAnalysis();
    });
  }

  updatePauseButtonLabel();
  updateReplayButtonActiveState();

	// disabling record here because we need code
  $('#b_record').prop('disabled', true);
  $('#b_recstop').prop('disabled', true);

  //drawSvg();

} // end of init()

//window.addEventListener("DOMContentLoaded", init);
