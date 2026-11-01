<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/morph-mark-dark.svg">
    <img src="docs/brand/morph-mark-light.svg" alt="M:orph" width="96">
  </picture>
  <br>
  M:orph
</h1>

<p align="center"><strong>Media Browser</strong><br><em>Los mismos datos, con cualquier forma.</em></p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · Español
</p>

M:orph es una aplicación de escritorio pensada primero para Windows que permite explorar grandes colecciones de carpetas (manga, álbumes, vídeos, música y juegos) como tarjetas, tablas o árboles. Indicas una carpeta raíz para un **proyecto** y la aplicación convierte cada subcarpeta que coincida en un registro que puedes describir, buscar y organizar a tu manera. Solo **muestra** tus datos: nunca mueve, renombra ni borra los originales para poder explorarlos.

**Los datos y su presentación van por separado.** Lo que sabes de una carpeta (título, etiquetas, valoración, origen) se guarda con la carpeta; el aspecto es un diseño que creas una vez y aplicas a todo el proyecto.

> **Dirigido por una persona, construido por IA.** Una persona dirige el proyecto (dirección, requisitos, decisiones de diseño y revisión), mientras que agentes de programación de IA (OpenAI Codex y después Claude Code de Anthropic) escriben el código bajo esa dirección.
>
> El proyecto está en una **fase temprana de desarrollo**. Versión actual: **0.38.0** ([registro de cambios](CHANGELOG.md)).

---

## Qué hace

**Explorar**

- Tres modos sobre los mismos datos: **CARD**, **TABLE** y **TREE**, con memoria por proyecto de filtros, ámbito y ajustes de vista.
- Un panel a la derecha muestra la carpeta seleccionada sin salir de la lista: detalles, archivos, subcarpetas y un lector o reproductor para su contenido.
- Búsqueda en todos los campos con un índice local reconstruible (subcadenas, AND / OR / exclusión, comparaciones numéricas y de fechas, búsquedas guardadas).

**Diseñar la tarjeta**

- Un editor de bloques coloca **componentes** en una cuadrícula: nombres, rutas, texto, etiquetas, números, valoraciones, fechas, opciones, enlaces, imágenes, separadores y componentes de juego (portada, botón de inicio).
- Cada componente tiene su estilo: tamaño, grosor, cursiva / subrayado / tachado, alineación, colores, relleno, esquinas, borde, opacidad, interlineado y espaciado de letras, además de estilos predefinidos. Las etiquetas se pueden colorear por categoría y las opciones pueden tener su propio color.
- Los valores largos se mantienen ordenados: puntos suspensivos, ajuste de línea, una insignia **+N** en las etiquetas o una celda con desplazamiento.
- **Campos alternativos**: un componente puede listar varios campos (por ejemplo, el título de Steam, de DLsite y tus propias notas) y muestra el primero que tenga valor. La búsqueda sigue el mismo orden.
- Vista previa con datos reales dentro del editor, varios diseños con nombre por proyecto y un diseño por tipo de contenido.

**Ver y reproducir**

- Álbum en mosaico y lector de imágenes a pantalla completa; lector de manga con páginas dobles y lectura de derecha a izquierda; reproductor de vídeo con subtítulos (SRT / VTT), reanudación y una cola de audio / vídeo entre proyectos; PDF, ZIP y CBZ dentro de la aplicación.
- Cuando un vídeo no se puede decodificar, la aplicación explica por qué (por ejemplo, un archivo comprimido renombrado) y ofrece abrirlo con el reproductor del sistema.

**Juegos**

- Detecta las carpetas de juegos (incluidos muchos motores japoneses de novelas visuales) y protege su interior: la aplicación nunca crea registros dentro de un juego.
- Acciones de inicio por juego: EXE con argumentos, carpetas, archivos, URL y **accesos directos** (así un acceso directo de Locale Emulator conserva su propia configuración). Un componente de inicio puede pasar de una acción a otra, y cada juego puede ocultar los botones que no usa.

**Completar los datos**

- Pega la dirección de una página y el origen se reconoce automáticamente: E-Hentai / ExHentai, Steam, DLsite, VNDB, Bangumi, AniList, Hitomi, Pixiv, MusicBrainz, Open Library y Wikimedia Commons. Revisa la vista previa y elige qué campos importar. No se descarga nada si no lo pides. Algunos de estos sitios contienen contenido para adultos; usarlos es decisión tuya y se aplican las condiciones de cada sitio.

