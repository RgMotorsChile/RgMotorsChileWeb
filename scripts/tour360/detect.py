import cv2,numpy as np,onnxruntime as ort,glob,json
s=ort.InferenceSession('yolo.onnx')
out={}
for f in sorted(glob.glob('raw/*.jpg')):
    im=cv2.imread(f);H,W=im.shape[:2]
    r=640/max(H,W);img=cv2.resize(im,(int(W*r),int(H*r)));pad=np.full((640,640,3),114,np.uint8);pad[:img.shape[0],:img.shape[1]]=img
    x=pad[:,:,::-1].transpose(2,0,1)[None].astype(np.float32)/255
    p=s.run(None,{'images':x})[0][0].T
    best=None
    for row in p:
        sc=row[4:];c=sc.argmax()
        if c in (2,7) and sc[c]>0.3:
            cx,cy,w,h=row[:4]/r;a=w*h
            if best is None or a>best[0]:best=(a,[float(cx-w/2),float(cy-h/2),float(w),float(h)],float(sc[c]))
    out[f]=best[1] if best else None
json.dump(out,open('boxes.json','w'))
