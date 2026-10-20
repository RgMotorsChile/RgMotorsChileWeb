import cv2,numpy as np,json
from PIL import Image,ImageDraw,ImageFont,ImageFilter
sel=json.load(open('sel.json'));p=json.load(open('plates.json'));b=json.load(open('boxes.json'))
K={}
for i in range(8): K[i]=p[sel[i]][0][:4]
for i in (70,71): K[i]=p[sel[i]][0][:4]
K.update({8:[1220,620,200,100],9:[1330,650,160,120],10:[1590,700,130,120],11:[1760,700,160,150],
 64:[0,700,150,130],65:[320,700,140,120],66:[480,640,150,140],67:[590,680,150,110],68:[500,680,180,120],69:[500,600,200,120],
 28:[600,820,250,160],30:[220,860,250,150],33:[330,390,230,150],36:[220,750,220,140],39:[800,700,240,160],
 41:[870,700,330,140],45:[1300,750,280,150],46:[1450,780,220,150],47:[1750,850,170,200]})
def interp(a,c,i):
    ka=K[a];kc=K[c];t=(i-a)/(c-a);return [ka[j]+(kc[j]-ka[j])*t for j in range(4)]
for a,c in ((28,30),(30,33),(33,36),(36,39),(39,41),(41,45)):
    for i in range(a+1,c): K[i]=interp(a,c,i)
json.dump(K,open('masks.json','w'))
try: font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',40)
except: font=ImageFont.load_default()
def patch(img,box):
    x,y,w,h=box;cx,cy=x+w/2,y+h/2;w*=1.4;h*=1.5;w=max(w,h*2.2)
    x0,y0,x1,y1=int(cx-w/2),int(cy-h/2),int(cx+w/2),int(cy+h/2)
    d=ImageDraw.Draw(img);r=int(h*0.18)
    d.rounded_rectangle([x0,y0,x1,y1],r,fill=(14,14,18),outline=(200,16,46),width=max(2,int(h*0.06)))
    f=font.font_variant(size=max(10,int(h*0.42)));t="RG MOTORS"
    tb=d.textbbox((0,0),t,font=f);tw=tb[2]-tb[0]
    if tw>(x1-x0)*0.85: f=font.font_variant(size=max(8,int(f.size*(x1-x0)*0.85/tw)));tb=d.textbbox((0,0),t,font=f);tw=tb[2]-tb[0]
    d.text((cx-tw/2,cy-(tb[3]+tb[1])/2),t,font=f,fill=(255,255,255))
import os;os.makedirs('masked',exist_ok=True)
for i,k in enumerate(sel):
    img=Image.open(k).convert('RGB')
    if i in K: patch(img,K[i])
    img.save(f'masked/{i:03d}.png')
