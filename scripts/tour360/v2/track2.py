import cv2,numpy as np,json
cap=cv2.VideoCapture('../tour360_rg.mp4');N=int(cap.get(7))
def load(a,b):
    cap.set(cv2.CAP_PROP_POS_FRAMES,a);out=[]
    for i in range(a,b+1):
        ok,f=cap.read()
        if not ok:break
        out.append(cv2.cvtColor(f,cv2.COLOR_BGR2GRAY))
    return out
def expand(q,s):
    c=q.mean(0);return (q-c)*s+c
def track(frames,start,step,Q0,limit):
    Q={start:Q0.copy()};q=Q0.astype(np.float32);i=start
    while True:
        j=i+step
        if j<0 or j>=len(frames) or (step>0 and j>limit[1]) or (step<0 and j<limit[0]):break
        m=np.zeros_like(frames[i]);cv2.fillConvexPoly(m,expand(q,1.35).astype(np.int32),255)
        p=cv2.goodFeaturesToTrack(frames[i],200,0.01,3,mask=m)
        if p is None or len(p)<10:break
        p2,st,_=cv2.calcOpticalFlowPyrLK(frames[i],frames[j],p,None,winSize=(21,21),maxLevel=3)
        pb,st2,_=cv2.calcOpticalFlowPyrLK(frames[j],frames[i],p2,None,winSize=(21,21),maxLevel=3)
        good=(st[:,0]==1)&(st2[:,0]==1)&(np.linalg.norm(pb-p,axis=2)[:,0]<1.0)
        if good.sum()<10:break
        H,inl=cv2.findHomography(p[good],p2[good],cv2.RANSAC,2.0)
        if H is None or inl.sum()<8:break
        q=cv2.perspectiveTransform(q[None],H)[0]
        area=cv2.contourArea(q)
        if area<150 or q[:,0].max()<0 or q[:,0].min()>1920:break
        i=j;Q[i]=q.copy()
    return Q
segs={
 'A':dict(a=0,b=450,seeds={0:[[706.2,679.5],[856.2,680.5],[856.2,731.2],[707.5,731.2]]}),
 'B':dict(a=1450,b=1860,seeds={1853:[[578.5,673.2],[807.8,681.1],[809.1,755.5],[583.7,744.9]]}),
 'C':dict(a=700,b=1400,seeds={1055:[[925,722],[1148,718],[1150,808],[925,800]]}),
}
res={}
for k,s in segs.items():
    fr=load(s['a'],s['b']);
    for sf,q in s['seeds'].items():
        q=np.array(q,np.float32);loc=sf-s['a']
        for step in (1,-1):
            for i,v in track(fr,loc,step,q,(0,len(fr)-1)).items(): res[i+s['a']]=v.tolist()
    ks=sorted(i for i in res if s['a']<=i<=s['b']);print(k,ks[0],ks[-1],len(ks))
json.dump(res,open('quads_raw.json','w'))
