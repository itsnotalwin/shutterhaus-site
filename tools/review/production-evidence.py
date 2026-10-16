"""Prepare review copies of fresh browser evidence; originals stay intact."""
from pathlib import Path
from PIL import Image,ImageDraw
import sys,json
root=Path(sys.argv[1]);out=root/'inspection';out.mkdir(exist_ok=True)
for name in ['home','portfolio','about','services','contact']:
 panels=[]
 for width in ['390','1440']:
  path=root/f'{name}-{width}.jpg'
  if not path.exists():continue
  im=Image.open(path).convert('RGB')
  cap=2200 if width=='390' else 1400
  for n,y in enumerate(range(0,im.height,cap)):
   tile=im.crop((0,y,im.width,min(y+cap,im.height)))
   tile.save(out/f'{name}-{width}-part{n+1}.jpg',quality=94)
  crop=im.crop((0,0,im.width,min(im.height,2200 if width=='390' else 1400)))
  targetwidth=390 if width=='390' else 1008
  crop=crop.resize((targetwidth,round(crop.height*targetwidth/crop.width)))
  card=Image.new('RGB',(crop.width+24,crop.height+52),'#eceae5');card.paste(crop,(12,40));ImageDraw.Draw(card).text((12,12),f'{name.title()} / PRODUCTION / {width}px',fill='#111');panels.append(card)
 if panels:
  board=Image.new('RGB',(sum(im.width for im in panels),max(im.height for im in panels)),'#eceae5');x=0
  for im in panels:board.paste(im,(x,0));x+=im.width
  board.save(out/f'{name}-production-comparison.jpg',quality=94)
print('Prepared screenshot inspection copies in',out)
