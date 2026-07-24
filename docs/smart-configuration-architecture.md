# Smart Configuration — arquitectura propuesta

Estado: asistente bajo demanda para servidores existentes implementado el 2026-07-24.

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
2. `Archivos INI`
3. `Mods`

La experiencia existente no desaparece. `Archivos INI` conserva una navegación
explícita entre `GameUserSettings.ini` y `Game.ini`, con dos modos:

- `Visual por archivo`: el editor categorizado actual.
- `Texto`: la edición raw que hoy se encuentra en `Avanzado`.

Esto preserva los conceptos y la memoria muscular de administradores
experimentados. La acción de abrir el archivo externo permanece en esta vista.

La configuración para principiantes no es una pestaña permanente. Se abre bajo
demanda desde `Servidor → Asistente de configuración`, porque entrar a una
pestaña no debe insinuar que explorar y aplicar recomendaciones son la misma
acción.

El asistente es una vista dedicada de cinco pasos:

1. Perfil de experiencia.
2. Ritmo de progresión mediante niveles semánticos.
3. Crianza mediante niveles semánticos.
4. Reglas de comodidad.
5. Revisión y aplicación.

Lee los valores actuales y crea un borrador aislado. Elegir perfiles, avanzar o
cancelar no escribe archivos. Solo `Aplicar cambios` valida, previsualiza y
guarda ambos INI. Las keys no administradas por el asistente se preservan.

## 4. Componentes y flujo

### Borrador

- Se inicializa desde los INI reales.
- Usa conceptos comprensibles, no keys técnicas.
- Modifica únicamente 16 conceptos frecuentes.
- Coordina ajustes relacionados mediante presets comprensibles, pero siempre
  muestra los multiplicadores exactos que producirá cada selección.
- `Actual` restaura únicamente los valores originales del grupo activo y
  conserva el resto del borrador.
- `Ajustes para una persona o grupo pequeño` es una decisión explícita de alto
  impacto. Los perfiles la conservan y nunca la activan o desactivan
  implícitamente.
- Cuando el modo individual está activo, Ritmo y Crianza muestran tanto el
  multiplicador configurado como el efectivo conocido. También se advierten
  los efectos que no pueden reducirse a una sola tasa.
- La dificultad es un concepto compuesto: el usuario elige el nivel máximo
  común y el asistente coordina `DifficultyOffset=1` con
  `OverrideOfficialDifficulty=nivel/30`. Los valores originales se preservan
  mientras el usuario mantenga `Actual`.
- Se descarta íntegramente al cancelar.
- No puede abrirse si `Archivos INI` tiene cambios pendientes.

### Revisión y guardado

- Presenta valor anterior y nuevo con lenguaje humano.
- El contador de cambios abre este mismo resumen desde cualquier paso; no es
  únicamente un indicador pasivo.
- Valida el modelo con Zod.
- Relee los INI antes de aplicar y superpone solo los ajustes curados.
- Solicita un preview al backend antes de guardar.
- Informa si el servidor requiere reinicio.
- Después de aplicar, recarga el editor manual desde disco.

### Archivos INI

- Conserva el editor visual por archivo actual.
- Conserva el editor raw actual como modo `Texto`.
- Selector entre ambos archivos y entre modo visual/texto.
- Ruta y acción de abrir el archivo.
- Sigue siendo la experiencia habitual para administradores experimentados.

## 5. Implementación incremental

### Bloque 3.1 — Archivos INI

- Agrupar editor visual y raw bajo una sola vista.
- Preservar selector de archivo, apertura externa y restauración.

Estado: completado.

### Bloque 3.2 — Asistente bajo demanda

- Lanzador contextual desde `Servidor`.
- Cinco pasos con perfiles y valores actuales.
- Borrador aislado, resumen legible y aplicación explícita.
- Protección frente a cambios manuales pendientes.

Estado: completado para servidores existentes.

### Bloque 3.3 — Ampliación curada

- Validar con usuarios los ajustes más utilizados.
- Añadir nuevos campos solo con rango, unidad y consecuencias confiables.
- Mejorar las recomendaciones sin convertir el asistente en otro editor total.

### Bloque 3.4 — Creación de servidores

- Reutilizar el mismo asistente después de crear un servidor.
- Ofrecer `Configurar experiencia`, `Usar defaults` y `Hacerlo más tarde`.
- Mantener el onboarding opcional y no bloquear instalación o arranque.

## 6. Decisiones vigentes

- No existe una pestaña permanente llamada `Configuración guiada`.
- Abrir el asistente nunca cambia los INI.
- Los perfiles son puntos de partida del borrador, no estados persistidos.
- Ritmo y crianza usan niveles discretos en vez de un slider continuo: varios
  multiplicadores cambian en direcciones distintas y una escala numérica única
  ocultaría esa relación.
- Los presets no se describen como tasas oficiales, porque eventos y cambios de
  Wildcard pueden alterar temporalmente esa referencia.
- Los factores adicionales del modo individual se mantienen centralizados y
  documentados con la referencia de
  [ARK Official Community Wiki](https://ark.wiki.gg/wiki/Single_Player).
- El resumen se deriva de cambios reales; no existe una segunda fuente de verdad.
- La integración posterior a la creación reutilizará este mismo flujo.
