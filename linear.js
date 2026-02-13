(() => {
  let lastBuild = null;

  function getLinThreshold() {
    const linInput = document.getElementById('linPauseThreshold');
    const fallbackInput = document.getElementById('pauseCrit');
    const raw = linInput?.value ?? fallbackInput?.value ?? 0;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function sortedTextEntries(textRecords) {
    return Object.entries(textRecords || {})
      .map(([ts, text]) => ({ ts: Number(ts), text: String(text || '') }))
      .filter((e) => Number.isFinite(e.ts))
      .sort((a, b) => a.ts - b.ts);
  }

  function toSortedEvents(records) {
    return Object.entries(records || {})
      .map(([ts, value]) => ({ ts: Number(ts), value: String(value || '') }))
      .filter((e) => Number.isFinite(e.ts))
      .sort((a, b) => a.ts - b.ts);
  }

  function tokenToText(token) {
    if (token.type === 'navkey') {
      const count = token.count || 1;
      return count > 1 ? `<${token.code}${count}>` : `<${token.code}>`;
    }
    if (token.type === 'nav') return `<NAV,${token.pos}>`;
    if (token.type === 'selection') return `<SEL,${token.start},${token.end}>`;
    if (token.type === 'unknown') return 'x';
    if (token.type === 'text') return String(token.value).replace(/ /g, '<SPACE>');
    if (token.type === 'delete') return token.count > 1 ? `<DELETE${token.count}>` : '<DELETE>';
    if (token.type === 'pause') return token.value;
    return token.value;
  }

  function renderTokens(tokens) {
    return tokens.map((token, index) => {
      const txt = escapeHtml(tokenToText(token));
      const attrs = `data-index=\"${index}\" tabindex=\"0\"`;
      if (token.type === 'text') return `<span ${attrs} class="linear-token linear-insert">${txt}</span>`;
      if (token.type === 'delete') return `<span ${attrs} class="linear-token linear-delete">${txt}</span>`;
      if (token.type === 'nav' || token.type === 'navkey' || token.type === 'selection') return `<span ${attrs} class="linear-token linear-nav">${txt}</span>`;
      if (token.type === 'pause') return `<span ${attrs} class="linear-token linear-time">${txt}</span>`;
      if (token.type === 'unknown') return `<span ${attrs} class="linear-token linear-unknown">${txt}</span>`;
      return `<span ${attrs} class="linear-token linear-marker">${txt}</span>`;
    }).join('');
  }

  function buildDebugLines(tokens) {
    return tokens.map((token) => {
      const text = tokenToText(token);
      const reasons = token.reasons && token.reasons.length ? token.reasons.join('; ') : 'no reason';
      return `${text} :: ${reasons}`;
    });
  }

  function rebuildToIndex(tokens, index) {
    const state = { text: '', pos: 0 };
    for (let i = 0; i <= index; i += 1) {
      applyTokenState(state, tokens[i]);
    }
    return state.text;
  }

  function renderCompare(actual, reconstructed) {
    const a = String(actual || '');
    const b = String(reconstructed || '');
    const max = Math.max(a.length, b.length);
    const row = (label, text, compare) => {
      const cells = [];
      for (let i = 0; i < max; i += 1) {
        const ch = i < text.length ? text[i] : ' ';
        const other = i < compare.length ? compare[i] : ' ';
        const diff = ch !== other;
        cells.push(`<span class=\"lincompare-cell${diff ? ' diff' : ''}\">${escapeHtml(ch)}</span>`);
      }
      return `<div class=\"lincompare-row\"><div class=\"lincompare-label\">${label}</div><div class=\"lincompare-line\">${cells.join('')}</div></div>`;
    };
    return [
      '<div class=\"lincompare-grid\">',
      row('Reconstructed', b, a),
      row('Actual', a, b),
      '</div>'
    ].join('');
  }

  function buildLinearStepWscr(tokens) {
    const steps = [];
    const state = { text: '', pos: 0 };
    (tokens || []).forEach((token, index) => {
      applyTokenState(state, token);
      steps.push({
        index,
        token: tokenToText(token),
        actual: token.actualText ?? '',
        reconstructed: state.text
      });
    });
    return steps;
  }

  function buildDiffLinesWscr(logs) {
    const diffLines = [];
    if (typeof diff_match_patch === 'undefined') return diffLines;
    const dmp = new diff_match_patch();
    const entries = sortedTextEntries(logs.text_records || {});

    const cursorEvents = Object.entries(logs.cursor_records || {})
      .map(([ts, value]) => ({ ts: Number(ts), value: String(value || '') }))
      .filter((ev) => Number.isFinite(ev.ts))
      .sort((a, b) => a.ts - b.ts);

    function cursorAt(ts) {
      let lo = 0;
      let hi = cursorEvents.length - 1;
      let best = null;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const ev = cursorEvents[mid];
        if (ev.ts <= ts) {
          best = ev;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (!best) return 0;
      const parts = best.value.split(':');
      const start = Number(parts[0]);
      return Number.isFinite(start) ? start : 0;
    }

    let prevCursor = 0;
    const diffEvents = [];
    for (let i = 0; i < entries.length; i += 1) {
      const prevText = i === 0 ? '' : entries[i - 1].text;
      const currText = entries[i].text;
      const diff = dmp.diff_main(prevText, currText);
      dmp.diff_cleanupSemantic(diff);

      let firstEq = 0;
      if (diff.length && diff[0][0] === DIFF_EQUAL) firstEq = diff[0][1].length;

      const parts = diff.map(([op, text]) => `(${op},${JSON.stringify(text)})`);
      const currCursor = cursorAt(entries[i].ts);
      diffEvents.push({
        ts: entries[i].ts,
        kind: 'diff',
        line: `${prevCursor} ${firstEq} ${currCursor} ${parts.join(' ')}`
      });

      let cursor = 0;
      diff.forEach(([op, text], idx) => {
        if (!text) return;
        if (op === DIFF_EQUAL) {
          if (idx !== diff.length - 1) cursor += text.length;
        } else if (op === DIFF_INSERT) {
          cursor += text.length;
        } else if (op === DIFF_DELETE) {
          cursor -= text.length;
        }
      });
      prevCursor = cursor;
    }

    const cursorLines = cursorEvents.map((ev) => {
      const parts = ev.value.split(':');
      const start = Number(parts[0]);
      const cursorPos = Number.isFinite(start) ? start : 0;
      return { ts: ev.ts, kind: 'cursor', line: `CURSOR ${cursorPos}` };
    });

    const merged = [...diffEvents, ...cursorLines].sort((a, b) => {
      if (a.ts !== b.ts) return a.ts - b.ts;
      if (a.kind === b.kind) return 0;
      return a.kind === 'diff' ? -1 : 1;
    });

    merged.forEach((item) => diffLines.push(item.line));
    return diffLines;
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  }

  function updateDebugPanel(result) {
    const debugEl = document.getElementById('lindebug');
    if (!debugEl) return;
    const lines = [];
    if (result && Array.isArray(result.debug)) lines.push(...result.debug);
    if (result && Array.isArray(result.tokens)) lines.push(...buildDebugLines(result.tokens));
    debugEl.textContent = lines.join('\n');
  }

  function applyTokenState(state, token) {
    if (!token) return;
    if (token.type === 'nav') {
      state.pos = Math.max(0, token.pos);
      return;
    }
    if (token.type === 'selection') {
      state.pos = Math.max(0, token.end);
      return;
    }
    if (token.type === 'navkey') {
      const count = token.count || 1;
      if (token.code === 'LEFT') state.pos = Math.max(0, state.pos - count);
      if (token.code === 'RIGHT') state.pos += count;
      if (token.code === 'CR') {
        for (let i = 0; i < count; i += 1) {
          state.text = `${state.text.slice(0, state.pos)}\n${state.text.slice(state.pos)}`;
          state.pos += 1;
        }
      }
      return;
    }
    if (token.type === 'text') {
      if (Number.isFinite(token.applyPos) && state.pos !== token.applyPos) {
        state.pos = Math.max(0, token.applyPos);
      }
      state.text = `${state.text.slice(0, state.pos)}${token.value}${state.text.slice(state.pos)}`;
      state.pos += token.value.length;
      return;
    }
    if (token.type === 'unknown') {
      state.text = `${state.text.slice(0, state.pos)}?${state.text.slice(state.pos)}`;
      state.pos += 1;
      return;
    }
    if (token.type === 'delete') {
      if (Number.isFinite(token.applyPos) && state.pos !== token.applyPos) {
        state.pos = Math.max(0, token.applyPos);
      }
      state.text = `${state.text.slice(0, state.pos)}${state.text.slice(state.pos + token.count)}`;
    }
  }

  function buildLinearDataWscr({ logs, thresholdOverride }) {
    if (!logs || typeof diff_match_patch === 'undefined') {
      return { tokens: [], debug: ['missing logs or diff_match_patch'], mismatches: 0 };
    }

    const dmp = new diff_match_patch();
    const entries = sortedTextEntries(logs.text_records || {});
    if (entries.length === 0) return { tokens: [], debug: ['no text records'], mismatches: 0 };

    const navKeyMap = {
      arrowleft: 'LEFT',
      arrowright: 'RIGHT',
      arrowup: 'UP',
      arrowdown: 'DOWN',
      left: 'LEFT',
      right: 'RIGHT',
      up: 'UP',
      down: 'DOWN',
      enter: 'CR',
      return: 'CR'
    };
    const modifierKeySet = new Set([
      'shift',
      'control',
      'ctrl',
      'alt',
      'altgraph',
      'meta',
      'os',
      'super',
      'hyper',
      'capslock'
    ]);

    function isModifierKey(keyRaw) {
      const key = String(keyRaw || '').trim().toLowerCase();
      return modifierKeySet.has(key);
    }

    const textTsSet = new Set(entries.map((e) => e.ts));
    const rawKeyEvents = toSortedEvents(logs.key_records || {}).map((ev) => {
      const parts = ev.value.split(':');
      if (parts.length < 2) return null;
      const kind = parts[0].trim().toLowerCase();
      const keyRaw = parts.slice(1).join(':').trim();
      const key = keyRaw.toLowerCase();
      const code = navKeyMap[key];
      return { ts: ev.ts, kind, key: keyRaw, code: code || null };
    }).filter(Boolean);

    const cursorEvents = toSortedEvents(logs.cursor_records || {});
    const navDownTimes = rawKeyEvents
      .filter((ev) => (ev.kind === 'keydown' || ev.kind === 'repeat') && ev.code)
      .map((ev) => ev.ts);
    const NAV_FUZZ_MS = 30;

    function hasNavDownNear(ts) {
      for (let i = 0; i < navDownTimes.length; i += 1) {
        const dt = navDownTimes[i] - ts;
        if (Math.abs(dt) <= NAV_FUZZ_MS) return true;
        if (dt > NAV_FUZZ_MS) return false;
      }
      return false;
    }

    function hasNavDownAt(ts, fuzzMs = 2) {
      for (let i = 0; i < navDownTimes.length; i += 1) {
        if (Math.abs(navDownTimes[i] - ts) <= fuzzMs) return true;
      }
      return false;
    }

    function parseCursorRange(value) {
      const parts = String(value || '').split(':');
      if (parts.length < 2) return null;
      const start = Number(parts[0]);
      const end = Number(parts[1]);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      return { start, end };
    }

    function findNavCodeNear(ts) {
      let best = null;
      let bestDelta = Infinity;
      for (let i = 0; i < rawKeyEvents.length; i += 1) {
        const ev = rawKeyEvents[i];
        if (!(ev.kind === 'keydown' || ev.kind === 'repeat') || !ev.code) continue;
        const delta = Math.abs(ev.ts - ts);
        if (delta <= NAV_FUZZ_MS && delta < bestDelta) {
          best = ev.code;
          bestDelta = delta;
        }
      }
      return best;
    }

    const keyEventsRaw = rawKeyEvents
      .filter((ev) => ev.kind === 'keydown' || ev.kind === 'repeat')
      .map((ev) => {
        if (isModifierKey(ev.key)) return null;
        if (ev.code) return { ts: ev.ts, kind: 'navkey', code: ev.code, key: ev.key };
        return { ts: ev.ts, kind: 'unknown', key: ev.key };
      })
      .filter(Boolean)
      .filter((ev) => !(ev.kind === 'unknown' && hasNavDownNear(ev.ts)));

    const cursorDerivedEvents = [];
    let prevCursorValue = null;
    cursorEvents.forEach((ev) => {
      const parsed = parseCursorRange(ev.value);
      if (!parsed) return;
      if (textTsSet.has(ev.ts)) return;
      if (ev.value === prevCursorValue) return;
      prevCursorValue = ev.value;

      const navCode = findNavCodeNear(ev.ts);
      if (navCode && !hasNavDownAt(ev.ts)) {
        cursorDerivedEvents.push({ ts: ev.ts, kind: 'navkey', code: navCode, key: navCode });
        return;
      }

      if (parsed.start !== parsed.end) {
        cursorDerivedEvents.push({ ts: ev.ts, kind: 'selection', start: parsed.start, end: parsed.end });
      } else {
        cursorDerivedEvents.push({ ts: ev.ts, kind: 'nav', pos: parsed.start });
      }
    });

    const activityEvents = [...keyEventsRaw, ...cursorDerivedEvents].sort((a, b) => {
      if (a.ts !== b.ts) return a.ts - b.ts;
      const order = { navkey: 0, selection: 1, nav: 2, unknown: 3 };
      return (order[a.kind] ?? 9) - (order[b.kind] ?? 9);
    });

    function findPrevText(ts) {
      let lo = 0; let hi = entries.length - 1; let best = null;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const ev = entries[mid];
        if (ev.ts <= ts) { best = ev; lo = mid + 1; } else { hi = mid - 1; }
      }
      return best || { ts: Number.NEGATIVE_INFINITY, text: '', index: -1 };
    }

    function findPrevTextBefore(ts) {
      let lo = 0; let hi = entries.length - 1; let best = null;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const ev = entries[mid];
        if (ev.ts < ts) { best = ev; lo = mid + 1; } else { hi = mid - 1; }
      }
      return best || { ts: Number.NEGATIVE_INFINITY, text: '', index: -1 };
    }

    function findNextText(ts) {
      let lo = 0; let hi = entries.length - 1; let best = null;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const ev = entries[mid];
        if (ev.ts > ts) { best = ev; hi = mid - 1; } else { lo = mid + 1; }
      }
      return best;
    }

    function findNextTextAtOrAfter(ts) {
      let lo = 0; let hi = entries.length - 1; let best = null;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const ev = entries[mid];
        if (ev.ts >= ts) { best = ev; hi = mid - 1; } else { lo = mid + 1; }
      }
      return best;
    }

    function cursorBefore(ts) {
      let lo = 0; let hi = cursorEvents.length - 1; let best = null;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const ev = cursorEvents[mid];
        if (ev.ts < ts) { best = ev; lo = mid + 1; } else { hi = mid - 1; }
      }
      if (!best) return null;
      const parts = best.value.split(':');
      const start = Number(parts[0]);
      return Number.isFinite(start) ? start : null;
    }

    function keyLabelIsBackspaceOnly(keyLabel) {
      const key = String(keyLabel || '').toLowerCase();
      return key === 'backspace';
    }

    function keyLabelIsDeleteOnly(keyLabel) {
      const key = String(keyLabel || '').toLowerCase();
      return key === 'delete';
    }

    function keyLabelIsBackspaceOrDelete(keyLabel) {
      return keyLabelIsBackspaceOnly(keyLabel) || keyLabelIsDeleteOnly(keyLabel);
    }

    function simpleKeyDiff(ts, keyLabel, currentPos) {
      const prev = findPrevTextBefore(ts);
      const next = findNextTextAtOrAfter(ts);
      if (!prev || !next || prev.text === next.text) return null;

      const diffs = dmp.diff_main(prev.text, next.text);
      dmp.diff_cleanupSemantic(diffs);

      let firstEq = 0;
      if (diffs.length && diffs[0][0] === DIFF_EQUAL) firstEq = diffs[0][1].length;

      let insert = null;
      let del = null;
      for (let i = 0; i < diffs.length; i += 1) {
        const [op, text] = diffs[i];
        if (!text) continue;
        if (op === DIFF_INSERT) {
          if (insert) return null;
          insert = text;
        } else if (op === DIFF_DELETE) {
          if (del) return null;
          del = text;
        }
      }

      const isBackspace = keyLabelIsBackspaceOnly(keyLabel);
      const isDeleteKey = keyLabelIsDeleteOnly(keyLabel);

      // For backspace chains, cursor typically moves from N -> N-1 before delete.
      // For delete-key chains, cursor typically stays at N while deleting forward.
      const expectedDeleteCursor =
        (isBackspace && currentPos === firstEq + 1) ||
        (isDeleteKey && currentPos === firstEq);

      const navNeeded = currentPos !== firstEq && !(del && expectedDeleteCursor);
      const navToken = navNeeded ? { type: 'nav', pos: firstEq, reasons: ['diff align nav'] } : null;

      if (insert && !del) {
        return { navToken, token: { type: 'text', value: insert, applyPos: firstEq, reasons: [`diff insert for ${keyLabel || 'unknown'}`] } };
      }
      if (del && !insert) {
        return { navToken, token: { type: 'delete', count: del.length, applyPos: firstEq, reasons: [`diff delete for ${keyLabel || 'unknown'}`] } };
      }
      return null;
    }

    function expectedTextAt(ts) {
      let lo = 0; let hi = entries.length - 1; let best = null;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const ev = entries[mid];
        if (ev.ts <= ts) { best = ev; lo = mid + 1; } else { hi = mid - 1; }
      }
      return best ? best.text : '';
    }

    function expectedTextBefore(ts) {
      let lo = 0; let hi = entries.length - 1; let best = null;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const ev = entries[mid];
        if (ev.ts < ts) { best = ev; lo = mid + 1; } else { hi = mid - 1; }
      }
      return best ? best.text : '';
    }

    function expectedTextAfter(ts) {
      let lo = 0; let hi = entries.length - 1; let best = null;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const ev = entries[mid];
        if (ev.ts >= ts) { best = ev; hi = mid - 1; } else { lo = mid + 1; }
      }
      return best ? best.text : expectedTextAt(ts);
    }

    function buildCatchUpTokens(currentText, expectedText) {
      if (currentText === expectedText) return [];
      const diffs = dmp.diff_main(currentText, expectedText);
      dmp.diff_cleanupSemantic(diffs);
      let firstEq = 0;
      if (diffs.length && diffs[0][0] === DIFF_EQUAL) firstEq = diffs[0][1].length;
      let insert = null;
      let del = null;
      for (let i = 0; i < diffs.length; i += 1) {
        const [op, text] = diffs[i];
        if (!text) continue;
        if (op === DIFF_INSERT) {
          if (insert) return [];
          insert = text;
        } else if (op === DIFF_DELETE) {
          if (del) return [];
          del = text;
        }
      }
      if (insert && !del) return [{ type: 'text', value: insert, applyPos: firstEq, reasons: ['catch-up insert'] }];
      if (del && !insert) return [{ type: 'delete', count: del.length, applyPos: firstEq, reasons: ['catch-up delete'] }];
      return [];
    }

    const threshold = Math.max(0, Number(thresholdOverride) || 0);
    const startTime = Number.isFinite(logs.header_records?.starttime) ? Number(logs.header_records.starttime) : entries[0].ts;
    const endTime = Number.isFinite(logs.header_records?.endtime) ? Number(logs.header_records.endtime) : entries[entries.length - 1].ts;

    const tokens = [];
    const debug = [];

    function pushToken(token, actualText) {
      if (!token) return;
      if (typeof actualText === 'string') token.actualText = actualText;
      const prev = tokens[tokens.length - 1];
      if (prev && token.type === 'delete' && prev.type === 'delete') {
        prev.count += token.count;
        if (Number.isFinite(prev.applyPos) && Number.isFinite(token.applyPos)) {
          prev.applyPos = Math.min(prev.applyPos, token.applyPos);
        }
        if (typeof actualText === 'string') prev.actualText = actualText;
        return;
      }
      if (prev && token.type === 'navkey' && prev.type === 'navkey' && token.code === prev.code) {
        prev.count = (prev.count || 1) + 1;
        if (typeof actualText === 'string') prev.actualText = actualText;
        return;
      }
      if (prev && token.type === 'selection' && prev.type === 'selection' && token.start === prev.start && token.end === prev.end) {
        if (typeof actualText === 'string') prev.actualText = actualText;
        return;
      }
      tokens.push(token);
    }

    function pushPause(seconds, actualText) {
      pushToken({ type: 'pause', value: `<${seconds.toFixed(2)}>` }, actualText);
    }

    let lastTime = startTime;
    let currentPos = 0;
    let currentText = '';

    pushToken({ type: 'marker', value: '<START>' }, '');

    activityEvents.forEach((ev) => {
      const delta = ev.ts - lastTime;
      if (delta > 0) {
        const secs = delta / 1000;
        if (secs >= threshold) pushPause(secs, expectedTextAt(lastTime));
      }

      const expectedBefore = expectedTextAt(ev.ts);
      const expectedAfter = expectedTextAfter(ev.ts);
      const expectedStrictBefore = expectedTextBefore(ev.ts);
      const catchUp = buildCatchUpTokens(currentText, expectedStrictBefore);
      if (catchUp.length) {
        const token = catchUp[0];
        if (Number.isFinite(token.applyPos) && currentPos !== token.applyPos) {
          pushToken({ type: 'nav', pos: token.applyPos, reasons: ['catch-up nav'] }, expectedStrictBefore);
          currentPos = token.applyPos;
        }
        pushToken(token, expectedStrictBefore);
        if (token.type === 'text') {
          currentText = `${currentText.slice(0, currentPos)}${token.value}${currentText.slice(currentPos)}`;
          currentPos += token.value.length;
        } else if (token.type === 'delete') {
          currentText = `${currentText.slice(0, currentPos)}${currentText.slice(currentPos + token.count)}`;
        }
      }

      if (ev.kind === 'selection') {
        pushToken({ type: 'selection', start: ev.start, end: ev.end, reasons: ['cursor selection'] }, expectedAfter);
        currentPos = ev.end;
      } else if (ev.kind === 'nav') {
        if (Number.isFinite(ev.pos) && ev.pos !== currentPos) {
          pushToken({ type: 'nav', pos: ev.pos, reasons: ['cursor nav'] }, expectedAfter);
          currentPos = ev.pos;
        }
      } else if (ev.kind === 'navkey') {
        pushToken({ type: 'navkey', code: ev.code, key: ev.key, reasons: [`keydown ${ev.key}`] }, expectedAfter);
        if (ev.code === 'LEFT') currentPos = Math.max(0, currentPos - 1);
        if (ev.code === 'RIGHT') currentPos += 1;
        if (ev.code === 'CR') {
          currentText = `${currentText.slice(0, currentPos)}\n${currentText.slice(currentPos)}`;
          currentPos += 1;
        }
      } else {
        const cursorPos = cursorBefore(ev.ts);
        const token = simpleKeyDiff(ev.ts, ev.key, currentPos);
        const cursorIsDeleteAlignMove =
          token &&
          token.token &&
          token.token.type === 'delete' &&
          Number.isFinite(cursorPos) &&
          cursorPos === token.token.applyPos;

        if (Number.isFinite(cursorPos) && cursorPos !== currentPos && !keyLabelIsBackspaceOrDelete(ev.key) && !cursorIsDeleteAlignMove) {
          pushToken({ type: 'nav', pos: cursorPos, reasons: ['cursor move'] }, expectedBefore);
          currentPos = cursorPos;
        }

        if (token) {
          if (token.navToken && currentPos !== token.navToken.pos) {
            pushToken(token.navToken, expectedAfter);
            currentPos = token.navToken.pos;
          }
          pushToken(token.token, expectedAfter);
          if (token.token.type === 'text') {
            if (Number.isFinite(token.token.applyPos)) currentPos = token.token.applyPos;
            currentText = `${currentText.slice(0, currentPos)}${token.token.value}${currentText.slice(currentPos)}`;
            currentPos += token.token.value.length;
          } else if (token.token.type === 'delete') {
            if (Number.isFinite(token.token.applyPos)) currentPos = token.token.applyPos;
            currentText = `${currentText.slice(0, currentPos)}${currentText.slice(currentPos + token.token.count)}`;
          }
        } else {
          pushToken({ type: 'unknown', reasons: [`keydown ${ev.key} no simple diff`] }, expectedAfter);
          currentText = `${currentText.slice(0, currentPos)}?${currentText.slice(currentPos)}`;
          currentPos += 1;
        }
      }

      if (expectedAfter !== currentText) {
        debug.push(`CHECK ${ev.ts} mismatch expected_len=${expectedAfter.length} actual_len=${currentText.length}`);
      }

      lastTime = ev.ts;
    });

    const finalDelta = endTime - lastTime;
    if (finalDelta > 0) {
      const secs = finalDelta / 1000;
      if (secs >= threshold) pushPause(secs, expectedTextAfter(lastTime));
    }

    pushToken({ type: 'marker', value: '<END>' }, entries[entries.length - 1].text);

    const mismatches = debug.length;
    return { tokens, debug, mismatches };
  }

  function renderLinearWscr({ targetEl, statusEl, logs, thresholdOverride }) {
    const out = targetEl || document.getElementById('linoutput');
    const status = statusEl || document.getElementById('linstatus');
    if (!out) return { tokens: [], debug: ['missing linoutput'], mismatches: 0 };

    const result = buildLinearDataWscr({ logs, thresholdOverride });
    const keyCount = Object.keys((logs && logs.key_records) || {}).length;
    const cursorCount = Object.keys((logs && logs.cursor_records) || {}).length;
    const pauseThreshold = Number(thresholdOverride) || 0;

    if (!result.tokens.length) {
      out.innerHTML = '';
      const compareEl = document.getElementById('lincompare');
      if (compareEl) compareEl.innerHTML = '';
      updateDebugPanel(result);
      lastBuild = { tokens: [], debug: result.debug || [] };
      if (status) status.textContent = `keys: ${keyCount} | cursor: ${cursorCount} | tokens: 0 | mismatches: 0 | pause>=${pauseThreshold.toFixed(2)}s`;
      return result;
    }
    out.innerHTML = renderTokens(result.tokens);
    updateDebugPanel(result);
    lastBuild = { tokens: result.tokens, debug: result.debug || [] };
    if (status) {
      status.textContent =
        `keys: ${keyCount} | cursor: ${cursorCount} | tokens: ${result.tokens.length} | mismatches: ${result.mismatches || 0} | pause>=${pauseThreshold.toFixed(2)}s`;
    }
    return result;
  }

  function exportDiffsWscr({ logs, sourceId = 'imported', sourceTitle = '' }) {
    const exportVersion = 'wscr-diffs-v1';
    const threshold = getLinThreshold();

    const diffLines = buildDiffLinesWscr(logs);
    const linearResult = buildLinearDataWscr({ logs, thresholdOverride: threshold });
    const debugLines = [
      ...(linearResult.debug || []),
      ...buildDebugLines(linearResult.tokens || [])
    ];
    const stepThrough = buildLinearStepWscr(linearResult.tokens || []);
    const stepLines = stepThrough.map((step) =>
      `${step.index} ${step.token} | actual:${step.actual} | reconstructed:${step.reconstructed}`
    );

    const header = [
      `noteId: ${sourceId || 'imported'}`,
      `title: ${sourceTitle || ''}`,
      `exportedAt: ${new Date().toISOString()}`,
      'format: prevCursor firstEq currCursor (op,"text") | CURSOR pos',
      `exporter: ${exportVersion}`,
      ''
    ].join('\n');

    const diffText = diffLines.join('\n');
    const linearText = debugLines.length ? `\n\n[linear_debug]\n${debugLines.join('\n')}\n` : '';
    const stepText = stepLines.length ? `\n\n[linear_steps]\n${stepLines.join('\n')}\n` : '';
    const logsText = `\n\n[logs]\n${JSON.stringify(logs, null, 2)}\n`;
    const payloadText = `${header}[diffs]\n${diffText}${linearText}${stepText}${logsText}`;

    downloadText(payloadText, `wscr-${sourceId || 'import'}-diffs.txt`);
    return payloadText;
  }

  function logsFromGlobals() {
    return {
      header_records: window.header_record || {},
      text_records: window.text_record || {},
      cursor_records: window.cursor_record || {},
      key_records: window.key_record || {},
      scroll_records: window.scroll_record || {}
    };
  }

  function renderFromGlobals() {
    const threshold = getLinThreshold();
    return renderLinearWscr({ logs: logsFromGlobals(), thresholdOverride: threshold });
  }

  function exportFromGlobals() {
    const logs = logsFromGlobals();
    const lb = document.getElementById('lb_load');
    const sourceId =
      lb && lb.selectedIndex >= 0 && lb.options[lb.selectedIndex]
        ? lb.options[lb.selectedIndex].text
        : 'imported';
    return exportDiffsWscr({ logs, sourceId, sourceTitle: '' });
  }

  window.wscrLinear = {
    buildLinearDataWscr,
    buildDiffLinesWscr,
    buildLinearStepWscr,
    renderLinearWscr,
    renderFromGlobals,
    exportDiffsWscr,
    exportFromGlobals
  };

  const linOutput = document.getElementById('linoutput');
  if (linOutput) {
    linOutput.addEventListener('click', (e) => {
      const target = e.target.closest ? e.target.closest('.linear-token') : null;
      if (!target || !lastBuild || !Array.isArray(lastBuild.tokens)) return;
      const index = Number(target.dataset.index);
      if (!Number.isFinite(index) || index < 0 || index >= lastBuild.tokens.length) return;

      const token = lastBuild.tokens[index];
      const reconstructed = rebuildToIndex(lastBuild.tokens, index);
      const actual = token?.actualText || '';
      const compareEl = document.getElementById('lincompare');
      if (compareEl) {
        compareEl.innerHTML = renderCompare(actual, reconstructed);
      }
    });
  }

  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('#linExportDiffsBtn') : null;
    if (!btn) return;
    exportFromGlobals();
  });

  document.addEventListener('input', (e) => {
    const input = e.target && e.target.closest ? e.target.closest('#linPauseThreshold') : null;
    if (!input) return;
    renderFromGlobals();
  });
})();
