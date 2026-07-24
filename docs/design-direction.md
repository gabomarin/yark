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
