import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/ui/confirm';
import { PageHeader, WithViewer } from '@/components/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NumberField } from '@/components/ui/field';
import { Alert } from '@/components/ui/status';
import { api } from '@/lib/api';
import { operationalLimits, physicalLimits, type JointLimitValues, type PoseKey } from '@/lib/limits';
import { fmt } from '@/lib/pistons';

const FIELDS: { key: keyof JointLimitValues; label: string; unit: string; step: number; hint: string }[] = [
  { key: 'stroke_min', label: 'Comprimento recolhido', unit: 'mm', step: 1, hint: 'junta a junta, com a haste toda para dentro' },
  { key: 'stroke_max', label: 'Comprimento estendido', unit: 'mm', step: 1, hint: 'o firmware usa 250 mm de curso (Lmm)' },
  { key: 'cardan_base_max_deg', label: 'Cardã da base: ângulo máximo', unit: '°', step: 0.5, hint: 'entre a perna e o eixo do assento' },
  { key: 'cardan_top_max_deg', label: 'Cardã do tampo: ângulo máximo', unit: '°', step: 0.5, hint: 'entre a perna e a normal do tampo' },
  { key: 'leg_radius_mm', label: 'Raio da perna', unit: 'mm', step: 0.5, hint: 'tubo em D de 44 × 42 mm' },
  { key: 'leg_clearance_mm', label: 'Folga mínima entre pernas', unit: 'mm', step: 0.5, hint: 'entre as superfícies' },
  { key: 'joint_zone_mm', label: 'Trecho das juntas ignorado', unit: 'mm', step: 1, hint: 'perto das juntas, as pernas de um par se tocam por construção' },
  { key: 'margin', label: 'Margem de segurança', unit: '', step: 0.05, hint: '0,2 = 20%: opera a 80% dos limites' },
];

const AXES: { key: PoseKey; label: string; unit: string }[] = [
  { key: 'x', label: 'X', unit: 'mm' },
  { key: 'y', label: 'Y', unit: 'mm' },
  { key: 'z', label: 'Z (a partir do home)', unit: 'mm' },
  { key: 'roll', label: 'Roll', unit: '°' },
  { key: 'pitch', label: 'Pitch', unit: '°' },
  { key: 'yaw', label: 'Yaw', unit: '°' },
];

/** Ajustes → Limites da mecânica: os valores físicos (limits.json), a margem e o alcance que resulta. */
export default function LimitsPage() {
  const qc = useQueryClient();
  const info = useQuery({ queryKey: ['limits'], queryFn: api.limits });
  const [draft, setDraft] = useState<Partial<JointLimitValues>>({});
  const [busy, setBusy] = useState(false);
  const values = info.data ? { ...info.data.values, ...draft } : null;
  const dirty = Object.keys(draft).length > 0;

  async function save() {
    if (!values) return;
    const ok = await confirmDialog({
      title: 'Salvar os novos limites?',
      description: 'Eles passam a valer para todos os comandos da bancada. Confira as medidas antes; a versão anterior fica em limits.json.bak.',
      confirmLabel: 'Salvar limites',
      tone: 'warning',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.setLimits(draft);
      setDraft({});
      await Promise.all([qc.invalidateQueries({ queryKey: ['limits'] }), qc.invalidateQueries({ queryKey: ['geometry'] })]);
      toast.success('Limites salvos', { description: 'limits.json atualizado (a versão anterior ficou em limits.json.bak).' });
    } catch (err) {
      toast.error('Limites não salvos', { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const phys = values ? physicalLimits(values) : null;
  const op = values ? operationalLimits(values) : null;

  return (
    <>
      <PageHeader
        title="Limites da mecânica"
        description="O máximo que a bancada aguenta: curso dos atuadores, ângulo das juntas cardã e distância entre as pernas. A operação usa esses limites com uma margem de segurança, e todos os sliders e controles derivam daqui."
      />
      <WithViewer>
        <div className="space-y-5">
          <Card title="Valores físicos" icon={<ShieldCheck aria-hidden />} description="Guardados em interface/backend/limits.json.">
            {values ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {FIELDS.map((f) => {
                    const range = info.data?.ranges[f.key];
                    return (
                      <NumberField
                        key={f.key}
                        label={f.label}
                        value={values[f.key] as number}
                        onValueChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                        min={range?.[0]}
                        max={range?.[1]}
                        step={f.step}
                        unit={f.unit}
                        hint={f.hint}
                      />
                    );
                  })}
                </div>
                {values.note && <Alert tone="info">{values.note}</Alert>}
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={save} disabled={!dirty || busy}>
                    <Save aria-hidden />
                    Salvar limites
                  </Button>
                  <Button variant="ghost" onClick={() => setDraft({})} disabled={!dirty}>
                    <RotateCcw aria-hidden />
                    Descartar mudanças
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">{info.isError ? 'Backend fora do ar.' : 'Carregando…'}</p>
            )}
          </Card>

          {phys && op && values && (
            <Card title="Físico × operação" description={`A operação trabalha a ${fmt((1 - values.margin) * 100, 0)}% dos limites físicos.`}>
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Limites físicos e de operação">
                <table className="w-full text-sm tabular-nums">
                  <caption className="sr-only">Limites físicos e de operação</caption>
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th scope="col" className="py-1 font-medium">Limite</th>
                      <th scope="col" className="py-1 font-medium">Físico</th>
                      <th scope="col" className="py-1 font-medium">Operação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ['Comprimento das pernas', `${fmt(phys.stroke_min, 0)} a ${fmt(phys.stroke_max, 0)} mm`, `${fmt(op.stroke_min, 0)} a ${fmt(op.stroke_max, 0)} mm`],
                        ['Cardã da base', `${fmt(phys.cardan_base_max_deg, 1)}°`, `${fmt(op.cardan_base_max_deg, 1)}°`],
                        ['Cardã do tampo', `${fmt(phys.cardan_top_max_deg, 1)}°`, `${fmt(op.cardan_top_max_deg, 1)}°`],
                        ['Distância mínima entre eixos das pernas', `${fmt(phys.min_axis_distance_mm, 1)} mm`, `${fmt(op.min_axis_distance_mm, 1)} mm`],
                      ] as const
                    ).map(([k, a, b]) => (
                      <tr key={k} className="border-t border-border">
                        <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                          {k}
                        </th>
                        <td className="py-1.5 pr-2">{a}</td>
                        <td className="py-1.5">{b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {info.data && (
            <Card title="Alcance a partir do home" description={`Home em z = ${fmt(info.data.home_z, 0)} mm. Cada eixo sozinho; inclinação máxima em qualquer direção: ${fmt(info.data.tilt_deg, 1)}°.`}>
              <table className="w-full text-sm tabular-nums">
                <caption className="sr-only">Alcance de operação de cada eixo</caption>
                <tbody>
                  {AXES.map((a) => (
                    <tr key={a.key} className="border-t border-border first:border-0">
                      <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                        {a.label}
                      </th>
                      <td className="py-1.5">
                        {fmt(info.data.reach[a.key][0], 1)} a {fmt(info.data.reach[a.key][1], 1)} {a.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted">É o que os sliders, o joystick, a IMU, as rotinas e o simulador de voo usam. Veja o volume inteiro no Espaço de trabalho.</p>
            </Card>
          )}
        </div>
      </WithViewer>
    </>
  );
}
