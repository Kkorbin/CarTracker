#!/usr/bin/env python3
"""Car Tracker check-run helper. Keeps each run down to data, not new code.

  python3 scripts/check.py list
      One line per active listing: id, where to check it, and the headline price
      the listing should show if nothing has changed.

  python3 scripts/check.py apply '<json>' [--dry-run]      (or: apply -  to read stdin)
      Record what the check found. Keys are id prefixes from `list`:
        {"56278693": {"seen": 16500},
         "fecfec48": {"seen": 22590, "shipping": 690},
         "115324fc": {"sold": true}}
      "seen" is the HEADLINE price exactly as the listing shows it. Where a doc fee
      is recorded, cars.com's headline already includes it, so it is subtracted.
      Updates data/listings.json and data/meta.json and prints what changed.
"""
import datetime
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LISTINGS = os.path.join(ROOT, "data", "listings.json")
META = os.path.join(ROOT, "data", "meta.json")
AZ = datetime.timezone(datetime.timedelta(hours=-7))  # Arizona, no DST
TODAY = datetime.datetime.now(AZ).strftime("%Y-%m-%d")

if hasattr(sys.stdout, "reconfigure"):  # Windows consoles default to cp1252
    sys.stdout.reconfigure(encoding="utf-8")


def load(path):
    with io.open(path, encoding="utf-8") as f:
        return json.load(f)


def save(path, data):
    with io.open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def active(listings):
    return [v for v in listings if v.get("status") not in ("sold", "passed")]


def source(v):
    url = v.get("url", "")
    if "carvana.com" in url:
        return "carvana"
    if "carmax.com" in url:
        return "carmax"
    return "cars.com"


def headline(v):
    return int(v["price"]) + int(v.get("docFee") or 0)


def cmd_list():
    for v in active(load(LISTINGS)):
        ship = " +ship $%s" % v["shipping"] if v.get("shipping") else ""
        print("%s|%s|%s|expect $%s%s|%s %s %s" % (
            v["id"][:8], source(v), v["url"], format(headline(v), ","), ship,
            v["year"], v["model"], v["dealer"][:22]))


def cmd_apply(raw, dry_run):
    found = json.loads(raw)
    listings = load(LISTINGS)
    log = []
    for prefix, r in found.items():
        v = next((x for x in listings if x["id"].startswith(prefix)), None)
        if v is None:
            log.append("?? no listing " + prefix)
            continue
        name = "%s %s %s (%s)" % (v["year"], v["model"], v["trim"], v["dealer"][:24])
        v["lastVerified"] = TODAY
        if r.get("sold"):
            if v.get("status") != "sold":
                v["status"] = "sold"
                v["notes"] = (v.get("notes") or "").rstrip() + \
                    " SOLD/DELISTED, confirmed %s." % TODAY
                log.append("SOLD   " + name)
            continue
        if "seen" in r:
            new = int(r["seen"]) - int(v.get("docFee") or 0)
            if new != int(v["price"]):
                log.append("PRICE  %s  $%s -> $%s" % (name, format(int(v["price"]), ","), format(new, ",")))
                v.setdefault("history", []).append({"date": TODAY, "price": new})
                v["price"] = new
        if "shipping" in r and int(r["shipping"]) != int(v.get("shipping") or 0):
            log.append("SHIP   %s  $%s -> $%s" % (name, v.get("shipping") or 0, r["shipping"]))
            v["shipping"] = int(r["shipping"])

    live = active(listings)
    missed = [v for v in live if v.get("lastVerified") != TODAY]
    for v in missed:
        log.append("NOT CHECKED  %s %s (%s)" % (v["year"], v["model"], v["dealer"][:24]))
    sold = sum(1 for line in log if line.startswith("SOLD"))
    moved = sum(1 for line in log if line.startswith(("PRICE", "SHIP")))

    old = load(META) if os.path.exists(META) else {}
    prev = old.get("lastChecked")
    meta = {
        "lastChecked": TODAY,
        "previousCheck": prev if prev and prev != TODAY else old.get("previousCheck", prev),
        "activeCount": len(live),
        "verifiedCount": len(live) - len(missed),
        "unverifiedCount": len(missed),
        "summary": "%d of %d verified. %s sold, %s price change%s." % (
            len(live) - len(missed), len(live), sold or "Nothing",
            moved or "no", "" if moved == 1 else "s"),
    }
    print("\n".join(log) or "no changes")
    print(meta["summary"])
    if dry_run:
        print("(dry run - nothing written)")
    else:
        save(LISTINGS, listings)
        save(META, meta)


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["list"]:
        cmd_list()
    elif args[:1] == ["apply"] and len(args) >= 2:
        cmd_apply(sys.stdin.read() if args[1] == "-" else args[1], "--dry-run" in args)
    else:
        print(__doc__)
