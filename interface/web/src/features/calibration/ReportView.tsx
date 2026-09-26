import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCheck, Download, Save, Sparkles, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, StatusPill } from '@/components/ui/status';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { downloadText } from '@/lib/csv';
import { fmt, PISTON_COLORS } from '@/lib/pistons';
import type { CalibrationReport, TwinParamKey } from '@/lib/types';

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const PARAM_LABEL: Record<TwinParamKey, string> = {
  vmax_adv_mm_s: 'vmax ↑ (mm/s)',
  vmax_ret_mm_s: 'vmax ↓ (mm/s)',
  deadzone_adv_pwm: 'zona morta ↑ (PWM)',
  deadzone_ret_pwm: 'zona morta ↓ (PWM)',
};
const KEYS = Object.keys(PARAM_LABEL) as TwinParamKey[];

/** "12,1" e, se houver relatório anterior, a variação "(+0,4)". */
function withDelta(value: number | undefined, prev: number | undefined, digits = 1, betterIsLower = false) {
  if (value === undefined || !Number.isFinite(value)) return '—';
  if (prev === undefined || !Number.isFinite(prev)) return fmt(value, digits);
  const d = value - prev;
  if (Math.abs(d) < 10 ** -digits / 2) return fmt(value, digits);
  const good = betterIsLower ? d < 0 : d > 0;
  return (
    <>
      {fmt(value, digits)}{' '}
      <span className={cn('text-xs', good ? 'text-brand-text' : 'text-warning')}>
        ({d > 0 ? '+' : ''}
        {fmt(d, digits)})
      </span>
    </>
  );
}

interface ReportViewProps {
  report: CalibrationReport;
  /** relatório anterior, para comparar */
  previous?: CalibrationReport | null;
}

