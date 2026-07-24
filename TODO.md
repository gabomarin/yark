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
- [x] UI amigable de Mods (lista, detalle, alta por ID, reorden) con metadata mock local.
- [ ] Sustituir mock por CurseForge API oficial cuando exista `CURSEFORGE_API_KEY` (Overwolf).
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
- [-] Panel de SteamCMD en UI (estado + salida de consola reciente + cancelación de proceso activa por servidor + ruta manual configurable; jerarquía operativa, consola de altura completa y contexto técnico compacto completados. Pendientes únicamente acciones más avanzadas por servidor si una necesidad real las justifica).
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
- [x] Simplificar `ServerCard` y mostrar solo información real y prioritaria (bloque 2.2: fila operativa horizontal, metadatos escaneables y menú secundario).
- [x] Definir una única acción primaria contextual por estado del servidor (`Instalar`, `Iniciar`, `Actualizar`, `Administrar`, `Revisar error` o `Cancelar`).
- [-] Mover RCON fuera de la tarjeta hacia el workspace o la futura consola (retirado del Overview; acciones rápidas en workspace, comando personalizado pendiente de la consola avanzada).
- [x] Mejorar estados vacíos, carga, error, instalación y actualización (skeletons de carga, primer servidor y búsqueda sin resultados completan los estados del Overview).
- [x] Compactar Actividad reciente a cinco eventos operativos, retirar el ruido RCON del resumen y conservar acceso directo a Registros.
- [x] Reducir gradientes, sombras y tarjetas anidadas (superficies planas, profundidad mediante contraste y sombras reservadas para elementos flotantes).
- [-] Introducir una dirección visual propia: primer pase Paleo-Tech aplicado y documentado en `docs/design-direction.md`; falta extenderlo gradualmente a pantallas secundarias.
- [-] Diseñar una marca propia para la aplicación sin depender del logo antiguo de ARK Survival Evolved (símbolo biotecnológico inicial en el sidebar; pendiente icono final de distribución).
- [x] Validar el layout en ventanas de escritorio amplias y compactas.

Criterio de cierre:

- [x] En menos de cinco segundos se entiende cuántos servidores existen, cuáles están activos y cuáles necesitan atención (resumen + badge ámbar + espina/acción primaria por fila).
- [x] La pantalla se siente específica para administrar mundos de ARK y no como un dashboard genérico (Paleo-Tech en Overview/SteamCMD/Registros; sin métricas decorativas).
- [x] Las acciones frecuentes requieren menos decisiones sin ocultar capacidades avanzadas (una primaria contextual; secundarias en kebab; “Nuevo servidor” como CTA del header).

Validación del bloque 2.3 (2026-07-24):

- [x] Typecheck y build.
- [x] Tests focalizados del Overview, Actividad reciente y ServerCard: 8/8.
- [x] Build real revisado con Playwright en `1280×720`, `1920×1080` y `2560×1440`.
- [x] Estado de búsqueda sin resultados y navegación a Registros verificados.
- [x] Sin overflow horizontal, errores de consola ni excepciones del renderer.
- [x] Actividad reciente limitada a cinco eventos relevantes y sin comandos RCON.

Validación del bloque 2.4 — identidad Paleo-Tech (2026-07-24):

- [x] Typecheck y build.
- [x] Tests conjuntos de AppShell, Overview, Actividad reciente, ServerCard y workspace: 11/11.
- [x] Overview y workspace revisados con Playwright en `1280×720`, `1920×1080` y `2560×1440`.
- [x] Sin overflow horizontal, errores CSP, errores de consola ni excepciones del renderer.
- [x] Gradientes decorativos retirados del renderer activo y patrón topográfico empaquetado como asset local.

Validación del bloque 2.5 — paleta Radix personalizada (2026-07-24):

