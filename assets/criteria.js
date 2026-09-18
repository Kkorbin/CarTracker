/* Scoring rules derived from CRITERIA.md. Edit here to retune what "good" means. */

const CRITERIA = {
  currentYear: 2026,
  milesPerYear: 11000,

  // Retargeted 2026-09-16: the goal is roughly $18k sticker so the out-the-door
  // number lands near $20k. Budget applies to STICKER, since that is how listings
  // are priced and searched — Phoenix tax plus a doc fee adds about $2,200 on an
  // $18k car, so read both numbers on every card.
  price: { budgetLow: 16500, target: 19000, stretch: 21500, ceiling: 23000 },
  miles: { idealLow: 45000, idealHigh: 60000, hardHigh: 100000 },
  year:  { preferredLow: 2021, preferredHigh: 2024 },

  // Minimum acceptable trim per model. Matched case-insensitively as substrings.
  trimFloor: {
    'rav4':     ['xle', 'xse', 'limited', 'adventure', 'trd', 'platinum'],
    'cr-v':     ['ex', 'ex-l', 'sport', 'touring'],
    'crv':      ['ex', 'ex-l', 'sport', 'touring'],
    'cx-5':     ['touring', 'preferred', 'grand touring', 'carbon', 'premium', 'signature'],
    'cx5':      ['touring', 'preferred', 'grand touring', 'carbon', 'premium', 'signature'],
    'forester': ['premium', 'limited', 'touring', 'sport', 'wilderness'],

    // Added 2026-09-16. Base trims are excluded because they drop the safety kit:
    // Tucson SE, Sportage LX, CX-30 base. Crosstrek base likewise.
    'tucson':    ['sel', 'limited', 'ultimate', 'n line', 'xrt', 'value'],
    'sportage':  ['s', 'ex', 'sx', 'x-line', 'x-pro', 'prestige'],
    'crosstrek': ['premium', 'sport', 'limited', 'wilderness'],
    'cx-30':     ['select', 'preferred', 'premium', 'carbon', 'turbo'],
    'cx30':      ['select', 'preferred', 'premium', 'carbon', 'turbo'],
  },

  safety: [
    { id: 'carplay',   label: 'Apple CarPlay',              weight: 8, essential: true },
    { id: 'acc',       label: 'Adaptive cruise control',    weight: 5 },
    { id: 'bsm',       label: 'Blind-spot monitoring',      weight: 5 },
    { id: 'rcta',      label: 'Rear cross-traffic alert',   weight: 4 },
    { id: 'aeb',       label: 'Automatic emergency braking', weight: 4 },
    { id: 'lane',      label: 'Lane departure / keep assist', weight: 4 },
  ],

  comfort: [
    { id: 'heatedseats',  label: 'Heated seats' },
    { id: 'liftgate',     label: 'Power liftgate' },
    { id: 'moonroof',     label: 'Moonroof' },
    { id: 'leather',      label: 'Leather / leatherette' },
    { id: 'powerseats',   label: 'Power seats' },
    { id: 'memoryseats',  label: 'Memory seats' },
    { id: 'remotestart',  label: 'Remote start' },
  ],

  weights: { safety: 30, price: 20, miles: 20, title: 15, trim: 10, year: 5 },

  // Hard ceilings applied when a dealbreaker is present, so no amount of
  // equipment or low mileage can float a car you said you'd avoid.
  caps: {
    brandedTitle:     35,  // salvage / rebuilt / flood / other branded
    majorDamage:      45,  // major or structural damage
    missingEssential: 75,  // missing a feature marked essential (Apple CarPlay)
  },

  // Arizona purchase costs.
  fees: {
    // TPT ("sales tax") is levied at the DEALER's city rate, not the buyer's, so a
    // Scottsdale dealer is cheaper than a Phoenix one on the same car. Only rates
    // actually verified are listed; anything else falls back to the Phoenix rate,
    // which is the highest of the group and so errs toward over-estimating.
    // Verified 2026-09-12. Exact rate depends on the dealer's street address.
    tptByCity: {
      'phoenix':    0.086,  // 5.6 state + 0.7 Maricopa + 2.3 city
      'scottsdale': 0.080,
      'peoria':     0.081,
      'gilbert':    0.083,
      'mesa':       0.083,
    },
    defaultTpt: 0.086,

    // Arizona does not cap dealer doc fees. Used where a listing doesn't state one.
    defaultDocFee: 599,

    // Title $4 + registration $8 + plate $5 + air quality $1.50.
    titleRegPlate: 18.50,

    // Vehicle License Tax, collected at registration. Assessed on 60% of the
    // ORIGINAL MSRP, reduced 16.25% for each year since new, taxed at $2.89 per
    // $100 of that value. What you actually pay for the car is irrelevant to it,
    // which is why a cheap late-model car still carries a high VLT.
    vlt: { assessedShare: 0.60, annualDecline: 0.1625, ratePer100: 2.89 },
  },

  // Financing defaults. These are starting points for the estimate, not a quote —
  // your own pre-approval rate is the number that matters, so it's editable.
  finance: { downPayment: 3000, apr: 8.5, termMonths: 60 },

  // Applies to every car, on top of whatever that specific listing needs checked.
  // Written as things to DO, in the order you'd do them.
  standardChecks: [
    'Run the VIN check on the card for UNREPAIRED recalls on this specific car, and have the dealer complete any that come back (free at a franchise dealer)',
    'Get an independent pre-purchase inspection — not the selling dealer\'s',
    'Test drive on the freeway, not just around the block',
    'Check tire tread and date codes — four tires is ~$800',
    'Confirm the out-the-door number in writing before agreeing to anything',
    'Ask what add-ons are pre-installed and whether they can be removed',
  ],
};