export function ReportView({ report, previous }: ReportViewProps) {
  const qc = useQueryClient();
  const fit = report.fit;
  const meanLive = report.rms_live_mm.reduce((a, b) => a + b, 0) / 6;
  const prevLive = previous ? previous.rms_live_mm.reduce((a, b) => a + b, 0) / 6 : null;

  async function apply() {
    if (!window.confirm('Gravar os novos parâmetros no simulador? O arquivo atual fica guardado como sim_params.json.bak.')) return;
    try {
      const r = await api.calibrationApply(report.id);
      toast.success('Parâmetros aplicados', { description: `Cópia anterior: ${r.backup}. Rode a calibração de novo para confirmar a melhora.` });
      await qc.invalidateQueries({ queryKey: ['calibration-report', report.id] });
      await qc.invalidateQueries({ queryKey: ['calibration-reports'] });
    } catch (err) {
      toast.error('Não foi possível aplicar', { description: (err as Error).message });
    }
  }

  return (
    <div className="space-y-5">
      <Card
        title={`Relatório de ${formatDate(report.created_at)}`}
        icon={<ClipboardCheck aria-hidden />}
        description={`${report.simulated ? 'Simulador' : 'Bancada real'} · ${fmt(report.duration_s / 60, 1)} min${previous ? ` · comparado com ${formatDate(previous.created_at)}` : ''}`}
        actions={
          <>
            {report.alerts ? <StatusPill tone="warning">{report.alerts} alerta(s)</StatusPill> : <StatusPill tone="success">Tudo certo</StatusPill>}
            <Button size="sm" variant="ghost" onClick={() => downloadText(`calibracao_${report.id}.json`, JSON.stringify(report, null, 2), 'application/json')}>
              <Download aria-hidden />
              JSON
            </Button>
          </>
        }
      >
        {report.simulated && (
          <Alert tone="info" className="mb-4">
            Feito com o simulador: o autoteste funciona, mas o simulador é comparado com ele mesmo, então a recalibração não tem o que mudar.
          </Alert>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm tabular-nums">
            <caption className="mb-2 text-left text-xs text-muted">
              Autoteste: cada pistão sozinho, ±amplitude em torno do home. {previous && 'Entre parênteses, a variação em relação ao relatório anterior.'}
            </caption>
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-medium">Pistão</th>
                <th className="font-medium">Estado</th>
                <th className="font-medium">Vel. ↑ (mm/s)</th>
                <th className="font-medium">Vel. ↓ (mm/s)</th>
                <th className="font-medium">Atraso (ms)</th>
                <th className="font-medium">Erro final (mm)</th>
                <th className="font-medium">Ruído (mm)</th>
              </tr>
            </thead>
            <tbody>
              {report.pistons.map((p, i) => {
                const q = previous?.pistons[i];
                return (
                  <tr key={p.piston} className="border-t border-border align-top">
                    <td className="py-1.5 font-medium">
                      <span aria-hidden className="mr-1.5 inline-block size-2 rounded-full" style={{ background: PISTON_COLORS[i] }} />P{p.piston}
                      {p.tested && <span className="block text-xs font-normal text-muted">±{fmt(p.amplitude_mm, 0)} mm</span>}
                    </td>
                    <td>
                      {p.status === 'ok' ? (
                        <span className="inline-flex items-center gap-1 text-brand-text">
                          <CheckCircle2 aria-hidden className="size-4" />
                          OK
                        </span>
                      ) : (
                        <span className="inline-flex items-start gap-1 text-warning">
                          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                          {p.issues.join(', ')}
                        </span>
                      )}
                    </td>
                    <td>{withDelta(p.speed_up_mm_s, q?.speed_up_mm_s)}</td>
                    <td>{withDelta(p.speed_down_mm_s, q?.speed_down_mm_s)}</td>
                    <td>{p.delay_ms == null ? '—' : withDelta(p.delay_ms, q?.delay_ms ?? undefined, 0, true)}</td>
                    <td>{withDelta(p.settle_err_mm, q?.settle_err_mm, 2, true)}</td>
                    <td>{withDelta(p.noise_mm, q?.noise_mm, 2, true)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Gêmeo digital e recalibração" icon={<Sparkles aria-hidden />}>
        <div className="space-y-4">
          <p className="text-sm">
            Erro médio entre a bancada e o simulador durante a calibração:{' '}
            <span className="font-semibold tabular-nums">{fmt(meanLive, 2)} mm</span>
            {prevLive !== null && (
              <>
                {' '}
                (antes: <span className="tabular-nums">{fmt(prevLive, 2)} mm</span>
                {previous?.applied ? ', com os parâmetros aplicados desde então' : ''}
                {meanLive < prevLive ? ' — melhorou' : meanLive > prevLive ? ' — piorou' : ''})
              </>
            )}
            .
          </p>
          {report.has_changes ? (
            <Alert tone="success" title={`O modelo novo reproduz ${fmt(report.improvement_pct, 0)}% melhor`}>
              Reproduzindo os mesmos comandos, o erro médio cai de {fmt(fit.rms_before.reduce((a, b) => a + b, 0) / 6, 2)} para {fmt(fit.rms_after.reduce((a, b) => a + b, 0) / 6, 2)} mm.
            </Alert>
          ) : (
            <Alert tone="info" title="Nada a mudar">
              Os parâmetros atuais do simulador já representam bem a bancada (nenhum ajuste melhorou a reprodução).
            </Alert>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm tabular-nums">
              <caption className="mb-2 text-left text-xs text-muted">Atual → proposto. Pistão sem mudança mantém os valores atuais (o motivo aparece ao lado).</caption>
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 font-medium">Pistão</th>
                  {KEYS.map((k) => (
                    <th key={k} className="font-medium">
                      {PARAM_LABEL[k]}
                    </th>
                  ))}
                  <th className="font-medium">Erro na reprodução</th>
                </tr>
              </thead>
              <tbody>
                {fit.pistons.map((p, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1.5 font-medium">P{i + 1}</td>
                    {KEYS.map((k) => {
                      const changed = Math.abs(fit.proposed[k][i] - fit.current[k][i]) > 1e-6;
                      return (
                        <td key={k}>
                          {fmt(fit.current[k][i], 1)}
                          {changed && (
                            <>
                              {' → '}
                              <span className="font-semibold">{fmt(fit.proposed[k][i], 1)}</span>
                            </>
                          )}
                        </td>
                      );
                    })}
                    <td>
                      {fmt(fit.rms_before[i], 2)} → {fmt(fit.rms_after[i], 2)} mm
                      {!p.ok && p.reason && <span className="block text-xs text-muted">{p.reason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.applied ? (
            <p className="text-sm font-medium text-brand-text">Parâmetros aplicados em {formatDate(report.applied_at!)}. Rode a calibração de novo para ver o efeito.</p>
          ) : (
            <Button variant="primary" onClick={apply} disabled={!report.has_changes}>
              <Save aria-hidden />
              Aplicar novos parâmetros
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
