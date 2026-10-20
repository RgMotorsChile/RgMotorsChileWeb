import json,numpy as np,os
from PIL import Image
sel=json.load(open('sel.json'));b=json.load(open('boxes.json'))
B=np.array([b[k] if b[k] else [np.nan]*4 for k in sel],float)
for j in range(4):
    v=B[:,j];idx=np.arange(72);m=~np.isnan(v);B[:,j]=np.interp(idx,idx[m],v[m])
cx=B[:,0]+B[:,2]/2;cy=B[:,1]+B[:,3]/2;h=B[:,3]
def med(a,r=3):
    n=len(a);return np.array([np.median(np.take(a,range(i-r,i+r+1),mode='wrap')) for i in range(n)])
def avg(a,r=2):
    n=len(a);return np.array([np.mean(np.take(a,range(i-r,i+r+1),mode='wrap')) for i in range(n)])
cx,cy,h=avg(med(cx)),avg(med(cy)),avg(med(h))
os.makedirs('out/hi',exist_ok=True);os.makedirs('out/sm',exist_ok=True)
for i in range(72):
    wh=min(1080,h[i]/0.78);ww=wh*16/9
    x0=min(max(cx[i]-ww/2,0),1920-ww);y0=min(max(cy[i]-wh/2+wh*0.03,0),1080-wh)
    im=Image.open(f'masked/{i:03d}.png').crop((int(x0),int(y0),int(x0+ww),int(y0+wh)))
    im.resize((1600,900),Image.LANCZOS).save(f'out/hi/{i+1:03d}.webp',quality=82,method=5)
    im.resize((800,450),Image.LANCZOS).save(f'out/sm/{i+1:03d}.webp',quality=75,method=5)
