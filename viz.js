function drawCumulativeVsPosition(textList) {
  // Create/find canvas
  let canvas = document.getElementById('linearityPlot');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'linearityPlot';
    canvas.width = 1000;
    canvas.height = 250;

    const contentDiv = document.getElementById('content');
    contentDiv.parentNode.insertBefore(canvas, contentDiv);
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const n = textList.length;
  if (n < 2) return;

  // Extract y values (cumulative)
  const ys = textList.map(d => d[1]); // [time, cumulative, char, ...]
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (yMin === yMax) yMax = yMin + 1;

  // Plot area padding
  const padL = 40, padR = 10, padT = 10, padB = 30;
  const w = canvas.width - padL - padR;
  const h = canvas.height - padT - padB;

  // Map final position -> x, cumulative -> y
  const xFor = (i) => padL + (i / (n - 1)) * w;
  const yFor = (y) => padT + (1 - (y - yMin) / (yMax - yMin)) * h;

  // Axes
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + h);
  ctx.lineTo(padL + w, padT + h);
  ctx.stroke();

  // Line plot
  ctx.beginPath();
  ctx.moveTo(xFor(0), yFor(ys[0]));
  for (let i = 1; i < n; i++) {
    ctx.lineTo(xFor(i), yFor(ys[i]));
  }
  ctx.stroke();

  // Simple labels (no styling needed)
  ctx.fillText('final position →', padL + 5, padT + h + 20);
  ctx.save();
  ctx.translate(15, padT + h - 5);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('cumulative insertion order ↑', 0, 0);
  ctx.restore();
}

function drawDiffStackedBarsOrdered(diffSteps) {
  let canvas = document.getElementById('diffStackedPlot');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'diffStackedPlot';
    canvas.width = 1000;
    canvas.height = 260;

    const contentDiv = document.getElementById('content');
    contentDiv.parentNode.insertBefore(canvas, contentDiv);
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const n = diffSteps.length;
  if (n === 0) return;

  // Total height per bar = sum of all chunk lengths in that diff
  const totals = diffSteps.map(d => d.chunks.reduce((s, c) => s + c.len, 0));
  let yMax = Math.max(...totals);
  if (yMax <= 0) yMax = 1;

  const padL = 45, padR = 10, padT = 10, padB = 30;
  const W = canvas.width - padL - padR;
  const H = canvas.height - padT - padB;

  const barW = Math.max(1, Math.floor(W / n));
  const gap = 1;

  const yFor = (v) => padT + (1 - v / yMax) * H;

  // Axes
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + H);
  ctx.lineTo(padL + W, padT + H);
  ctx.stroke();

  // Colors by op
  const colorFor = (op) => {
    if (op === 0) return '#000000';  // unchanged
    if (op === 1) return '#00AA00';  // insertion
    return '#CC0000';               // deletion (-1)
  };

  // Bars: stack chunks in the order they appear in diffs
  for (let i = 0; i < n; i++) {
    const { chunks } = diffSteps[i];
    const x = padL + i * barW;

    let acc = 0;
    for (const ch of chunks) {
      if (ch.len <= 0) continue;

      const yTop = yFor(acc + ch.len);
      const yBot = yFor(acc);

      ctx.fillStyle = colorFor(ch.op);
      ctx.fillRect(x, yTop, Math.max(1, barW - gap), yBot - yTop);

      acc += ch.len;
    }
  }

  // Labels
  ctx.fillStyle = '#000';
  ctx.fillText('diff step →', padL + 5, padT + H + 20);
  ctx.save();
  ctx.translate(15, padT + H - 5);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('diff chunk length (ordered stack) ↑', 0, 0);
  ctx.restore();
}