- [x] Escalas completas de azul, gris neutral y alpha integradas como tokens del renderer, con variantes Display P3/OKLCH.
- [x] Tokens semánticos y variables internas de Mantine alineados con la misma fuente de color.
- [x] Estados de foco, hover y selección migrados desde colores heredados a niveles alpha de Radix.
- [x] Typecheck, build y tests focalizados de AppShell, Overview, Actividad reciente, ServerCard y workspace: 11/11.
- [x] Overview, workspace, Registros y SteamCMD revisados con Playwright en `1280×720`, `1920×1080` y `2560×1440`.
- [x] Sin overflow horizontal, errores de consola ni excepciones del renderer en las doce capturas.

Validación del bloque 2.6 — Obsidian Atmosphere (2026-07-24):

- [x] Sidebar y lienzo unificados mediante una transición azul noche–obsidiana.
- [x] Degradados limitados al ambiente, navegación activa y filas operativas; acciones y superficies de trabajo conservan claridad.
- [x] Tokens semánticos de panel y borde enfriados sin modificar las escalas Radix originales.
- [x] Typecheck, build y tests focalizados de AppShell, Overview, ServerCard y workspace: 9/9.
- [x] Overview y workspace revisados con Playwright en `1280×720`, `1920×1080` y `2560×1440`.
- [x] Sin overflow horizontal, errores de consola ni excepciones del renderer.

Auditoría UX/UI posterior al bloque 2.6 (2026-07-24):

- [x] Reequilibrar la escala de superficies: borde de control/panel elevado de aproximadamente `1.51:1` a `3.10:1`; foco/control alcanza `6.85:1`.
- [x] Reducir la mezcla de temperaturas en workspace y editores mediante niveles semánticos de chrome, panel, control, hover y bordes.
- [x] Dar más ancho útil al editor INI en `1280×720`: modo compacto responsive con editor a ancho completo y paneles secundarios bajo demanda.
- [x] Simplificar filtros de categorías del editor INI: selector único con cantidades y opciones disponibles por archivo.
- [x] Registros usa el alto del viewport, scroll interno y una jerarquía master-detail compacta que prioriza la consola sobre metadatos y superficies decorativas.
- [x] Diferenciar jerarquía en SteamCMD: estado operativo, contexto técnico y consola tienen pesos y alturas acordes a su importancia.
- [x] Revisar el exceso de vacío del Overview en `2560×1440` sin convertirlo nuevamente en un dashboard de métricas.

Validación del bloque 2.7 — microtextura Tek (2026-07-24):

- [x] SVG continuo propio con geometría fragmentada, conexiones, nodos y estratos; sin dependencias ni recursos externos.
- [x] Textura empaquetada como asset local de menos de `2 KB`, sin `currentColor`, rutas absolutas ni `background-attachment: fixed`.
- [x] Curvas topográficas macro conservadas como capa independiente.
- [x] Repetición presentada a `720×720` y atenuada mediante máscara vertical para proteger las áreas de contenido.
- [x] Typecheck, build y tests focalizados de AppShell, Overview y workspace: 5/5.
- [x] Overview, workspace y Registros revisados con Playwright en `1280×720`, `1920×1080` y `2560×1440`.
- [x] Sin costuras visibles, overflow horizontal, errores de consola ni excepciones del renderer.

Validación del bloque 2.8 — selección de servidor (2026-07-24):

- [x] Relleno azul intenso sustituido por una superficie oscura con contaminación azul mínima.
- [x] Selección comunicada mediante indicador lateral, borde tenue y énfasis del icono.
- [x] Build y test focalizado del workspace: 1/1.
- [x] Workspace revisado con Playwright en `1280×720`, `1920×1080` y `2560×1440`.
- [x] Sin overflow horizontal, errores de consola ni excepciones del renderer.

Validación del bloque 2.9 — contenedores de servidor (2026-07-24):

- [x] Superficie gris sustituida por una mezcla semántica azul noche–obsidiana.
- [x] Nuevos tokens `--app-color-panel-cool` y `--app-color-panel-cool-emphasis` disponibles para contenedores operativos.
- [x] Skeletons y estados vacíos del listado alineados con la misma temperatura visual.
- [x] Typecheck, build y tests focalizados de Overview y ServerCard: 6/6.
- [x] Overview revisado con Playwright en `1280×720`, `1920×1080` y `2560×1440`.
- [x] Sin overflow horizontal, errores de consola ni excepciones del renderer.

