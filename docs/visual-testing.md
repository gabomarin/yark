# Protocolo de pruebas visuales

Esta guía es obligatoria cuando un cambio modifica layout, estilos, navegación,
componentes visibles o comportamiento responsive del renderer.

## Tamaños de ventana requeridos

La revisión debe ejecutarse, como mínimo, en estos tres viewports del renderer:

| Perfil | Viewport (píxeles CSS) | Objetivo |
| --- | ---: | --- |
| HD / compacto | `1280 × 720` | Detectar recortes, acciones fuera de vista, scrolls ausentes y layouts demasiado densos. |
| Full HD | `1920 × 1080` | Validar la experiencia principal de escritorio. |
| QHD / 2K | `2560 × 1440` | Detectar anchos excesivos, contenido que no crece y espacios vacíos no intencionales. |

En este proyecto, **2K significa QHD `2560 × 1440`**. Las medidas corresponden
al viewport de contenido de Electron, no a la resolución física del monitor.
Playwright debe establecerlas explícitamente con `page.setViewportSize`.

Si el cambio afecta un breakpoint concreto, se añade una resolución cercana a
ese breakpoint; no sustituye ninguno de los tres tamaños obligatorios.

## Requisitos

- Windows nativo o un entorno capaz de abrir aplicaciones GUI de Windows.
- Node.js 20 o superior y npm.
- Dependencias instaladas mediante `npm install`.
- Electron y Playwright disponibles desde las dependencias del proyecto.
- Un build actualizado generado con `npm run build`.
- Permiso para abrir temporalmente la ventana de Electron y guardar capturas.
- Datos locales suficientes para representar el flujo revisado. Para el
  workspace se necesita al menos un servidor y contenido que produzca scroll;
  para los INI deben existir suficientes ajustes para validar la tabla extensa.

Algunos entornos tienen `ELECTRON_RUN_AS_NODE=1`. Electron no abrirá su ventana
correctamente mientras esa variable esté activa. Debe eliminarse únicamente
para el proceso de la prueba:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

En un script Node aislado puede hacerse antes de lanzar Electron:

```js
delete process.env.ELECTRON_RUN_AS_NODE;
```

## Procedimiento con Playwright

1. Ejecutar `npm run build`.
2. Lanzar el proyecto compilado con `_electron.launch`.
3. Esperar `domcontentloaded` y un elemento estable de la pantalla.
4. Registrar errores de `console` y `pageerror`.
5. Recorrer `1280×720`, `1920×1080` y `2560×1440` mediante
   `page.setViewportSize`.
6. Capturar la pantalla inicial y los estados relevantes después de interactuar.
7. Probar scroll con rueda, no solo modificando `scrollTop` mediante JavaScript.
8. Cerrar Electron aunque la prueba falle.

Plantilla mínima:

```js
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

async function run() {
  const sizes = [
    { name: "hd", width: 1280, height: 720 },
    { name: "full-hd", width: 1920, height: 1080 },
    { name: "qhd-2k", width: 2560, height: 1440 },
  ];

  const app = await electron.launch({ args: ["."], cwd: process.cwd() });

  try {
    const page = await app.firstWindow();
    const errors = [];

    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.waitForLoadState("domcontentloaded");

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.screenshot({
        path: path.join(os.tmpdir(), `visual-${size.name}.png`),
        fullPage: false,
      });
    }

    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

La plantilla es un punto de partida. Cada revisión debe navegar e interactuar
con la pantalla modificada, no limitarse a capturar la pantalla inicial.

## Qué debe revisarse

En cada resolución:

- La acción principal es visible y no compite con acciones secundarias.
- No hay contenido recortado ni controles inaccesibles.
- Todo contenido extenso tiene un scroll evidente y funcional.
- No aparece overflow horizontal inesperado.
- Las superficies que deben crecer usan la altura y el ancho disponibles.
- Headers, toolbars y acciones sticky no cubren contenido.
- Los textos no se truncan salvo que exista una alternativa para consultarlos.
- Estados hover, focus, disabled, loading, error y vacío siguen siendo legibles
  cuando formen parte del cambio.
- No hay errores en consola ni excepciones del renderer.

La revisión debe incluir la pantalla completa —shell, sidebar y paneles
adyacentes— además del componente modificado. Si el cambio afecta el workspace
del servidor, deben revisarse al menos las pestañas Servidor, `Game.ini`,
`GameUserSettings.ini`, Mods y Avanzado.

## Evidencia y cierre

Antes de cerrar el cambio se debe registrar:

- Resoluciones revisadas.
- Pantallas y estados recorridos.
- Resultado de consola y `pageerror`.
- Problemas encontrados y correcciones aplicadas.
- Cualquier limitación que impidiera completar una resolución.

Las capturas temporales no necesitan versionarse. Si una decisión visual debe
conservarse como referencia de producto, su documentación sí debe añadirse a
`docs/` o al plan correspondiente.
