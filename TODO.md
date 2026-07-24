# TODO

Estado del proyecto para continuar el trabajo sin perder contexto.

## Criterio de estado
- `[x]` Hecho
- `[-]` Parcial / en progreso
- `[ ]` Pendiente

## MVP y requisitos principales

### Plataforma base
- [x] Aplicacion de escritorio Windows con Electron + React + TypeScript.
- [x] Persistencia local con SQLite (`node:sqlite`).
- [x] Arquitectura separada en main / preload / renderer / backend.
- [x] Documentacion inicial de proyecto y contexto para humanos/agentes (README + docs/agent-context.md).
- [-] Base de pruebas unitarias, integracion y E2E inicial.

### Multi-servidor
- [-] Crear, editar, clonar y eliminar multiples perfiles de servidor.
- [x] Al crear, la carpeta elegida es base y el servidor se instala en `base\<nombre>` (p. ej. `C:\ark_servers` + `my_server` → `C:\ark_servers\my_server`); la UI muestra la ruta final.
- [x] Validacion de puertos y conflictos entre instancias.
- [x] Visualizacion de estado por servidor en la UI.
- [x] Visualizacion de estado de instalacion (instalado/no instalado) y version detectada por servidor.
- [ ] E2E UI para crear, clonar y eliminar servidores.

### Lifecycle / operacion del servidor
- [x] Iniciar servidor.
- [x] Detener servidor con intento de guardado previo por RCON.
- [x] Forzar cierre del servidor.
- [-] Restart seguro con backup previo.
- [x] Prueba automatizada de arranque real del `ProcessManager` hasta estado `running`.
- [x] Estado `starting` hasta readiness real (RCON ListPlayers / señales de log); si falla o hace timeout → `error` (no se queda en `running` falso).
- [x] Eliminar servidor borra perfil y carpeta `installDir` del disco (con guardas de ruta y de installDir compartido).
- [ ] Prueba E2E completa contra binario real de ASA en el host.

### Cluster / transferencias
- [x] Configuracion de `clusterId` y `clusterDir` por servidor.
- [x] Validacion de consistencia de cluster entre mapas.
- [x] Verificacion visual de cumplimiento de cluster en la UI.
- [ ] Flujo validado con servidores reales compartiendo cluster y transferencias reales.

### Configuracion INI
- [x] Catalogo ASA de settings (descripciones/defaults desde INI comentados del usuario + wiki.gg) integrado en shared; defaults/known keys derivados del catalogo.
- [x] Editor avanzado de `GameUserSettings.ini` y `Game.ini`.
- [x] Plantillas / presets de configuracion comunes.
- [x] Validacion y diff antes de guardar cambios en INI.
- [x] Defaults canónicos en `src/shared/defaults/GameUserSettings.ini` y `Game.ini` (source of truth con comentarios); el catálogo ASA solo agrega keys faltantes.
- [-] Workspace de servidor en el frontend nuevo (lista lateral para cambiar de servidor, Configuration con tabla Setting/Value/Description, presets, raw Advanced, mods basicos y panel de acciones). Falta pulido visual final, Startup Parameters editable y tabs Files/Backups/Logs/Players/Console del mockup.

### Backups y restore
- [x] Backup manual.
- [x] Backups programados.
- [x] Backups pre-restart.
- [-] Backups pre-update.
- [x] Backups de salvaguarda pre-restore.
- [x] Politicas de retencion por cantidad y dias.
- [x] Restore desde backup.
- [ ] Historial de restore en DB.
- [ ] Seleccion manual de backup especifico desde UI mas completa.
- [ ] Exportacion / importacion de backups o restore externo guiado.

### Mods
- [x] Campo basico de mods por IDs en orden de carga.
- [ ] Gestion avanzada de mods desde CurseForge para ASA.
- [ ] Validacion de compatibilidad de mods entre nodos de cluster.
- [ ] Instalacion / actualizacion automatica de mods.

