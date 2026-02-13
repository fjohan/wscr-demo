/* global header_record, text_record, cursor_record, key_record, scroll_record, processGraphFormat */

(() => {
  function sortedNumericKeysLocal(obj) {
    return Object.keys(obj || {})
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
  }

  function getWritingTimeMsFromTextRecords() {
    const times = sortedNumericKeysLocal(text_record);
    if (times.length === 0) return 0;
    return times[times.length - 1] - times[0];
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

  function splitParagraphs(text) {
    if (!text) return [];
    const trimmed = text.trim();
    if (!trimmed) return [];
    let parts = trimmed.split(/\n\s*\n+/);
    if (parts.length === 1 && trimmed.includes('\n')) {
      parts = trimmed.split(/\n+/);
    }
    return parts.filter((p) => p.trim().length > 0);
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  function stdev(values) {
    if (values.length < 2) return 0;
    const m = mean(values);
    const variance = values.reduce((s, v) => s + (v - m) * (v - m), 0) / values.length;
    return Math.sqrt(variance);
  }

  function getProducedTextAndCounts() {
    if (!window.wscrLinear || typeof window.wscrLinear.buildLinearDataWscr !== 'function') {
      return {
        producedText: '',
        totalCharsProduced: 0,
        totalCopiedChars: 0,
        totalTypedCharsInclSpaces: 0,
        totalTypedCharsExclSpaces: 0
      };
    }
    const logs = {
      header_records: header_record || {},
      text_records: text_record || {},
      cursor_records: cursor_record || {},
      key_records: key_record || {},
      scroll_records: scroll_record || {}
    };
    const data = window.wscrLinear.buildLinearDataWscr({ logs, thresholdOverride: 0 });
    let producedText = '';
    let totalCharsProduced = 0;
    let totalCopiedChars = 0;
    let totalTypedCharsInclSpaces = 0;
    let totalTypedCharsExclSpaces = 0;

    (data.tokens || []).forEach((token) => {
      if (!token || token.type !== 'text') return;
      const value = String(token.value || '');
      const len = value.length;
      producedText += value;
      totalCharsProduced += len;
      if (len > 1) {
        totalCopiedChars += len;
      } else {
        totalTypedCharsInclSpaces += len;
        if (value !== ' ') totalTypedCharsExclSpaces += len;
      }
    });

    return {
      producedText,
      totalCharsProduced,
      totalCopiedChars,
      totalTypedCharsInclSpaces,
      totalTypedCharsExclSpaces
    };
  }

  function countNonCharacterKeys() {
    let count = 0;
    Object.values(key_record || {}).forEach((value) => {
      const entry = String(value || '');
      if (!entry.startsWith('keydown')) return;
      const key = entry.slice('keydown:'.length).trim();
      const isSingleChar = key.length === 1;
      const isWordChar = /^[\p{L}\p{N}]$/u.test(key);
      const isSpace = key === ' ';
      if (!isSingleChar || (!isWordChar && !isSpace)) {
        count += 1;
      }
    });
    return count;
  }

  function writeDebug(messages, label, values) {
    const parts = Array.isArray(values) ? values : [values];
    messages.value += `DEBUG ${label}: ${parts.join(', ')}\n`;
  }

  window.inspectCounts = function inspectCounts() {
    for (var k in header_record) {
      messages.value += '(internal ' + k + ': ' + header_record[k] + ')\n';
    }
    messages.value += 'Recording time: '
      + (header_record['endtime'] - header_record['starttime']) / 1000 + '\n';

    processGraphFormat(false);

    const writingTimeMs = getWritingTimeMsFromTextRecords();
    const writingTimeMin = writingTimeMs / 60000;
    writeDebug(messages, 'writingTimeMs', writingTimeMs);
    writeDebug(messages, 'writingTimeMin', writingTimeMin);

    const finalText = (() => {
      const times = sortedNumericKeysLocal(text_record);
      if (!times.length) return '';
      return String(text_record[times[times.length - 1]] ?? '');
    })();
    writeDebug(messages, 'finalTextLength', finalText.length);

    const produced = getProducedTextAndCounts();
    writeDebug(messages, 'producedTextLength', produced.producedText.length);
    writeDebug(messages, 'totalCharsProduced', produced.totalCharsProduced);
    writeDebug(messages, 'totalCopiedChars', produced.totalCopiedChars);
    writeDebug(messages, 'totalTypedCharsInclSpaces', produced.totalTypedCharsInclSpaces);
    writeDebug(messages, 'totalTypedCharsExclSpaces', produced.totalTypedCharsExclSpaces);

    const producedWords = tokenizeWords(produced.producedText);
    const producedWordLengths = producedWords.map((w) => w.length);
    const producedSentences = countSentences(produced.producedText);
    const producedParagraphs = splitParagraphs(produced.producedText);
    writeDebug(messages, 'producedWords', producedWords.length);
    writeDebug(messages, 'producedSentences', producedSentences);
    writeDebug(messages, 'producedParagraphs', producedParagraphs.length);

    const finalWords = tokenizeWords(finalText);
    const finalParagraphs = splitParagraphs(finalText);
    writeDebug(messages, 'finalWords', finalWords.length);
    writeDebug(messages, 'finalParagraphs', finalParagraphs.length);

    const producedCharsPerSentence = producedSentences > 0 ? produced.totalCharsProduced / producedSentences : 0;
    const producedWordsPerSentence = producedSentences > 0 ? producedWords.length / producedSentences : 0;

    const producedCharsPerParagraph = producedParagraphs.length > 0 ? produced.totalCharsProduced / producedParagraphs.length : 0;
    const producedWordsPerParagraph = producedParagraphs.length > 0 ? producedWords.length / producedParagraphs.length : 0;

    const sentenceSegments = producedSentences > 0
      ? produced.producedText.replace(/\r\n/g, '\n').split(/[.!?]+|\n+/).map((s) => s.trim()).filter((s) => s.length > 0)
      : [];
    const sentenceCharCounts = sentenceSegments.map((s) => s.length);
    const sentenceWordCounts = sentenceSegments.map((s) => tokenizeWords(s).length);
    const paragraphCharCounts = producedParagraphs.map((p) => p.length);
    const paragraphWordCounts = producedParagraphs.map((p) => tokenizeWords(p).length);
    writeDebug(messages, 'sentenceCharCounts', sentenceCharCounts.join('|'));
    writeDebug(messages, 'sentenceWordCounts', sentenceWordCounts.join('|'));
    writeDebug(messages, 'paragraphCharCounts', paragraphCharCounts.join('|'));
    writeDebug(messages, 'paragraphWordCounts', paragraphWordCounts.join('|'));

    const finalCharsInclSpaces = finalText.length;
    const finalCharsExclSpaces = finalText.replace(/\s/g, '').length;
    const nonCharacterKeys = countNonCharacterKeys();
    writeDebug(messages, 'finalCharsInclSpaces', finalCharsInclSpaces);
    writeDebug(messages, 'finalCharsExclSpaces', finalCharsExclSpaces);
    writeDebug(messages, 'nonCharacterKeys', nonCharacterKeys);

    messages.value += 'Counts (process):\n';
    messages.value += `Characters | Total: ${produced.totalCharsProduced}\n`;
    messages.value += `Characters | Total copied: ${produced.totalCopiedChars}\n`;
    messages.value += `Characters | Total typed (incl. spaces): ${produced.totalTypedCharsInclSpaces}\n`;
    messages.value += `Characters | Per minute (incl. spaces): ${writingTimeMin > 0 ? produced.totalTypedCharsInclSpaces / writingTimeMin : 0}\n`;
    messages.value += `Characters | Total typed (excl. spaces): ${produced.totalTypedCharsExclSpaces}\n`;
    messages.value += `Characters | Per minute (excl. spaces): ${writingTimeMin > 0 ? produced.totalTypedCharsExclSpaces / writingTimeMin : 0}\n`;
    messages.value += `Words | Total: ${producedWords.length}\n`;
    messages.value += `Words | Per minute: ${writingTimeMin > 0 ? producedWords.length / writingTimeMin : 0}\n`;
    messages.value += `Words | Mean Word Length: ${mean(producedWordLengths)}\n`;
    messages.value += `Words | St. Dev. Word length: ${stdev(producedWordLengths)}\n`;
    messages.value += `Sentences | Total: ${producedSentences}\n`;
    messages.value += `Sentences | Mean Characters/sentence: ${producedCharsPerSentence}\n`;
    messages.value += `Sentences | St. Dev. Characters/sentence: ${stdev(sentenceCharCounts)}\n`;
    messages.value += `Characters/sentence | Mean Words/sentence: ${producedWordsPerSentence}\n`;
    messages.value += `Characters/sentence | St. Dev. Words/sentence: ${stdev(sentenceWordCounts)}\n`;
    messages.value += `Paragraphs | Total: ${producedParagraphs.length}\n`;
    messages.value += `Paragraphs | Mean Characters/paragraphs: ${producedCharsPerParagraph}\n`;
    messages.value += `Paragraphs | St. Dev. Characters/paragraphs: ${stdev(paragraphCharCounts)}\n`;
    messages.value += `Paragraphs | Mean Words/paragraphs: ${producedWordsPerParagraph}\n`;
    messages.value += `Paragraphs | St. Dev. Words/paragraphs: ${stdev(paragraphWordCounts)}\n`;

    messages.value += 'Counts (final text):\n';
    messages.value += `Characters | Total (incl. spaces): ${finalCharsInclSpaces}\n`;
    messages.value += `Characters | Per minute (incl. spaces): ${writingTimeMin > 0 ? finalCharsInclSpaces / writingTimeMin : 0}\n`;
    messages.value += `Characters | Total (excl. spaces): ${finalCharsExclSpaces}\n`;
    messages.value += `Characters | Per minute (excl. spaces): ${writingTimeMin > 0 ? finalCharsExclSpaces / writingTimeMin : 0}\n`;
    messages.value += `Words | Total: ${finalWords.length}\n`;
    messages.value += `Words | Per minute: ${writingTimeMin > 0 ? finalWords.length / writingTimeMin : 0}\n`;
    messages.value += `Paragraphs | Total: ${finalParagraphs.length}\n`;

    messages.value += 'Counts (ratios/proportions):\n';
    messages.value += `Ratio | Produced ratio (incl. spaces): ${produced.totalCharsProduced > 0 ? (finalCharsInclSpaces + nonCharacterKeys) / produced.totalCharsProduced : 0}\n`;
    messages.value += `Proportion | Characters (incl. spaces): ${produced.totalTypedCharsInclSpaces > 0 ? finalCharsInclSpaces / produced.totalTypedCharsInclSpaces : 0}\n`;
    messages.value += `Proportion | Characters (excl. spaces): ${produced.totalTypedCharsExclSpaces > 0 ? finalCharsExclSpaces / produced.totalTypedCharsExclSpaces : 0}\n`;
    messages.value += `Proportion | Words: ${producedWords.length > 0 ? finalWords.length / producedWords.length : 0}\n`;
    messages.scrollTop = messages.scrollHeight;
  };
})();
