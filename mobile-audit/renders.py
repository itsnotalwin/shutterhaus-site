# Visual evidence PNGs:
#  1. contact sheet of the 30 images AS RENDERED on the 393px phone (111px cells, DPR3)
#  2. side-by-side: current sizes() delivery (1200w) vs correct 400w delivery, same pixels, 7.7x bytes
#  3. the 1200w-vs-400w resolution comparison at the real 111px render size
import os, json
from PIL import Image, ImageDraw, ImageFont

BASE = r"C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\mobile-audit"
SERVED = os.path.join(BASE, "served")
LOCAL = r"C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\public\gallery"
OUT = os.path.join(BASE, "imgshots")
os.makedirs(OUT, exist_ok=True)
cq = json.load(open(os.path.join(BASE, "crop-quality.json"), encoding="utf-8"))

def font(sz):
    for n in ("segoeui.ttf", "arial.ttf"):
        p = "C:/Windows/Fonts/" + n
        if os.path.exists(p):
            try: return ImageFont.truetype(p, sz)
            except Exception: pass
    return ImageFont.load_default()

# ---- 1. contact sheet at true rendered size --------------------------------
DPR = 3
COLS, GAP = 3, 18
cellw = int(111 * DPR)
PAD = 30
rowsn = 10
# measured heights by shape
def cell_for(r):
    return cellw, int(round(r["box_h"] * DPR))
imgs = [Image.open(os.path.join(SERVED, r["file"])).convert("RGB") for r in cq]
heights = [cell_for(r)[1] for r in cq]
sheet_rows = [heights[i:i+COLS] for i in range(0, len(heights), COLS)]
W = PAD*2 + COLS*cellw + (COLS-1)*GAP
H = PAD + 70 + sum(max(sr) for sr in sheet_rows) + (len(sheet_rows)-1)*GAP + PAD
sheet = Image.new("RGB", (W, H), (18, 18, 20))
d = ImageDraw.Draw(sheet)
d.text((PAD, 14), "shutterhausvisuals.co.za/#/portfolio  |  iPhone 393px @DPR3  |  ACTUAL rendered cell size 111x166.5 CSS px", fill=(235,235,235), font=font(21))
d.text((PAD, 42), "object-fit: fill, aspect-ratio matches natural => ZERO crop. All 30 load on first paint. 3.92 MB.", fill=(255,150,120), font=font(21))
y = PAD + 70
for ri, sr in enumerate(sheet_rows):
    x = PAD
    for ci in range(COLS):
        idx = ri*COLS + ci
        if idx >= len(imgs): break
        im = imgs[idx]
        ch = sr[ci]
        # scale the 1200px source DOWN to the true 111 CSS px box (what the phone shows)
        tw, th = cellw, ch
        sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y))
        d.rectangle([x, y, x+tw, y+th], outline=(70,70,80), width=1)
        x += tw + GAP
    y += max(sr) + GAP
p1 = os.path.join(OUT, "05-contact-sheet-as-rendered-393px.png")
sheet.save(p1)
print("wrote", p1, sheet.size)

# ---- 2. bytes vs pixels: 1200w served vs 400w correct ----------------------
BARW = 520
panels = []
tot12 = sum(r["bytes"] for r in cq)
tot04 = sum(os.path.getsize(os.path.join(LOCAL, f'{r["label"]}-400w.webp')) for r in cq)
comp = Image.new("RGB", (BARW*2 + 90, 300), (18,18,20))
d = ImageDraw.Draw(comp)
d.text((30, 18), "Same 30 images, same 111px render box. Only the srcset choice differs.", fill=(235,235,235), font=font(20))
for k,(title, tot, col) in enumerate([("DELIVERED TODAY  (sizes=100vw -> 1200w)", tot12, (220,80,70)),
                                      ("CORRECT        (400w @DPR3 = 333 device px)", tot04, (90,190,120))]):
    x0 = 40 + k*(BARW+50)
    d.text((x0, 60), title, fill=col, font=font(20))
    d.rectangle([x0, 96, x0+BARW, 126], fill=(45,45,50))
    frac = min(1.0, tot/tot12)
    d.rectangle([x0, 96, x0+int(BARW*frac), 126], fill=col)
    d.text((x0, 140), f"{tot/1024/1024:.2f} MB  ({tot} B)", fill=(235,235,235), font=font(26))
d.text((40, 200), f"{tot12/tot04:.1f}x more bytes for zero additional pixels on screen.", fill=(255,150,120), font=font(22))
d.text((40, 238), f"Wasted: {(tot12-tot04)/1024/1024:.2f} MB per portfolio view.", fill=(255,150,120), font=font(22))
p2 = os.path.join(OUT, "06-bytes-vs-pixels-1200w-vs-400w.png")
comp.save(p2)
print("wrote", p2, comp.size)

# ---- 3. resolution comparison at true render size --------------------------
# how much detail the phone actually gets, blown back up for inspection
sel = ["18-img-0043", "2-20240718114526-img-0124", "40-img-0092", "53-img-0155", "49-img-0131", "30-img-0396"]
zoom = Image.new("RGB", (len(sel)*300 + 40, 360), (18,18,20))
d = ImageDraw.Draw(zoom)
d.text((20, 14), "Top-6 byte hogs: source 1200px (what is sent) vs 400px (what the 111px box can use)", fill=(235,235,235), font=font(20))
for k, lab in enumerate(sel):
    x = 20 + k*300
    big = Image.open(os.path.join(SERVED, f"{lab}-1200w.webp")).convert("RGB")
    small = Image.open(os.path.join(LOCAL, f"{lab}-400w.webp")).convert("RGB")
    # both scaled to the 111 CSS px box (111*3 = 333 device px) then upscaled 3x for viewing
    bx = int(111*DPR)
    b = big.resize((bx, int(bx*big.height/big.width)), Image.LANCZOS)
    s = small.resize((bx, int(bx*small.height/small.width)), Image.LANCZOS)
    h = max(b.height, s.height)
    UP = max(1, int(230/bx))
    b = b.resize((bx*UP, b.height*UP), Image.NEAREST)
    s = s.resize((bx*UP, s.height*UP), Image.NEAREST)
    colw = bx*UP
    zoom.paste(b, (x, 52))
    zoom.paste(s, (x + colw//2 + 6, 52))
    d.text((x, 36), f"{lab}  {big.width}px {os.path.getsize(os.path.join(SERVED, f'{lab}-1200w.webp'))//1024}KB", fill=(220,120,110), font=font(15))
    d.text((x + colw//2 + 6, 36), f"400px {os.path.getsize(os.path.join(LOCAL, f'{lab}-400w.webp'))//1024}KB", fill=(110,200,140), font=font(15))
p3 = os.path.join(OUT, "07-resolution-1200w-vs-400w.png")
zoom.crop((0, 0, min(zoom.width, 20 + len(sel)*300), 52 + 230*3 + 10)).save(p3)
print("wrote", p3)