**Aspecto e idioma**

- Tres temas (oscuro, cristal esmerilado, papel cálido) y cinco idiomas de interfaz (chino tradicional, chino simplificado, inglés, japonés y español).

---

## Cómo se guardan tus datos

```text
Carpetas ──→ registros portátiles de carpeta ──┐
                                               ├──→ diseño del proyecto → componentes en pantalla
Raíz del proyecto ──→ ajustes portátiles ──────┘
                        │ ambos son la fuente de verdad
                        └──→ índice de búsqueda SQLite (reconstruible en cualquier momento)
```

- Cada carpeta gestionada lleva un registro oculto `.media-viewer`, de modo que puede moverse a otro lugar o dispositivo y seguir sabiendo qué es. Tus archivos originales no se tocan. (El nombre de esta carpeta forma parte del formato de datos y se conserva de antes del cambio de nombre del producto.)
- Las escrituras son atómicas y recuperables; la limpieza solo elimina lo que creó la aplicación, siempre con vista previa.
- Los valores se comparten entre proyectos por defecto; una sobrescritura privada debe crearse a propósito.
- Electron se ejecuta con aislamiento de contexto y sandbox; el renderizador no puede leer rutas arbitrarias ni ejecutar comandos.

---

## Primeros pasos

Requiere Node.js 24 y pnpm 10.

```bash
pnpm install
pnpm dev
```

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Ejecuta la aplicación en modo desarrollo |
| `pnpm build` | Comprueba tipos y compila |
| `pnpm typecheck` | Solo comprueba tipos |
| `pnpm test` | Pruebas de datos y lógica |
| `pnpm test:ui:changed` / `:smoke` / `:all` | Pruebas de interfaz con Electron (cambios / conjunto básico / todo) |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm dist` | Crea el instalador de Windows y una versión portátil en `release/` |
| `pnpm shot <game\|manga\|album\|other>` | Captura la aplicación con datos de ejemplo integrados |

Los detalles de verificación están en [IMPLEMENTATION](docs/IMPLEMENTATION.md). GitHub Actions ejecuta la comprobación de tipos, el formato y las pruebas de datos en cada envío.

---

## Tecnología

Electron · React 18 · Vite 7 · TypeScript · Mantine 8 · Node SQLite (índice de búsqueda) · Playwright (pruebas de interfaz)

---

## Documentación

Los documentos de diseño están escritos principalmente en chino tradicional.

- [Índice de documentación](docs/README.md): encuentra el documento adecuado para cada tarea.
- [Alcance del producto](docs/PRODUCT.md) y [arquitectura](docs/ARCHITECTURE.md).
- [Trabajo actual y límites conocidos](docs/WORK_ITEMS.md), [decisiones](docs/DECISIONS.md).
- [Guía de contribución](CONTRIBUTING.md) y [política de seguridad](SECURITY.md) (informa de las vulnerabilidades en privado).
- Colaboradores y agentes de programación: lean primero [CLAUDE.md](CLAUDE.md) (Claude Code) o [AGENTS.md](AGENTS.md) (Codex). El material de las primeras pruebas de concepto está en [docs/archive](docs/archive/) y no es una especificación vigente.

---

## Licencia

Copyright (C) 2024–2026 Zeke Gan. El código fuente es software libre bajo la **Licencia Pública General de GNU, versión 3 o (a tu elección) cualquier versión posterior**; consulta [LICENSE](LICENSE) y [NOTICE.md](NOTICE.md). Las versiones modificadas deben seguir siendo abiertas con la misma licencia y conservar los avisos.

**El nombre y el logotipo no forman parte de esa licencia.** Una versión modificada no puede usar el nombre «M:orph» ni el logotipo de M:orph, ni publicarse como la oficial solo por cambiar el logotipo o el nombre. Consulta la [política de nombre y logotipo](TRADEMARK.md).

M:orph no está afiliado a ninguno de los sitios web de los que puede leer información; sus nombres pertenecen a sus propietarios.

---

## Autor

**Zeke Gan** — [GitHub](https://github.com/ZekeGan)
