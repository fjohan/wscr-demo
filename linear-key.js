(() => {
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function sortedKeyEvents(records) {
    return Object.entries(records || {})
      .map(([ts, value]) => ({ ts: Number(ts), value: String(value || '') }))
      .filter((e) => Number.isFinite(e.ts))
      .sort((a, b) => a.ts - b.ts);
  }

  function getLinThreshold() {
    const linInput = document.getElementById('linPauseThreshold');
    const raw = linInput?.value ?? 0;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  function classifyTag(tag) {
    if (tag === 'DELETE') return 'delete';
    if (tag === 'SEL') return 'nav';
    if (['LEFT', 'RIGHT', 'UP', 'DOWN'].includes(tag)) return 'nav';
    return 'marker';
  }

  function tokenToText(token) {
    if (token.type === 'text') {
      return String(token.value).replace(/ /g, '<SPACE>');
    }
    if (token.type === 'time') return token.value;
    if (token.type === 'tag') {
      const count = token.count || 1;
      const suffix = count > 1 ? String(count) : '';
      return `<${token.value}${suffix}>`;
    }
    return token.value || '';
  }

  function renderTokens(tokens) {
    return tokens.map((token, index) => {
      const txt = escapeHtml(tokenToText(token));
      const attrs = `data-index=\"${index}\" tabindex=\"0\"`;
      if (token.type === 'text') return `<span ${attrs} class="linear-token linear-insert">${txt}</span>`;
      if (token.type === 'time') return `<span ${attrs} class="linear-token linear-time">${txt}</span>`;
      if (token.type === 'tag') {
        const category = token.category || 'marker';
        const cls = category === 'delete'
          ? 'linear-delete'
          : category === 'nav'
            ? 'linear-nav'
            : 'linear-marker';
        return `<span ${attrs} class="linear-token ${cls}">${txt}</span>`;
      }
      return `<span ${attrs} class="linear-token linear-marker">${txt}</span>`;
    }).join('');
  }

  function buildLinearKeyData({ logs, thresholdSec }) {
    if (!logs) return { tokens: [] };
    const keyEvents = sortedKeyEvents(logs.key_records || {});
    const tokens = [];
    let lastEventTs = null;
    let shiftActive = false;
    let lastTag = null;

    function pushToken(token) {
      if (!token) return;
      if (token.type === 'tag' && lastTag && lastTag.value === token.value) {
        lastTag.count = (lastTag.count || 1) + 1;
        return;
      }
      if (token.type === 'tag') {
        token.count = token.count || 1;
        lastTag = token;
      } else {
        lastTag = null;
      }
      tokens.push(token);
    }

    keyEvents.forEach((ev) => {
      const value = ev.value;
      const isKeydown = value.startsWith('keydown');
      const isKeyup = value.startsWith('keyup');

      if (lastEventTs != null && isKeydown) {
        const deltaSec = (ev.ts - lastEventTs) / 1000;
        if (deltaSec > thresholdSec) {
          const pauseToken = { type: 'time', value: `<${deltaSec.toFixed(2)}>` };
          pushToken(pauseToken);
        }
      }

      if (isKeyup && value.includes('Shift')) {
        shiftActive = false;
        lastEventTs = ev.ts;
        return;
      }

      if (!isKeydown) {
        lastEventTs = ev.ts;
        return;
      }

      const sub9 = value.substring(9);
      if (sub9 === 'Shift') {
        shiftActive = true;
        lastEventTs = ev.ts;
        return;
      }

      if (sub9.length === 1) {
        pushToken({ type: 'text', value: sub9 });
        lastEventTs = ev.ts;
        return;
      }

      const upper = sub9.toUpperCase();
      const isArrow = ['ARROWLEFT', 'ARROWRIGHT', 'ARROWUP', 'ARROWDOWN', 'LEFT', 'RIGHT', 'UP', 'DOWN'].includes(upper);
      if (shiftActive && isArrow) {
        pushToken({ type: 'tag', value: 'SEL', category: 'nav' });
        lastEventTs = ev.ts;
        return;
      }

      let tag = upper;
      if (tag === 'BACKSPACE' || tag === 'DELETE') tag = 'DELETE';
      if (tag === 'ARROWLEFT') tag = 'LEFT';
      if (tag === 'ARROWRIGHT') tag = 'RIGHT';
      if (tag === 'ARROWUP') tag = 'UP';
      if (tag === 'ARROWDOWN') tag = 'DOWN';

      pushToken({ type: 'tag', value: tag, category: classifyTag(tag) });
      lastEventTs = ev.ts;
    });

    return { tokens };
  }

  function renderLinearKey({ logs }) {
    const out = document.getElementById('linoutputKey');
    if (!out) return;
    const thresholdSec = getLinThreshold();
    const result = buildLinearKeyData({ logs, thresholdSec });
    out.innerHTML = renderTokens(result.tokens || []);
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
    return renderLinearKey({ logs: logsFromGlobals() });
  }

  window.wscrLinearKey = {
    buildLinearKeyData,
    renderFromGlobals
  };

  document.addEventListener('input', (e) => {
    const input = e.target && e.target.closest ? e.target.closest('#linPauseThreshold') : null;
    if (!input) return;
    renderFromGlobals();
  });
})();
