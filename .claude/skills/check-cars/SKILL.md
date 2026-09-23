---
name: check-cars
description: Run the Car Tracker check - re-verify every active listing, record sold cars and price changes, publish. Use when asked to run a check, check the cars, or update the tracker's listings.
context: fork
agent: general-purpose
background: false
---

# Car Tracker check (runs in its own clean subagent)

You are running a routine check of the Car Tracker's used-car listings. You start
with no conversation history; everything you need is below. Every step you take
costs usage, so aim for four steps and do nothing extra.

**1. List** (one Bash call):

    MSYS_NO_PATHCONV=1 wsl -e python3 /mnt/c/Users/diazj/Desktop/car-tracker/scripts/check.py list

Each line is `id8|source|url|expect $headline|car`.

**2. Check everything in ONE message** (all calls in parallel):
- each `cars.com` URL: WebFetch with prompt
  `Still listed, or "no longer available"? Reply with only the current headline price, or SOLD.`
- all `carvana` and `carmax` URLs (they refuse WebFetch): ONE `browser_batch`, a
  `navigate` then a `javascript_tool` per URL running:

      await new Promise(r=>setTimeout(r,4000)); const t=document.body.innerText;
      ({url:location.href, price:(t.match(/\n\$([\d,]{5,7})\n/)||[])[1]||null,
        ship:(t.match(/\$([\d,]+) shipping/)||[])[1]||null,
        gone:/no longer available|has been sold|sale pending/i.test(t.slice(0,4000))})

  Record shipping for Carvana only. If browser tools are not available to you,
  skip those URLs; the apply step will list them as not checked.

**3. Apply, commit, publish** (one Bash call). Results map each id8 to
`{"seen": <headline price>}`, plus `"shipping": N` for Carvana, or `{"sold": true}`:

    cd /c/Users/diazj/Desktop/car-tracker && MSYS_NO_PATHCONV=1 wsl -e python3 /mnt/c/Users/diazj/Desktop/car-tracker/scripts/check.py apply - <<'JSON'
    {...}
    JSON
    git add data && git commit -qm "Check $(date +%F): <summary line printed by apply>" -m "Co-Authored-By: Claude <noreply@anthropic.com>" && git push -q origin main && for i in 1 2 3 4 5 6; do sleep 20; curl -s "https://kkorbin.github.io/CarTracker/data/meta.json?cb=$RANDOM" | grep -q "$(date +%F)" && { echo LIVE; break; }; done

**4. Final message** (it is passed back to the user's conversation): five lines or
fewer - what sold, price changes, anything not checked - then
https://kkorbin.github.io/CarTracker/

Do not take screenshots, read listings.json or source files, write new scripts,
write long commit messages or notes, or research anything.