### Tareas administrativas / RCON
- [x] Cliente RCON propio.
- [x] Comandos rapidos (`SaveWorld`, `ListPlayers`, `Broadcast`).
- [x] Campo para comando RCON personalizado.
- [ ] Historial visible de respuestas RCON en UI.

### Updates seguras
- [-] Update seguro por servidor con backup previo.
- [-] Stop -> update -> start -> health check -> rollback si falla.
- [-] Registro de eventos de update.
- [-] Log de update en disco.
- [-] Ruta configurable de `steamcmd.exe`.
- [-] Instalador asistido de SteamCMD.
- [-] Bootstrap de archivos base del servidor por SteamCMD.
- [x] Caché SteamCMD reutilizable entre servidores: `cwd` en home de SteamCMD (depotcache), `force_install_dir` antes de login, instalación compartida `asa_content_cache` + sync local (robocopy) preservando `ShooterGame\Saved`.
- [-] Cola persistente de jobs criticos para updates y bootstrap (cola persistente con reintentos en install-files/update y backup/restore; falta visibilidad completa en UI).

### Observabilidad y logs
- [x] Eventos recientes persistidos y visibles en UI.
- [x] Estado runtime por servidor.
- [x] Progreso de install/update visible: panel flotante con consola en vivo, barra de progreso en ServerCard, push IPC + poll 1s mientras hay operación.
- [-] Vista de logs de proceso / update / backup desde la UI (filtros de eventos, búsqueda, scroll interno, copia y exportación listos; rediseño Fase 2 aplicado: tabs superiores Events/Runtime/Update Logs/Backups, panel "Update History" con detalle y botón "Open in external viewer" vía `shell.openPath`; ya migrado al frontend nuevo como `LogsPage` sobre Mantine + CSS Modules para el histórico persistido. Pendiente refinamiento visual final del tab de updates).
- [ ] Rotacion avanzada de logs.
- [ ] Diagnostico guiado para fallos de arranque reales.

### Automatizacion / robustez / idempotencia
- [x] Lock en memoria por instancia para evitar operaciones conflictivas.
- [-] Scheduler de backups en memoria.
- [-] Idempotencia parcial en jobs criticos (sumada cola persistente y reintentos para jobs críticos de SteamCMD).
- [ ] Persistencia de cola / locks / jobs para recuperacion tras reinicio de la app.
- [ ] Reintentos controlados para operaciones remotas o de sistema.
- [ ] Endpoint IPC dedicado de "reiniciar servidor" (hoy el botón Reiniciar de ServerCard hace `stop` + `start` secuencial desde el renderer, sin atomicidad ni manejo de fallo intermedio a nivel backend).

