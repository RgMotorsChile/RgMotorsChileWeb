import cv2,numpy as np,glob,json
b=json.load(open('boxes.json'));res={}
for f in sorted(b):
    v=b[f]; im=cv2.imread(f); g=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY); H,W=g.shape
    hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV)
    m=((hsv[:,:,1]<60)&(hsv[:,:,2]>150)).astype(np.uint8)*255
    m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((7,7),np.uint8))
    cs,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE);cand=[]
    for c in cs:
        x,y,w,h=cv2.boundingRect(c);a=w*h
        if a<1500 or a>120000 or not(1.6<w/h<4.2):continue
        if cv2.contourArea(c)/a<0.6:continue
        roi=g[y:y+h,x:x+w]; dark=(roi<90).mean()
        if not(0.06<dark<0.5):continue
        if v and not(v[0]-20<x and x+w<v[0]+v[2]+20 and y>v[1]+v[3]*0.35 and y+h<v[1]+v[3]+30):continue
        cand.append([x,y,w,h,round(float(dark),2)])
    res[f]=cand
json.dump(res,open('plates.json','w'))
print(sum(1 for c in res.values() if c),'frames with candidates')
