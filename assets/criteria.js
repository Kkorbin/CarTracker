/* Scoring rules derived from CRITERIA.md. Edit here to retune what "good" means. */

const CRITERIA = {
  currentYear: 2026,
  milesPerYear: 11000,

  // Budget applies to the STICKER price, since that is how listings are priced and
  // searched. Tax and fees are computed separately and shown alongside — at Phoenix
  // rates a $23,000 car lands near $25,600 out the door, so read both numbers.
  price: { budgetLow: 18000, target: 23000, stretch: 25000, ceiling: 27000 },
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

  return {
    price, rate, tax, doc, reg, vlt,
    total: price + tax + doc + reg + (vlt || 0),
    docIsEstimate: !docKnown,
    vltIsEstimate: Boolean(v.msrpEstimated),
    cityKnown: Object.prototype.hasOwnProperty.call(
      CRITERIA.fees.tptByCity, String(v.location || '').split(',')[0].trim().toLowerCase()
    ),
  };
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