### UX operativa
- [x] Selector nativo de carpeta para rutas de servidor y cluster.
- [x] Boton para abrir la carpeta del servidor en Explorer.
- [x] Opcion en Overview para abrir CMD nativo de Windows al iniciar un servidor (toggle persistente en UI).
- [x] Botones contextuales para instalar archivos y ejecutar update server.
- [x] Boton global para instalar SteamCMD (ruta por defecto local).
- [x] Selector nativo de archivo para `steamcmd.exe`.
- [-] Panel de SteamCMD en UI (estado + salida de consola reciente + cancelación de proceso activa por servidor + ruta manual configurable; ya migrado al frontend nuevo con `SteamCmdPage` en Mantine + CSS Modules. Pendiente: pulido visual, métricas extra y, si hace falta, acciones más avanzadas por servidor durante operaciones activas).
- [-] Mejoras visuales para gestionar backups, restores y logs (aplicado rediseño base del UI, navegación por secciones en logs, scroll interno en paneles, mejor uso del ancho e iconografía; queda pulido final y diagnóstico guiado).
- [-] Rediseño de navegación tipo sidebar (Fase 1 completa: shell con sidebar persistente + páginas Overview fusionado con Servers, Clusters, Backups, SteamCMD, Logs, Settings; iconografía y responsive con colapso de sidebar a solo-iconos en <900px). Fase "corrección de fidelidad" completa: iconografía migrada a librería real `@phosphor-icons/react` (reemplaza SVGs a mano, mismo `IconName` API), ServerCard rediseñado con thumbnail placeholder, meta-grid de 2 filas (Jugadores/Mapa/Cluster, Mods/Versión/Estado) y fila de acciones icon-only (Iniciar, Detener, Reiniciar, Abrir carpeta, menu kebab con Editar/INI/Logs/Instalar-Actualizar/Clonar/Forzar cierre/Eliminar), tarjeta de estadística de SteamCMD eliminada de Overview y reemplazada por Backups (placeholder) y Updates (real, comparando `officialVersion` vs versión local detectada), "Official Version" reubicado al Sidebar. Fase 2 (rediseño de Logs) completa en su parte estática: tabs superiores Events/Runtime/Update Logs/Backups, Update History con detalle y visor del log, botón "Open in external viewer" (IPC `logs:open-update-file` vía `shell.openPath`); el histórico persistido ya fue migrado al frontend nuevo como `LogsPage`. Rewrite UI v2: shell nuevo activo; `Overview`, `SteamCMD` y `Logs` migrados; `Clusters`, `Backups` y `Settings` siguen como placeholders. **Server Workspace (editor de servidor) Fase 1**: desde Overview → INI se abre layout de 3 columnas (lista de servidores para cambio rápido / Configuration INI+mods / panel de status+quick actions), reutilizando IPC de INI existente. Pendiente inmediato: pulir workspace, Startup Parameters editable, tabs restantes del mockup, streaming en Logs, y después página Backups.
- [ ] Asistentes guiados para bootstrap, update y restore.

## Roadmap de producto y UX

Esta sección sigue el pulido comercial del renderer por separado del backlog
funcional. Las mejoras deben reutilizar la arquitectura y los componentes
existentes siempre que sea razonable. Antes de cambios significativos de layout
se presenta una propuesta para aprobación.

### Iteración 1 — Limpieza y coherencia

Objetivo: eliminar señales de producto incompleto o genérico sin rediseñar las
pantallas principales.

- [x] Unificar el idioma visible del renderer y eliminar mezclas innecesarias de español e inglés.
- [x] Retirar del Overview métricas vacías o marcadas como "próximamente".
- [x] Ocultar tabs, rutas y acciones que todavía no ofrecen una experiencia funcional.
- [x] Eliminar las notas temporales del workspace mientras no tengan persistencia.
- [x] Mover "Mostrar consola del servidor al iniciar" fuera del encabezado de Overview.
- [x] Corregir referencias de mods de Workshop a CurseForge para ASA.
- [x] Usar controles Mantine apropiados en el formulario (`Select`, `NumberInput`, `PasswordInput`) donde aporten claridad y validación.
- [x] Consolidar colores, radios, sombras, superficies y estados en el theme compartido mediante variables semánticas consumidas por los estilos del renderer.
- [x] Definir un patrón único de feedback para notificaciones, alertas contextuales y errores.
- [x] Revisar textos menores de 12 px y corregir los que comprometan legibilidad.

Patrón de feedback vigente:

- Notificación: confirmación o resultado breve que no bloquea el flujo.
- Alerta contextual: error o advertencia que pertenece a una pantalla, formulario o editor.
- Alerta del shell: fallo de una acción operativa global; no se duplica como notificación.
- Modal: confirmación destructiva, pérdida de cambios o decisión con riesgo.
- Dock de progreso: operaciones prolongadas de SteamCMD y su cancelación.

Criterio de cierre:

- [x] No hay contenido simulado, controles muertos ni inconsistencias evidentes de idioma en los flujos activos.
- [x] Overview, creación de servidor y workspace pasan una revisión de claridad, jerarquía, acciones, consistencia y accesibilidad mediante Playwright y Chrome DevTools.

