import { SliderField } from '@/components/ui/field';
import { useLimits } from '@/features/platform3d/geometry';
import type { Pose } from '@/lib/types';

export interface PoseLimits {
  x: [number, number];
  y: [number, number];
  z: [number, number];
  roll: [number, number];
  pitch: [number, number];
  yaw: [number, number];
}

/** Faixas antigas, fixas (só para comparação no Espaço de trabalho). Os sliders usam o alcance real. */
export const DEFAULT_LIMITS: PoseLimits = {
  x: [-40, 40],
  y: [-40, 40],
  z: [440, 620],
  roll: [-15, 15],
  pitch: [-15, 15],
  yaw: [-15, 15],
};

const FIELDS: { key: keyof Pose; label: string; unit: string; spoken: string; step: number }[] = [
  { key: 'x', label: 'X (frente/trás)', unit: 'mm', spoken: 'milímetros', step: 0.5 },
  { key: 'y', label: 'Y (esquerda/direita)', unit: 'mm', spoken: 'milímetros', step: 0.5 },
  { key: 'z', label: 'Z (altura)', unit: 'mm', spoken: 'milímetros', step: 0.5 },
  { key: 'roll', label: 'Roll (em torno de X)', unit: '°', spoken: 'graus', step: 0.1 },
  { key: 'pitch', label: 'Pitch (em torno de Y)', unit: '°', spoken: 'graus', step: 0.1 },
  { key: 'yaw', label: 'Yaw (em torno de Z)', unit: '°', spoken: 'graus', step: 0.1 },
];

interface PoseEditorProps {
  pose: Pose;
  onChange: (pose: Pose) => void;
  limits?: Partial<PoseLimits>;
  fields?: (keyof Pose)[];
  disabled?: boolean;
}

export function PoseEditor({ pose, onChange, limits, fields, disabled }: PoseEditorProps) {
  // padrão: alcance de operação de cada eixo a partir do home (limites reais, /config)
  const auto = useLimits().pose;
  const lim = { ...auto, ...limits };
  const shown = fields ? FIELDS.filter((f) => fields.includes(f.key)) : FIELDS;
  return (
    <fieldset className="@container" disabled={disabled}>
      <legend className="sr-only">Pose da plataforma</legend>
      <div className="grid gap-x-6 gap-y-4 @xl:grid-cols-2 @5xl:grid-cols-3">
      {shown.map((f) => (
        <SliderField
          key={f.key}
          label={f.label}
          value={pose[f.key]}
          onValueChange={(v) => onChange({ ...pose, [f.key]: v })}
          min={lim[f.key][0]}
          max={lim[f.key][1]}
          step={f.step}
          unit={f.unit}
          unitSpoken={f.spoken}
          disabled={disabled}
        />
      ))}
      </div>
    </fieldset>
  );
}
