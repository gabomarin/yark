# Smart Configuration — arquitectura propuesta

Estado: arquitectura aprobada; Bloque 3.1 implementado el 2026-07-24.

## 1. Observaciones

- El workspace presenta `Game.ini` y `GameUserSettings.ini` como destinos
  principales, aunque ambos usan el mismo editor visual.
- Las categorías ya están desacopladas de las secciones técnicas, pero solo se
  pueden recorrer dentro del archivo activo.
- Los defaults canónicos contienen 297 ajustes: 191 de
  `GameUserSettings.ini` y 106 de `Game.ini`.
- El catálogo reconoce 296 de esos 297 ajustes y ya aporta descripción,
  default y tipo para la mayoría.
- La edición raw, el estado de cambios, presets, búsqueda, filtros y
  restauración ya existen y deben conservarse.

## 2. Problemas detectados

- Un usuario debe saber en qué INI buscar antes de expresar qué quiere cambiar.
- Las mismas categorías pueden aparecer en dos pestañas y obligan a alternar
  entre archivos.
- Las keys técnicas son el título principal y muchas descripciones están en
  inglés o son demasiado extensas.
- Todos los ajustes tienen prácticamente la misma jerarquía, aunque algunos
  son frecuentes y otros son operativos, peligrosos o muy especializados.
- Los presets actuales aplican varios cambios desde un selector sin explicar
  suficientemente el resultado antes de aplicarlo.

## 3. Arquitectura de información propuesta

Navegación principal del servidor:

1. `Servidor`
2. `Configuración guiada`
3. `Archivos INI`
4. `Mods`

La experiencia existente no desaparece. `Archivos INI` conserva una navegación
explícita entre `GameUserSettings.ini` y `Game.ini`, con dos modos:

- `Visual por archivo`: el editor categorizado actual.
- `Texto`: la edición raw que hoy se encuentra en `Avanzado`.

Esto preserva los conceptos y la memoria muscular de administradores
experimentados. La acción de abrir el archivo externo permanece en esta vista.

La pestaña `Configuración guiada` combina ajustes de ambos archivos y los
presenta por objetivo:

- Esenciales
- Mundo y dificultad
- Experiencia y recolección
- Dinosaurios
- Domesticación y crianza
- Construcción
- Reglas PvE/PvP
- Jugadores, tribus y comunicación
- Eventos
- Red y administración
- Otros

`Esenciales` es una vista curada de los ajustes más frecuentes; no crea copias
ni una fuente de datos adicional. Red, administración, valores desconocidos y
ajustes poco frecuentes quedan disponibles, pero no dominan la experiencia
inicial.

Ambas vistas operan sobre el mismo `ServerIniPayload`, baseline y estado dirty.
Un cambio realizado en `Configuración guiada` debe verse inmediatamente en
`Archivos INI`, y viceversa. Solo existe una acción de persistencia y una única
fuente de verdad.

Para evitar desorientar a usuarios recurrentes, el workspace recuerda la última
vista de configuración utilizada. Una instalación nueva puede abrir
`Configuración guiada` por defecto sin imponerla en cada visita.

En escritorio se utilizará navegación vertical compacta por categorías. En
ventanas pequeñas se reutilizará el selector desplegable actual; no se usarán
badges horizontales que consuman ancho.

## 4. Componentes y flujo

### Encabezado

- Título orientado a la tarea: `Configuración del juego`.
- Búsqueda global sobre ambos archivos.
- Acceso secundario a perfiles/presets.
- Estado de cambios y requisito de reinicio, sin alertas permanentes.

### Lista de ajustes

- Nombre legible en español como información principal.
- Key técnica y archivo como metadatos secundarios o detalle expandible.
- Descripción corta orientada al efecto.
- Control visual adecuado: switch, número, selector, duración o slider solo
  cuando existan límites confiables.
- Default y restauración disponibles sin ocupar una columna permanente.

### Guardado

- Los cambios de ambos archivos forman una sola sesión.
- Una barra de acciones aparece únicamente cuando hay cambios.
- `Revisar y guardar` abre un resumen legible agrupado por categoría.
- Si el servidor está activo, el resumen indica que los cambios requieren
  reinicio; no debe confundirse guardar con aplicar inmediatamente.

### Archivos INI

- Conserva el editor visual por archivo actual.
- Conserva el editor raw actual como modo `Texto`.
- Selector entre ambos archivos y entre modo visual/texto.
- Ruta y acción de abrir el archivo.
- Comparte payload, baseline, cambios pendientes y guardado con la vista guiada.

## 5. Implementación incremental

### Bloque 3.1 — Separación de experiencias

- Añadir una referencia visual que incluya `fileKey`, sección, key y ocurrencia.
- Crear `Configuración guiada` como vista nueva sin cambiar parser,
  persistencia ni IPC.
- Agrupar el editor actual y la edición raw bajo `Archivos INI`.
- Mantener inicialmente los controles, categorías y búsqueda actuales.
- Compartir una sola sesión de edición entre ambas experiencias.

Este bloque ofrece una entrada más simple sin retirar ni esconder la
experiencia reconocible para administradores.

Estado: completado. La preferencia de experiencia se conserva localmente y
ambas vistas comparten una única instancia de `ConfigurationEditor`.

### Bloque 3.2 — Jerarquía y lenguaje

- Introducir `Esenciales`.
- Añadir nombres legibles en español y descripciones breves.
- Mostrar la key técnica como información secundaria.
- Separar ajustes comunes de opciones técnicas o poco frecuentes.

### Bloque 3.3 — Controles inteligentes

- Definir metadatos confiables de unidad, rango, paso y opciones.
- Añadir selects, duraciones y sliders únicamente donde aporten claridad.
- Mostrar defaults y advertencias contextuales.

### Bloque 3.4 — Revisión y guardado

- Crear resumen de cambios por categoría.
- Unificar el guardado de ambos archivos.
- Mostrar claramente el requisito de reinicio.
- Convertir presets en una experiencia con vista previa.

## 6. Decisiones que requieren aprobación

- Añadir `Configuración guiada` como vista separada.
- Agrupar las pestañas actuales y el editor raw dentro de `Archivos INI`.
- Usar `Esenciales` como entrada predeterminada en lugar de mostrar los 297
  ajustes.
- Recordar la última experiencia utilizada por el usuario.
- Implementar primero el Bloque 3.1 sin rediseñar todavía cada fila ni retirar
  capacidades existentes.