Validación del primer pase (2026-07-24):

- [x] Tests del renderer: 11/11.
- [x] Typecheck.
- [x] Build.
- [-] Suite completa: 116/117 en ejecución conjunta; la prueba de proceso real falla al limpiar una carpeta temporal bloqueada por Windows (`EBUSY`) y pasa al ejecutarse de forma aislada.
- [x] Revisión visual del build real en Electron a 1440x900 y 1100x720: sin errores de consola ni overflow horizontal.
- [x] Fuente real verificada mediante Chrome DevTools (`Segoe UI`); se eliminó el fallback efectivo a `Trebuchet MS`.
- [x] Acción Guardar visible desde el primer viewport en creación y edición de servidor.
- [x] Scroll vertical común en todas las tabs del workspace; los editores INI conservan un scroll interno para listas extensas.
- [x] Acceso al archivo INI simplificado como acción contextual junto al título, con la ruta disponible mediante tooltip.
- [x] Tabs del workspace ajustadas a la altura disponible: las tablas INI crecen con la ventana y Servidor comparte la misma superficie y patrón de scroll.
- [x] Protocolo visual completo en `1280×720`, `1920×1080` y `2560×1440`: creación y workspace sin overflow global ni errores de consola; scrolls internos operativos.
- [x] Hallazgos no bloqueantes trasladados a Iteración 2: Overview desperdicia espacio en pantallas amplias y conserva patrones de dashboard genérico.

### Iteración 2 — Overview operativo e identidad visual

Objetivo: hacer que la pantalla principal priorice servidores y problemas que
requieren atención, con una identidad propia de centro de operaciones de mundos
ARK sin convertirse en una interfaz gamer.

- [x] Presentar y aprobar una propuesta incremental de layout antes de implementarla.
- [x] Sustituir el dashboard de métricas por un resumen operativo compacto y accionable (bloque 2.1: métricas retiradas, búsqueda contextual y ancho útil limitado).
- [ ] Simplificar `ServerCard` y mostrar solo información real y prioritaria.
- [ ] Definir una única acción primaria contextual por estado del servidor.
- [ ] Mover RCON fuera de la tarjeta hacia el workspace o la futura consola.
- [ ] Mejorar estados vacíos, carga, error, instalación y actualización.
- [ ] Reducir gradientes, sombras y tarjetas anidadas.
- [ ] Introducir una dirección visual propia: base obsidiana, azul criogénico, ámbar fósil, verde biomasa y motivos topográficos sutiles.
- [ ] Diseñar una marca propia para la aplicación sin depender del logo antiguo de ARK Survival Evolved.
- [ ] Validar el layout en ventanas de escritorio amplias y compactas.

Criterio de cierre:

- [ ] En menos de cinco segundos se entiende cuántos servidores existen, cuáles están activos y cuáles necesitan atención.
- [ ] La pantalla se siente específica para administrar mundos de ARK y no como un dashboard genérico.
- [ ] Las acciones frecuentes requieren menos decisiones sin ocultar capacidades avanzadas.

### Iteración 3 — Smart Configuration

Objetivo: convertir la configuración visual en la experiencia principal y
relegar los archivos INI a Advanced Mode.

- [ ] Presentar y aprobar la arquitectura de información antes de cambiar la navegación.
- [ ] Organizar settings por objetivos del usuario: jugabilidad, mundo, dinosaurios, domesticación y crianza, construcción, experiencia/rates y otras categorías necesarias.
- [ ] Evitar que `Game.ini` y `GameUserSettings.ini` sean conceptos principales fuera de Advanced Mode.
- [ ] Añadir nombres legibles y descripciones orientadas a resultados para los settings.
- [ ] Enriquecer controles según tipo y rango usando switches, selects, sliders, inputs numéricos y presets cuando correspondan.
- [ ] Mostrar valores recomendados, defaults y consecuencias relevantes sin saturar la pantalla.
- [ ] Añadir un resumen legible de cambios antes de guardar.
- [ ] Mantener visible el estado de cambios pendientes y si requieren reiniciar el servidor.
- [ ] Conservar edición raw de ambos INI dentro de Advanced Mode.
- [ ] Dividir `ConfigurationEditor` gradualmente por responsabilidades sin reescribir su lógica funcional.
- [ ] Preparar la gestión de mods para CurseForge, dependencias, conflictos, orden de carga y actualizaciones.

