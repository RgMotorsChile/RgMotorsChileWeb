"""Tour 360 RG Motors (v3): video de una vuelta -> N fotos alineadas + manifest con control de calidad.

Fondo: siempre el patio real. Solo se rellenan (inpainting) personas que aparecen en cuadro.
Pasos: cubrepatente por homografía -> vidstab 2 pasadas -> segmentación del auto ->
ángulo real por flujo óptico del fondo -> selección por ángulo (nítido, sin atípicos) ->
similitud por cuadro (misma escala, centro y línea de suelo, suavizado circular) ->
recorte común -> exposición/balance igualados -> QA que bloquea la publicación.

Uso: python3 tour360.py video.mp4 salida/ --quads quads.json [--frames 120] [--front 0]
"""
import argparse, json, math, os, subprocess, sys
import cv2, numpy as np
from scipy.ndimage import gaussian_filter1d, median_filter

OUT_W, OUT_H = 1920, 1080
TARGET_W_FRAC = 0.78        # el auto ocupa ~78% del ancho en la vista lateral
QA_SCALE, QA_CENTER, QA_HORIZON = 0.02, 0.015, 1.0

# ---------------- utilidades de video ----------------
def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height,r_frame_rate:format=duration", "-of", "json", path],
                         capture_output=True, text=True, check=True)
    j = json.loads(out.stdout); s = j["streams"][0]
    num, den = s["r_frame_rate"].split("/")
    return int(s["width"]), int(s["height"]), float(j["format"]["duration"]), float(num) / float(den)

def validate(w, h, dur):
    errs = []
    if min(w, h) < 1080: errs.append(f"Resolución {w}x{h}: se necesita al menos 1080p (ideal 4K).")
    if dur < 20: errs.append(f"Duración {dur:.0f}s: una vuelta lenta necesita ~60 s.")
    return errs

def frames_of(path):
    cap = cv2.VideoCapture(path)
    while True:
        ok, f = cap.read()
        if not ok: return
        yield f

def write_video(frames, dst, w, h, fps):
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}",
                          "-r", f"{fps:.4f}", "-i", "-", "-c:v", "libx264", "-crf", "12", "-preset", "fast",
                          "-pix_fmt", "yuv420p", dst], stdin=subprocess.PIPE)
    for f in frames: p.stdin.write(f.tobytes())
    p.stdin.close(); p.wait()

# ---------------- cubrepatente ----------------
def plate_texture(color="white", w=520, h=120):
    """Placa mate (blanca o negra) con el logo RG chico al centro."""
    from PIL import Image, ImageDraw, ImageFont
    bg = (236, 236, 232) if color == "white" else (22, 22, 24)
    fg = (24, 24, 24) if color == "white" else (235, 235, 235)
    im = Image.new("RGB", (w, h), bg); d = ImageDraw.Draw(im)
    try: f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(h * 0.34))
    except OSError: f = ImageFont.load_default()
    rg, mo = "RG", " MOTORS"
    w1 = d.textlength(rg, font=f); w2 = d.textlength(mo, font=f); x = (w - w1 - w2) / 2; y = h * 0.30
    d.text((x, y), rg, font=f, fill=(200, 16, 46)); d.text((x + w1, y), mo, font=f, fill=fg)
    return cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)

def smooth_quads(quads, sigma=1.5):
    Q = {int(k): np.array(v, np.float32) for k, v in quads.items()}
    if not Q: return {}
    ks = sorted(Q); runs, cur = [], [ks[0]]
    for k in ks[1:]:
        if k == cur[-1] + 1: cur.append(k)
        else: runs.append(cur); cur = [k]
    runs.append(cur); S = {}
    for r in runs:
        arr = np.stack([Q[k] for k in r])
        if len(r) > 5: arr = gaussian_filter1d(arr, sigma, axis=0, mode="nearest")
        S.update({k: a for k, a in zip(r, arr)})
    return S

