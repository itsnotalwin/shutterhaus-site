"""Compare primary artwork with rendered production artwork (QA evidence only)."""
from pathlib import Path
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parents[2]
ref=Image.open('/workspace/design-reference/SHUTTERHAUS_Master_Design_Spec_v1/assets/reference/01-primary-reference.png').convert('RGB')
desktop=Image.open(root/'review/after/home-1440.png').convert('RGB')
mobile=Image.open(root/'review/after/home-390.png').convert('RGB')
board=Image.new('RGB',(1060,840),'#e9e7e2');d=ImageDraw.Draw(board)
d.text((24,18),'ARTWORK REVIEW / supplied mockup and rendered revision 3',fill='#111')
for x,label,im in [(24,'Mockup / desktop',ref.crop((829,205,939,624))),(230,'Rendered / desktop',desktop.crop((1213,212,1380,884)))]:
 im=im.resize((174,664),Image.Resampling.LANCZOS);board.paste(im,(x,76));d.text((x,51),label,fill='#111')
# Horizontal source is partly clipped by the reference phone frame at its bottom.
for y,label,im in [(76,'Mockup / mobile (visible portion)',ref.crop((1018,852,1257,940))),(350,'Mobile production artwork',Image.open(root/'public/brand/editorial-arcs-horizontal.webp').convert('RGB'))]:
 im=im.resize((570,round(im.height*570/im.width)),Image.Resampling.LANCZOS);board.paste(im,(464,y+25));d.text((464,y),label,fill='#111')
d.text((464,650),'Generated decorative artwork; real studio photos unchanged.',fill='#111')
d.text((464,672),'Curve proportions and individual grain marks are reconstructed.',fill='#111')
d.text((464,694),'Owner visual approval pending. No deployment.',fill='#111')
board.save(root/'review/comparisons/artwork-reference-revision.jpg',quality=94)
