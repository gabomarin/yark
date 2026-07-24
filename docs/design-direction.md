# Dirección visual — Paleo-Tech Operations

## Idea central

La interfaz representa tecnología avanzada operando mundos primitivos. La
identidad debe comunicar precisión, control y vida antigua sin convertirse en
una interfaz gamer ni copiar la identidad visual de ARK.

La mezcla se denomina **Paleo-Tech Operations**.

## Lenguaje visual

- **Obsidiana:** lienzo y superficies principales. Debe sentirse profundo,
  estable y sobrio.
- **Azul criogénico:** acciones, selección, navegación y procesos técnicos.
- **Ámbar fósil:** atención, instalaciones pendientes, updates y elementos que
  requieren una decisión.
- **Verde biomasa:** salud, disponibilidad y operaciones correctas.
- **Rojo:** errores y acciones destructivas; no se usa como decoración.

Los nombres semánticos están disponibles como variables CSS:

- `--app-color-cryo`
- `--app-color-fossil`
- `--app-color-biomass`

## Paleta Radix vigente

La paleta base sigue escalas Radix personalizadas. Los componentes deben usar
primero los tokens semánticos `--app-color-*`; las escalas `--ark-*` se
reservan para estados y variantes que necesiten un nivel concreto.

- `--ark-background`: lienzo azul noche (`#0c1427`).
- `--ark-gray-2`: navegación y superficies de máxima profundidad.
- `--ark-gray-3`: paneles y tarjetas principales.
- `--ark-gray-4`: campos, hover y superficies internas.
- `--ark-gray-6` y `--ark-gray-7`: bordes y separadores.
- `--ark-gray-11`: texto secundario.
- `--ark-gray-12`: texto principal.
- `--ark-blue-9`: acciones sólidas, selección e indicadores.
- `--ark-blue-10`: hover de acciones sólidas.
- `--ark-blue-11`: texto interactivo y foco.
- `--ark-blue-12`: contenido de alto contraste sobre fondos azules.

Los contenedores operativos que representan entidades —como una fila de
servidor— pueden usar `--app-color-panel-cool` y
`--app-color-panel-cool-emphasis`. Estas superficies mezclan obsidiana y azul
noche para separarse del lienzo sin convertirse en tarjetas grises ni competir
con las acciones.

### Escala semántica de superficies

Las superficies del workspace siguen niveles funcionales en lugar de grises
elegidos por componente:

- `--app-color-surface-chrome`: navegación, barras y paneles estructurales.
- `--app-color-surface-panel`: formularios, editores y tarjetas de contenido.
- `--app-color-surface-control`: campos y cabeceras interactivas.
- `--app-color-surface-control-hover`: hover de controles.
- `--app-color-border-subtle`: separación entre regiones.
- `--app-color-border-control`: límite identificable de campos.
- `--app-color-text-soft` y `--app-color-muted-soft`: texto principal y
  secundario sin blanco puro.

Un campo debe distinguirse del panel por relleno y borde. En reposo el borde de
control mantiene aproximadamente `3.10:1` respecto al panel; al recibir foco
usa azul interactivo y halo, sin cambiar el layout.

Las selecciones persistentes en listas usan una superficie oscura apenas
contaminada de azul, un borde tenue y un indicador lateral. El azul sólido se
reserva para acciones primarias y no debe utilizarse como relleno completo de
una fila seleccionada.

También están disponibles las escalas completas `--ark-blue-1` a
`--ark-blue-12`, `--ark-blue-a1` a `--ark-blue-a12`, `--ark-gray-1` a
`--ark-gray-12` y `--ark-gray-a1` a `--ark-gray-a12`. Las variantes alpha
deben preferirse para selección, hover y foco porque conservan la relación con
la superficie subyacente. El renderer incluye equivalentes Display P3/OKLCH
cuando el monitor y Chromium los soportan.

## Motivos y formas

- Las curvas topográficas representan territorio, estratos y exploración. Se
  usan a baja opacidad y como textura ambiental, nunca como contenido.
- La microtextura Tek combina geometría fragmentada, conexiones, nodos y curvas
  de estrato en un mosaico continuo de `640×640`. Se presenta visualmente a
  `720×720` para reducir la repetición y usa una máscara vertical: casi
  desaparece detrás del contenido superior y gana presencia únicamente en
  espacios vacíos.
- La microtextura pertenece al lienzo. No se repite dentro de tarjetas,
  formularios, modales, tablas o paneles laterales.
- Las formas técnicas pueden incorporar cortes, segmentos o geometría
  ligeramente irregular. No deben comprometer legibilidad ni áreas clicables.
- La espina lateral de las filas de servidor comunica estado y recuerda una
  estructura orgánica sin dibujar huesos o dinosaurios literalmente.
- El símbolo inicial combina biología y tecnología mediante ADN dentro de una
  celda técnica. Es una dirección de marca, no el icono final de distribución.

## Profundidad

La jerarquía se construye principalmente con contraste, bordes y separación.
Los degradados se reservan para planos ambientales grandes, navegación
seleccionada y transiciones entre azul noche y obsidiana. No se aplican a cada
tarjeta ni se usan para simular brillo. Se evitan glassmorphism y sombras
grandes; las sombras se reservan para elementos que realmente flotan, como
modales o docks.

### Obsidian Atmosphere

- El lienzo combina azul noche en la zona superior con obsidiana neutral en el
  área de trabajo.
