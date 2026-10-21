"""Control de calidad sobre una carpeta de cuadros ya generados (001.webp…): bloquea la publicación si falla.
Uso: python3 qa_frames.py carpeta/ [--seg yolov8s-seg.pt] -> escribe qa.json y sale con código 1 si queda 'pendiente'."""
import argparse, glob, json, os, sys
import cv2, numpy as np
from tour360 import Segmenter, pick_car, bg_flow, sharpness, qa_metrics, summarize

ap = argparse.ArgumentParser(); ap.add_argument("dir"); ap.add_argument("--seg", default="yolov8s-seg.pt"); a = ap.parse_args()
files = sorted(glob.glob(os.path.join(a.dir, "[0-9][0-9][0-9].webp")))
seg = Segmenter(a.seg); boxes, sharp, black, cut, smalls = [], [], [], [], []; last = None
for f in files:
    im = cv2.imread(f); H, W = im.shape[:2]
    cands, _ = seg(im); box, _m = pick_car(cands, last, W, H)
    if box is not None: last = box
    boxes.append(box); sharp.append(sharpness(im))
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    black.append(bool((g < 4).mean() > 0.005))
    cut.append(box is None or box[0] <= 3 or box[1] <= 3 or box[2] >= W - 3 or box[3] >= H - 3)
    sm = cv2.resize(g, (480, 270)); cm = np.zeros_like(sm)
    if box: r = 480 / W; cv2.rectangle(cm, (int(box[0] * r), int(box[1] * r)), (int(box[2] * r), int(box[3] * r)), 255, -1)
    smalls.append((sm, cm))
n = len(files); hz = [0.0] * n
for k in range(n):
    j = (k + 1) % n; hz[j] = bg_flow(smalls[k][0], smalls[j][0], cv2.bitwise_or(smalls[k][1], smalls[j][1]))[1]
rows, fails = qa_metrics(boxes, hz, sharp, black, cut, W)
s = summarize(rows, fails); s["status"] = "ok" if not fails else "pendiente"; s["cuadros"] = n
json.dump({"resumen": s, "pares": rows}, open(os.path.join(a.dir, "qa.json"), "w"), indent=1, ensure_ascii=False)
print(json.dumps({k: v for k, v in s.items() if k not in ("empalme", "cuadros_con_falla")}, ensure_ascii=False))
sys.exit(0 if not fails else 1)
