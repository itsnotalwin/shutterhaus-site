import json, sys
p = r"C:/Users/Operations 3/Documents/WEBSITE/shutterhaus-site/audit-v2/audit3/measure.json"
d = json.load(open(p))
W = [320, 393, 430, 768, 1024, 1440, 1920]

def h(t): print("\n" + "="*78 + "\n" + t + "\n" + "="*78)

h("1. SECTION GUTTERS (left/right) per route per width")
for r, per in d.items():
    for w in W:
        if str(w) not in per: continue
        rows = per[str(w)]["sections"]
        if not rows: print(f"  {r} @{w}: NO SECTIONS"); continue
        print(f"\n  --- {r} @{w} (vw={per[str(w)]['vw']}) ---")
        for s in rows:
            asym = abs((s['gutL'] or 0) - (s['gutR'] or 0))
            flag = ""
            if asym > 2: flag += f"  <== ASYMMETRIC by {asym:.1f}px"
            print(f"    {s['sel']:<20} w={s['w']:>7} gutL={s['gutL']:>6} gutR={s['gutR']:>6} maxW={str(s['maxW']):>8} padL={s['padL']:>7} padR={s['padR']:>7}{flag}")

h("2. VERTICAL RHYTHM (gaps between top-level sections)")
for r, per in d.items():
    for w in W:
        if str(w) not in per: continue
        rh = per[str(w)]["rhythm"]
        if not rh: continue
        gaps = [x.get("gap") for x in rh[1:]]
        print(f"  {r:<11}@{w:<5} pageH={per[str(w)]['pageH']:<8} sections={len(rh):<3} gaps={gaps}")

h("3. FONT SIZES  (flag <14px body, and form fields <16px)")
for r, per in d.items():
    for w in W:
        if str(w) not in per: continue
        ts = per[str(w)]["typeSizes"]
        small = {k: v for k, v in ts.items() if float(v["fs"].replace("px", "")) < 14}
        if small:
            print(f"  {r} @{w} SMALL(<14px):")
            for k, v in small.items():
                print(f"     {k:<34} {v['fs']:>6} n={v['n']:<3} {v['sample'][:40]}")

h("3b. ALL TYPE SIZES at 320 and 393 (mobile priority)")
for r in d:
    for w in (320, 393):
        if str(w) not in d[r]: continue
        ts = d[r][str(w)]["typeSizes"]
        print(f"\n  --- {r} @{w} ---")
        for k, v in sorted(ts.items(), key=lambda x: -float(x[1]["fs"].replace("px", ""))):
            print(f"     {k:<34} {v['fs']:>7} /lh {v['lh']:>8} {v['ff']:<16} w{v['wgt']:<4} ls={v['ls']:<7} n={v['n']:<3} {v['sample'][:34]}")

h("4. FORM FIELDS (iOS zoom guard: font-size must be >= 16px)")
for r, per in d.items():
    for w in W:
        if str(w) not in per: continue
        f = per[str(w)]["fields"]
        if not f: continue
        bad = [x for x in f if float(x["fs"].replace("px", "")) < 16]
        print(f"  {r} @{w}: {len(f)} fields, {len(bad)} below 16px")
        for x in f:
            m = "  <== BELOW 16px" if float(x["fs"].replace("px", "")) < 16 else ""
            print(f"     {x['tag']:<9} {x['type']:<13} fs={x['fs']:>6} h={x['h']:>6} pad={x['pad']}{m}")

h("5. TAP TARGETS under 44x44 at 393 (excluding clipped/hidden)")
for r, per in d.items():
    if "393" not in per: continue
    taps = per["393"]["taps"]
    vis = [t for t in taps if not t["clipped"]]
    bad = [t for t in vis if (t["w"] or 0) < 44 or (t["h"] or 0) < 44]
    print(f"  {r}: {len(taps)} total, {len(vis)} visible, {len(bad)} under 44x44")
    for t in bad:
        print(f"     {t['tag']:<7} {str(t['cls'])[:26]:<27} {t['w']}x{t['h']} @{t['x']},{t['y']} '{t['txt'][:24]}' {t['href'][:20]}")

h("6. LINE LENGTH (approx chars per line) — flag > 75")
for r, per in d.items():
    for w in W:
        if str(w) not in per: continue
        ms = per[str(w)]["measures"]
        bad = [m for m in ms if (m["approxCPL"] or 0) > 75]
        if bad:
            print(f"  {r} @{w}:")
            for m in bad:
                print(f"     {m['tag']}.{m['cls']:<22} cpl~{m['approxCPL']:<4} blockW={m['blockW']:<8} lines={m['lines']:<3} {m['sample'][:40]}")

h("7. ORPHAN / SHORT LAST LINES")
for r, per in d.items():
    for w in W:
        if str(w) not in per: continue
        wr = per[str(w)]["wraps"]
        if not wr: continue
        print(f"  {r} @{w}:")
        for x in wr:
            print(f"     {x['tag']}.{str(x['cls'])[:20]:<21} lines={x['lines']:<3} lastW={x['lastLineW']:<7} ({x['lastFracPct']}%) tail='{x['tail'][:28]}'")

h("8. IMAGES — distortion, upscaling, loading priority")
for r, per in d.items():
    for w in W:
        if str(w) not in per: continue
        im = per[str(w)]["images"]
        if not im: continue
        dist = [i for i in im if i["distorted"]]
        up = [i for i in im if i["upscaled"]]
        lazy = [i for i in im if i["loading"] == "lazy"]
        noalt = [i for i in im if not i.get("alt", "").strip()]
        nofw = [i for i in im if i["loading"] != "lazy" and not i["fp"]]
        print(f"  {r} @{w}: n={len(im)} distorted={len(dist)} upscaled={len(up)} lazy={len(lazy)} eager-no-fetchpriority={len(nofw)} empty-alt={len(noalt)}")
        for i in dist[:6]:
            print(f"     DISTORTED {i['src'][:40]} box={i['bw']}x{i['bh']} nat={i['nw']}x{i['nh']} fit={i['fit']}")
        for i in up[:6]:
            print(f"     UPSCALED  {i['src'][:40]} boxW={i['bw']} natW={i['nw']}")
        for i in lazy[:3]:
            print(f"     LAZY first: {i['src'][:44]} y-order idx box={i['bw']}x{i['bh']}")
