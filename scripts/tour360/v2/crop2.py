import cv2,numpy as np,onnxruntime as ort,os
from PIL import Image
s=ort.InferenceSession('../yolo.onnx');B=[]
for j in range(120):
    im=cv2.imread(f'masked/{j:03d}.png');r=640/1920;img=cv2.resize(im,(640,360));pad=np.full((640,640,3),114,np.uint8);pad[:360]=img
    p=s.run(None,{'images':pad[:,:,::-1].transpose(2,0,1)[None].astype(np.float32)/255})[0][0].T
    best=None
    for row in p:
        sc=row[4:];c=sc.argmax()
        if c in(2,7) and sc[c]>0.3:
            cx,cy,w,h=row[:4]/r
            if best is None or w*h>best[2]*best[3]:best=[cx,cy,w,h]
    B.append(best or [np.nan]*4)
B=np.array(B,float);idx=np.arange(120)
for k in range(4):
    m=~np.isnan(B[:,k]);B[:,k]=np.interp(idx,idx[m],B[:,k][m],period=120)
from scipy.ndimage import median_filter,gaussian_filter1d
cx,cy,h=[gaussian_filter1d(median_filter(B[:,k],5,mode='wrap'),2.5,mode='wrap') for k in (0,1,3)]
os.makedirs('out/lo',exist_ok=True);os.makedirs('out/hi',exist_ok=True)
for j in range(120):
    wh=min(1080,h[j]/0.80);ww=wh*16/9
    x0=min(max(cx[j]-ww/2,0),1920-ww);y0=min(max(cy[j]-wh/2,0),1080-wh)
    im=Image.open(f'masked/{j:03d}.png').crop((round(x0),round(y0),round(x0+ww),round(y0+wh)))
    im.resize((1600,900),Image.LANCZOS).save(f'out/hi/{j+1:03d}.webp',quality=80,method=5)
    im.resize((960,540),Image.LANCZOS).save(f'out/lo/{j+1:03d}.webp',quality=72,method=5)
print('ok')