Criterio de cierre:

- [ ] Un usuario nuevo puede configurar un servidor común sin saber qué archivo INI contiene cada setting.
- [ ] Un administrador experimentado conserva acceso directo y confiable a los archivos raw.
- [ ] La navegación puede crecer sin convertirse en una lista plana o una tabla inmanejable.

### Design review obligatorio por iteración

Antes de marcar una iteración como completada:

- [ ] Prueba visual del build real según `docs/visual-testing.md` en `1280×720`, `1920×1080` y `2560×1440`.
- [ ] Claridad: la pantalla se entiende en menos de cinco segundos.
- [ ] Jerarquía: lo más importante es lo más visible.
- [ ] Acciones: la acción principal destaca y las secundarias no compiten.
- [ ] Consistencia: se reutilizan patrones y componentes existentes.
- [ ] Espaciado: las secciones respiran sin desperdiciar espacio.
- [ ] Escalabilidad: el diseño admite más servidores y settings.
- [ ] Profesionalismo: no hay placeholders, contenido simulado ni acabados provisionales visibles.

## Pruebas y verificacion actual
- [x] Unit tests verdes.
- [x] Typecheck verde.
- [x] Build verde.
- [ ] Smoke E2E de lanzamiento de app Electron.
- [ ] Suite E2E formal de crear / clonar / eliminar servidor.
- [ ] E2E de bootstrap + start + stop con binario real de ASA.
- [ ] E2E de update seguro con rollback real.

## Validacion realizada (estado actual)
- Fecha de validacion: 2026-07-23.
- Comandos ejecutados:
	- `npx vitest run src/renderer/src/app/AppProviders.test.tsx src/renderer/src/app/AppShellLayout.test.tsx src/renderer/src/features/servers/components/ServerForm/ServerForm.test.tsx src/renderer/src/features/servers/components/ServerCard/ServerCard.test.tsx src/renderer/src/features/overview/OverviewPage.test.tsx`: OK.
	- `npx vitest run src/renderer/src/features/steamcmd/SteamCmdPage.test.tsx`: OK.
	- `npx vitest run src/renderer/src/features/logs/LogsPage.test.tsx`: OK.
	- `npx vitest run tests/unit/ini-model.test.ts src/renderer/src/features/server-workspace/ServerWorkspacePage.test.tsx`: OK.
	- `npm run typecheck`: OK.
	- `npm run build`: OK.
	- `npm run e2e:smoke` y `npm run e2e`: fallan por instalación de Electron en el entorno.
- Criterio aplicado: cada check se marcó como `[x]` solo cuando existe evidencia funcional vigente; si hay implementación parcial o desalineada, se marcó `[-]`; si no hay evidencia o está roto, `[ ]`.

## Siguiente prioridad recomendada
1. Pulir editor de servidor (workspace): Startup Parameters editable y tabs restantes del mockup.
2. Página dedicada de Backups.
3. Streaming en vivo de Logs durante SteamCMD.
4. Clusters / Settings como páginas reales.
5. E2E real contra binario ASA y SteamCMD del host.
6. Gestion avanzada de mods (Workshop / thumbnails / instalación automática).

## Regla de mantenimiento
- Cada vez que se complete una tarea, actualizar este archivo en el mismo cambio.
- Si cambia la prioridad por decision del usuario, reflejarlo aqui.
- Si una tarea se divide, agregar subtareas en lugar de perder detalle.