function drawDiffStackedBarsOrderedD3(diffSteps) {
  const container = d3.select('#diffviz');
  container.selectAll('*').remove();

  const margin = { top: 10, right: 10, bottom: 30, left: 55 };
  const width = 1000 - margin.left - margin.right;
  const height = 260 - margin.top - margin.bottom;

  // ---------- Controls ----------
  const controls = container.append('div').style('margin', '6px 0');

  controls.append('span').text('X-axis: ').style('margin-right', '6px');

  const modeSelect = controls.append('select').style('margin-right', '12px');
  modeSelect.append('option').attr('value', 'index').text('Step index');
  modeSelect.append('option').attr('value', 'time').text('Real time (ms)');

  const btnZoomIn = controls.append('button').text('Zoom in').attr('type', 'button').style('margin-right', '6px');
  const btnZoomOut = controls.append('button').text('Zoom out').attr('type', 'button').style('margin-right', '6px');
  const btnReset = controls.append('button').text('Reset').attr('type', 'button');

  // ---------- SVG ----------
  const svg = container.append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // ---------- Build ordered stack rects ----------
  const rects = [];
  const totals = [];

  for (let i = 0; i < diffSteps.length; i++) {
    const step = diffSteps[i];
    let acc = 0;
    for (const ch of step.chunks) {
      const y0 = acc;
      const y1 = acc + ch.len;
      rects.push({ i, time: step.time, op: ch.op, y0, y1 });
      acc = y1;
    }
    totals.push(acc);
  }

  const yMax = Math.max(1, ...totals);

  const y = d3.scaleLinear()
    .domain([0, yMax])
    .range([height, 0]);

  const yAxisG = g.append('g').call(d3.axisLeft(y).ticks(5));
  const xAxisG = g.append('g').attr('transform', `translate(0,${height})`);

  // Clip path
  g.append('defs').append('clipPath')
    .attr('id', 'diffviz-clip')
    .append('rect')
    .attr('x', 0).attr('y', 0)
    .attr('width', width).attr('height', height);

  const plotG = g.append('g').attr('clip-path', 'url(#diffviz-clip)');

  const color = (op) => (op === 0 ? '#000000' : (op === 1 ? '#00AA00' : '#CC0000'));

  const bars = plotG.selectAll('rect')
    .data(rects)
    .enter()
    .append('rect')
    .attr('fill', d => color(d.op))
    .attr('y', d => y(d.y1))
    .attr('height', d => Math.max(0, y(d.y0) - y(d.y1)));

  // ---------- Mode-dependent x scale ----------
  let mode = 'index';
  let xBase = makeXScale(mode);

  function makeXScale(m) {
    if (m === 'time') {
      const tMin = d3.min(diffSteps, d => d.time);
      const tMax = d3.max(diffSteps, d => d.time);
      // avoid degenerate domain
      const hi = (tMax === tMin) ? (tMin + 1) : tMax;
      return d3.scaleLinear().domain([tMin, hi]).range([0, width]);
    }
    // index
    return d3.scaleLinear().domain([0, diffSteps.length]).range([0, width]);
  }

  function xValue(d) {
    return (mode === 'time') ? d.time : d.i;
  }

  function widthFn(zx) {
    if (mode === 'time') {
      return (d) => {
        const i = d.i;
        const t0 = diffSteps[i].time;
        // pick next time; if last bar, extrapolate using previous interval or +1
        let t1;
        if (diffSteps[i + 1]) t1 = diffSteps[i + 1].time;
        else if (diffSteps[i - 1]) t1 = t0 + (t0 - diffSteps[i - 1].time);
        else t1 = t0 + 1;

        if (t1 === t0) t1 = t0 + 1;
        return Math.max(1, zx(t1) - zx(t0));
      };
    }
    return (d) => Math.max(1, zx(d.i + 1) - zx(d.i));
  }

  function draw(transform) {
    const zx = transform.rescaleX(xBase);

    // axis
    if (mode === 'time') {
      xAxisG.call(
        d3.axisBottom(zx)
          .ticks(6)
          .tickFormat(d3.format('d'))
      );
    } else {
      xAxisG.call(
        d3.axisBottom(zx)
          .ticks(Math.min(10, diffSteps.length))
          .tickFormat(d => Math.floor(d))
      );
    }

    // bars
    const w = widthFn(zx);
    bars
      .attr('x', d => zx(xValue(d)))
      .attr('width', w);
  }

  // ---------- Zoom behavior (set ONCE) ----------
  const zoom = d3.zoom()
    .scaleExtent([1, 50])
    .translateExtent([[0, 0], [width, height]])
    .extent([[0, 0], [width, height]])
    .on('zoom', (event) => {
      // ONLY draw; do NOT call zoom.transform here
      draw(event.transform);
    });

  svg.call(zoom);

  // Initial draw
  draw(d3.zoomIdentity);

  // ---------- Controls ----------
  modeSelect.on('change', function () {
    mode = this.value;
    xBase = makeXScale(mode);

    // Keep current zoom/pan; just redraw with current transform
    const t = d3.zoomTransform(svg.node());
    draw(t);
  });

  btnZoomIn.on('click', () => svg.transition().call(zoom.scaleBy, 1.5));
  btnZoomOut.on('click', () => svg.transition().call(zoom.scaleBy, 1 / 1.5));
  btnReset.on('click', () => svg.transition().call(zoom.transform, d3.zoomIdentity));
}