def apply_plate(f, q, tex, grow=1.02):
    """Placa del tamaño exacto (homografía sobre las 4 esquinas). grow mínimo: no tapa el parachoques."""
    c = q.mean(0); q = (q - c) * grow + c
    th, tw = tex.shape[:2]
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [tw, 0], [tw, th], [0, th]]), q.astype(np.float32))
    reg = np.zeros(f.shape[:2], np.uint8); cv2.fillConvexPoly(reg, q.astype(np.int32), 255)
    vals = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)[reg > 0]
    k = float(np.clip(np.percentile(vals, 90) / 230, 0.55, 1.05)) if len(vals) else 1.0   # sombra/luz de la escena
    w = cv2.warpPerspective(tex, M, (f.shape[1], f.shape[0]), flags=cv2.INTER_AREA).astype(np.float32) * k
    a = cv2.warpPerspective(np.full((th, tw), 255, np.uint8), M, (f.shape[1], f.shape[0])).astype(np.float32) / 255
    a = cv2.GaussianBlur(a, (0, 0), 0.6)[..., None]
    return (f * (1 - a) + cv2.GaussianBlur(w, (0, 0), 0.5) * a).astype(np.uint8)

# ---------------- segmentación ----------------
class Segmenter:
    """YOLOv8-seg (ultralytics). Devuelve máscara del auto principal y máscara de personas."""
    def __init__(self, weights):
        from ultralytics import YOLO
        self.m = YOLO(weights)
    def __call__(self, im):
        H, W = im.shape[:2]
        r = self.m.predict(im, imgsz=640, conf=0.3, classes=[0, 2, 7], verbose=False, retina_masks=False)[0]
        car, people = None, np.zeros((H, W), np.uint8)
        if r.masks is None: return None, people, None
        ms = r.masks.data.cpu().numpy(); cls = r.boxes.cls.cpu().numpy().astype(int); bx = r.boxes.xyxy.cpu().numpy()
        cands = []
        for m, c, b in zip(ms, cls, bx):
            m = cv2.resize(m, (W, H), interpolation=cv2.INTER_LINEAR) > 0.5
            if c == 0: people[m] = 255
            elif m.any():
                ys, xs = np.nonzero(m)
                cands.append(([float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())], m))
        return cands, people

def iou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0])); iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - ix * iy
    return ix * iy / u if u > 0 else 0.0

def pick_car(cands, prev, W, H):
    """Sigue al mismo auto cuadro a cuadro (IoU con el anterior); al inicio, el más grande y centrado."""
    if not cands: return None, None
    def area(b): return (b[2] - b[0]) * (b[3] - b[1])
    if prev is None:
        return max(cands, key=lambda c: area(c[0]) * (1 - 0.5 * abs((c[0][0] + c[0][2]) / 2 - W / 2) / W))
    best = max(cands, key=lambda c: iou(c[0], prev) + 0.2 * area(c[0]) / (W * H))
    return best if iou(best[0], prev) > 0.2 else (None, None)

def sharpness(im):
    g = cv2.cvtColor(cv2.resize(im, (960, 540)), cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(g, cv2.CV_64F).var())

# ---------------- ángulo real ----------------
def bg_flow(prev, cur, car_mask_small):
    """Desplazamiento horizontal mediano del fondo (px a 480 de ancho) entre dos cuadros."""
    mask = cv2.bitwise_not(car_mask_small) if car_mask_small is not None else None
    p0 = cv2.goodFeaturesToTrack(prev, 300, 0.01, 8, mask=mask)
    if p0 is None or len(p0) < 10: return 0.0, 0.0
    p1, st, _ = cv2.calcOpticalFlowPyrLK(prev, cur, p0, None, winSize=(21, 21), maxLevel=3)
    ok = st.ravel() == 1
    if ok.sum() < 10: return 0.0, 0.0
    a, b = p0[ok].reshape(-1, 2), p1[ok].reshape(-1, 2)
    M, _ = cv2.estimateAffinePartial2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=2.0)
    rot = math.degrees(math.atan2(M[1, 0], M[0, 0])) if M is not None else 0.0
    return float(np.median(b[:, 0] - a[:, 0])), rot

# ---------------- QA ----------------
def qa_metrics(boxes, horizons, sharp, black, cut, W):
    n = len(boxes); rows = []; fails = []
    def pair(i, j):
        bi, bj = boxes[i], boxes[j]
        hi, hj = bi[3] - bi[1], bj[3] - bj[1]
        ds = abs(hj - hi) / max(hi, 1)
        ci = np.array([(bi[0] + bi[2]) / 2, (bi[1] + bi[3]) / 2]); cj = np.array([(bj[0] + bj[2]) / 2, (bj[1] + bj[3]) / 2])
        dc = float(np.linalg.norm(cj - ci) / W)
        return ds, dc, abs(horizons[j])
    med = float(np.median(sharp))
    for i in range(n):
        j = (i + 1) % n
        if boxes[i] is None or boxes[j] is None:
            rows.append({"i": i + 1, "j": j + 1, "ok": False, "motivo": "auto no detectado"}); fails.append(i + 1); continue
        ds, dc, hz = pair(i, j)
        why = []
        if ds > QA_SCALE: why.append(f"escala {ds*100:.1f}%")
        if dc > QA_CENTER: why.append(f"centro {dc*100:.1f}%")
        if hz > QA_HORIZON: why.append(f"horizonte {hz:.1f}°")
        if sharp[i] < 0.55 * med: why.append("borroso")
        if black[i]: why.append("bordes negros")
        if cut[i]: why.append("auto cortado")
        rows.append({"i": i + 1, "j": j + 1, "escala": round(ds * 100, 2), "centro": round(dc * 100, 2),
                     "horizonte": round(hz, 2), "nitidez": round(sharp[i]), "ok": not why, "motivo": ", ".join(why),
                     "empalme": j == 0})
        if why: fails.append(i + 1)
    return rows, fails

