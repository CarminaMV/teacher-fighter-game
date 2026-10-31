# Teacher Fighter 🥊

Juego de lucha 2D para navegador, hecho con HTML, CSS y JavaScript (sin dependencias).

## 🎮 Jugar

- **Versión en línea:** _(pega aquí la URL de GitHub Pages cuando la actives)_
- **En local:** abre `index.html` con un servidor estático. Por ejemplo, con Node:
  ```
  npx serve .
  ```
  y entra a la dirección que indique (p. ej. `http://localhost:3000`).

## 🕹️ Controles

| Acción            | Jugador 1 | Jugador 2 |
|-------------------|-----------|-----------|
| Moverse           | A / D     | ← / →     |
| Saltar            | W         | ↑         |
| Agacharse / cubrir| S         | ↓         |
| Puñetazo          | F         | K         |
| Patada            | G         | L         |
| Pausa             | ESC       | ESC       |

- **Brincar al rival:** mantén una dirección **+** saltar (salto largo por encima).
- **Ataque aéreo:** en el aire, pulsa puñetazo o patada.
- Las teclas se pueden reconfigurar en **Opciones**.

## ✨ Características

- Pantalla de inicio, selección de personaje y batalla.
- 5 luchadores con velocidad y fuerza distintas.
- Modo 1 jugador (contra la CPU) y 2 jugadores.
- Elección de escenario de batalla.
- Combates al mejor de 3 rounds.
- Música y efectos de sonido.
- Tabla de récords (se guarda en el navegador).

## 📁 Estructura

```
index.html        Página principal
css/style.css     Estilos
js/game.js        Lógica del juego
js/audio.js       Sonido y música
Imagenes/         Fondos y sprites (sprites/ = poses recortadas)
musica/           Música de fondo
```