function _drawDiffStackedBarsOrderedD3(diffSteps) {
  const container = d3.select('#diffviz');
  container.selectAll('*').remove();

  const margin = { top: 10, right: 10, bottom: 30, left: 45 };
  const width = 1000 - margin.left - margin.right;
  const height = 2260 - margin.top - margin.bottom;

  // Controls
  const controls = container.append('div').style('margin', '6px 0');
  controls.append('button').text('Zoom in').attr('type', 'button').style('margin-right', '6px');
  controls.append('button').text('Zoom out').attr('type', 'button').style('margin-right', '6px');
  controls.append('button').text('Reset').attr('type', 'button');

  // SVG
  const svg = container.append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Flatten chunks into rects with y0/y1 (ordered stacking)
  const rects = [];
  for (let i = 0; i < diffSteps.length; i++) {
    let acc = 0;
    for (const ch of diffSteps[i].chunks) {
      const y0 = acc;
      const y1 = acc + ch.len;
      rects.push({ i, op: ch.op, y0, y1 });
      acc = y1;
    }
  }

  const totals = diffSteps.map(d => d.chunks.reduce((s, c) => s + c.len, 0));
  const yMax = Math.max(1, ...totals);

  // Scales
  const x = d3.scaleLinear()
    .domain([0, diffSteps.length])
    .range([0, width]);

  const y = d3.scaleLinear()
    .domain([0, yMax])
    .range([height, 0]);

  const color = (op) => (op === 0 ? '#000000' : (op === 1 ? '#00AA00' : '#CC0000'));

  // Axis (x is step index; we keep it sparse)
  const xAxisG = g.append('g')
    .attr('transform', `translate(0,${height})`);

  const yAxisG = g.append('g');

  const baseXAxis = d3.axisBottom(x)
    .ticks(Math.min(10, diffSteps.length))
    .tickFormat(d => Math.floor(d));

  const yAxis = d3.axisLeft(y).ticks(5);

  xAxisG.call(baseXAxis);
  yAxisG.call(yAxis);

  // Clip path so bars don't draw outside plot area during pan/zoom
  g.append('defs').append('clipPath')
    .attr('id', 'diffviz-clip')
    .append('rect')
    .attr('x', 0).attr('y', 0)
    .attr('width', width).attr('height', height);

  const barsG = g.append('g').attr('clip-path', 'url(#diffviz-clip)');

  // Draw bars
  const bars = barsG.selectAll('rect')
    .data(rects)
    .enter()
    .append('rect')
    .attr('fill', d => color(d.op))
    .attr('x', d => x(d.i))
    .attr('width', d => Math.max(1, x(d.i + 1) - x(d.i)))
    .attr('y', d => y(d.y1))
    .attr('height', d => Math.max(0, y(d.y0) - y(d.y1)));

  // Zoom behavior: horizontal only (pan + zoom X)
  const zoom = d3.zoom()
    .scaleExtent([1, 50])
    .translateExtent([[0, 0], [width, height]])
    .extent([[0, 0], [width, height]])
    .on('zoom', (event) => {
      const zx = event.transform.rescaleX(x);

      // update bars
      bars
        .attr('x', d => zx(d.i))
        .attr('width', d => Math.max(1, zx(d.i + 1) - zx(d.i)));

      // update x axis
      xAxisG.call(d3.axisBottom(zx)
        .ticks(Math.min(10, diffSteps.length))
        .tickFormat(d => Math.floor(d)));
    });

  // Attach zoom to the svg plot area (not the control div)
  svg.call(zoom);

  // Hook up buttons
  const btns = controls.selectAll('button').nodes();
  d3.select(btns[0]).on('click', () => svg.transition().call(zoom.scaleBy, 1.5));
  d3.select(btns[1]).on('click', () => svg.transition().call(zoom.scaleBy, 1 / 1.5));
  d3.select(btns[2]).on('click', () => svg.transition().call(zoom.transform, d3.zoomIdentity));
}




