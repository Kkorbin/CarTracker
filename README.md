# Car Tracker

A single-page app for tracking used compact SUV listings against a fixed set of buying
criteria, scoring each one, and watching prices move over time.

Search criteria live in [CRITERIA.md](CRITERIA.md). The scoring rules that implement them
live in [`assets/criteria.js`](assets/criteria.js) — edit that file to retune what counts
as a good car.

## Running it

No build step, no dependencies, nothing to install.

**Easiest:** double-click `index.html`. Everything works except the **Load from repo**
button, which needs a real `http://` origin because `fetch` cannot read `file://` URLs.

**With a local server** (needed only for that button). If you have Python or Node:

```bash
python -m http.server 8000
```

If you have neither, Windows PowerShell can serve the folder on its own:

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Then visit http://localhost:8765.

Once the site is published to GitHub Pages, the hosted URL is the simplest way to use
it — including from your phone at a dealership.

## How it works

1. **Add a listing.** Paste the dealer's vehicle-detail URL and fill in the details.
2. **Decode the VIN.** The Decode button calls [NHTSA's vPIC API](https://vpic.nhtsa.dot.gov/api/)
   — free, no key, no registration — to fill in year, make, model, and trim.
3. **Read the score.** Each listing is scored out of 100 against the criteria, with a
   per-category breakdown and flags for anything disqualifying.
4. **Track the price.** *Update price* appends to that listing's price history, so you can
   see what has dropped and by how much.

### Scoring weights

| Category | Weight |
| --- | --- |
| Safety & driver assistance | 30 |
| Price | 20 |
| Mileage | 20 |
| Title & history | 15 |
| Trim | 10 |
| Year | 5 |
| AWD + comfort features | up to +5 bonus |

Mileage is judged two ways: against an ~11,000 miles/year age baseline (producing the
Excellent → Very High bands), plus a bonus for landing in the 45k–60k sweet spot.

## Saving your data

Listings are held in browser `localStorage` as you work, which is per-browser and not
shared. To persist them into the repo:

1. Click **Export JSON**.
2. Save the file over `data/listings.json`.
3. Commit it.

**Load from repo** pulls that committed file back in, which is also how the published
site shows your listings to anyone you share it with.

## On automated listing data

This app deliberately does not scrape Autotrader, Cars.com, CarGurus, or similar sites —
they prohibit it in their terms and actively block bots, so anything built that way would
be both against the rules and constantly broken.

Paid listing APIs exist if automated ingestion becomes worth it later
([MarketCheck](https://www.marketcheck.com/apis/cars/), [Auto.dev](https://www.auto.dev/listings)).
Adding one would mean a scheduled job writing to `data/listings.json`; the rest of the app
would not need to change.