def summarize(rows, fails):
    ok = [r for r in rows if "escala" in r]
    s = {"cuadros_con_falla": fails, "n_fallas": len(fails)}
    if ok:
        for k in ("escala", "centro", "horizonte"):
            v = np.array([r[k] for r in ok]); s[f"{k}_max"] = float(v.max()); s[f"{k}_p95"] = float(np.percentile(v, 95))
        s["empalme"] = next((r for r in rows if r.get("empalme")), None)
    return s

# ---------------- principal ----------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("out")
    ap.add_argument("--quads", help="esquinas de la patente por fotograma (json {frame: [[x,y]x4]})")
    ap.add_argument("--plate-color", default="white", choices=["white", "black"])
    ap.add_argument("--frames", type=int, default=120); ap.add_argument("--front", type=int, default=0)
    ap.add_argument("--seg", default="yolov8s-seg.pt"); ap.add_argument("--window", type=int, default=6)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True); work = os.path.join(a.out, "_work"); os.makedirs(work, exist_ok=True)
    W, H, dur, fps = probe(a.video)
    errs = validate(W, H, dur)
    if errs: print("RECHAZADO:\n- " + "\n- ".join(errs)); sys.exit(2)
    if not a.quads: print("RECHAZADO: falta el seguimiento de la patente (--quads)."); sys.exit(2)

    # 1) cubrepatente sobre el video original
    S = smooth_quads(json.load(open(a.quads))); tex = plate_texture(a.plate_color)
    covered = os.path.join(work, "covered.mp4")
    if not os.path.exists(covered):
        write_video((apply_plate(f, S[i], tex) if i in S else f for i, f in enumerate(frames_of(a.video))), covered, W, H, fps)

    # 2) vidstab 2 pasadas
    stab = os.path.join(work, "stab.mp4"); trf = os.path.join(work, "t.trf")
    if not os.path.exists(stab):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", covered, "-vf",
                        f"vidstabdetect=shakiness=8:accuracy=15:stepsize=4:result={trf}", "-f", "null", "-"], check=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", covered, "-vf",
                        f"vidstabtransform=input={trf}:smoothing=15:optalgo=gauss:zoom=0:optzoom=0:crop=black:interpol=bicubic",
                        "-c:v", "libx264", "-crf", "12", "-preset", "fast", stab], check=True)

    # 3) segmentación + nitidez + flujo del fondo, cuadro a cuadro
    meta_p = os.path.join(work, "meta.json")
    if os.path.exists(meta_p):
        meta = json.load(open(meta_p))
    else:
        seg = Segmenter(a.seg); meta = {"box": [], "sharp": [], "dx": [], "rot": [], "valid": []}
        prev = None; last_box = None
        for i, f in enumerate(frames_of(stab)):
            cands, people = seg(f)
            box, m = pick_car(cands, last_box, W, H)
            if box is not None:
                last_box = box; m = m.astype(np.uint8) * 255
            meta["box"].append(box); meta["sharp"].append(sharpness(f))
            small = cv2.cvtColor(cv2.resize(f, (480, 270)), cv2.COLOR_BGR2GRAY)
            ms = cv2.resize(cv2.dilate(m, np.ones((25, 25), np.uint8)), (480, 270)) if m is not None else None
            if ms is not None: ms = cv2.bitwise_or(ms, cv2.resize(people, (480, 270)))
            dx, rot = bg_flow(prev, small, ms) if prev is not None else (0.0, 0.0)
            meta["dx"].append(dx); meta["rot"].append(rot)
            v = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) > 3
            meta["valid"].append([int(np.argmax(v.any(0))), int(W - np.argmax(v.any(0)[::-1])),
                                  int(np.argmax(v.any(1))), int(H - np.argmax(v.any(1)[::-1]))])
            if people.any(): np.save(os.path.join(work, f"people_{i}.npy"), np.packbits(people > 0))
            prev = small
            if i % 100 == 0: print("analizado", i, flush=True)
        json.dump(meta, open(meta_p, "w"))
    n = len(meta["sharp"])

    # 4) ángulo real acumulado (el fondo se desplaza en proporción al giro de la cámara alrededor del auto)
    dx = np.abs(np.array(meta["dx"])); dx = median_filter(dx, 9, mode="nearest")
    ang = np.cumsum(dx); ang = ang / ang[-1] * 360.0
    sharp = np.array(meta["sharp"]); boxes = meta["box"]
    good = np.array([b is not None for b in boxes]) & (sharp > 0.6 * np.median(sharp))
    picks = []
    for k in range(a.frames):
        t = (k * 360.0 / a.frames)
        c = int(np.argmin(np.abs(ang - t)))
        lo, hi = max(0, c - a.window), min(n - 1, c + a.window)
        cand = [i for i in range(lo, hi + 1) if good[i] and (not picks or i > picks[-1])] or [c]
        picks.append(max(cand, key=lambda i: sharp[i] - 0.5 * np.median(sharp) * abs(ang[i] - t) / (360 / a.frames)))

    # 5) similitud por cuadro: misma altura del auto, mismo centro horizontal y misma línea de suelo (suavizado circular)
    B = np.array([boxes[i] if boxes[i] else [np.nan] * 4 for i in picks], float); idx = np.arange(len(B))
    V = [meta["valid"][i] for i in picks]  # zona con imagen tras vidstab [x0, x1, y0, y1]
    src_cut = np.array([bool(np.isnan(b[0]) or b[0] <= v[0] + 6 or b[2] >= v[1] - 6 or b[1] <= v[2] + 6 or b[3] >= v[3] - 6)
                        for b, v in zip(B, V)])
    # con el auto cortado la caja no sirve para medir escala/centro: se interpola desde los vecinos completos
    T = B.copy(); T[src_cut] = np.nan
    if (~src_cut).sum() >= 3:
        for c in range(4):
            m = ~np.isnan(T[:, c]); T[:, c] = np.interp(idx, idx[m], T[:, c][m], period=len(T))
    for c in range(4):
        m = ~np.isnan(B[:, c]); B[:, c] = np.interp(idx, idx[m], B[:, c][m], period=len(B))
    if (~src_cut).sum() < 3: T = B.copy()
    h = T[:, 3] - T[:, 1]; w = T[:, 2] - T[:, 0]; cx = (T[:, 0] + T[:, 2]) / 2; gy = T[:, 3]
    sm = lambda v, s=2.0: gaussian_filter1d(median_filter(v, 5, mode="wrap"), s, mode="wrap")
    h_s, cx_s, gy_s = sm(h), sm(cx), sm(gy)
    # escala común: el auto en vista lateral (más ancho) ocupa TARGET_W_FRAC del ancho final
    # escala común = altura típica del auto en el video (no se agranda el auto más que el video lo permite)
    car_h_out = float(np.percentile(h_s, 60)) * OUT_H / H
    ground_out = OUT_H * 0.86
    rot = np.array(meta["rot"]); rot_acc = gaussian_filter1d(np.cumsum(rot), 30, mode="nearest")

    out_dirs = {"1920": (1920, 1080), "1280": (1280, 720)}
    for d in out_dirs: os.makedirs(os.path.join(a.out, d), exist_ok=True)
    want = {i: k for k, i in enumerate(picks)}; final = [None] * len(picks)
    for i, f in enumerate(frames_of(stab)):
        if i not in want: continue
        k = want[i]
        pp = os.path.join(work, f"people_{i}.npy")
        if os.path.exists(pp):  # inpainting solo de personas (fuera del auto)
            pm = np.unpackbits(np.load(pp))[:H * W].reshape(H, W) * 255
            f = cv2.inpaint(f, cv2.dilate(pm, np.ones((15, 15), np.uint8)), 7, cv2.INPAINT_TELEA)
        final[k] = f
    ref = np.median(np.stack([f.reshape(-1, 3).mean(0) for f in final]), 0)
    gains = np.stack([np.clip(ref / (f.reshape(-1, 3).mean(0) + 1e-6), 0.8, 1.25) for f in final])
    gains = gaussian_filter1d(gains, 3, axis=0, mode="wrap")  # exposición/balance suaves y circulares

    out_boxes, black, cut, sharp_out, sprite, smalls = [], [], [], [], [], []
    for k, f in enumerate(final):
        s = car_h_out / h_s[k]
        M = np.array([[s, 0, OUT_W / 2 - s * cx_s[k]], [0, s, ground_out - s * gy_s[k]]], np.float64)
        img = cv2.warpAffine(np.clip(f * gains[k], 0, 255).astype(np.uint8), M, (OUT_W, OUT_H), flags=cv2.INTER_LANCZOS4,
                             borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))
        valid = cv2.warpAffine(np.full((H, W), 255, np.uint8), M, (OUT_W, OUT_H), flags=cv2.INTER_NEAREST, borderValue=0)
        hole = valid < 128
        black.append(bool(hole.mean() > 0.005))
        if hole.any():  # solo para revisar; un cuadro con borde queda marcado y bloquea la publicación
            img = cv2.inpaint(img, hole.astype(np.uint8) * 255, 5, cv2.INPAINT_TELEA) if hole.mean() < 0.25 else img
        b = B[k]; ob = [b[0] * s + M[0, 2], b[1] * s + M[1, 2], b[2] * s + M[0, 2], b[3] * s + M[1, 2]]
        out_boxes.append(ob)
        cut.append(bool(src_cut[k] or ob[0] < 2 or ob[2] > OUT_W - 2 or ob[1] < 2 or ob[3] > OUT_H - 2))
        sharp_out.append(sharpness(img))
        g = cv2.cvtColor(cv2.resize(img, (480, 270)), cv2.COLOR_BGR2GRAY)
        cm = np.zeros((270, 480), np.uint8); r = 480 / OUT_W
        cv2.rectangle(cm, (int(ob[0] * r), int(ob[1] * r)), (int(ob[2] * r), int(ob[3] * r)), 255, -1)
        smalls.append((g, cm))
        name = f"{k + 1:03d}.webp"
        for d, size in out_dirs.items():
            cv2.imwrite(os.path.join(a.out, d, name), cv2.resize(img, size, interpolation=cv2.INTER_AREA),
                        [cv2.IMWRITE_WEBP_QUALITY, 88 if d == "1920" else 80])
        sprite.append(cv2.resize(img, (192, 108), interpolation=cv2.INTER_AREA))

    # horizonte: giro residual entre cuadros consecutivos elegidos
    # horizonte: giro residual medido sobre el fondo entre cuadros finales consecutivos (incluye el empalme)
    hz = [0.0] * len(picks)
    for k in range(len(picks)):
        j = (k + 1) % len(picks)
        hz[j] = bg_flow(smalls[k][0], smalls[j][0], cv2.bitwise_or(smalls[k][1], smalls[j][1]))[1]
    rows, fails = qa_metrics(out_boxes, hz, sharp_out, black, cut, OUT_W)
    wfrac = [round((b[2] - b[0]) / OUT_W * 100, 1) for b in out_boxes]
    cols = 12; rws = (len(sprite) + cols - 1) // cols
    sh = np.zeros((rws * 108, cols * 192, 3), np.uint8)
    for k, t in enumerate(sprite): sh[(k // cols) * 108:(k // cols + 1) * 108, (k % cols) * 192:(k % cols + 1) * 192] = t
    cv2.imwrite(os.path.join(a.out, "sprite.webp"), sh, [cv2.IMWRITE_WEBP_QUALITY, 72])
    summary = summarize(rows, fails)
    status = "ok" if not fails else "pendiente"
    manifest = {"version": 3, "count": len(picks), "front": a.front, "lo": "1280/{i}.webp", "hi": "1920/{i}.webp",
                "sprite": {"src": "sprite.webp", "cols": cols, "w": 192, "h": 108}, "status": status,
                "qa": summary, "anchoAutoPct": {"min": min(wfrac), "max": max(wfrac)}, "sourceFrames": picks, "sourceAngles": [round(float(ang[i]), 2) for i in picks]}
    json.dump(manifest, open(os.path.join(a.out, "manifest.json"), "w"), indent=1, ensure_ascii=False)
    json.dump(rows, open(os.path.join(a.out, "qa_cuadros.json"), "w"), indent=1, ensure_ascii=False)
    print(json.dumps({"status": status, **{k: v for k, v in summary.items() if k != "empalme"}}, ensure_ascii=False))

if __name__ == "__main__":
    main()
