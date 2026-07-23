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
- [-] Base de pruebas unitarias, integracion y E2E inicial.

### Multi-servidor
- [-] Crear, editar, clonar y eliminar multiples perfiles de servidor.
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
- [ ] Prueba E2E completa contra binario real de ASA en el host.

### Cluster / transferencias
- [x] Configuracion de `clusterId` y `clusterDir` por servidor.
- [x] Validacion de consistencia de cluster entre mapas.
- [x] Verificacion visual de cumplimiento de cluster en la UI.
- [ ] Flujo validado con servidores reales compartiendo cluster y transferencias reales.

### Configuracion INI
- [x] Editor avanzado de `GameUserSettings.ini` y `Game.ini`.
- [x] Plantillas / presets de configuracion comunes.
- [x] Validacion y diff antes de guardar cambios en INI.

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
- [ ] Gestion avanzada de mods desde Steam Workshop / CurseForge si aplica.
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
- [-] Cola persistente de jobs criticos para updates y bootstrap (cola persistente con reintentos en install-files/update y backup/restore; falta visibilidad completa en UI).

### Observabilidad y logs
- [x] Eventos recientes persistidos y visibles en UI.
- [x] Estado runtime por servidor.
- [-] Vista de logs de proceso / update / backup desde la UI (filtros de eventos, búsqueda, scroll interno, copia y exportación listos; rediseño Fase 2 aplicado: tabs superiores Events/Runtime/Update Logs/Backups, panel "Update History" con detalle y botón "Open in external viewer" vía `shell.openPath`; ya migrado al frontend nuevo como `LogsPage` sobre Mantine + CSS Modules para el histórico persistido. Sigue pendiente salida en vivo durante una operación SteamCMD activa y el refinamiento visual final del tab de updates).
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
- [-] Rediseño de navegación tipo sidebar (Fase 1 completa: shell con sidebar persistente + páginas Overview fusionado con Servers, Clusters, Backups, SteamCMD, Logs, Settings; iconografía y responsive con colapso de sidebar a solo-iconos en <900px). Fase "corrección de fidelidad" completa: iconografía migrada a librería real `@phosphor-icons/react` (reemplaza SVGs a mano, mismo `IconName` API), ServerCard rediseñado con thumbnail placeholder, meta-grid de 2 filas (Jugadores/Mapa/Cluster, Mods/Versión/Estado) y fila de acciones icon-only (Iniciar, Detener, Reiniciar, Abrir carpeta, menu kebab con Editar/INI/Logs/Instalar-Actualizar/Clonar/Forzar cierre/Eliminar), tarjeta de estadística de SteamCMD eliminada de Overview y reemplazada por Backups (placeholder) y Updates (real, comparando `officialVersion` vs versión local detectada), "Official Version" reubicado al Sidebar. Fase 2 (rediseño de Logs) completa en su parte estática: tabs superiores Events/Runtime/Update Logs/Backups, Update History con detalle y visor del log, botón "Open in external viewer" (IPC `logs:open-update-file` vía `shell.openPath`); el histórico persistido ya fue migrado al frontend nuevo como `LogsPage`. Inicio de rewrite UI v2 en `ux_refactor`: base del renderer migrada a Mantine + CSS Modules + aliases nuevos en `electron.vite.config.ts`/`tsconfig.json`; shell nuevo (`AppShellLayout`, `Sidebar`, `PageScaffold`) ya activo y recuperó banner global de errores; `Overview`, `SteamCMD` y `Logs` ya están reimplementados con componentes nuevos; `Clusters`, `Backups` y `Settings` siguen como placeholders homogéneos dentro del shell nuevo; el árbol visual legacy del frontend ya fue removido. Pendiente inmediato: migrar la siguiente página real, recuperar el editor INI con diseño dedicado y, en Logs, sumar salida en vivo cuando haya operación SteamCMD activa.
- [ ] Asistentes guiados para bootstrap, update y restore.

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
	- `npm run typecheck`: OK.
	- `npm run build`: OK.
	- `npm run e2e:smoke` y `npm run e2e`: fallan por instalación de Electron en el entorno.
- Criterio aplicado: cada check se marcó como `[x]` solo cuando existe evidencia funcional vigente; si hay implementación parcial o desalineada, se marcó `[-]`; si no hay evidencia o está roto, `[ ]`.

## Siguiente prioridad recomendada
1. Cerrar Fase 2 del rediseño de Logs: salida en vivo (streaming) cuando hay una operación SteamCMD activa para el servidor seleccionado (hoy el tab "Update Logs" solo muestra histórico estático leído de disco).
2. Fase 3 del rediseño: páginas dedicadas Clusters/Backups/SteamCMD/Settings con el mismo nivel de pulido que Overview, más estados de carga/vacío/error en las server cards (siguiendo el mockup de referencia, con placeholders para imagen de mapa hasta definir el asset real).
3. Completar cola persistente de jobs críticos para cubrir backup/restore y exponer estado en UI.
4. E2E real contra binario ASA y SteamCMD del host.
5. Gestion avanzada de mods.

## Regla de mantenimiento
- Cada vez que se complete una tarea, actualizar este archivo en el mismo cambio.
- Si cambia la prioridad por decision del usuario, reflejarlo aqui.
- Si una tarea se divide, agregar subtareas en lugar de perder detalle.