Validación del bloque 2.10 — jerarquía de superficies (2026-07-24):

- [x] Escala semántica aplicada a workspace, formulario de servidor, editores INI, panel de servidores y acciones laterales.
- [x] Controles Mantine alineados globalmente con superficie, borde, hover, disabled y foco coherentes.
- [x] Tabs activas, cabeceras de tabla y separadores retirados de grises/rgba locales.
- [x] Texto principal suavizado sin perder legibilidad; texto secundario conserva jerarquía suficiente.
- [x] Typecheck, build y tests focalizados de AppShell, Overview, ServerCard y workspace: 9/9.
- [x] Servidor, Game.ini, GameUserSettings.ini, Overview, Registros y SteamCMD revisados con Playwright en `1280×720`, `1920×1080` y `2560×1440`.
- [x] Sin overflow horizontal, errores de consola ni excepciones del renderer en las dieciocho capturas.
- [x] Registros y SteamCMD no presentan regresiones; su jerarquía interna permanece como trabajo explícito de bloques posteriores.

Validación del bloque 2.11 — workspace adaptable (2026-07-24):

- [x] A menos de `1600 px`, la lista de servidores y el panel de estado/acciones dejan de competir permanentemente con el editor.
- [x] Selector de servidor y acciones secundarias reutilizados en drawers izquierdo y derecho; iniciar, reiniciar y detener permanecen visibles en el header.
- [x] Cambio de servidor desde el drawer cierra la capa y conserva la protección ante cambios INI sin guardar.
- [x] El editor alcanza `1032 px` de ancho útil en `1280×720`; a partir de `1600 px` vuelve al layout de tres columnas con un mínimo medido de `832 px`.
- [x] Typecheck, build y tests focalizados de AppShell, Overview, ServerCard y workspace: 10/10.
- [x] Playwright/Electron revisado en `1280×720`, `1598×900`, `1600×900`, `1920×1080` y `2560×1440`.
- [x] Servidor, Game.ini, GameUserSettings.ini, Mods y Avanzado recorridos; drawers y scroll real con rueda verificados.
- [x] Sin overflow horizontal o vertical global, errores de consola ni excepciones del renderer.

Validación del bloque 2.12 — filtros de categorías INI (2026-07-24):

- [x] Quince botones de categoría sustituidos por un único selector buscable junto a la búsqueda de ajustes.
- [x] El selector muestra solo categorías presentes en el archivo activo e incluye la cantidad de ajustes de cada una.
- [x] Una categoría se conserva al cambiar de archivo si sigue disponible; si deja de existir, vuelve automáticamente a “Todos los ajustes”.
- [x] En `1280×720` se eliminaron dos filas de chips y la tabla comienza aproximadamente `80 px` antes.
- [x] Selector, menú, selección de categoría y scroll con rueda verificados con datos reales.
- [x] Typecheck, build y pruebas focalizadas del workspace y taxonomía de categorías: 6/6.
- [x] Game.ini y GameUserSettings.ini revisados con Playwright/Electron en `1280×720`, `1920×1080` y `2560×1440`.
- [x] Sin overflow global, errores de consola ni excepciones del renderer.

Validación del bloque 2.13 — altura operativa de Registros (2026-07-24):

