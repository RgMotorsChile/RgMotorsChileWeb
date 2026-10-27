# Autores

Este archivo identifica al autor del software y resume el historial de Git de `main`. No es un certificado legal.

## Autor

| Campo | Dato |
| --- | --- |
| Nombre | Mathias Jara |
| Rol | Desarrollador full-stack |
| GitHub | [MathiasAlejandr0](https://github.com/MathiasAlejandr0) |
| Correo de contacto | mathias.jara@hotmail.com |
| Años con commits en `main` | 2026 |

El nombre, el rol, el usuario de GitHub y el correo de contacto son los datos indicados para esta constancia. El correo `mathias.jara@hotmail.com` no aparece en `git log`. Las identidades que sí registró Git están en la sección siguiente.

En los commits, Git también guardó el nombre **Mathias Alejandro Jara Alvarado** junto al correo `111708379+MathiasAlejandr0@users.noreply.github.com`.

## Historial de Git

Cifras del commit `e456148f970204824f8c10524b7cf1ef68601d3c` (`main` el 2026-10-22). Cubren solo los commits alcanzables desde ese SHA: 214. No incluyen commits que existan únicamente en otras ramas.

Comando de origen:

```bash
git log e456148f970204824f8c10524b7cf1ef68601d3c \
  --pretty=format:'%H%x09%aN%x09%aE%x09%aI' --numstat
```

Cada commit suma 1 a la identidad `Nombre <email>` tal como quedó grabada. Las líneas añadidas y eliminadas son la suma de las columnas numéricas de `--numstat`. Las filas con `-` (archivos binarios) no entran en esas sumas; su cantidad va aparte. Hay 14 merge commits en este historial y, con el `git log` por defecto (sin `-m`), no aportan filas numstat.

### Primer commit

| Campo | Dato |
| --- | --- |
| Commit | `9eed10dbef77f76d4cba0f160528e69adb38950b` |
| Fecha de autor | 2026-07-28T15:45:59-04:00 |
| Autor | Mathias Alejandro Jara Alvarado \<111708379+MathiasAlejandr0@users.noreply.github.com\> |
| Asunto | Initial commit |

### Último commit

| Campo | Dato |
| --- | --- |
| Commit | `e456148f970204824f8c10524b7cf1ef68601d3c` |
| Fecha de autor | 2026-10-22T15:30:26-03:00 |
| Autor | Mathias Alejandro Jara Alvarado \<111708379+MathiasAlejandr0@users.noreply.github.com\> |
| Asunto | feat: ficha pública, slug sin patente y un auto por sucursal |

### Commits y líneas por autor

| Autor en Git | Commits | Líneas añadidas | Líneas eliminadas | Filas binarias |
| --- | ---: | ---: | ---: | ---: |
| Mathias \<math.jaraa@duocuc.cl\> | 152 | 125425 | 65955 | 8781 |
| Mathias Alejandro Jara Alvarado \<111708379+MathiasAlejandr0@users.noreply.github.com\> | 33 | 12060 | 2338 | 5 |
| RgMotorsChile \<administracion@rgmotorschile.cl\> | 18 | 2084 | 125 | 144 |
| Cursor Agent \<cursoragent@cursor.com\> | 9 | 2810 | 500 | 1 |
| RgMotorsChile \<327515373+RgMotorsChile@users.noreply.github.com\> | 1 | 9 | 22 | 0 |
| cursor[bot] \<206951365+cursor[bot]@users.noreply.github.com\> | 1 | 0 | 0 | 0 |
| **Total** | **214** | **142388** | **68940** | **8931** |

`git shortlog -sn e456148f970204824f8c10524b7cf1ef68601d3c` agrupa por nombre y junta los dos correos de RgMotorsChile en 19 commits. La tabla de arriba los deja separados.

La suma de las dos identidades cuyo nombre en Git empieza por Mathias es aritmética de esas filas: 185 commits, 137485 líneas añadidas y 68293 líneas eliminadas. No reasigna los commits firmados con otro nombre.
