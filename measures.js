/* global diff_match_patch */

(() => {
  function sortedNumericKeys(obj) {
    return Object.keys(obj || {})
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
  }

  function getFirstLastTextTimes(textRecords) {
    const times = sortedNumericKeys(textRecords);
    if (times.length === 0) return { first: null, last: null };
    return { first: times[0], last: times[times.length - 1] };
  }

  function getFinalText(textRecords) {
    const times = sortedNumericKeys(textRecords);
    if (times.length === 0) return '';
    return String(textRecords[times[times.length - 1]] ?? '');
  }

  function tokenizeWords(text) {
    if (!text) return [];
    const matches = text.match(/\p{L}[\p{L}\p{N}'’-]*/gu);
    return matches ? matches : [];
  }

  function countSentences(text) {
    if (!text) return 0;
    const normalized = text.replace(/\r\n/g, '\n');
    const segments = normalized
      .split(/[.!?]+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return segments.length;
  }

  function computeLinearTokens({ logs, thresholdSec }) {
    if (!window.wscrLinear || typeof window.wscrLinear.buildLinearDataWscr !== 'function') {
      return { tokens: [], mismatches: 0 };
    }
    return window.wscrLinear.buildLinearDataWscr({
      logs,
      thresholdOverride: Number.isFinite(thresholdSec) ? thresholdSec : 0
    });
  }

  function extractLinearStats(tokens) {
    let insertedChars = 0;
    let deletedChars = 0;
    let revisionCount = 0;
    tokens.forEach((token) => {
      if (!token) return;
      if (token.type === 'text') insertedChars += String(token.value || '').length;
      if (token.type === 'delete') {
        const count = Number(token.count) || 0;
        deletedChars += count;
        if (count > 0) revisionCount += 1;
      }
    });
    const producedChars = insertedChars;
    return { insertedChars, deletedChars, producedChars, revisionCount };
  }

  function computeKeydownTimes(keyRecords) {
    const times = [];
    Object.entries(keyRecords || {}).forEach(([ts, value]) => {
      const entry = String(value || '');
      if (entry.startsWith('keydown')) {
        const t = Number(ts);
        if (Number.isFinite(t)) times.push(t);
      }
    });
    times.sort((a, b) => a - b);
    return times;
  }

  function computePausesFromEvents(allEventTimes, thresholdSec) {
    const pauses = [];
    if (!Array.isArray(allEventTimes) || allEventTimes.length < 2) return pauses;
    for (let i = 1; i < allEventTimes.length; i += 1) {
      const gapSec = (allEventTimes[i] - allEventTimes[i - 1]) / 1000;
      if (gapSec >= thresholdSec) {
        pauses.push({
          start: allEventTimes[i - 1],
          end: allEventTimes[i],
          gapSec
        });
      }
    }
    return pauses;
  }

  function getAllEventTimes({ textRecords, cursorRecords, scrollRecords, keyRecords }) {
    const textTimes = sortedNumericKeys(textRecords);
    const cursorTimes = sortedNumericKeys(cursorRecords);
    const scrollTimes = sortedNumericKeys(scrollRecords);
    const keyTimes = sortedNumericKeys(keyRecords);
    return Array.from(new Set([...textTimes, ...cursorTimes, ...scrollTimes, ...keyTimes])).sort((a, b) => a - b);
  }

  function cursorBefore(cursorRecords, ts) {
    const entries = Object.entries(cursorRecords || {})
      .map(([t, v]) => ({ ts: Number(t), value: String(v || '') }))
      .filter((e) => Number.isFinite(e.ts))
      .sort((a, b) => a.ts - b.ts);
    let lo = 0;
    let hi = entries.length - 1;
    let best = null;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const ev = entries[mid];
      if (ev.ts <= ts) { best = ev; lo = mid + 1; } else { hi = mid - 1; }
    }
    if (!best) return null;
    const parts = best.value.split(':');
    if (parts.length < 2) return null;
    const start = Number(parts[0]);
    const end = Number(parts[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return { start, end };
  }

  function textBefore(textRecords, ts) {
    const entries = Object.entries(textRecords || {})
      .map(([t, v]) => ({ ts: Number(t), text: String(v || '') }))
      .filter((e) => Number.isFinite(e.ts))
      .sort((a, b) => a.ts - b.ts);
    let lo = 0;
    let hi = entries.length - 1;
    let best = null;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const ev = entries[mid];
      if (ev.ts <= ts) { best = ev; lo = mid + 1; } else { hi = mid - 1; }
    }
    return best ? best.text : '';
  }

  function classifyPauseLocation({ text, cursor }) {
    if (!text || !cursor) return 'unknown';
    const pos = cursor.start;
    const prevChar = pos > 0 ? text[pos - 1] : '';
    const nextChar = pos < text.length ? text[pos] : '';
    const isWordChar = (ch) => /\p{L}|\p{N}/u.test(ch);
    const isSpace = (ch) => /\s/.test(ch);
    const isTerminal = (ch) => /[.!?]/.test(ch);

    if (isTerminal(prevChar) || isTerminal(nextChar)) return 'between_sentences';
    if (isWordChar(nextChar) && !isWordChar(prevChar)) return 'before_word';
    if (isWordChar(prevChar) && isWordChar(nextChar)) return 'within_word';
    if (isWordChar(prevChar) && !isWordChar(nextChar)) return 'after_word';
    if (isSpace(prevChar) && isSpace(nextChar)) return 'between_words';
    return 'unknown';
  }

  function computePauseLocationCounts(pauses, textRecords, cursorRecords) {
    const counts = {
      before_word: 0,
      within_word: 0,
      after_word: 0,
      between_words: 0,
      between_sentences: 0,
      unknown: 0
    };
    pauses.forEach((pause) => {
      const text = textBefore(textRecords, pause.start);
      const cursor = cursorBefore(cursorRecords, pause.start);
      const category = classifyPauseLocation({ text, cursor });
      counts[category] = (counts[category] || 0) + 1;
    });
    return counts;
  }

  function computeTransitionTimes({ keyRecords, textRecords }) {
    const keyEvents = Object.entries(keyRecords || {})
      .map(([t, v]) => ({ ts: Number(t), value: String(v || '') }))
      .filter((e) => Number.isFinite(e.ts))
      .sort((a, b) => a.ts - b.ts);

    const transitions = [];
    let prevKeydown = null;
    let prevWasLetterInWord = false;

    keyEvents.forEach((ev) => {
      if (!ev.value.startsWith('keydown')) return;
      const key = ev.value.slice('keydown:'.length).trim();
      const isLetter = /^[\p{L}\p{N}]$/u.test(key);
      const isWordBoundary = key === 'Enter' || /^\s$/.test(key) || /[.!?]/.test(key);
      const isLetterInWord = isLetter && !isWordBoundary;

      if (prevKeydown !== null && prevWasLetterInWord && isLetterInWord) {
        transitions.push((ev.ts - prevKeydown) / 1000);
      }

      prevKeydown = ev.ts;
      prevWasLetterInWord = isLetterInWord;
    });

    transitions.sort((a, b) => a - b);
    if (transitions.length === 0) return null;
    const mid = Math.floor(transitions.length / 2);
    if (transitions.length % 2 === 1) return transitions[mid];
    return (transitions[mid - 1] + transitions[mid]) / 2;
  }

  function computePBursts({ logs, thresholdSec }) {
    const tokens = computeLinearTokens({ logs, thresholdSec }).tokens;
    const bursts = [];
    let currentChars = 0;
    let currentStarted = false;
    tokens.forEach((token) => {
      if (token.type === 'marker' && token.value === '<START>') return;
      if (token.type === 'pause') {
        if (currentStarted) bursts.push({ chars: currentChars });
        currentChars = 0;
        currentStarted = false;
        return;
      }
      currentStarted = true;
      if (token.type === 'text') currentChars += String(token.value || '').length;
    });
    if (currentStarted) bursts.push({ chars: currentChars });
    const meanChars = bursts.length ? bursts.reduce((s, b) => s + b.chars, 0) / bursts.length : null;
    return { meanChars };
  }

  function computePBurstSeconds({ allEventTimes, thresholdSec, writingStart, writingEnd }) {
    const pauses = computePausesFromEvents(allEventTimes, thresholdSec);
    const bursts = [];
    if (!Number.isFinite(writingStart) || !Number.isFinite(writingEnd) || writingEnd <= writingStart) {
      return { meanSeconds: null };
    }
    let currentStart = writingStart;
    pauses.forEach((pause) => {
      const burstSec = (pause.start - currentStart) / 1000;
      if (burstSec >= 0) bursts.push(burstSec);
      currentStart = pause.end;
    });
    const finalBurst = (writingEnd - currentStart) / 1000;
    if (finalBurst >= 0) bursts.push(finalBurst);
    const meanSeconds = bursts.length ? bursts.reduce((s, v) => s + v, 0) / bursts.length : null;
    return { meanSeconds };
  }

  function computeRBursts({ tokens }) {
    const bursts = [];
    let currentChars = 0;
    tokens.forEach((token) => {
      if (token.type === 'delete') {
        bursts.push(currentChars);
        currentChars = 0;
        return;
      }
      if (token.type === 'text') currentChars += String(token.value || '').length;
    });
    if (currentChars > 0) bursts.push(currentChars);
    const meanChars = bursts.length ? bursts.reduce((s, v) => s + v, 0) / bursts.length : null;
    return { meanChars };
  }

  function computeRBurstSeconds({ keyRecords, writingStart, writingEnd }) {
    if (!Number.isFinite(writingStart) || !Number.isFinite(writingEnd) || writingEnd <= writingStart) {
      return { meanSeconds: null };
    }
    const deleteTimes = Object.entries(keyRecords || {})
      .map(([t, v]) => ({ ts: Number(t), value: String(v || '') }))
      .filter((e) => Number.isFinite(e.ts) && e.value.startsWith('keydown'))
      .filter((e) => {
        const key = e.value.slice('keydown:'.length).trim().toLowerCase();
        return key === 'backspace' || key === 'delete';
      })
      .map((e) => e.ts)
      .sort((a, b) => a - b);
    const bursts = [];
    let currentStart = writingStart;
    deleteTimes.forEach((t) => {
      const burstSec = (t - currentStart) / 1000;
      if (burstSec >= 0) bursts.push(burstSec);
      currentStart = t;
    });
    const finalBurst = (writingEnd - currentStart) / 1000;
    if (finalBurst >= 0) bursts.push(finalBurst);
    const meanSeconds = bursts.length ? bursts.reduce((s, v) => s + v, 0) / bursts.length : null;
    return { meanSeconds };
  }

  function computeMeasures(logs, opts = {}) {
    const measures = {};
    const textRecords = logs.text_records || {};
    const cursorRecords = logs.cursor_records || {};
    const scrollRecords = logs.scroll_records || {};
    const keyRecords = logs.key_records || {};

    const pauseCriteriaSec = Number.isFinite(opts.pauseCriteriaSec) ? opts.pauseCriteriaSec : 0.3;

    const { first, last } = getFirstLastTextTimes(textRecords);
    const writingTimeMs = (first != null && last != null) ? (last - first) : 0;
    const writingTimeSec = writingTimeMs / 1000;

    const finalText = getFinalText(textRecords);
    const words = tokenizeWords(finalText);
    const numWords = words.length;
    const numSentences = countSentences(finalText);
    const avgWordLength = numWords ? words.reduce((s, w) => s + w.length, 0) / numWords : 0;

    const logsForLinear = { header_records: logs.header_records || {}, text_records: textRecords, cursor_records: cursorRecords, key_records: keyRecords, scroll_records: scrollRecords };
    const linearData = computeLinearTokens({ logs: logsForLinear, thresholdSec: opts.linPauseThreshold ?? 0 });
    const linearStats = extractLinearStats(linearData.tokens || []);

    const allEventTimes = getAllEventTimes({ textRecords, cursorRecords, scrollRecords, keyRecords });
    const pauses = computePausesFromEvents(allEventTimes, pauseCriteriaSec);
    const pauseCounts = computePauseLocationCounts(pauses, textRecords, cursorRecords);

    const transitionMedian = computeTransitionTimes({ keyRecords, textRecords });

    const pburst = computePBursts({ logs: logsForLinear, thresholdSec: pauseCriteriaSec });
    const pburstSec = computePBurstSeconds({
      allEventTimes,
      thresholdSec: pauseCriteriaSec,
      writingStart: first,
      writingEnd: last
    });
    const rburst = computeRBursts({ tokens: linearData.tokens || [] });
    const rburstSec = computeRBurstSeconds({ keyRecords, writingStart: first, writingEnd: last });

    measures['Number of words'] = numWords;
    measures['Word length'] = avgWordLength;
    measures['Number of sentences'] = numSentences;
    measures['Proportion of spelling errors'] = 'UNDECIDED';
    measures['Lexical diversity'] = 'UNDECIDED';
    measures['Lexical density'] = 'UNDECIDED';
    measures['Number of T-units'] = 'UNDECIDED';
    measures['Number of clauses'] = 'UNDECIDED';
    measures['Words per T-unit'] = 'UNDECIDED';
    measures['Clause per T-units'] = 'UNDECIDED';
    measures['Words per clause'] = 'UNDECIDED';
    measures['Writing time'] = {
      ms: writingTimeMs,
      seconds: writingTimeSec,
      minutes: writingTimeSec / 60
    };
    measures['Number of characters linear text'] = linearStats.insertedChars;
    measures['Writing flow (offline)'] = writingTimeSec > 0 ? finalText.length / writingTimeSec : 0;
    measures['Writing flow (online)'] = writingTimeSec > 0 ? linearStats.insertedChars / writingTimeSec : 0;
    measures['Transition time'] = transitionMedian;
    measures['Pause percentage'] = {
      threshold_sec: pauseCriteriaSec,
      value: writingTimeSec > 0 ? pauses.reduce((s, p) => s + p.gapSec, 0) / writingTimeSec : 0
    };
    measures['Pauses before words'] = { threshold_sec: pauseCriteriaSec, value: pauseCounts.before_word };
    measures['Pauses within words'] = { threshold_sec: pauseCriteriaSec, value: pauseCounts.within_word };
    measures['Pauses after words'] = { threshold_sec: pauseCriteriaSec, value: pauseCounts.after_word };
    measures['Pauses between words'] = { threshold_sec: pauseCriteriaSec, value: pauseCounts.between_words };
    measures['Pauses between sentences'] = { threshold_sec: pauseCriteriaSec, value: pauseCounts.between_sentences };
    measures['P-bursts in characters (mean)'] = { threshold_sec: pauseCriteriaSec, value: pburst.meanChars };
    measures['P-bursts in seconds (mean)'] = { threshold_sec: pauseCriteriaSec, value: pburstSec.meanSeconds };
    measures['R-bursts in seconds'] = rburstSec.meanSeconds;
    measures['R-bursts in characters'] = rburst.meanChars;
    measures['Removed characters'] = linearStats.producedChars > 0 ? linearStats.deletedChars / linearStats.producedChars : 0;
    measures['Inserted characters'] = linearStats.producedChars > 0 ? linearStats.insertedChars / linearStats.producedChars : 0;
    measures['Bigger revisions'] = 'UNDECIDED';
    measures['Global revisions'] = 'UNDECIDED';

    return measures;
  }

  window.wscrMeasures = {
    computeMeasures
  };
})();
