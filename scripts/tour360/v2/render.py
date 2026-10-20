import cv2,numpy as np,json,os,onnxruntime as ort
Q={int(k):np.array(v,np.float32) for k,v in json.load(open('quads_final.json')).items()}
ks=sorted(Q);runs=[];cur=[ks[0]]
for k in ks[1:]:
    if k==cur[-1]+1:cur.append(k)
    else:runs.append(cur);cur=[k]
runs.append(cur)
from scipy.ndimage import gaussian_filter1d
S={}
for r in runs:
    arr=np.stack([Q[k] for k in r]);
    if len(r)>5: arr=gaussian_filter1d(arr,2.0,axis=0,mode='nearest')
    for k,a in zip(r,arr):S[k]=a
tex=cv2.imread('rgplate.png');th,tw=tex.shape[:2]
src=np.float32([[0,0],[tw,0],[tw,th],[0,th]])
def apply(f,q):
    c=q.mean(0);q=(q-c)*1.07+c
    M=cv2.getPerspectiveTransform(src,q.astype(np.float32))
    reg=np.zeros(f.shape[:2],np.uint8);cv2.fillConvexPoly(reg,q.astype(np.int32),255)
    vals=cv2.cvtColor(f,cv2.COLOR_BGR2GRAY)[reg>0]
    k=np.clip(np.percentile(vals,92)/235 if len(vals) else 1,0.62,1.05)
    w=cv2.warpPerspective(tex,M,(f.shape[1],f.shape[0]),flags=cv2.INTER_AREA if cv2.contourArea(q)<th*tw/4 else cv2.INTER_LINEAR)
    w=cv2.GaussianBlur(w,(0,0),0.6).astype(np.float32)*k
    a=cv2.warpPerspective(np.full((th,tw),255,np.uint8),M,(f.shape[1],f.shape[0])).astype(np.float32)/255
    a=cv2.GaussianBlur(a,(0,0),0.5)[...,None]
    return (f*(1-a)+w*a).astype(np.uint8)
N=1861;T=120;sel=[round(i*(N-1)/T) for i in range(T)]
os.makedirs('masked',exist_ok=True)
cap=cv2.VideoCapture('../tour360_rg.mp4');i=0;si=0;want=set(sel)
while True:
    ok,f=cap.read()
    if not ok:break
    if i in want:
        if i in S: f=apply(f,S[i])
        cv2.imwrite(f'masked/{sel.index(i):03d}.png',f)
    i+=1
json.dump({'sel':sel,'masked':[s for s in sel if s in S]},open('sel.json','w'))
print('done',len(sel),sum(1 for s in sel if s in S))
