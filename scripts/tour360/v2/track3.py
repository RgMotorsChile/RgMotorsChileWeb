import cv2,numpy as np,json
exec(open('track2.py').read().split("segs={")[0])
seeds={750:[[560,818],[678,872],[668,915],[556,872]],1055:[[925,722],[1148,718],[1150,808],[925,800]]}
fr=load(690,1230);best={}
for sf,q in seeds.items():
    for step in (1,-1):
        for i,v in track(fr,sf-690,step,np.array(q,np.float32),(0,len(fr)-1)).items():
            g=i+690;d=abs(g-sf)
            if g not in best or d<best[g][0]: best[g]=(d,v.tolist())
raw=json.load(open('quads_raw.json'));out={}
for k,v in raw.items():
    k=int(k)
    if k<=450: out[k]=v
    elif 1684<=k: out[k]=v
for g,(d,v) in best.items():
    if 700<=g<=1215: out[g]=v
json.dump({str(k):out[k] for k in sorted(out)},open('quads2.json','w'));print(len(out))
