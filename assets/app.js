/* Car Tracker — no build step, no dependencies. */

const STORE_KEY = 'car-tracker/listings/v1';
const $ = sel => document.querySelector(sel);

let listings = [];

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
    case 'price-asc':  return c.sort((a, b) => a.price - b.price);
    case 'price-desc': return c.sort((a, b) => b.price - a.price);
    case 'miles':      return c.sort((a, b) => a.miles - b.miles);
    case 'year':       return c.sort((a, b) => b.year - a.year);
    case 'added':      return c.sort((a, b) => (b.added || '').localeCompare(a.added || ''));
    default:           return c.sort((a, b) => s(b) - s(a));
  }
}

function render() {
  renderStats();
  const host = $('#listings');
  host.innerHTML = '';

  let rows = listings;
  if ($('#hideDead').checked) rows = rows.filter(v => !['sold', 'passed'].includes(v.status));

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
    const hist = v.history || [];
    const delta = hist.length > 1 ? v.price - hist[0].price : 0;
    const dEl = node.querySelector('.pricedelta');
    if (delta !== 0) {
      dEl.textContent = `${delta < 0 ? '▼' : '▲'} ${money(Math.abs(delta))} since first seen`;
      dEl.classList.add(delta < 0 ? 'down' : 'up');
    }

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

function init() {
  buildChecks();
  load();
  render();

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
  $('#importFile').addEventListener('change', e => {
    if (e.target.files[0]) importJson(e.target.files[0]);
  });
}

document.addEventListener('DOMContentLoaded', init);
