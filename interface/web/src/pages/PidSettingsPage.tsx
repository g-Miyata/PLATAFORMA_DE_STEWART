import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Info } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { PageHeader, WithViewer } from '@/components/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NumberField, SelectField } from '@/components/ui/field';
import { Alert } from '@/components/ui/status';
import { useCanCommand } from '@/features/control/useControlGate';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { PISTON_COLORS, PISTONS } from '@/lib/pistons';
import type { PidGains } from '@/lib/types';

type Gains = { kp: number; ki: number; kd: number };

const valid = (g: Partial<Gains>) => Object.values(g).every((v) => v === undefined || (Number.isFinite(v) && v >= 0));

/** Uma linha da tabela. Os campos pertencem a um <form> fora da célula (atributo form), então Enter aplica. */
function GainsRow({
  piston,
  label,
  initial,
  disabled,
  onApply,
  highlight,
}: {
  piston: number | 'todos';
  label: string;
  initial: Gains;
  disabled: boolean;
  onApply: (g: Gains) => Promise<void>;
  highlight?: boolean;
}) {
  const [g, setG] = useState(initial);
  const formId = `ganhos-${piston}`;
  const who = piston === 'todos' ? 'todos os pistões' : `pistão ${piston}`;
  const set = (k: keyof Gains) => (v: number) => setG((prev) => ({ ...prev, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid(g)) {
      toast.error('Ganhos devem ser números maiores ou iguais a zero.');
      return;
    }
    await onApply(g);
  }

  return (
    <tr className={cn('border-t border-border', highlight && 'bg-surface-2')}>
      <th scope="row" className="py-2 pl-2 pr-4 text-left text-sm font-semibold">
        <form id={formId} onSubmit={submit} />
        <span className="inline-flex items-center gap-2">
          {piston !== 'todos' && <span aria-hidden className="size-2.5 rounded-full" style={{ background: PISTON_COLORS[piston - 1] }} />}
          {label}
        </span>
      </th>
      {(['kp', 'ki', 'kd'] as const).map((k) => (
        <td key={k} className="py-2 pr-3">
          <NumberField
            label={`${k === 'kp' ? 'Kp' : k === 'ki' ? 'Ki' : 'Kd'} de ${who}`}
            hideLabel
            value={g[k]}
            onValueChange={set(k)}
            min={0}
            step={0.01}
            disabled={disabled}
            form={formId}
            className="w-full max-w-[9rem]"
          />
        </td>
      ))}
      <td className="py-2 pr-2 text-right">
        <Button type="submit" form={formId} size="sm" variant={highlight ? 'primary' : 'secondary'} disabled={disabled} aria-label={`Aplicar ganhos em ${who}`}>
          <Check aria-hidden />
          Aplicar
        </Button>
      </td>
    </tr>
  );
}

function GainsCard({ gains, disabled }: { gains: PidGains; disabled: boolean }) {
  const qc = useQueryClient();

  async function apply(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['pid-gains'] });
      toast.success(ok);
    } catch (err) {
      toast.error('Ganhos não aplicados', { description: (err as Error).message });
    }
  }

  return (
    <Card
      title="Ganhos PID por pistão"
      description="Kp em PWM/mm, Ki em PWM/(mm·s), Kd em PWM·s/mm. O ESP32 não informa os ganhos: os valores mostrados são os últimos enviados por esta interface (ou os padrões do firmware). Enter aplica a linha."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">Ganhos Kp, Ki e Kd de cada pistão</caption>
          <thead>
            <tr className="text-left text-xs text-muted">
              <th scope="col" className="pb-2 pl-2 font-medium">Pistão</th>
              <th scope="col" className="pb-2 font-medium">Kp</th>
              <th scope="col" className="pb-2 font-medium">Ki</th>
              <th scope="col" className="pb-2 font-medium">Kd</th>
              <th scope="col" className="pb-2 pr-2 text-right font-medium">
                <span className="sr-only">Ação</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {PISTONS.map((p) => {
              const g = gains[String(p) as keyof PidGains];
              return (
                <GainsRow
                  key={`${p}-${g.kp}-${g.ki}-${g.kd}`}
                  piston={p}
                  label={`P${p}`}
                  initial={g}
                  disabled={disabled}
                  onApply={(v) => apply(() => api.setPidGains(p, v), `Ganhos do pistão ${p} aplicados`)}
                />
              );
            })}
            <GainsRow
              piston="todos"
              label="Todos"
              highlight
              initial={{ kp: 5, ki: 0.8, kd: 0 }}
              disabled={disabled}
              onApply={(v) => apply(() => api.setPidGainsAll(v), 'Ganhos aplicados nos seis pistões')}
            />
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SettingsCard({ initial, disabled }: { initial: { dbmm: number; minpwm: number }; disabled: boolean }) {
  const [s, setS] = useState(initial);
  const qc = useQueryClient();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!(s.dbmm >= 0) || !(s.minpwm >= 0 && s.minpwm <= 255)) {
      toast.error('Zona morta ≥ 0 e PWM mínimo entre 0 e 255.');
      return;
    }
    try {
      await api.setPidSettings({ dbmm: s.dbmm, minpwm: Math.round(s.minpwm) });
      await qc.invalidateQueries({ queryKey: ['pid-settings'] });
      toast.success('Configurações aplicadas');
    } catch (err) {
      toast.error('Configurações não aplicadas', { description: (err as Error).message });
    }
  }

  return (
    <Card title="Configurações gerais" description="Valem para os seis pistões.">
      <form onSubmit={submit} className="flex h-full flex-col">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Zona morta"
            value={s.dbmm}
            onValueChange={(v) => setS((p) => ({ ...p, dbmm: v }))}
            min={0}
            step={0.05}
            unit="mm"
            hint="Erro menor que isso: PWM zerado."
            disabled={disabled}
          />
          <NumberField
            label="PWM mínimo"
            value={s.minpwm}
            onValueChange={(v) => setS((p) => ({ ...p, minpwm: v }))}
            min={0}
            max={255}
            step={1}
            hint="De 0 a 255."
            disabled={disabled}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit" variant="primary" disabled={disabled}>
            <Check aria-hidden />
            Aplicar configurações
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AdvancedCard({ disabled }: { disabled: boolean }) {
  const [piston, setPiston] = useState(1);
  const [ff, setFf] = useState({ u0_adv: 12, u0_ret: 10 });
  const [offset, setOffset] = useState(0);

  async function run(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn();
      toast.success(msg);
    } catch (err) {
      toast.error('Não aplicado', { description: (err as Error).message });
    }
  }

  return (
    <Card
      title="Feedforward e offset"
      description="Feedforward compensa a zona morta do motor (PWM somado ao PID). Offset corrige erro sistemático da leitura de posição."
    >
      <SelectField label="Pistão" value={piston} onChange={(e) => setPiston(Number(e.target.value))} disabled={disabled} className="max-w-[12rem]">
        {PISTONS.map((p) => (
          <option key={p} value={p}>
            Pistão {p}
          </option>
        ))}
      </SelectField>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <fieldset className="rounded-lg border border-border p-3" disabled={disabled}>
          <legend className="px-1 text-sm font-semibold">Feedforward (PWM)</legend>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Subida (u0a)" value={ff.u0_adv} onValueChange={(v) => setFf((f) => ({ ...f, u0_adv: v }))} min={0} max={255} />
            <NumberField label="Descida (u0r)" value={ff.u0_ret} onValueChange={(v) => setFf((f) => ({ ...f, u0_ret: v }))} min={0} max={255} />
          </div>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => run(() => api.setFeedforward(piston, ff), `Feedforward do pistão ${piston} aplicado`)}>
            <Check aria-hidden />
            Aplicar feedforward
          </Button>
        </fieldset>
        <fieldset className="rounded-lg border border-border p-3" disabled={disabled}>
          <legend className="px-1 text-sm font-semibold">Offset de leitura</legend>
          <NumberField label="Offset" value={offset} onValueChange={setOffset} min={-20} max={20} step={0.1} unit="mm" />
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => run(() => api.setOffset(piston, offset), `Offset do pistão ${piston} aplicado`)}>
            <Check aria-hidden />
            Aplicar offset
          </Button>
        </fieldset>
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />O firmware não permite ler esses valores de volta: os campos mostram sugestões, não o valor atual do ESP32.
      </p>
    </Card>
  );
}

export default function PidSettingsPage() {
  const canCommand = useCanCommand();
  const gains = useQuery({ queryKey: ['pid-gains'], queryFn: api.pidGains });
  const settings = useQuery({ queryKey: ['pid-settings'], queryFn: api.pidSettings });

  return (
    <>
      <PageHeader
        title="Ganhos PID"
        description="Ajuste o controlador de cada pistão. Para ver o efeito, acompanhe a página Atuadores e PID ou abra o modelo 3D (no modo simulação, o modelo virtual responde aos novos ganhos)."
      />
      <WithViewer>
        {!canCommand && <Alert tone="info">Conecte o simulador ou a porta serial para aplicar os ajustes.</Alert>}
        {gains.isError && (
          <Alert tone="danger" title="Não foi possível ler os ganhos">
            {gains.error.message}
          </Alert>
        )}
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          {gains.data && <GainsCard gains={gains.data} disabled={!canCommand} />}
          <div className="space-y-5">
            {settings.data && <SettingsCard key={`${settings.data.dbmm}-${settings.data.minpwm}`} initial={settings.data} disabled={!canCommand} />}
            <AdvancedCard disabled={!canCommand} />
          </div>
        </div>
      </WithViewer>
    </>
  );
}