function _drawDiffStackedBars(diffSteps, useCumulative = false) {
  // Create/find canvas
  let canvas = document.getElementById('diffStackedPlot');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'diffStackedPlot';
    canvas.width = 1000;
    canvas.height = 260;

    const contentDiv = document.getElementById('content');
    contentDiv.parentNode.insertBefore(canvas, contentDiv);
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const n = diffSteps.length;
  if (n === 0) return;

  // Y scale based on total stack height
  const totals = diffSteps.map(d => d.unchangedLen + d.insertLen + d.deleteLen);
  let yMax = Math.max(...totals);
  if (yMax <= 0) yMax = 1;

  // Plot area padding
  const padL = 45, padR = 10, padT = 10, padB = 30;
  const W = canvas.width - padL - padR;
  const H = canvas.height - padT - padB;

  // X mapping: evenly spaced bars (simple + fast)
  const barW = Math.max(1, Math.floor(W / n));
  const gap = 1;

  const yFor = (v) => padT + (1 - v / yMax) * H; // v in [0..yMax]

  // Axes
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + H);
  ctx.lineTo(padL + W, padT + H);
  ctx.stroke();

  // Bars (stacked)
  for (let i = 0; i < n; i++) {
    const d = diffSteps[i];
    const x = padL + i * barW;

    // Stack order (bottom -> top). Choose any; this is a readable one:
    // unchanged (black) at bottom, then insert (green), then delete (red)
    const parts = [
      { val: d.unchangedLen, color: '#000000' }, // 0
      { val: d.insertLen,    color: '#00AA00' }, // 1
      { val: d.deleteLen,    color: '#CC0000' }  // -1
    ];

    let acc = 0;
    for (const p of parts) {
      if (p.val <= 0) continue;
      const yTop = yFor(acc + p.val);
      const yBot = yFor(acc);
      ctx.fillStyle = p.color;
      ctx.fillRect(x, yTop, Math.max(1, barW - gap), yBot - yTop);
      acc += p.val;
    }
  }

  // Minimal labels
  const xLabel = useCumulative ? 'cumulative step →' : 'diff step →';
  ctx.fillStyle = '#000';
  ctx.fillText(xLabel, padL + 5, padT + H + 20);
  ctx.save();
  ctx.translate(15, padT + H - 5);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('diff chunk length ↑', 0, 0);
  ctx.restore();
}

