---
name: check-cars
description: Run the Car Tracker check - re-verify every active listing, record sold cars and price changes, publish. Use when asked to run a check, check the cars, or update the tracker's listings.
---

# Car Tracker check (lean)

Every step re-reads the whole conversation, so steps are the cost. Target: 4 steps.
Best run in a fresh conversation started in this folder.

**1. List** (one Bash call):

    MSYS_NO_PATHCONV=1 wsl -e python3 /mnt/c/Users/diazj/Desktop/car-tracker/scripts/check.py list

**2. Check everything in ONE message** (all calls in parallel):
- each `cars.com` URL: WebFetch with prompt
  `Still listed, or "no longer available"? Reply with only the current headline price, or SOLD.`
- all `carvana` and `carmax` URLs (they refuse WebFetch): ONE `browser_batch`, a
  `navigate` then a `javascript_tool` per URL running:

      await new Promise(r=>setTimeout(r,4000)); const t=document.body.innerText;
      ({url:location.href, price:(t.match(/\n\$([\d,]{5,7})\n/)||[])[1]||null,
        ship:(t.match(/\$([\d,]+) shipping/)||[])[1]||null,
        gone:/no longer available|has been sold|sale pending/i.test(t.slice(0,4000))})

  Record shipping for Carvana only.

**3. Apply, commit, publish** (one Bash call; results as `{"id8": {"seen": N}}`,
add `"shipping": N` for Carvana, `{"sold": true}` if gone):

    cd /c/Users/diazj/Desktop/car-tracker && MSYS_NO_PATHCONV=1 wsl -e python3 /mnt/c/Users/diazj/Desktop/car-tracker/scripts/check.py apply - <<'EOF'
    {...}
    EOF
    git add data && git commit -qm "Check $(date +%F): <summary line from apply>" -m "<attribution line>" && git push -q origin main && for i in 1 2 3 4 5 6; do sleep 20; curl -s "https://kkorbin.github.io/CarTracker/data/meta.json?cb=$RANDOM" | grep -q "$(date +%F)" && { echo LIVE; break; }; done

**4. Report** in five lines or fewer: what sold, price changes, anything not
checked, then https://kkorbin.github.io/CarTracker/

Do not: take screenshots, read listings.json or source files, write new scripts,
write long commit messages or notes, or research anything. New cars, comparisons
and analysis are separate requests.
