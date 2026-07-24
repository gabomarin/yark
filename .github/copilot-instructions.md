# Copilot Instructions

## Source of truth
- Antes de continuar cualquier trabajo en este repositorio, revisa `TODO.md`.
- Usa `TODO.md` como referencia principal para saber que ya esta hecho, que esta parcial y que falta.
- Si completas una tarea o cambias el estado real del proyecto, actualiza `TODO.md` en el mismo cambio.

## Prioridad de trabajo
- A menos que el usuario indique otra prioridad, continua desde la seccion `Siguiente prioridad recomendada` de `TODO.md`.
- No reabras trabajo ya marcado como hecho salvo que el usuario pida correccion, refactor o ampliacion.
- Cuando propongas el siguiente paso, alinealo con los pendientes del `TODO.md`.

## Reglas del proyecto
- Mantener la arquitectura actual: Electron + React + TypeScript + SQLite local (`node:sqlite`).
- Preferir cambios pequenos, verificables y centrados en la causa raiz.
- No introducir dependencias nativas innecesarias si existe una alternativa pura de Node/TypeScript.
- Para rutas de Windows, preservar compatibilidad con entorno Windows real.

## Verificacion
- Si se tocan backend, shared o flujos criticos: ejecutar `npm test` y `npm run typecheck`.
- Si se tocan renderer, preload, main o integracion app: ejecutar `npm run build`.
- Si se tocan flujos de UI principales: ejecutar `npm run e2e` cuando sea viable.
- Si hay cambios visuales en el renderer: seguir `docs/visual-testing.md` y revisar con Playwright/Electron en `1280x720`, `1920x1080` y `2560x1440`.
- En este repo, para verificacion fiable, preferir comandos por `cmd.exe /c` cuando el entorno WSL falle por dependencias opcionales de Rollup.

## Continuidad
- Si hay varias opciones razonables, elige la que cierre mas pendientes reales del `TODO.md` con el menor riesgo.
- Si agregas nuevas pruebas, intenta que queden repetibles y automatizadas.
- Si detectas una nueva deuda tecnica relevante, registrala en `TODO.md`.
