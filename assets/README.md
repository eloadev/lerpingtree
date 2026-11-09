# 🎨 Recursos gráficos de LERPO

Todo lo visual de LERPO vive aquí. El código los busca **por nombre**, así que si cambias una imagen, guárdala con el **mismo nombre** y en la **misma carpeta**.

## `logos/` — logos de ELOA (PNG transparentes, recortados)

| Archivo | Qué es | Dónde se usa |
|---|---|---|
| `eloa-icono.png` | Solo la cabeza de LERP | Barra superior de toda la app |
| `eloa-horizontal.png` | Logo + "ELOA DEV TEAM" a la derecha, texto azul marino | Disponible |
| `eloa-horizontal-blanco.png` | Igual, texto blanco | Disponible |
| `eloa-vertical.png` | Logo con texto abajo, azul marino | Disponible (aún sin usar) |
| `eloa-vertical-blanco.png` | Igual, texto blanco | Disponible (aún sin usar) |
| `eloa-texto.png` | Solo letras "ELOA DEV TEAM" (sin la cabeza) | Título del login (tema claro) |
| `eloa-texto-blanco.png` | Igual, en blanco | Título del login (tema oscuro) |

## `lerp/` — la mascota (SVG, se ven nítidos en cualquier tamaño)

| Archivo | Pose | Dónde aparece |
|---|---|---|
| `lerp-saludando.svg` | Saluda asomándose desde abajo | Login / crear cuenta y encabezado del dashboard |
| `lerp-mirando-arriba.svg` | Brazos arriba | "Revisa tu correo" |
| `lerp-determinado.svg` | Decidido | Cambiar contraseña |
| `lerp-parado.svg` | De pie, normal | Disponible |
| `lerp-bombilla.svg` | Colgado de cabeza con un foco 💡 | Dashboard sin proyectos ("crea el primero") |
| `lerp-curioso-2.svg` | Se asoma de lado | Pantalla de carga, "necesitas invitación" y búsqueda sin resultados |
| `lerp-curioso.svg` | Se asoma de lado (variante) | Disponible |
| `lerp-contento.svg` | Feliz | Aceptar invitación |
| `lerp-contento-lado.svg` | Feliz asomándose en diagonal | Tarjeta de proyecto al 100% y "¡Sprint terminado!" |
| `lerp-triste.svg` | Triste | Sin acceso, invitación inválida, falta configurar |
| `lerp-bandana.svg` | Con bandana, listo para trabajar | Sprint vacío |
| `lerp-bandana-2.svg` | Con bandana (variante) | Disponible |

Para usar una pose nueva en el código: `lerp('nombre', 'clase-css')` (ver `js/ui.js`). Si agregas un SVG nuevo, ponle `lerp-algo.svg` y regístralo en el objeto `LERP` de `js/ui.js`.

## `favicon/`

`favicon-32.png`, `favicon-64.png` (pestaña del navegador) y `apple-touch-icon.png` (ícono al guardar en el celular), hechos a partir de `eloa-icono.png`.

## Colores ELOA (los mismos del portafolio)

| Color | Hex | Uso |
|---|---|---|
| Azul marino | `#182D42` | Texto principal y botones |
| Azul LERP | `#7DABC5` | Marca, detalles, aro decorativo |
| Fondo | `#F9F9F9` | Fondo general |
| Naranja | `#DA5D1A` | Resaltar ("en **curso**", "**Logic**") |
| Rosa | `#D8A2D8` | Resaltar ("**Art**") |

Tipografías: **Space Grotesk** (títulos), **Montserrat** (texto), **IBM Plex Mono** (etiquetas pequeñas).

> Las imágenes con versión `-blanco` se cambian solas con el botón ☀️/🌙 de tema.