- [x] `PageScaffold` extendido con modo `fillViewport` opcional, sin modificar el comportamiento de las demás páginas.
- [x] Header y tabs permanecen visibles; Eventos, Ejecución, Actualizaciones y Respaldos ocupan únicamente el alto restante.
- [x] Eventos, backups, historial de updates y contenido de consola tienen regiones de scroll independientes.
- [x] En `1280×720`, la página pasó de aproximadamente `4321 px` de alto a exactamente `720 px`; Eventos conserva `4092 px` de contenido dentro de una región de `470 px`.
- [x] Actualizaciones mantiene lista y detalle en paralelo; los metadatos y la acción externa permanecen visibles mientras la consola se desplaza.
- [x] Estados vacíos de Eventos, Ejecución y Respaldos centrados y explicativos para evitar tarjetas vacías sin intención.
- [x] Typecheck, build y tests focalizados de Registros: 2/2.
- [x] Los cuatro tabs revisados con Playwright/Electron en `1280×720`, `1920×1080` y `2560×1440`.
- [x] Scroll con rueda verificado; sin overflow global, errores de consola ni excepciones del renderer.

Validación del bloque 2.14 — densidad y jerarquía de Actualizaciones (2026-07-24):

- [x] Cuatro tarjetas de metadatos sustituidas por una franja compacta de `58 px` con fecha, duración y tamaño.
- [x] El servidor redundante se retiró del detalle; permanece visible en el selector global.
- [x] La acción “Abrir en visor externo” se integró en el encabezado del detalle sin ocupar una fila propia.
- [x] El historial identifica el archivo real y conserva la fecha como contexto secundario.
- [x] La selección azul intensa se sustituyó por una superficie oscura, borde tenue e indicador lateral coherentes con el workspace.
- [x] Encabezados del master-detail reducidos a `18 px`, UUID a `14 px` y metadatos a `11–12 px` para evitar que el chrome compita con la consola.
- [x] En `1280×720`, la consola de actualización creció de aproximadamente `213 px` a `400 px`; alcanza `760 px` en Full HD y `1120 px` en 2K.
- [x] Typecheck, build y tests focalizados de Registros: 2/2.
- [x] Eventos, Ejecución, Actualizaciones y Respaldos revisados con Playwright/Electron en `1280×720`, `1920×1080` y `2560×1440`.
- [x] Sin overflow global, recortes en metadatos prioritarios, errores de consola ni excepciones del renderer.

Validación del bloque 2.17 — design review de cierre Iteración 2 (2026-07-24):

- [x] Badge operativo “N necesitan atención” (sin instalar / update / error) junto al resumen de servidores.
- [x] “Verificar actualizaciones” del header pasó a `subtle` para no competir con “Nuevo servidor”.
- [x] Meta “Archivos” en tono warn cuando falta instalación o hay update.
- [x] Protocolo visual: `npm run build` + `node scripts/visual-iter2-review.cjs` en `1280×720`, `1920×1080` y `2560×1440`.
- [x] Pantallas: Overview, SteamCMD, Registros (Eventos/Actualizaciones), Workspace (Servidor / Archivos INI / Mods).
- [x] Evidencia QHD: resumen `2 servidores · ninguno activo`, badge `2 necesitan atención`, primarias `Actualizar`/`Instalar`, sin overflow ni errores de consola.
- [x] Tests focalizados Overview + ServerCard: 9/9; typecheck y build correctos.
- [x] Diferidos explícitos: icono final de distribución; Paleo-Tech en placeholders Clusters/Backups/Settings; RCON avanzado en consola.

Validación del bloque 2.16 — Overview en QHD/2K (2026-07-24):

- [x] Retirado el tope estrecho de `1680 px`; el contenido útil crece hasta `2200–2400 px`.
- [x] A partir de `1600 px`, servidores y actividad reciente pasan a layout paralelo con panel sticky (sin métricas decorativas).
- [x] Documentado en `docs/design-direction.md` bajo “Overview en pantallas amplias”.
- [x] Typecheck y tests focalizados de Overview / ServerCard.
- [x] Protocolo visual (`docs/visual-testing.md`) con `npm run build` + `node scripts/visual-overview.cjs`.
- [x] Resoluciones: `1280×720` (apilado), `1600×900` (paralelo), `1920×1080` (paralelo), `2560×1440` (paralelo; overview ≈ `2312 px`, servidores ≈ `1796 px`, actividad `400 px`).
- [x] Sin overflow horizontal, errores de consola ni `pageerror` en las cuatro capturas.
- [x] CTA primaria “Nuevo servidor” visible; actividad no compite con la lista en 720p (queda debajo).
- [x] Script reutilizable: `scripts/visual-overview.cjs` (capturas en `%TEMP%\ark-gbo-visual-overview`).

