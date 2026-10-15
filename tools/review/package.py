"""Generate portable screenshot evidence and before/after comparison boards."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
REF = Path('/workspace/design-reference/SHUTTERHAUS_Master_Design_Spec_v1/assets')
OUT = ROOT / 'review'
EVIDENCE = OUT / 'evidence'
COMPARE = OUT / 'comparisons'
EVIDENCE.mkdir(exist_ok=True)
COMPARE.mkdir(exist_ok=True)
REFERENCE_CROPS = OUT / 'reference-crops'
REFERENCE_CROPS.mkdir(exist_ok=True)
ROUTES = ['home', 'portfolio', 'about', 'services', 'contact']
for state,folder in [('before','baseline'),('after','after')]:
    for route in ROUTES:
        for width in ([390,1440] if state=='before' else [320,390,430,768,1024,1440,1920]):
            image = Image.open(OUT/folder/f'{route}-{width}.png').convert('RGB')
            image.save(EVIDENCE/f'{route}-{width}-{state}.webp',quality=88,method=6)

# Compare visible upper content at the same CSS width, density 1.
for route in ROUTES:
    for width in [390,1440]:
        images=[]
        for state,folder in [('Before','baseline'),('After','after')]:
            im=Image.open(OUT/folder/f'{route}-{width}.png').convert('RGB')
            im=im.crop((0,0,width,min(im.height,1600 if width==390 else 1100)))
            scale=1 if width==390 else 0.65
            im=im.resize((round(im.width*scale),round(im.height*scale)))
            card=Image.new('RGB',(im.width+24,im.height+50),'#f0efec')
            card.paste(im,(12,40));ImageDraw.Draw(card).text((12,12),f'{route.title()} / {state} / {width}px',fill='#111')
            images.append(card)
        canvas=Image.new('RGB',(sum(i.width for i in images),max(i.height for i in images)),'#f0efec')
        x=0
        for im in images:canvas.paste(im,(x,0));x+=im.width
        canvas.save(COMPARE/f'{route}-{width}-before-after.jpg',quality=92)

# Supplied prototype screenshot: remove its 64px study header/stage.
for route in ROUTES:
    for width in [390,1440]:
        src=Image.open(REF/'screenshots'/f'{route}-{"mobile-390" if width==390 else "desktop-1440"}.png')
        src=src.convert('RGB').crop((0,64,width,src.height))
        if route == 'home':
            primary=Image.open(REF/'reference'/'01-primary-reference.png').convert('RGB')
            region=primary.crop((53,55,978,941)) if width==1440 else primary.crop((1009,67,1265,982))
            src=region.resize((width,round(region.height*width/region.width)))
        elif route == 'portfolio' and width == 390:
            primary=Image.open(REF/'reference'/'01-primary-reference.png').convert('RGB')
            region=primary.crop((1292,67,1544,982));src=region.resize((390,round(region.height*390/region.width)))
        src.save(REFERENCE_CROPS/f'{route}-{width}.webp',quality=92,method=6)
        src=src.crop((0,0,width,min(src.height,1500 if width==390 else 1100)))
        actual=Image.open(OUT/'after'/f'{route}-{width}.png').convert('RGB')
        actual=actual.crop((0,0,width,min(actual.height,1500 if width==390 else 1100)))
        scale=1 if width==390 else .65
        cards=[]
        for label,im in [('Reference concept (illustrative photos)',src),('Implementation (original work)',actual)]:
            im=im.resize((round(im.width*scale),round(im.height*scale)))
            card=Image.new('RGB',(im.width+24,im.height+50),'#f0efec');card.paste(im,(12,40));ImageDraw.Draw(card).text((12,12),label,fill='#111');cards.append(card)
        canvas=Image.new('RGB',(sum(i.width for i in cards),max(i.height for i in cards)),'#f0efec');x=0
        for im in cards:canvas.paste(im,(x,0));x+=im.width
        canvas.save(COMPARE/f'{route}-{width}-reference.jpg',quality=92)

src=Image.open(REF/'reference'/'01-primary-reference.png').convert('RGB').crop((53,55,978,941))
src=src.resize((925,886))
actual=Image.open(OUT/'after'/'home-1440.png').convert('RGB').crop((0,0,1440,1379)).resize((925,886))
canvas=Image.new('RGB',(1874,932),'#f0efec');canvas.paste(src,(8,38));canvas.paste(actual,(941,38))
draw=ImageDraw.Draw(canvas);draw.text((8,12),'Selected primary reference / desktop stage normalized',fill='#111');draw.text((941,12),'Real implementation / same display measure',fill='#111')
canvas.save(COMPARE/'home-primary-reference.jpg',quality=94)
