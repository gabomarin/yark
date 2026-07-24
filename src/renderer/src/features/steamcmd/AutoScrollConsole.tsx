import { useEffect, useRef } from "react";

interface Props {
  lines: string[];
  className?: string;
  emptyText?: string;
  /** Cuántas líneas mostrar (las más recientes). */
  maxLines?: number;
}

/**
 * Consola con autoscroll al final cuando llegan líneas nuevas.
 * Si el usuario sube el scroll manualmente, no lo fuerza hasta que vuelva cerca del fondo.
 */
export function AutoScrollConsole(props: Props): JSX.Element {
  const { lines, className = "", emptyText = "Esperando salida…", maxLines = 120 } = props;
  const preRef = useRef<HTMLPreElement | null>(null);
  const stickToBottomRef = useRef(true);
  const visible = lines.slice(-maxLines);
  const text = visible.length === 0 ? emptyText : visible.join("\n");

  useEffect(() => {
    const node = preRef.current;
    if (node === null || !stickToBottomRef.current) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [text]);

  return (
    <pre
      ref={preRef}
      className={className}
      onScroll={() => {
        const node = preRef.current;
        if (node === null) {
          return;
        }
        const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
        stickToBottomRef.current = distanceFromBottom < 48;
      }}
    >
      {text}
    </pre>
  );
}
