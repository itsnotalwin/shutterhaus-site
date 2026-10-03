import json, os
base = r"C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\mobile-audit"
imgs = json.load(open(os.path.join(base, "portfolio-imgs.json"), encoding="utf-8"))
print("count:", len(imgs))
rendered = sorted({(i["renderedW"], i["renderedH"]) for i in imgs})
print("distinct rendered boxes:", rendered)
print("distinct natural sizes:", sorted({(i["naturalW"], i["naturalH"]) for i in imgs}))
print("distinct objectFit:", {i["objectFit"] for i in imgs})
print("distinct objectPosition:", {i["objectPosition"] for i in imgs})
print("distinct inline aspect-ratio:", sorted({i["ar"] for i in imgs}))
print("loading attrs:", {})
from collections import Counter
print("loading:", Counter(i["loading"] for i in imgs))
print("fetchpriority:", Counter(i["fetchpriority"] for i in imgs))
print("all complete:", all(i["complete"] for i in imgs), " any naturalW==0:", any(i["nat0"] for i in imgs))
missing_alt = [i for i in imgs if i["alt"] is None or i["alt"].strip() == ""]
print("\nMISSING/EMPTY ALT:", len(missing_alt))
for m in missing_alt: print("   ", m["file"], repr(m["alt"]))
# aspect fidelity: does the box ratio match the natural ratio?
print("\nfidelity check (box ratio vs natural ratio):")
bad = 0
for i in imgs:
    if i["naturalW"] == 0: continue
    nat = i["naturalW"] / i["naturalH"]
    ren = i["renderedW"] / i["renderedH"]
    drift = abs(nat - ren) / nat * 100
    if drift > 1.0:
        bad += 1
        print(f"  DRIFT {i['file']:32s} nat={nat:.4f} box={ren:.4f} drift={drift:.1f}%")
print("  distorted (drift>1%):", bad)
# CSS aspect-ratio vs natural
print("\ndeclared aspect-ratio vs natural ratio:")
for i in imgs[:3]:
    print("  ", i["file"], "declared", i["ar"], "natural", f'{i["naturalW"]}/{i["naturalH"]}')
# first screenful
print("\nviewport 393x852; images whose top < 852:")
for i in imgs:
    if i.get("top") is not None: pass
print("\nsrc vs currentSrc mismatch (served != declared src):")
n = 0
for i in imgs:
    if i["currentSrc"].split("/")[-1] != i["src"].split("/")[-1]:
        n += 1
print("  ", n, "of", len(imgs), "serve a different file than the src attribute names")
print("\nlist of served files:")
for i in imgs: print(f'  {i["idx"]:2d} {i["file"]:30s} box={i["renderedW"]}x{i["renderedH"]} nat={i["naturalW"]}x{i["naturalH"]} loading={i["loading"]}')
