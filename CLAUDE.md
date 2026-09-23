# Car Tracker

Static used-car tracker (no build step), published by GitHub Pages at
https://kkorbin.github.io/CarTracker/ — always give the user that link after changing listings.

- `data/listings.json` listings · `data/meta.json` last-check status · `assets/criteria.js` scoring, Arizona tax and fees · `CRITERIA.md` buying criteria and budget
- **Checks:** use the `check-cars` skill. Keep them lean — it is the most frequent task.
- **Python/Node run only in WSL:** `MSYS_NO_PATHCONV=1 wsl -e python3 /mnt/c/Users/diazj/Desktop/car-tracker/...`
- **Sites:** cars.com works with WebFetch; Carvana, CarMax and Autotrader refuse it but load in the browser.
- **Publish:** `git push origin main` (SSH deploy key via the `github-cartracker` host alias).
- **Features:** dealer feature lists often omit equipment the car has. Check the manufacturer's spec or the VIN before recording a feature as missing.
- This repo is public: personal and financial details go in `NOTES.local.md` (gitignored), never in committed files.
