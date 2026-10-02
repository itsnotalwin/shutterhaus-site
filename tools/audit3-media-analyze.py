import json
d = json.load(open(r"C:/Users/Operations 3/Documents/WEBSITE/shutterhaus-site/audit-v2/audit3/media.json"))

def h(t): print("\n" + "="*78 + "\n" + t + "\n" + "="*78)

h("A. UPSCALED IMAGES (CSS box wider than delivered bitmap) — blurry photos")
for r, per in d.items():
    for w in sorted(per, key=int):
        ups = [i for i in per[w]["images"] if i["upscaled"]]
        if not ups: continue
        worst = sorted(ups, key=lambda i: -(i["upRatio"] or 0))[:5]
        print(f"\n  {r} @{w}: {len(ups)} upscaled of {len(per[w]['images'])}")
        for i in worst:
            print(f"     {i['src'][:46]:<47} box={i['bw']}px  natural={i['nw']}px  box/nat={i['upRatio']}x  fit={i['fit']}")

h("B. THE ONE CROPPED IMAGE per width on / (hero — expected, brief allows hero crop)")
for w in sorted(d["/"], key=int):
    for i in d["/"][w]["images"]:
        if i["crops"]:
            print(f"  / @{w}: {i['src'][:46]} box={i['bw']}x{i['bh']} nat={i['nw']}x{i['nh']} fit={i['fit']} pos={i['fit']} arSkew={i['arSkew']}")

h("C. TAP TARGETS UNDER 44x44")
seen = set()
for r, per in d.items():
    for w in sorted(per, key=int):
        bad = [t for t in per[w]["taps"] if not t["clipped"] and (t["w"] < 44 or t["h"] < 44)]
        if not bad: continue
        for t in bad:
            k = (r, t["cls"], t["txt"])
            if k in seen: continue
            seen.add(k)
            print(f"  {r} @{w}: {t['tag']}.{t['cls'][:22]:<23} {t['w']}x{t['h']} fs={t['fs']:<7} lh={t['lh']:<7} pad={t['pad']:<16} '{t['txt'][:26]}' href={t['href'][:24]}")

h("D. LINE MEASURE — real chars per line (flag >75)")
worst = []
for r, per in d.items():
    for w in sorted(per, key=int):
        for m in per[w]["measures"]:
            worst.append((m["cpl"], r, w, m))
worst.sort(reverse=True, key=lambda x: x[0])
for cpl, r, w, m in worst[:22]:
    flag = "  <== TOO WIDE" if cpl > 75 else ""
    print(f"  {r:<11}@{w:<5} cpl={cpl:<4} fs={m['fs']:<6} blockW={m['blockW']:<7} lines={m['lines']:<3} {m['tag']}.{m['cls'][:16]:<17} {m['sample'][:34]}{flag}")

h("E. MEASURE DISTRIBUTION at 1920 (does text blow out on big screens?)")
for r, per in d.items():
    ms = per.get("1920", {}).get("measures", [])
    if not ms: continue
    print(f"  {r} @1920: " + ", ".join(f"{m['cls'] or m['tag']}={m['cpl']}cpl/{m['blockW']}px" for m in sorted(ms, key=lambda x: -x['cpl'])[:6]))

h("F. FIRST IMAGE / LCP PRIORITY per route")
for r, per in d.items():
    for w in ("393", "1440"):
        if w not in per: continue
        ims = per[w]["images"]
        if not ims: continue
        f = ims[0]
        print(f"  {r} @{w}: first img {f['src'][:44]} loading={f['loading']} fetchpriority={f['fp']} nat={f['nw']}x{f['nh']} box={f['bw']}x{f['bh']} firstInDoc={f['isFirstInDoc']} aboveFold={f['visibleAboveFold']}")

h("G. ALT TEXT coverage")
for r, per in d.items():
    ims = per.get("393", {}).get("images", [])
    if not ims: continue
    noalt = [i for i in ims if not i["hasAlt"]]
    empty = [i for i in ims if i["hasAlt"] and i["altLen"] == 0]
    gen = [i for i in ims if i["hasAlt"] and 0 < i["altLen"] <= 2]
    print(f"  {r}: {len(ims)} imgs, no-alt-attr={len(noalt)}, empty-alt={len(empty)}, <=2char-alt={len(gen)}")
    for i in gen[:3]: print(f"     short alt: {i['src'][:40]} alt='{i['alt']}'")