/* ---------- helpers ---------- */

function expectedMiles(year) {
  const age = Math.max(0, CRITERIA.currentYear - year);
  return age * CRITERIA.milesPerYear;
}

// Ratio of actual to age-expected mileage, bucketed the way CRITERIA.md describes.
function mileageBand(miles, year) {
  const expected = expectedMiles(year);
  if (expected <= 0) return { band: 'excellent', ratio: 0 };
  const ratio = miles / expected;
  if (ratio <= 0.60) return { band: 'excellent', ratio };
  if (ratio <= 0.90) return { band: 'good', ratio };
  if (ratio <= 1.10) return { band: 'normal', ratio };
  if (ratio <= 1.35) return { band: 'upper end', ratio };
  if (ratio <= 1.70) return { band: 'high', ratio };
  return { band: 'very high', ratio };
}

function trimMeetsFloor(model, trim) {
  const key = String(model || '').toLowerCase().replace(/\s+/g, '');
  const floors = CRITERIA.trimFloor[key] || CRITERIA.trimFloor[String(model || '').toLowerCase()];
  if (!floors) return null;            // unknown model — don't judge
  if (!trim) return false;
  const t = String(trim).toLowerCase();
  return floors.some(f => t.includes(f));
}

/* ---------- Arizona cost of purchase ---------- */

function tptRateFor(location) {
  const city = String(location || '').split(',')[0].trim().toLowerCase();
  return CRITERIA.fees.tptByCity[city] ?? CRITERIA.fees.defaultTpt;
}

function estimateVlt(msrp, year) {
  const base = Number(msrp);
  if (!base) return null;
  const { assessedShare, annualDecline, ratePer100 } = CRITERIA.fees.vlt;
  const age = Math.max(0, CRITERIA.currentYear - Number(year));
  const assessed = base * assessedShare * Math.pow(1 - annualDecline, age);
  return (assessed / 100) * ratePer100;
}

