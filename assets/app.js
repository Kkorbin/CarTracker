/* Car Tracker — no build step, no dependencies. */

const STORE_KEY = 'car-tracker/listings/v1';
const FIN_KEY = 'car-tracker/finance/v1';
const DONE_KEY = 'car-tracker/checks/v1';
const $ = sel => document.querySelector(sel);

let listings = [];
let marketPoints = [];        // comparable local listings, for the value range
let finance = { ...CRITERIA.finance };
let doneChecks = {};          // { [listingId]: { [checkText]: true } }
const compareSet = new Set();

/* ---------- finance + checklist persistence ---------- */

function loadPrefs() {
  try {
    const f = JSON.parse(localStorage.getItem(FIN_KEY) || 'null');
    if (f) finance = { ...finance, ...f };
  } catch { /* defaults are fine */ }
  try {
    doneChecks = JSON.parse(localStorage.getItem(DONE_KEY) || '{}') || {};
  } catch { doneChecks = {}; }
}

function savePrefs() {
  try { localStorage.setItem(FIN_KEY, JSON.stringify(finance)); } catch {}
}

function saveChecks() {
  try { localStorage.setItem(DONE_KEY, JSON.stringify(doneChecks)); } catch {}
}

// Every car gets its own open questions plus the universal pre-purchase steps.
function checksFor(v) {
  return [...(v.checks || []), ...CRITERIA.standardChecks];
}

function paymentFor(v) {
  const otd = outTheDoor(v);
  const financed = Math.max(0, otd.total - finance.downPayment);
  return monthlyPayment(financed, finance.apr, finance.termMonths);
}

/* ---------- persistence ---------- */

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    listings = raw ? JSON.parse(raw) : [];
  } catch {
    listings = [];
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(listings));
  } catch {
    status('Could not save to browser storage — export your JSON to avoid losing work.');
  }
}

function status(msg) { $('#dataStatus').textContent = msg || ''; }

/* ---------- form scaffolding ---------- */

function buildChecks() {
  const mk = (list, host) => {
    host.innerHTML = list.map(f =>
      `<label class="check"><input type="checkbox" data-feat="${f.id}"> ${f.label}</label>`
    ).join('');
  };
  mk(CRITERIA.safety, $('#safetyChecks'));
  mk(CRITERIA.comfort, $('#comfortChecks'));
}

function readForm() {
  const features = {};
  document.querySelectorAll('[data-feat]').forEach(el => { features[el.dataset.feat] = el.checked; });
  return {
    url: $('#url').value.trim(),
    vin: $('#vin').value.trim().toUpperCase(),
    year: Number($('#year').value),
    make: $('#make').value.trim(),
    model: $('#model').value.trim(),
    trim: $('#trim').value.trim(),
    price: Number($('#price').value),
    miles: Number($('#miles').value),
    title: $('#title').value,
    accidents: $('#accidents').value,
    drive: $('#drive').value,
    location: $('#location').value.trim(),
    dealer: $('#dealer').value.trim(),
    status: $('#status').value,
    notes: $('#notes').value.trim(),
    features,
  };
}

function fillForm(v) {
  $('#editId').value = v.id || '';
  $('#url').value = v.url || '';
  $('#vin').value = v.vin || '';
  $('#year').value = v.year || '';
  $('#make').value = v.make || '';
  $('#model').value = v.model || '';
  $('#trim').value = v.trim || '';
  $('#price').value = v.price || '';
  $('#miles').value = v.miles || '';
  $('#title').value = v.title || 'clean';
  $('#accidents').value = v.accidents || 'none';
  $('#drive').value = v.drive || 'fwd';
  $('#location').value = v.location || '';
  $('#dealer').value = v.dealer || '';
  $('#status').value = v.status || 'watching';
  $('#notes').value = v.notes || '';
  document.querySelectorAll('[data-feat]').forEach(el => {
    el.checked = Boolean(v.features && v.features[el.dataset.feat]);
  });
}

function resetForm() {
  $('#listingForm').reset();
  $('#editId').value = '';
  document.querySelectorAll('[data-feat]').forEach(el => { el.checked = false; });
  $('#formTitle').textContent = 'Add a listing';
  $('#submitBtn').textContent = 'Add listing';
  $('#vinStatus').textContent = 'Decodes free via NHTSA — fills year, make, model, trim.';
}

