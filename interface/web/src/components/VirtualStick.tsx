import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { stickFromOffset } from '@/features/mobile/control';
import { cn } from '@/lib/cn';

interface VirtualStickProps {
  label: string;
  /** eixos −1..1 (y para cima positivo) */
  onChange: (x: number, y: number) => void;
  size?: number;
  className?: string;
}

/**
 * Joystick na tela para toque: cada um segue o próprio dedo (dá para usar dois ao
 * mesmo tempo) e volta ao centro ao soltar. No teclado, as setas movem em passos.
 */
export function VirtualStick({ label, onChange, size = 168, className }: VirtualStickProps) {
  const pointer = useRef<number | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const radius = size / 2 - 22;

  function emit(x: number, y: number) {
    setPos({ x, y });
    onChange(x, y);
  }
  function fromEvent(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const s = stickFromOffset(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), radius);
    emit(s.x, s.y);
  }
  function release(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerId !== pointer.current) return;
    pointer.current = null;
    emit(0, 0);
  }
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const d: Record<string, [number, number]> = { ArrowLeft: [-0.25, 0], ArrowRight: [0.25, 0], ArrowUp: [0, 0.25], ArrowDown: [0, -0.25] };
    if (e.key === ' ' || e.key === 'Enter' || e.key === '0') {
      e.preventDefault();
      emit(0, 0);
      return;
    }
    const m = d[e.key];
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    const c = (v: number) => Math.max(-1, Math.min(1, Math.round(v * 4) / 4));
    emit(c(pos.x + m[0]), c(pos.y + m[1]));
  }

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      {/* joystick 2D não tem papel ARIA nativo: "application" + setas no teclado é o padrão recomendado */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="application"
        tabIndex={0}
        aria-label={`${label}. Arraste com o dedo; no teclado, setas movem e Espaço centraliza. Agora: ${Math.round(pos.x * 100)}% horizontal, ${Math.round(pos.y * 100)}% vertical.`}
        className="relative touch-none select-none rounded-full border-2 border-border-strong bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-focus"
        style={{ width: size, height: size }}
        onPointerDown={(e) => {
          if (pointer.current !== null) return;
          pointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          fromEvent(e);
        }}
        onPointerMove={(e) => e.pointerId === pointer.current && fromEvent(e)}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={onKey}
      >
        <span aria-hidden className="absolute inset-[22%] rounded-full border border-dashed border-border" />
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 size-14 rounded-full bg-primary shadow-lg"
          style={{ transform: `translate(calc(-50% + ${pos.x * radius}px), calc(-50% + ${-pos.y * radius}px))` }}
        />
      </div>
      <span className="text-xs font-medium text-muted">{label}</span>
    </div>
  );
}
