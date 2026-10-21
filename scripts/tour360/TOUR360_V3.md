# Tour 360 v3: proceso para cada vehículo

Fondo: siempre el patio real de RG (Av. Cardonal). Solo se rellenan personas (inpainting).

## Requisitos (una vez)
```bash
uv venv -p 3.12 .venv
uv pip install -p .venv/bin/python --index-url https://download.pytorch.org/whl/cpu \
  --extra-index-url https://pypi.org/simple torch torchvision ultralytics opencv-python-headless scipy pillow
```

## Generar
```bash
.venv/bin/python scripts/tour360/tour360.py video.mp4 salida/ --quads patente.json --frames 120 [--plate-color black]
```
1. Cubrepatente del tamaño exacto (homografía sobre las 4 esquinas de `patente.json`, suavizado), mate con logo RG chico.
2. vidstab en 2 pasadas.
3. YOLOv8-seg cuadro a cuadro, siguiendo al mismo auto (IoU).
4. Ángulo real por flujo óptico del fondo; 120 cuadros a ángulos iguales, el más nítido de la vecindad, sin atípicos.
5. Similitud por cuadro (misma altura, centro y línea de suelo), suavizado circular (el final empalma con el inicio).
6. Exposición y balance igualados (circular).
7. Control de calidad: escala ≤2 %, centroide ≤1,5 %, horizonte ≤1°, sin borrosos, negros ni auto cortado, empalme sin salto.
   Si falla: `manifest.json` queda con `"status": "pendiente"`. Con ese estado en `catalog_vehicles.spin` la ficha no
   muestra el tour y el admin muestra el aviso «Tour pendiente».

Control solo sobre cuadros ya hechos: `.venv/bin/python scripts/tour360/qa_frames.py carpeta/` (código 1 = pendiente).

## Pendiente del proceso
- Seguimiento automático de las 4 esquinas de la patente para videos nuevos (hoy se entrega `patente.json`; ver `v2/track3.py`).
- Interpolación RIFE/FILM: no incluida. Con un video de ~60 s a 60 fps hay ~30 fotogramas reales por cuadro, no hace falta.