/* ---------- VIN decode (NHTSA vPIC, free, no key) ---------- */

async function decodeVin() {
  const vin = $('#vin').value.trim().toUpperCase();
  if (vin.length !== 17) { $('#vinStatus').textContent = 'A VIN is 17 characters.'; return; }

  $('#vinStatus').textContent = 'Decoding…';
  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const r = data.Results && data.Results[0];
    if (!r) throw new Error('No results');

    if (r.ModelYear) $('#year').value = r.ModelYear;
    if (r.Make) $('#make').value = titleCase(r.Make);
    if (r.Model) $('#model').value = r.Model;
    if (r.Trim && !$('#trim').value) $('#trim').value = r.Trim;
    if (r.DriveType && /awd|4wd|all/i.test(r.DriveType)) $('#drive').value = 'awd';

    const err = r.ErrorText && !/^0/.test(r.ErrorCode || '') ? ` (${r.ErrorText.split(';')[0]})` : '';
    $('#vinStatus').textContent = `Decoded: ${r.ModelYear || '?'} ${titleCase(r.Make || '?')} ${r.Model || ''}${err}`;
  } catch (e) {
    $('#vinStatus').textContent = `Decode failed: ${e.message}. Enter details manually.`;
  }
}

function titleCase(s) {
  return String(s).toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
}

/* ---------- rendering ---------- */

function money(n) { return '$' + Number(n || 0).toLocaleString(); }