// Everything you actually hand over to drive away, not just the advertised price.
function outTheDoor(v) {
  const price = Number(v.price) || 0;
  const rate = tptRateFor(v.location);
  const tax = price * rate;
  const docKnown = v.docFee != null && v.docFee !== '';
  const doc = docKnown ? Number(v.docFee) : CRITERIA.fees.defaultDocFee;
  const reg = CRITERIA.fees.titleRegPlate;
  const vlt = estimateVlt(v.msrp, v.year);
  // Online sellers ship. A cheap car 1,300 miles away is not a cheap car.
  const shipping = Number(v.shipping) || 0;

  return {
    price, rate, tax, doc, reg, vlt, shipping,
    total: price + tax + doc + reg + (vlt || 0) + shipping,
    docIsEstimate: !docKnown,
    vltIsEstimate: Boolean(v.msrpEstimated),
    cityKnown: Object.prototype.hasOwnProperty.call(
      CRITERIA.fees.tptByCity, String(v.location || '').split(',')[0].trim().toLowerCase()
    ),
  };
}

// Standard amortised loan payment. Handles 0% without dividing by zero.
function monthlyPayment(principal, apr, months) {
  const p = Math.max(0, Number(principal) || 0);
  const n = Math.max(1, Number(months) || 1);
  const r = (Number(apr) || 0) / 100 / 12;
  if (p === 0) return 0;
  if (r === 0) return p / n;
  const f = Math.pow(1 + r, n);
  return p * r * f / (f - 1);
}

/* ---------- recalls (NHTSA, free, no key) ---------- */

const _recallCache = new Map();

async function fetchRecalls(v) {
  const key = `${v.year}|${v.make}|${v.model}`.toLowerCase();
  if (_recallCache.has(key)) return _recallCache.get(key);

  const url = 'https://api.nhtsa.gov/recalls/recallsByVehicle'
    + `?make=${encodeURIComponent(v.make)}`
    + `&model=${encodeURIComponent(v.model)}`
    + `&modelYear=${encodeURIComponent(v.year)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  const list = (data.results || []).map(r => ({
    campaign: r.NHTSACampaignNumber,
    component: r.Component,
    summary: r.Summary,
    consequence: r.Consequence,
    remedy: r.Remedy,
    // NHTSA flags the severe ones explicitly.
    parkIt: Boolean(r.parkIt),
    parkOutside: Boolean(r.parkOutSide),
  }));
  _recallCache.set(key, list);
  return list;
}

/* ---------- what a comparable car actually sells for ---------- */

// KBB's own widget will not hand over a number to automation, so this derives a
// range from the local listings we collected instead. Same make and model, similar
// mileage and year — and it names how many cars are behind the number so you can
// judge it, which a single KBB figure never tells you.
function comparableRange(v, points) {
  if (!Array.isArray(points) || !points.length) return null;

  const pick = (milesWindow, yearWindow) => points.filter(p =>
    p.make === v.make && p.model === v.model &&
    Math.abs(p.miles - v.miles) <= milesWindow &&
    Math.abs(p.year - v.year) <= yearWindow
  );

  let set = pick(15000, 2);
  let widened = false;
  if (set.length < 3) { set = pick(25000, 3); widened = true; }
  if (set.length < 3) return null;

  const prices = set.map(p => p.price).sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;

  return {
    low: prices[0],
    high: prices[prices.length - 1],
    median,
    n: prices.length,
    widened,
    delta: v.price - median,
  };
}

// NHTSA's public API is year/make/model only — there is no VIN endpoint, and their
// VIN tool is reCAPTCHA-protected, so per-car status has to be a link you click.
// Manufacturers run their own VIN lookups, which are usually the faster route.
const MFR_RECALL_LOOKUP = {
  honda:  'https://owners.honda.com/recalls-campaigns',
  toyota: 'https://www.toyota.com/recall/',
  mazda:  'https://www.mazdausa.com/owners/recalls',
  subaru: 'https://www.subaru.com/vehicle-recalls.html',
};

function mfrRecallUrl(make) {
  return MFR_RECALL_LOOKUP[String(make || '').toLowerCase()] || null;
}

// How much of the original sticker the car still commands, and how fast it shed the
// rest. Resale value is an explicit criterion but nothing in the score captured it,
// because depreciation is a property of the badge rather than of this particular car.
// Shown as information, deliberately not folded into the 0-100.
function depreciation(v) {
  const msrp = Number(v.msrp);
  if (!msrp) return null;
  const age = Math.max(0, CRITERIA.currentYear - Number(v.year));
  const retained = Number(v.price) / msrp;
  const lost = 1 - retained;
  return {
    msrp,
    retainedPct: retained * 100,
    lostPct: lost * 100,
    age,
    lostPerYear: age > 0 ? (lost * 100) / age : null,
    milesPerYear: age > 0 ? Math.round(Number(v.miles) / age) : Number(v.miles),
  };
}

function kbbUrl(v) {
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `https://www.kbb.com/${slug(v.make)}/${slug(v.model)}/${v.year}/`;
}