Validación del bloque 2.15 — SteamCMD operativo y superficies azul‑obsidiana (2026-07-24):

- [x] Métricas genéricas y tarjetas técnicas independientes sustituidas por estado operativo, franja de contexto y consola principal.
- [x] Estados no configurado, disponible y en curso definen automáticamente título, explicación, badge, indicador y acción relevante.
- [x] Progreso activo integra porcentaje, bytes procesados, cola y cancelación sin competir con la consola.
- [x] Ruta, versión oficial, depotcache y contenido ASA agrupados en una franja compacta con truncado y valor completo accesible mediante tooltip nativo.
- [x] `SteamCmdPage` usa el alto completo del viewport; la consola pasó de un máximo fijo de `360 px` a `351 px` en 720p, `711 px` en Full HD y `1071 px` en 2K.
- [x] El dock flotante de progreso se oculta automáticamente cuando SteamCMD ya es la vista activa.
- [x] SteamCMD y Registros adoptan la misma familia azul‑grisácea de Servidores con menor intensidad para conservar la jerarquía.
- [x] Typecheck, build y tests focalizados de SteamCMD y Registros: 4/4.
- [x] SteamCMD y Actualizaciones revisados con Playwright/Electron en `1280×720`, `1920×1080` y `2560×1440`.
- [x] Sin overflow global, errores de consola ni excepciones del renderer.

Corrección operativa — falso positivo de actualización ASA (2026-07-24):

- [x] La disponibilidad de updates deja de comparar `ARK Version` del log local con la versión observada en un servidor oficial externo.
- [x] El estado se determina únicamente comparando el `buildid` del `appmanifest_2430930.acf` local con el build público de Steam.
- [x] Si falta alguno de los builds comparables, la UI muestra “Sin verificar” en lugar de afirmar “Actualizado” o “Actualización disponible”.
- [x] Una acción explícita de actualizar o verificar siempre consulta SteamCMD; la caché fresca solo se reutiliza al instalar archivos en otros servidores.
- [x] El sidebar aclara que la versión ARK oficial es informativa y que SteamCMD determina los updates.
- [x] Caso real validado con local `92.21`, valor tercero previamente observado `92.23` y build Steam coincidente `24346423`: Archivos muestra “Actualizado” y la acción es “Iniciar”.
- [x] La aplicación se relanzó dos veces mediante Playwright/Electron; el estado permaneció consistente después del reinicio y no hubo errores del renderer.
- [x] Pruebas de regresión para builds coincidentes, builds atrasados, fuentes incomparables y caché explícita; typecheck y build correctos.
- [-] Suite completa: 130/131 en ejecución conjunta por el `EBUSY` conocido al limpiar una carpeta temporal de Windows; la prueba de proceso real pasa aislada 1/1.

Corrección de fuente — versión oficial ARK (2026-07-24):

- [x] Eliminada la dependencia del servidor Arkpocalypse fijo de ArkStatus.
- [x] Versión informativa obtenida desde `https://cdn2.arkdedicated.com/asa/officialserverstatus.ini`, publicado por el CDN oficial de ARK/Wildcard.
- [x] Parser tolera estados como `Online` o `Deploying` y extrae únicamente el valor `(vX.Y)`.
- [x] Si el estado oficial no incluye versión, la UI muestra “No detectada”; no sustituye el dato con un build Steam incompatible.
- [x] Fuente real verificada con respuesta `Online (v92.21)`.
- [x] Sidebar validado en `1280×720`, `1920×1080` y `2560×1440`, además de dos lanzamientos consecutivos de Electron: `92.21` consistente y sin errores del renderer.
- [x] Tests focalizados: 28/28; typecheck y build correctos.