function renderStats() {
  const live = listings.filter(v => !['sold', 'passed'].includes(v.status));
  const host = $('#stats');
  if (!listings.length) { host.innerHTML = ''; return; }

  const scored = live.map(v => scoreListing(v).total);
  const best = scored.length ? Math.max(...scored) : 0;
  const prices = live.map(v => Number(v.price)).filter(Boolean);
  const avg = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;

  const cards = [
    ['Tracking', live.length],
    ['Best score', best ? `${best}/100` : '—'],
    ['Avg price', prices.length ? money(avg) : '—'],
    ['Lowest', prices.length ? money(Math.min(...prices)) : '—'],
  ];
  host.innerHTML = cards.map(([k, v]) => `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
}

function sortListings(arr) {
  const how = $('#sort').value;
  const c = [...arr];
  const s = v => scoreListing(v).total;
  switch (how) {
    case 'otd':        return c.sort((a, b) => outTheDoor(a).total - outTheDoor(b).total);
    case 'payment':    return c.sort((a, b) => paymentFor(a) - paymentFor(b));
    case 'price-asc':  return c.sort((a, b) => a.price - b.price);
    case 'price-desc': return c.sort((a, b) => b.price - a.price);
    case 'miles':      return c.sort((a, b) => a.miles - b.miles);
    case 'year':       return c.sort((a, b) => b.year - a.year);
    case 'added':      return c.sort((a, b) => (b.added || '').localeCompare(a.added || ''));
    default:           return c.sort((a, b) => s(b) - s(a));
  }
}

/* ---------- recalls ---------- */

// NHTSA's VIN tool reports UNREPAIRED recalls for a specific car, which is the number
// that actually matters — but it sits behind reCAPTCHA and has no public API, so this
// gets the VIN onto the clipboard and opens the right page rather than automating it.
function vinLookupBlock(v) {
  const mfr = mfrRecallUrl(v.make);
  if (!v.vin) {
    return `<p class="vinlookup none">No VIN recorded for this car — ask the dealer for
      it, then check it at
      <a href="https://www.nhtsa.gov/recalls" target="_blank" rel="noopener noreferrer">nhtsa.gov/recalls</a>.</p>`;
  }
  return `<div class="vinlookup">
    <div class="vl-row">
      <code class="vl-vin">${v.vin}</code>
      <button type="button" class="ghost act-copyvin" data-vin="${v.vin}">Copy VIN</button>
    </div>
    <div class="vl-links">
      <a href="https://www.nhtsa.gov/recalls?vymm=${encodeURIComponent(v.vin)}"
         target="_blank" rel="noopener noreferrer"><strong>Check this VIN at NHTSA &rarr;</strong></a>
      ${mfr ? `<a href="${mfr}" target="_blank" rel="noopener noreferrer">${v.make} owner lookup &rarr;</a>` : ''}
    </div>
    <p class="hint">Opens with the VIN already filled in; press Search. It reports only
      what is still <em>unrepaired</em> on this particular car — a clean result reads
      "0 unrepaired recalls associated with this VIN".
      <strong>A lower count here than in the list below does not mean the rest were
      repaired</strong> — most recall campaigns cover only a slice of a model year's
      production, so many probably never applied to this car. Either way, the number
      above is the one that matters.</p>
  </div>`;
}

async function loadRecalls(v, host) {
  const countEl = host.querySelector('.recall-count');
  const body = host.querySelector('.recall-body');
  countEl.textContent = '— checking…';

  try {
    const list = await fetchRecalls(v);
    if (!list.length) {
      countEl.textContent = '— none';
      countEl.className = 'recall-count ok';
      body.innerHTML = `<p class="hint">NHTSA lists no open recalls for the
        ${v.year} ${v.make} ${v.model}.</p>`;
      return;
    }

    const severe = list.filter(r => r.parkIt || r.parkOutside).length;
    countEl.textContent = `— ${list.length}${severe ? `, ${severe} severe` : ''}`;
    countEl.className = 'recall-count ' + (severe ? 'bad' : 'warn');

    body.innerHTML = `
      ${vinLookupBlock(v)}
      <p class="hint"><strong>This list is every campaign that touched the ${v.year}
        ${v.make} ${v.model} as a model — not this car's status.</strong> Campaigns
        usually cover a specific range of build dates or plants, so a given car is
        typically affected by only some of them. Expect the VIN check to return far
        fewer. Anything it does return is repaired free at a franchise dealer, which
        makes it leverage rather than a dealbreaker.</p>
      <ul class="recall-list">${list.map(r => `
        <li>
          <div class="rc-head">
            <strong>${r.component}</strong>
            ${r.parkIt ? '<span class="rc-flag bad">DO NOT DRIVE</span>' : ''}
            ${r.parkOutside ? '<span class="rc-flag bad">PARK OUTSIDE</span>' : ''}
            <span class="rc-id">${r.campaign}</span>
          </div>
          ${r.consequence ? `<div class="rc-consequence">${r.consequence}</div>` : ''}
        </li>`).join('')}</ul>`;
  } catch (e) {
    countEl.textContent = '— lookup failed';
    body.innerHTML = `<p class="hint">Could not reach NHTSA: ${e.message}.
      Check manually at <a href="https://www.nhtsa.gov/recalls" target="_blank"
      rel="noopener noreferrer">nhtsa.gov/recalls</a>.</p>`;
  }
}

/* ---------- compare ---------- */

function renderCompare() {
  const panel = $('#comparePanel');
  // Follow whatever order the list is currently sorted in, so columns line up
  // with what you were just looking at.
  const picked = sortListings(listings.filter(v => compareSet.has(v.id)));

  if (picked.length < 2) { panel.hidden = true; return; }
  panel.hidden = false;

  // Only rows where the cars actually differ are worth eyeballing, but keep the
  // money rows always — those are the decision.
  const rows = [
    ['Score', v => `${scoreListing(v).total}/100`],
    ['Sticker', v => money(v.price)],
    ['Out the door', v => money(Math.round(outTheDoor(v).total))],
    ['Monthly', v => `${money(Math.round(paymentFor(v)))}/mo`],
    ['Mileage', v => `${Number(v.miles).toLocaleString()} mi`],
    ['Year', v => v.year],
    ['Trim', v => v.trim || '—'],
    ['Drive', v => (v.drive === 'awd' ? 'AWD' : 'FWD')],
    ['Title', v => v.title === 'clean' ? 'Clean' : v.title],
    ['Accidents', v => ({ none: 'None reported', minor: 'Reported (minor)', major: 'Major', unknown: 'Not stated' }[v.accidents] || v.accidents)],
    ['Tax rate', v => `${(outTheDoor(v).rate * 100).toFixed(1)}%`],
    ['Where', v => v.location || '—'],
    ['Open items', v => {
      const items = checksFor(v), done = doneChecks[v.id] || {};
      return `${items.filter(t => !done[t]).length} left`;
    }],
  ];

  const head = `<tr><th></th>${picked.map(v =>
    `<th>${v.year} ${v.make} ${v.model}<br><span class="sub">${v.trim || ''}</span></th>`).join('')}</tr>`;

  const body = rows.map(([label, fn]) => {
    const vals = picked.map(fn);
    // Highlight the best cell for the rows where "best" is unambiguous.
    let bestIdx = -1;
    if (label === 'Out the door' || label === 'Monthly' || label === 'Sticker') {
      const nums = picked.map(v => label === 'Monthly' ? paymentFor(v)
        : label === 'Sticker' ? Number(v.price) : outTheDoor(v).total);
      bestIdx = nums.indexOf(Math.min(...nums));
    } else if (label === 'Score') {
      const nums = picked.map(v => scoreListing(v).total);
      bestIdx = nums.indexOf(Math.max(...nums));
    } else if (label === 'Mileage') {
      const nums = picked.map(v => Number(v.miles));
      bestIdx = nums.indexOf(Math.min(...nums));
    }
    return `<tr><td class="lbl">${label}</td>${vals.map((val, i) =>
      `<td class="${i === bestIdx ? 'best' : ''}">${val}</td>`).join('')}</tr>`;
  }).join('');

  $('#cmpTable').innerHTML = head + body;
}

// Rebuilds the make dropdown's options without discarding the current selection,
// so re-syncing from the repo doesn't silently reset what you were looking at.
function refreshMakeFilter() {
  const sel = $('#filterMake');
  const current = sel.value;
  const makes = [...new Set(listings.map(v => v.make))].filter(Boolean).sort();
  sel.innerHTML = `<option value="__all__">All makes</option>`
    + makes.map(m => `<option value="${m}">${m}</option>`).join('');
  sel.value = makes.includes(current) ? current : '__all__';
}

function render() {
  refreshMakeFilter();
  renderStats();
  renderCompare();
  const host = $('#listings');
  host.innerHTML = '';

  let rows = listings;
  if ($('#hideDead').checked) rows = rows.filter(v => !['sold', 'passed'].includes(v.status));
  if ($('#budgetOnly').checked) rows = rows.filter(v => Number(v.price) <= CRITERIA.price.target);
  const makeFilter = $('#filterMake').value;
  if (makeFilter !== '__all__') rows = rows.filter(v => v.make === makeFilter);

  if (!rows.length) {
    host.innerHTML = `<p class="empty">No listings yet. Add one below, or load the sample data from the repo.</p>`;
    return;
  }

  for (const v of sortListings(rows)) {
    const s = scoreListing(v);
    const node = $('#cardTpl').content.cloneNode(true);
    const card = node.querySelector('.card');
    card.dataset.id = v.id;
    if (['sold', 'passed'].includes(v.status)) card.classList.add('dead');

    node.querySelector('.card-title').textContent =
      `${v.year} ${v.make} ${v.model}${v.trim ? ' ' + v.trim : ''}`;

    const scoreEl = node.querySelector('.score');
    node.querySelector('.score-num').textContent = s.total;
    scoreEl.classList.add(s.total >= 80 ? 'good' : s.total >= 60 ? 'ok' : 'poor');

    const bits = [
      `${Number(v.miles).toLocaleString()} mi`,
      v.drive === 'awd' ? 'AWD' : 'FWD',
      v.title === 'clean' ? 'Clean title' : `${v.title} title`,
      v.location || null,
      v.dealer || null,
      `status: ${v.status}`,
    ].filter(Boolean);
    node.querySelector('.card-sub').textContent = bits.join(' · ');

    const flags = node.querySelector('.flags');
    flags.innerHTML = s.flags.map(f => `<li class="flag ${f.level}">${f.text}</li>`).join('');

    node.querySelector('.price').textContent = money(v.price);
    node.querySelector('.monthly').textContent = `≈ ${money(Math.round(paymentFor(v)))}/mo`;
    const hist = v.history || [];
    const delta = hist.length > 1 ? v.price - hist[0].price : 0;
    const dEl = node.querySelector('.pricedelta');
    if (delta !== 0) {
      dEl.textContent = `${delta < 0 ? '▼' : '▲'} ${money(Math.abs(delta))} since first seen`;
      dEl.classList.add(delta < 0 ? 'down' : 'up');
    }

    // Out-the-door cost: sticker is what you search on, this is what you actually pay.
    const otd = outTheDoor(v);
    node.querySelector('.otd-total').textContent = money(Math.round(otd.total));
    const caveats = [];
    if (!otd.cityKnown) caveats.push('city rate assumed');
    if (otd.docIsEstimate) caveats.push('doc fee estimated');
    if (otd.vltIsEstimate) caveats.push('MSRP estimated');
    if (!otd.vlt) caveats.push('no VLT — MSRP unknown');
    node.querySelector('.otd-note').textContent = caveats.length ? `(${caveats.join(', ')})` : '';

    const rows = [
      ['Sticker price', money(otd.price)],
      [`AZ tax (${(otd.rate * 100).toFixed(1)}%)`, money(Math.round(otd.tax))],
      [otd.doc === 0 ? 'Doc fee (already in price)' : 'Dealer doc fee', money(Math.round(otd.doc))],
      ['Title, reg &amp; plate', money(otd.reg)],
    ];
    if (otd.shipping) rows.push(['Shipping', money(otd.shipping)]);
    if (otd.vlt) rows.push(['Vehicle License Tax (yr 1)', money(Math.round(otd.vlt))]);
    rows.push(['<strong>Total</strong>', `<strong>${money(Math.round(otd.total))}</strong>`]);
    node.querySelector('.otd-table').innerHTML =
      rows.map(([k, val]) => `<tr><td>${k}</td><td class="num">${val}</td></tr>`).join('');

    // What comparable local cars are actually asking, plus a way out to KBB.
    const vb = node.querySelector('.valuebox');
    const cmpRange = comparableRange(v, marketPoints);
    const kbb = `<a href="${kbbUrl(v)}" target="_blank" rel="noopener noreferrer">KBB value &rarr;</a>`;
    if (cmpRange) {
      const d = cmpRange.delta;
      const verdict = d < -750 ? 'below' : d > 750 ? 'above' : 'in line with';
      const cls = d < -750 ? 'good' : d > 750 ? 'bad' : '';
      vb.innerHTML =
        `<span class="vb-label">Comparable asking prices</span>
         <span class="vb-range">${money(cmpRange.low)} – ${money(cmpRange.high)}</span>
         <span class="vb-mid">median ${money(Math.round(cmpRange.median))} · ${cmpRange.n} car${cmpRange.n === 1 ? '' : 's'}${cmpRange.widened ? ', widened search' : ''}</span>
         <span class="vb-verdict ${cls}">This one is ${verdict} the median${d ? ` (${d > 0 ? '+' : '−'}${money(Math.round(Math.abs(d)))})` : ''}</span>
         <span class="vb-kbb">${kbb}</span>`;
    } else {
      vb.innerHTML = `<span class="vb-label">Comparable asking prices</span>
        <span class="vb-mid">Not enough similar local listings to build a range.</span>
        <span class="vb-kbb">${kbb}</span>`;
    }

    // Depreciation, shown alongside the value box. Two cars at the same price can be
    // holding value very differently, and that is the resale criterion in a number.
    const dep = depreciation(v);
    if (dep && dep.lostPerYear != null) {
      const fast = dep.lostPerYear >= 12, slow = dep.lostPerYear <= 4;
      const cls = slow ? 'good' : fast ? 'bad' : '';
      vb.insertAdjacentHTML('beforeend',
        `<span class="vb-dep ${cls}">Holding ${Math.round(dep.retainedPct)}% of its
         ${money(dep.msrp)} sticker · losing ${dep.lostPerYear.toFixed(1)}%/yr ·
         driven ${dep.milesPerYear.toLocaleString()} mi/yr</span>`);
    }

    // The research behind the score. Without this the card shows "Title & history 11/15"
    // and no hint that it is because an accident is reported.
    const notesEl = node.querySelector('.notes');
    if (v.notes) notesEl.textContent = v.notes; else notesEl.remove();

    // Pre-purchase checklist, ticked state kept per car across visits.
    const items = checksFor(v);
    const done = doneChecks[v.id] || {};
    const doneCount = items.filter(t => done[t]).length;
    node.querySelector('.checkcount').textContent = `(${doneCount}/${items.length})`;
    node.querySelector('.checklist').innerHTML = items.map((t, i) => {
      const specific = i < (v.checks || []).length;
      return `<li class="${specific ? 'specific' : ''}">
        <label><input type="checkbox" class="act-check" data-text="${t.replace(/"/g, '&quot;')}"
          ${done[t] ? 'checked' : ''}> <span>${t}</span></label></li>`;
    }).join('');

    node.querySelector('.act-cmp').checked = compareSet.has(v.id);

    // Recalls load on demand — one request per year/make/model, cached after that.
    const rc = node.querySelector('.recalls');
    rc.addEventListener('toggle', () => {
      if (rc.open) loadRecalls(v, rc);
    }, { once: true });

    node.querySelector('.breakdown').innerHTML = s.parts.map(p => {
      const pct = p.max ? Math.round((p.got / p.max) * 100) : 0;
      return `<div class="bar"><span class="bl">${p.label}</span>
        <span class="bt"><i style="width:${pct}%"></i></span>
        <span class="bv">${Math.round(p.got)}/${p.max}</span></div>`;
    }).join('');

    const link = node.querySelector('.link');
    if (v.url) link.href = v.url; else link.remove();

    const ol = node.querySelector('.history ol');
    ol.innerHTML = hist.map(h => `<li>${h.date} — ${money(h.price)}</li>`).join('') || '<li>No history yet</li>';

    host.appendChild(node);
  }
}

/* ---------- actions ---------- */

function today() { return new Date().toISOString().slice(0, 10); }

function onSubmit(e) {
  e.preventDefault();
  const data = readForm();
  const id = $('#editId').value;

  if (id) {
    const i = listings.findIndex(v => v.id === id);
    if (i > -1) {
      const prev = listings[i];
      const hist = prev.history || [];
      // Only append history when the price actually moved.
      if (Number(prev.price) !== Number(data.price)) hist.push({ date: today(), price: data.price });
      listings[i] = { ...prev, ...data, history: hist };
    }
  } else {
    listings.push({
      ...data,
      id: crypto.randomUUID(),
      added: today(),
      history: [{ date: today(), price: data.price }],
    });
  }

  save(); render(); resetForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function onListClick(e) {
  const card = e.target.closest('.card');
  if (!card) return;
  const id = card.dataset.id;
  const v = listings.find(x => x.id === id);
  if (!v) return;

  if (e.target.classList.contains('act-check')) {
    const text = e.target.dataset.text;
    doneChecks[id] = doneChecks[id] || {};
    if (e.target.checked) doneChecks[id][text] = true;
    else delete doneChecks[id][text];
    saveChecks();
    // Update the count in place — a full re-render would collapse the open <details>.
    const items = checksFor(v);
    const done = doneChecks[id] || {};
    card.querySelector('.checkcount').textContent =
      `(${items.filter(t => done[t]).length}/${items.length})`;
    renderCompare();
    return;
  }

  if (e.target.classList.contains('act-copyvin')) {
    const btn = e.target;
    navigator.clipboard.writeText(btn.dataset.vin).then(
      () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy VIN'; }, 1500); },
      () => { btn.textContent = 'Copy failed'; }
    );
    return;
  }

  if (e.target.classList.contains('act-cmp')) {
    if (e.target.checked) compareSet.add(id); else compareSet.delete(id);
    renderCompare();
    return;
  }

  if (e.target.classList.contains('act-edit')) {
    fillForm(v);
    $('#formTitle').textContent = 'Edit listing';
    $('#submitBtn').textContent = 'Save changes';
    $('#listingForm').scrollIntoView({ behavior: 'smooth' });
  }

  if (e.target.classList.contains('act-del')) {
    if (confirm(`Delete the ${v.year} ${v.make} ${v.model}?`)) {
      listings = listings.filter(x => x.id !== id);
      save(); render();
    }
  }

  if (e.target.classList.contains('act-price')) {
    const input = prompt(`New price for the ${v.year} ${v.make} ${v.model}?`, v.price);
    if (input === null) return;
    const n = Number(input.replace(/[^0-9.]/g, ''));
    if (!n) return;
    if (n !== Number(v.price)) {
      v.history = v.history || [];
      v.history.push({ date: today(), price: n });
      v.price = n;
      save(); render();
    }
  }
}

/* ---------- import / export ---------- */

function exportJson() {
  const blob = new Blob([JSON.stringify(listings, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'listings.json';
  a.click();
  URL.revokeObjectURL(a.href);
  status('Exported. Save it over data/listings.json and commit to publish.');
}

function importJson(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!Array.isArray(data)) throw new Error('Expected an array');
      listings = data;
      save(); render();
      status(`Imported ${data.length} listing(s).`);
    } catch (e) {
      status(`Import failed: ${e.message}`);
    }
  };
  r.readAsText(file);
}

function mergeHistory(a = [], b = []) {
  const seen = new Set();
  return [...a, ...b]
    .filter(h => {
      const k = `${h.date}|${h.price}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((x, y) => String(x.date).localeCompare(String(y.date)));
}