- El sidebar forma parte del mismo ambiente y no debe verse como una columna
  gris independiente.
- Las superficies de contenido conservan contraste neutral con una mezcla azul
  mínima.
- Las acciones sólidas permanecen planas; el degradado no debe sustituir la
  jerarquía funcional.
- El ámbar fósil puede aparecer como iluminación ambiental casi imperceptible,
  además de conservar su significado de atención.

## Restricciones

- No usar ilustraciones de dinosaurios como decoración de dashboard.
- No usar neón, metal cepillado, fuego, texturas agresivas o tipografías gamer.
- No llenar cada superficie con patrones topográficos.
- No asignar colores sin significado operativo.
- No sacrificar densidad, contraste o accesibilidad por identidad visual.

## Criterio para componentes nuevos

Un componente pertenece a esta identidad cuando:

1. Sigue siendo comprensible sin el motivo decorativo.
2. Usa color para comunicar estado o acción.
3. Mantiene superficies planas y una jerarquía clara.
4. Introduce, como máximo, un detalle paleo-tecnológico sutil.
5. Se sentiría profesional junto a Docker Desktop, GitHub Desktop o Linear.

## Workspace adaptable

El workspace protege primero la superficie de trabajo. El breakpoint no se
elige por una categoría genérica de dispositivo, sino por el ancho mínimo que
necesitan el formulario y los editores INI.

- A partir de `1600 px` se muestran lista de servidores, editor y panel de
  estado/acciones en tres columnas.
- Por debajo de `1600 px` el editor ocupa todo el ancho disponible.
- La lista de servidores se reutiliza en un drawer izquierdo y las acciones
  secundarias en uno derecho.
- Las acciones de ciclo de vida —iniciar, reiniciar y detener— permanecen en el
  header porque afectan al estado inmediato del servidor.
- Los drawers son temporales y se cierran al completar la selección; no se
  añade una preferencia manual cuando el comportamiento puede resolverse de
  forma automática y predecible.

Este patrón puede reutilizarse en otras pantallas con un área de trabajo
central, siempre que los paneles desplazados sean contexto o acciones
secundarias y no información imprescindible para completar la tarea principal.

## Filtros de catálogos densos

Las colecciones extensas de filtros no se representan como filas de badges o
botones. Cuando existen más categorías de las que caben en una sola línea:

- se usa un selector buscable junto al campo de búsqueda principal;
- solo se ofrecen categorías con resultados en el contexto actual;
- cada opción comunica su cantidad de resultados;
- una selección se conserva entre contextos únicamente si sigue siendo válida;
- el espacio vertical se reserva para el contenido que el usuario intenta
  consultar o editar.

Los chips se reservan para conjuntos pequeños —aproximadamente cinco opciones
o menos— cuando la comparación simultánea entre alternativas aporta valor.

## Vistas operativas de altura completa

Las pantallas destinadas a consultar flujos extensos —registros, consolas,
jobs o historiales— mantienen el contexto operativo dentro del viewport:

- el encabezado, las acciones globales y la navegación de sección no se
  desplazan con el contenido;
- listas y consolas reciben el scroll, no la página completa;
- toda la cadena flex debe declarar `min-height: 0`; no se simula el resultado
  con alturas máximas arbitrarias;
- una vista master-detail permite scroll independiente en ambas regiones;
- los metadatos y acciones del elemento seleccionado permanecen visibles;
- un panel sin datos muestra un estado vacío deliberado y explicativo.

`PageScaffold` ofrece `fillViewport` como comportamiento opt-in. No debe
activarse en páginas de contenido documental o formularios que naturalmente
necesiten crecer.

### Densidad en vistas master-detail

Cuando el detalle contiene una consola, editor o visor extenso, ese contenido
es el objetivo principal y debe recibir la mayor parte del alto disponible:

- la acción del elemento seleccionado comparte encabezado con el título cuando
  no necesita explicación adicional;
- los datos ya visibles en el contexto global no se repiten en el detalle;
- entre dos y cuatro metadatos breves se agrupan en una sola franja compacta,
  con separadores, en lugar de tarjetas independientes;
- el historial identifica el artefacto real —por ejemplo, el nombre del
  archivo— y no repite el nombre del servidor;
- una selección se comunica con indicador lateral, borde y contaminación de
  color mínima; no mediante un bloque saturado.

La compactación no debe ocultar ni truncar información prioritaria. En ventanas
estrechas, la franja puede desplazarse horizontalmente antes que crecer y
reducir de forma significativa el área de trabajo.

## Superficies operativas azul‑obsidiana

Servidores, SteamCMD y Registros pertenecen al mismo entorno operativo, pero no
deben usar idéntica intensidad:

- las filas de servidor reciben el mayor énfasis porque representan las
  entidades principales y sus estados;
- el estado activo de SteamCMD puede usar el mismo gradiente e indicador
  lateral con intensidad media;
- historiales, detalles y consolas usan una mezcla azul‑grisácea más tenue;
- las consolas conservan un interior prácticamente negro para legibilidad del
  texto monoespaciado;
- los paneles técnicos secundarios no vuelven al gris neutral puro ni reciben
  gradientes decorativos independientes.

La identidad se consigue mediante temperatura coherente y niveles semánticos,
no pintando cada contenedor de azul. El usuario debe distinguir primero estado,
acción y contenido antes de percibir el tratamiento visual.