/*
function _scriptlogram() {
  messages.value += 'scriptlogram!\n';
  const dmp = new diff_match_patch();

  hr = {};
  hr[header_record['starttime']]='';
  ftr = Object.assign(hr,text_record);

  // Convert text_record and cursor_records data into arrays of objects
  const textData = Object.keys(ftr).map(key => ({
    time: +key,
    length: ftr[key].length,
    text: ftr[key]
  }));

  // fake time for easier debugging
  /*let cumulative = 0;
const textData = Object.keys(text_record).map((key, index) => {
    cumulative += (index + 1) * 1000; // increment grows with index
    return {
        time: cumulative,
        length: text_record[key].length,
        text: text_record[key]
    };
});/*


  // Diff logic
  const textList = [];
  let currentPosition = 0;

  //textData = textData.slice(0,50);

  // Process diffs between consecutive items in text_record
  textData.forEach((item, index) => {
    if (index > 0) {
      const prevText = textData[index - 1].text;
      const currentText = item.text;

      // Compute diffs between the current and previous text
      const diffs = dmp.diff_main(prevText, currentText);
      dmp.diff_cleanupSemantic(diffs); // Optionally clean up semantic diffs

      diffs.forEach(diff => {
        const [operation, text] = diff;

        if (operation === 0) { // Unchanged part
          currentPosition = text.length;
        } else if (operation === 1) { // Insertion
          // For each inserted character, add an element to textList
          for (let char of text) {
            textList.splice(currentPosition, 0, [
              item.time,  // item time
              char,       // character
              item.time - textData[index - 1].time, // time since previous item
              (textData[index + 1] ? textData[index + 1].time : item.time) - item.time // time until next item
            ]);
            currentPosition++; // Move to the next character position
          }
        } else if (operation === -1) { // Deletion
          // For each deleted character, remove an element from textList
          for (let char of text) {
            textList.splice(currentPosition, 1);
          }
        }
        console.log(operation, text, currentPosition);
      });
    }
  });

  //console.log("Processed Text List: ", textList);

  // Insert characters from textList into the content div
  const contentDiv = document.getElementById("content");
  const labelDiv = document.getElementById("label");
  textList.forEach(([time, char, timeSincePrev, timeUntilNext]) => {
    const span = document.createElement('span');
    span.textContent = char;
    span.setAttribute('data-time', time); // Store the time in a data attribute
    span.setAttribute('time-bef', timeSincePrev);
    span.setAttribute('time-aft', timeUntilNext);
    /*span.addEventListener('mouseenter', function(event) {
      //labelDiv.textContent = `Time: ${event.target.getAttribute('data-time')}`;
      labelDiv.textContent = `B: ${event.target.getAttribute('time-bef')} A: ${event.target.getAttribute('time-aft')}`;
    });
    span.addEventListener('mouseleave', function() {
      labelDiv.textContent = 'Time: -'; // Clear label on mouse leave
    });*
    contentDiv.appendChild(span);
  });

	contentDiv.addEventListener('mouseover', (e) => {
		const span = e.target.closest('#content span[time-bef][time-aft]');
		if (!span) return;
		labelDiv.textContent = `B: ${span.getAttribute('time-bef')} A: ${span.getAttribute('time-aft')}`;
	});
	contentDiv.addEventListener('mouseout', (e) => {
		const span = e.target.closest('#content span[time-bef][time-aft]');
		if (!span) return;
		labelDiv.textContent = 'Time: -';
	});

	function getCharSpan(node) {
		if (!node) return null;
		// If it's a text node, use its parent element
		const el = (node.nodeType === Node.TEXT_NODE) ? node.parentElement : node;
		// Walk up until we hit a character span (the ones with time-bef/time-aft)
		return el?.closest?.('#content span[time-bef][time-aft]') || null;
	}

	contentDiv.addEventListener('mouseup', function (e) {
    if (e.target.closest('.newspan')) return;

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;

		const original = selection.getRangeAt(0);
		if (original.collapsed) return;

		const startSpan = getCharSpan(original.startContainer);
		const endSpan   = getCharSpan(original.endContainer);

		// If selection isn't within your character spans, do nothing
		if (!startSpan || !endSpan) return;

		// Create an adjusted range that fully includes the boundary spans
		const range = document.createRange();
		range.setStartBefore(startSpan);
		range.setEndAfter(endSpan);

		// Wrap as before
		const newSpan = document.createElement('span');
		newSpan.className = 'newspan';

		const contents = range.extractContents();
		newSpan.appendChild(contents);
		range.insertNode(newSpan);

		selection.removeAllRanges();
	});

  contentDiv.addEventListener('click', (e) => {
    //if (e.target.classList.contains('data-time') && e.target.parentElement.classList.contains('newspan')) {
    if (e.target.parentElement.classList.contains('newspan')) {
      const span = e.target.parentElement;
      const parent = span.parentNode;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    }
  });

  document.getElementById('generate-table').addEventListener('click', generateTable);

  function generateTable() {
    const container = document.getElementById('content');
    const spans = container.getElementsByClassName('newspan');
    const tableContainer = document.getElementById('table-container');

    if (spans.length === 0) {
      tableContainer.innerHTML = '<p>No newspan elements found.</p>';
      return;
    }

    let tableHTML = '<table><thead><tr><th>Content</th><th>Start Position</th><th>End Position</th></tr></thead><tbody>';

    Array.from(spans).forEach(span => {
      const content = span.textContent;
      const timeBef = span.firstChild.getAttribute('time-bef');
      const timeAft = span.lastChild.getAttribute('time-aft');
      const startPos = getTextPosition(container, span, 'start');
      const endPos = startPos + getTextPosition(container, span, 'end');

      tableHTML += `<tr><td>${content}</td><td>${timeBef}</td><td>${timeAft}</td></tr>`;
    });

    tableHTML += '</tbody></table>';
    tableContainer.innerHTML = tableHTML;
  }

  function getTextPosition(container, span, position) {
    const range = document.createRange();
    const preRange = document.createRange();
    range.selectNodeContents(container);
    preRange.selectNodeContents(span);

    if (position === 'start') {
      range.setEnd(preRange.startContainer, preRange.startOffset);
    } else if (position === 'end') {
      range.setStart(preRange.startContainer, preRange.startOffset);
      range.setEnd(preRange.endContainer, preRange.endOffset);
    }

    return range.toString().length;
  }
}
*/