// The repo file is the maintained dataset, so it wins on vehicle facts and price.
// The one thing it must not stomp is a status the user set themselves — marking a car
// "passed" should survive the next sync.
async function syncFromRepo({ quiet = false } = {}) {
  try {
    const res = await fetch('data/listings.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const repo = await res.json();
    if (!Array.isArray(repo)) throw new Error('Expected an array');

    const byId = new Map(listings.map(v => [v.id, v]));
    let added = 0, priceChanged = 0;

    for (const r of repo) {
      const local = byId.get(r.id);
      if (!local) {
        listings.push({ ...r, source: 'repo' });
        added++;
        continue;
      }
      const userSetStatus = local.status && local.status !== 'watching';
      if (Number(local.price) !== Number(r.price)) priceChanged++;
      Object.assign(local, r, {
        status: userSetStatus ? local.status : r.status,
        history: mergeHistory(local.history, r.history),
        source: 'repo',
      });
    }

    save();
    render();

    if (!quiet || added || priceChanged) {
      const bits = [];
      if (added) bits.push(`${added} new`);
      if (priceChanged) bits.push(`${priceChanged} price change${priceChanged > 1 ? 's' : ''}`);
      status(bits.length ? `Synced: ${bits.join(', ')}.` : `Up to date (${repo.length} listing(s)).`);
    }
  } catch (e) {
    // On the published site this is the only data source, so say so plainly.
    if (!listings.length) {
      $('#listings').innerHTML =
        `<p class="empty">Could not load listings: ${e.message}</p>`;
    }
    status(`Could not load repo data: ${e.message}`);
  }
}

/* ---------- init ---------- */

function syncFinanceInputs() {
  $('#fDown').value = finance.downPayment;
  $('#fApr').value = finance.apr;
  $('#fTerm').value = finance.termMonths;
  $('#financeNote').textContent =
    `${money(finance.downPayment)} down · ${finance.apr}% APR · ${finance.termMonths} mo`;
}

function onFinanceChange() {
  finance.downPayment = Math.max(0, Number($('#fDown').value) || 0);
  finance.apr = Math.max(0, Number($('#fApr').value) || 0);
  finance.termMonths = Number($('#fTerm').value) || 60;
  savePrefs();
  syncFinanceInputs();
  render();
}

function init() {
  buildChecks();
  loadPrefs();
  load();
  syncFinanceInputs();
  render();

  for (const id of ['fDown', 'fApr', 'fTerm']) {
    $('#' + id).addEventListener('change', onFinanceChange);
  }
  $('#budgetOnly').addEventListener('change', render);
  $('#filterMake').addEventListener('change', render);
  $('#clearCompare').addEventListener('click', () => {
    compareSet.clear();
    render();
  });

  $('#listingForm').addEventListener('submit', onSubmit);
  $('#listings').addEventListener('click', onListClick);
  $('#resetForm').addEventListener('click', resetForm);
  $('#decodeVin').addEventListener('click', decodeVin);
  $('#sort').addEventListener('change', render);
  $('#hideDead').addEventListener('change', render);
  $('#exportBtn').addEventListener('click', exportJson);
  $('#loadRepoBtn').addEventListener('click', () => syncFromRepo({ quiet: false }));

  // Pull the maintained dataset on every visit — otherwise the published site shows
  // an empty page to anyone who has not clicked the sync button.
  syncFromRepo({ quiet: true });

  // Comparable-price data. Failure here only costs the value box, so don't block on it.
  fetch('data/market.json', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(d => { if (d && Array.isArray(d.points)) { marketPoints = d.points; render(); } })
    .catch(() => { /* value box degrades to the KBB link alone */ });
  $('#importFile').addEventListener('change', e => {
    if (e.target.files[0]) importJson(e.target.files[0]);
  });
}

document.addEventListener('DOMContentLoaded', init);
