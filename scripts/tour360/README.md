# Tour 360° desde un video (patente siempre cubierta)

Pipeline usado para el giro de prueba `public/cars/spin/demo-hilux-dx-roja`.

1. `ffmpeg -i video.mp4 -vf fps=6 -q:v 2 raw/%04d.jpg` (fotos de trabajo, no se suben).
2. `detect.py`: detecta el auto en cada foto (YOLOv8n ONNX, `yolo.onnx`, no versionado).
3. `plates.py`: candidatos automáticos de patente; luego se corrigen a mano (`masks-*.json`).
4. `process.py`: elige 72 fotos parejas y pone el parche **RG MOTORS** sobre la patente
   (y sobre placas de otras automotoras).
5. `crop.py`: estabiliza (centra y normaliza el tamaño del auto) y exporta
   WebP 800×450 (celular) y 1600×900 (`hi/`, pantalla completa/zoom).

**Regla:** revisar visualmente las 72 fotos antes de publicar. Ninguna patente visible.

Para mejores resultados al grabar: vuelta completa a distancia y altura constantes
(~3–4 m, celular a la altura de los focos), caminando lento y parejo, auto entero en cuadro.