/* ---------- Arizona registration quirks ---------- */

// Area A (Phoenix metro) exempts the five newest model years. Everything older
// tests every two years before it can be registered.
function needsEmissionsTest(year) {
  return (CRITERIA.currentYear - Number(year)) >= 5;
}

/* ---------- scoring ---------- */

function scoreListing(v) {
  const parts = [];
  const flags = [];
  // Dealbreakers can't be expressed as weights — losing all 15 title points still
  // leaves 85, which would let a rebuilt-title wreck outrank a clean car. Anything
  // pushed here caps the final score outright.
  const caps = [];
  const W = CRITERIA.weights;

  // --- Safety (30) ---
  let safetyPts = 0;
  const safetyMax = CRITERIA.safety.reduce((s, f) => s + f.weight, 0);
  for (const f of CRITERIA.safety) {
    if (v.features && v.features[f.id]) safetyPts += f.weight;
    else if (f.essential) {
      flags.push({ level: 'bad', text: `No ${f.label}` });
      caps.push(CRITERIA.caps.missingEssential);
    }
  }
  const safety = (safetyPts / safetyMax) * W.safety;
  parts.push({ label: 'Safety', got: safety, max: W.safety });

  // --- Price (20) ---
  const p = Number(v.price) || 0;
  let priceScore;
  if (p <= CRITERIA.price.target) priceScore = 1;
  else if (p <= CRITERIA.price.stretch) priceScore = 0.75;
  else if (p <= CRITERIA.price.ceiling) priceScore = 0.4;
  else priceScore = 0.1;
  if (p > CRITERIA.price.stretch) flags.push({ level: 'warn', text: `$${p.toLocaleString()} is over budget` });
  const price = priceScore * W.price;
  parts.push({ label: 'Price', got: price, max: W.price });

  // --- Mileage (20) ---
  const m = Number(v.miles) || 0;
  const { band, ratio } = mileageBand(m, Number(v.year));
  // Scored on absolute mileage first, because that is how the preference was stated:
  // 45k-60k good, 80k-100k+ avoid. Judging by the 11k/yr age ratio alone punished a
  // 2022 at 66k as harshly as a genuinely worn-out car, which is not the intent.
  const inSweetSpot = m >= CRITERIA.miles.idealLow && m <= CRITERIA.miles.idealHigh;
  let mileScore;
  if (m <= CRITERIA.miles.idealLow)       mileScore = 1;
  else if (m <= CRITERIA.miles.idealHigh) mileScore = 0.95;
  else if (m <= 75000)                    mileScore = 0.70;
  else if (m <= 90000)                    mileScore = 0.45;
  else if (m <= CRITERIA.miles.hardHigh)  mileScore = 0.25;
  else                                    mileScore = 0.10;

  // The age ratio survives as a nudge only — enough to reward an older car carrying
  // light miles, not enough to overturn the absolute judgment above.
  if (ratio > 0 && ratio <= 0.70)      mileScore = Math.min(1, mileScore + 0.05);
  else if (ratio >= 1.60)              mileScore = Math.max(0.10, mileScore - 0.05);
  if (m > CRITERIA.miles.hardHigh) { mileScore = Math.min(mileScore, 0.15); flags.push({ level: 'bad', text: `${m.toLocaleString()} miles is very high` }); }
  const miles = mileScore * W.miles;
  // Label the absolute band being scored, not the age ratio — showing "high" next to
  // 14/20 just looks like a bug.
  const mileLabel =
    inSweetSpot        ? 'sweet spot' :
    m <= CRITERIA.miles.idealLow ? 'low' :
    m <= 75000         ? 'a bit high' :
    m <= 90000         ? 'high' :
    m <= CRITERIA.miles.hardHigh ? 'very high' : 'excessive';
  parts.push({ label: `Mileage (${mileLabel})`, got: miles, max: W.miles });

  // --- Title & history (15) ---
  let titleScore = { clean: 1, unknown: 0.5, salvage: 0, rebuilt: 0, flood: 0, 'other-branded': 0.1 }[v.title] ?? 0.5;
  const branded = ['salvage', 'rebuilt', 'flood', 'other-branded'].includes(v.title);
  if (branded) {
    flags.push({ level: 'bad', text: `${v.title} title` });
    caps.push(CRITERIA.caps.brandedTitle);
  }
  if (v.title === 'unknown') flags.push({ level: 'warn', text: 'Title status not stated' });
  const accPenalty = { none: 0, unknown: 0.2, minor: 0.3, major: 0.8 }[v.accidents] ?? 0.2;
  if (v.accidents === 'major') {
    flags.push({ level: 'bad', text: 'Major / structural damage' });
    caps.push(CRITERIA.caps.majorDamage);
  }
  titleScore = Math.max(0, titleScore - accPenalty);
  const title = titleScore * W.title;
  parts.push({ label: 'Title & history', got: title, max: W.title });

  // --- Trim (10) ---
  const meets = trimMeetsFloor(v.model, v.trim);
  let trimScore = meets === null ? 0.7 : (meets ? 1 : 0.25);
  if (meets === false) flags.push({ level: 'warn', text: `${v.trim || 'Trim'} is below your floor for ${v.model}` });
  const trim = trimScore * W.trim;
  parts.push({ label: 'Trim', got: trim, max: W.trim });

  // --- Year (5) ---
  const y = Number(v.year) || 0;
  let yearScore;
  if (y >= CRITERIA.year.preferredLow && y <= CRITERIA.year.preferredHigh) yearScore = 1;
  else if (y > CRITERIA.year.preferredHigh) yearScore = 1;
  else if (y === CRITERIA.year.preferredLow - 1) yearScore = 0.6;
  else yearScore = 0.25;
  const year = yearScore * W.year;
  parts.push({ label: 'Year', got: year, max: W.year });

  // --- Bonuses (up to +5, uncapped total stays <= 100) ---
  let bonus = 0;
  if (v.drive === 'awd') bonus += 2;
  const comfortCount = CRITERIA.comfort.filter(c => v.features && v.features[c.id]).length;
  bonus += Math.min(3, comfortCount * 0.5);

  const base = safety + price + miles + title + trim + year;
  let total = Math.max(0, Math.min(100, Math.round(base + bonus)));

  // A single dealbreaker holds the whole score down, no matter how good the rest is.
  const cap = caps.length ? Math.min(...caps) : 100;
  if (total > cap) {
    total = cap;
    flags.push({ level: 'bad', text: `Score capped at ${cap} — dealbreaker present` });
  }

  // Value sanity check: unusually cheap for the spec is worth investigating.
  if (p > 0 && p < 15000 && y >= 2021) {
    flags.push({ level: 'warn', text: 'Suspiciously cheap — check for salvage, rental, or hidden fees' });
  }

  return { total, parts, flags, band, ratio, expected: expectedMiles(y) };
}
