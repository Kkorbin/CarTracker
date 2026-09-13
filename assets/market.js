/* Price-vs-mileage baseline. Inline SVG, no charting library. */

const $ = sel => document.querySelector(sel);
const ANY = '__any__';

let DATA = { points: [] };
let TRACKED = [];

const money = n => '$' + Math.round(n).toLocaleString();

/* ---------- fitting ---------- */

// Ordinary least squares of price against mileage. Returns null when there is not
// enough spread to fit anything meaningful — two cars at the same mileage cannot
// define a slope, and pretending otherwise draws a confident line through noise.
function fit(points) {
  const n = points.length;
  if (n < 3) return null;

  const mx = points.reduce((s, p) => s + p.miles, 0) / n;
  const my = points.reduce((s, p) => s + p.price, 0) / n;

  let sxx = 0, sxy = 0, syy = 0;
  for (const p of points) {
    const dx = p.miles - mx, dy = p.price - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);

  return { slope, intercept, r2, n, predict: m => intercept + slope * m };
}

/* ---------- filtering ---------- */

function selected() {
  return {
    make: $('#fMake').value,
    model: $('#fModel').value,
    year: $('#fYear').value,
    trim: $('#fTrim').value,
  };
}

function matching(sel, ignore) {
  return DATA.points.filter(p =>
    (ignore === 'make'  || sel.make  === ANY || p.make  === sel.make) &&
    (ignore === 'model' || sel.model === ANY || p.model === sel.model) &&
    (ignore === 'year'  || sel.year  === ANY || String(p.year) === sel.year) &&
    (ignore === 'trim'  || sel.trim  === ANY || p.trim  === sel.trim)
  );
}

function fillSelect(el, values, label, keep) {
  const prev = keep ?? el.value;
  el.innerHTML = `<option value="${ANY}">All ${label}</option>` +
    values.map(v => `<option value="${v}">${v}</option>`).join('');
  el.value = values.map(String).includes(String(prev)) ? prev : ANY;
}

function uniq(arr) { return [...new Set(arr)]; }

function refreshSelects(changed) {
  const sel = selected();

  if (changed !== 'make') {
    fillSelect($('#fMake'), uniq(DATA.points.map(p => p.make)).sort(), 'makes', sel.make);
  }
  const afterMake = matching({ ...selected(), model: ANY, year: ANY, trim: ANY });
  fillSelect($('#fModel'), uniq(afterMake.map(p => p.model)).sort(), 'models', sel.model);

  const afterModel = matching({ ...selected(), year: ANY, trim: ANY });
  fillSelect($('#fYear'), uniq(afterModel.map(p => p.year)).sort((a, b) => b - a), 'years', sel.year);

  const afterYear = matching({ ...selected(), trim: ANY });
  fillSelect($('#fTrim'), uniq(afterYear.map(p => p.trim)).sort(), 'trims', sel.trim);
}

/* ---------- chart ---------- */