Corrección INI — ajustes de cliente regenerados por ASA (2026-07-24):

- [x] Confirmado que los defaults canónicos de `src/shared/defaults` no contienen claves de cliente.
- [x] Identificado que el servidor dedicado de ASA regenera la sección `ShooterGameUserSettings` en el archivo runtime.
- [x] La lectura del backend filtra secciones y claves de cliente antes de exponer la configuración.
- [x] El editor usa el contenido filtrado como baseline y ya no muestra cambios pendientes ni pide guardar para limpiar ruido generado.
- [x] La lectura permanece no destructiva; el archivo en disco solo cambia durante una acción real de guardado.
- [x] Tests focalizados 19/19, typecheck y build correctos.
- [x] Editor real validado en `1280×720`, `1920×1080` y `2560×1440`: sin aviso, claves de cliente, falso estado pendiente, overflow global ni errores del renderer; scroll interno funcional.

### Iteración 3 — Smart Configuration

Objetivo: convertir la configuración visual en la experiencia principal y
relegar los archivos INI a Advanced Mode.

- [x] Arquitectura de información aprobada y documentada en `docs/smart-configuration-architecture.md`.
- [-] Organizar los ajustes más utilizados por objetivos del usuario; primera selección curada de 16 conceptos completada, ampliación pendiente de validar.
- [x] Integrar Smart Configuration como asistente bajo demanda sin retirar la experiencia reconocible de `Game.ini` y `GameUserSettings.ini`.
- [-] Añadir nombres legibles y descripciones orientadas a resultados para los ajustes curados; catálogo completo pendiente.
- [-] Enriquecer controles según tipo y rango; perfiles, presets semánticos, switches e inputs numéricos cubren ya el asistente inicial.
- [x] Mostrar perfiles recomendados y consecuencias sin aplicar cambios al seleccionarlos.
- [x] Añadir un resumen legible de cambios antes de guardar.
- [x] Permitir consultar los valores anterior/nuevo desde el contador de cambios en cualquier paso.
- [x] Mantener visible el estado de cambios pendientes y si requieren reiniciar el servidor.
- [x] Conservar el editor visual actual y la edición raw de ambos archivos dentro de una vista explícita `Archivos INI`.
- [ ] Dividir `ConfigurationEditor` gradualmente por responsabilidades sin reescribir su lógica funcional.
- [ ] Preparar la gestión de mods para CurseForge, dependencias, conflictos, orden de carga y actualizaciones.

Bloques propuestos:

- [x] 3.1 Agrupar la experiencia visual/raw existente bajo `Archivos INI`.
- [x] 3.2 Crear asistente bajo demanda de cinco pasos para servidores existentes.
- [x] 3.3 Ampliar y validar la selección curada de ajustes frecuentes.
- [x] 3.4 Reutilizar el asistente opcionalmente después de crear un servidor.

Validación del bloque 3.2 — asistente bajo demanda:

- [x] Eliminada la pestaña provisional que solo fusionaba ambos INI.
- [x] Lanzador integrado en `Servidor`; navegación habitual reducida a Servidor, Archivos INI y Mods.
- [x] Cinco pasos iniciales: perfil, ritmo, crianza, comodidad y revisión (ampliados en 3.3).
- [x] Ritmo y crianza usan presets semánticos coordinados; muestran sus multiplicadores exactos y permiten volver a los valores actuales.
- [x] El modo individual se presenta como ajuste de alto impacto, nunca cambia implícitamente con un perfil y muestra tasas efectivas conocidas.
- [x] Dificultad se presenta como un solo concepto; nivel máximo, `DifficultyOffset` y `OverrideOfficialDifficulty` se coordinan únicamente tras una elección explícita.
- [x] `Muy rápido` diferencia claramente el ritmo con XP `5×`, recolección `5×` y domesticación `10×`.
- [x] Abrir, recorrer y cancelar trabajan sobre un borrador y no escriben en disco.
- [x] Solo se modifican conceptos curados; contenido desconocido y casing de secciones se conservan.
- [x] Antes de aplicar se relee el disco y el borrador se superpone sobre la versión más reciente para preservar cambios externos.
- [x] El asistente se bloquea si el editor manual tiene cambios pendientes.
- [x] Aplicación final usa Zod, preview del backend y guardado explícito; el editor manual se recarga después.
- [x] Tests focalizados 26/26, typecheck y build correctos.
- [-] Suite completa 147/148 por el `EBUSY` conocido al limpiar una carpeta temporal de Windows; la prueba de proceso real pasa aislada 1/1.
- [x] Launcher, inicio y revisión recorridos con Playwright/Electron en `1280×720`, `1920×1080` y `2560×1440`.
- [x] Scroll interno funcional en 720p, footer/progreso accesibles, sin overflow global, errores de consola ni excepciones.

