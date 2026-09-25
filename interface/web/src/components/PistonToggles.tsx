import { PISTON_COLORS } from '@/lib/pistons';

interface PistonTogglesProps {
  visible: boolean[];
  onChange: (index: number, visible: boolean) => void;
  legend?: string;
}

/** Liga/desliga cada pistão num gráfico (checkbox com a cor da série). */
export function PistonToggles({ visible, onChange, legend = 'Pistões exibidos' }: PistonTogglesProps) {
  return (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <legend className="sr-only">{legend}</legend>
      {visible.map((on, i) => (
        <label key={i} className="inline-flex cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => onChange(i, e.target.checked)}
            className="size-4 accent-[var(--c-primary)]"
          />
          <span aria-hidden className="h-1 w-4 rounded-full" style={{ background: PISTON_COLORS[i] }} />
          P{i + 1}
        </label>
      ))}
    </fieldset>
  );
}
