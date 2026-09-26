import { Stethoscope } from 'lucide-react';
import { Link } from 'react-router';
import { useCalibrationStatus } from './useCalibration';

/** Aviso no cabeçalho enquanto a calibração roda (as outras funções ficam bloqueadas). */
export function CalibrationIndicator() {
  const { data } = useCalibrationStatus();
  if (!data?.running) return null;
  return (
    <Link
      to="/calibracao"
      className="flex items-center gap-2 rounded-full border border-warning/50 bg-warning/10 px-3 py-1 text-sm font-semibold text-warning hover:bg-warning/20"
    >
      <Stethoscope aria-hidden className="size-4" />
      <span role="status">
        Calibrando <span className="tabular-nums">{Math.round(data.progress * 100)}%</span>
      </span>
    </Link>
  );
}