function renderChart(points, model) {
  const host = $('#chart');
  if (!points.length) {
    host.innerHTML = `<p class="empty">No listings match that combination.</p>`;
    return;
  }

  const W = 720, H = 380, PAD = { t: 16, r: 16, b: 44, l: 68 };
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;

  const xs = points.map(p => p.miles), ys = points.map(p => p.price);
  const relevant = TRACKED.filter(t => matchesSelection(t));
  relevant.forEach(t => { xs.push(t.miles); ys.push(t.price); });

  const pad = (lo, hi) => {
    if (lo === hi) return [lo * 0.9, hi * 1.1 || 1];
    const m = (hi - lo) * 0.08;
    return [Math.max(0, lo - m), hi + m];
  };
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));

  const sx = v => PAD.l + ((v - x0) / (x1 - x0)) * iw;
  const sy = v => PAD.t + ih - ((v - y0) / (y1 - y0)) * ih;

  const ticks = (lo, hi, count) => {
    const step = (hi - lo) / count;
    return Array.from({ length: count + 1 }, (_, i) => lo + step * i);
  };

  const gridX = ticks(x0, x1, 5).map(v =>
    `<line x1="${sx(v)}" y1="${PAD.t}" x2="${sx(v)}" y2="${PAD.t + ih}" class="grid"/>
     <text x="${sx(v)}" y="${PAD.t + ih + 20}" class="axis" text-anchor="middle">${Math.round(v / 1000)}k</text>`
  ).join('');

  const gridY = ticks(y0, y1, 5).map(v =>
    `<line x1="${PAD.l}" y1="${sy(v)}" x2="${PAD.l + iw}" y2="${sy(v)}" class="grid"/>
     <text x="${PAD.l - 10}" y="${sy(v) + 4}" class="axis" text-anchor="end">$${Math.round(v / 1000)}k</text>`
  ).join('');

  // Budget band, so you can see at a glance which cars are even reachable.
  const bLo = Math.max(y0, CRITERIA.price.budgetLow);
  const bHi = Math.min(y1, CRITERIA.price.target);
  const budget = bHi > bLo
    ? `<rect x="${PAD.l}" y="${sy(bHi)}" width="${iw}" height="${sy(bLo) - sy(bHi)}" class="budget"/>
       <text x="${PAD.l + 8}" y="${sy(bHi) + 14}" class="badge">budget ${money(CRITERIA.price.budgetLow)}–${money(CRITERIA.price.target)}</text>`
    : '';

  const f = fit(points);
  let line = '', band = '';
  if (f) {
    const yA = f.predict(x0), yB = f.predict(x1);
    line = `<line x1="${sx(x0)}" y1="${sy(yA)}" x2="${sx(x1)}" y2="${sy(yB)}" class="fitline"/>`;
  }

  const dots = points.map(p =>
    `<circle cx="${sx(p.miles)}" cy="${sy(p.price)}" r="4" class="dot">
       <title>${p.year} ${p.make} ${p.model} ${p.trim}\n${money(p.price)} · ${p.miles.toLocaleString()} mi</title>
     </circle>`
  ).join('');

  const mine = relevant.map(t =>
    `<circle cx="${sx(t.miles)}" cy="${sy(t.price)}" r="7" class="dot mine">
       <title>TRACKED: ${t.year} ${t.make} ${t.model} ${t.trim}\n${money(t.price)} · ${t.miles.toLocaleString()} mi · ${t.dealer}</title>
     </circle>`
  ).join('');

  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="chart" role="img"
         aria-label="Scatter plot of asking price against mileage for ${model}">
      ${budget}${gridX}${gridY}${line}${dots}${mine}
      <text x="${PAD.l + iw / 2}" y="${H - 6}" class="axis-title" text-anchor="middle">Mileage</text>
      <text x="16" y="${PAD.t + ih / 2}" class="axis-title" text-anchor="middle"
            transform="rotate(-90 16 ${PAD.t + ih / 2})">Asking price</text>
    </svg>`;
}

function matchesSelection(t) {
  const sel = selected();
  return (sel.make === ANY || t.make === sel.make)
      && (sel.model === ANY || t.model === sel.model)
      && (sel.year === ANY || String(t.year) === sel.year)
      && (sel.trim === ANY || t.trim === sel.trim);
}

/* ---------- readout ---------- */

let currentFit = null;

function render() {
  const sel = selected();
  const points = matching(sel);
  currentFit = fit(points);

  const label = [
    sel.year === ANY ? '' : sel.year,
    sel.make === ANY ? '' : sel.make,
    sel.model === ANY ? 'all models' : sel.model,
    sel.trim === ANY ? '' : sel.trim,
  ].filter(Boolean).join(' ');

  renderChart(points, label);

  const n = points.length;
  const sampleEl = $('#sample');
  sampleEl.textContent = `${n} listing${n === 1 ? '' : 's'}`;
  sampleEl.className = 'sample ' + (n >= 8 ? 'ok' : n >= 4 ? 'thin' : 'poor');

  const out = $('#readout');
  if (!currentFit) {
    out.innerHTML = `<p class="warn-note">Not enough data to draw a baseline — need at least 3 listings
      with differing mileage. Widen the year or trim filter.</p>`;
    return;
  }

  // slope is dollars per mile; report it per 10k miles, which is the unit people think in
  const per10k = -currentFit.slope * 10000;
  const fitQuality = currentFit.r2 >= 0.6 ? 'tracks mileage closely'
                   : currentFit.r2 >= 0.3 ? 'loosely related to mileage'
                   : 'barely related to mileage — trim and condition dominate here';

  const caution = n < 8
    ? `<p class="warn-note">Only ${n} listings behind this line. Treat it as a rough sketch, not a market rate.</p>`
    : '';

  out.innerHTML = `
    <div class="statrow">
      <div><span class="k">Depreciation</span><span class="v">${per10k > 0 ? money(per10k) : '—'} per 10k mi</span></div>
      <div><span class="k">Price at 50k mi</span><span class="v">${money(currentFit.predict(50000))}</span></div>
      <div><span class="k">Fit strength</span><span class="v">r² ${currentFit.r2.toFixed(2)}</span></div>
    </div>
    <p class="hint">Price ${fitQuality}.</p>
    ${caution}`;

  checkPrice();
}

function checkPrice() {
  const miles = Number($('#qMiles').value);
  const price = Number($('#qPrice').value);
  const el = $('#verdict');

  if (!miles || !price) { el.textContent = ''; el.className = 'verdict'; return; }
  if (!currentFit) {
    el.textContent = 'No baseline available for this selection.';
    el.className = 'verdict';
    return;
  }

  const expected = currentFit.predict(miles);
  const delta = price - expected;
  const pct = (delta / expected) * 100;

  const verdict = delta < -1500 ? 'below' : delta > 1500 ? 'above' : 'about at';
  el.className = 'verdict ' + (delta < -1500 ? 'good' : delta > 1500 ? 'bad' : '');
  el.innerHTML = `At ${miles.toLocaleString()} miles the baseline says <strong>${money(expected)}</strong>.
    ${money(price)} is <strong>${verdict} market</strong>
    (${delta >= 0 ? '+' : '−'}${money(Math.abs(delta))}, ${Math.abs(pct).toFixed(0)}%).`;
}

/* ---------- init ---------- */

async function init() {
  try {
    const [mRes, lRes] = await Promise.all([
      fetch('data/market.json', { cache: 'no-store' }),
      fetch('data/listings.json', { cache: 'no-store' }),
    ]);
    if (!mRes.ok) throw new Error(`market.json: HTTP ${mRes.status}`);
    DATA = await mRes.json();
    TRACKED = lRes.ok ? await lRes.json() : [];
  } catch (e) {
    $('#chart').innerHTML = `<p class="empty">Could not load market data: ${e.message}</p>`;
    return;
  }

  $('#meta').textContent =
    `${DATA.points.length} listings collected ${DATA.collected} from ${DATA.source}. ${DATA.note} ` +
    `Your tracked cars are drawn as larger highlighted dots when they match the filter.`;

  for (const id of ['fMake', 'fModel', 'fYear', 'fTrim']) {
    $('#' + id).addEventListener('change', () => { refreshSelects(id); render(); });
  }
  $('#qMiles').addEventListener('input', checkPrice);
  $('#qPrice').addEventListener('input', checkPrice);

  refreshSelects();
  render();
}

document.addEventListener('DOMContentLoaded', init);