Validación del bloque 3.3 — ampliación curada:

- [x] Nuevos conceptos: MaxPlayers, densidad, salud de nodos, ciclo día/noche, drain comida/agua, resistencia de estructuras.
- [x] Paso `Mundo` con presets semánticos (Base / Amable / Equilibrado / Exigente); perfiles de experiencia los declaran.
- [x] Tests de modelo cubren escritura INI y presets de mundo.

Validación del bloque 3.4 — onboarding post-creación:

- [x] Tras crear (no clonar) se abre workspace con checklist opcional.
- [x] Checklist: experiencia, cluster, puertos e instalar archivos; `Más tarde` no bloquea.
- [x] `Configurar con asistente` reutiliza `ConfigurationWizard`.
- [x] Conflictos de puerto vía `findPortConflicts` compartido; compliance de cluster vía `checkCluster`.
- [x] Ajuste de presets, dificultad, modo individual y resumen interactivo: pruebas focalizadas 16/16, typecheck y build correctos.
- [x] Ritmo, crianza y modal de cambios revisados en Electron a `1280×720`, `1920×1080` y `2560×1440`; sin overflow ni errores del renderer.
- [x] Modo individual, tasas efectivas y dificultad compuesta revisados con scroll real en las tres resoluciones; footer siempre accesible.

Criterio de cierre:

- [x] Un usuario nuevo puede configurar los ajustes comunes sin saber qué archivo INI contiene cada setting.
- [x] Un administrador experimentado conserva acceso directo y confiable a los archivos raw.
- [ ] La navegación puede crecer sin convertirse en una lista plana o una tabla inmanejable.

### Design review obligatorio por iteración

Antes de marcar una iteración como completada:

- [x] Prueba visual del build real según `docs/visual-testing.md` en `1280×720`, `1920×1080` y `2560×1440` (Iteración 2: `scripts/visual-iter2-review.cjs`).
- [x] Claridad: la pantalla se entiende en menos de cinco segundos.
- [x] Jerarquía: lo más importante es lo más visible.
- [x] Acciones: la acción principal destaca y las secundarias no compiten.
- [x] Consistencia: se reutilizan patrones y componentes existentes.
- [x] Espaciado: las secciones respiran sin desperdiciar espacio.
- [x] Escalabilidad: el diseño admite más servidores y settings.
- [x] Profesionalismo: no hay placeholders, contenido simulado ni acabados provisionales visibles en los flujos activos (placeholders de rutas no migradas quedan fuera del cierre).

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
1. Página funcional de **Backups** (backend ya existe); después Clusters y Settings.
2. Cuando haya `CURSEFORGE_API_KEY`: sustituir mock de mods por cliente oficial; discovery/updates/cluster después.
3. Diferido: partir `ConfigurationEditor`, icono final de distribución, RCON en consola avanzada.

## Regla de mantenimiento
- Cada vez que se complete una tarea, actualizar este archivo en el mismo cambio.
- Si cambia la prioridad por decision del usuario, reflejarlo aqui.
- Si una tarea se divide, agregar subtareas en lugar de perder detalle.
