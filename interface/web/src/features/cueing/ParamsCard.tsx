import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SliderField, SwitchField } from '@/components/ui/field';
import { api } from '@/lib/api';
import type { CueingParams } from '@/lib/types';
import { PARAM_GROUPS, PRESETS, type ParamGroup } from './params';

const APPLY_MS = 250;

interface ParamsCardProps {
  title?: string;
  description?: string;
  groups?: ParamGroup[];
  /** Suave / Padrão / Intenso (só fazem sentido no washout) */
  showPresets?: boolean;
}

/** Parâmetros do motor: cada mudança vale na hora (inclusive com a plataforma engatada). */
export function ParamsCard({
  title = 'Ajuste do washout',
  description = 'As mudanças valem na hora. Use a análise de um voo gravado para ver o efeito sem mover a plataforma.',
  groups = PARAM_GROUPS,
  showPresets = true,
}: ParamsCardProps) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['cueing-params'], queryFn: api.cueingParams, staleTime: Infinity });
  // rascunho local só depois da primeira edição; antes disso, o que está no backend
  const [edited, setEdited] = useState<CueingParams | null>(null);
  const draft = edited ?? query.data?.params ?? null;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function update(next: CueingParams) {
    setEdited(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await api.cueingSetParams(next);
        qc.setQueryData(['cueing-params'], (old: typeof query.data) => (old ? { ...old, params: next } : old));
      } catch (err) {
        toast.error('Parâmetro recusado', { description: (err as Error).message });
      }
    }, APPLY_MS);
  }

  async function save() {
    try {
      await api.cueingSaveParams();
      toast.success('Parâmetros salvos', { description: 'Valem também depois de reiniciar o backend.' });
    } catch (err) {
      toast.error('Não foi possível salvar', { description: (err as Error).message });
    }
  }

  const defaults = query.data?.defaults;

  return (
    <Card
      title={title}
      icon={<SlidersHorizontal aria-hidden />}
      description={description}
      actions={
        <>
          {showPresets &&
            defaults &&
            PRESETS.map((p) => (
              <Button key={p.id} size="sm" variant="secondary" onClick={() => update(p.apply(defaults))}>
                {p.label}
              </Button>
            ))}
          <Button size="sm" variant="ghost" onClick={() => defaults && update(defaults)} disabled={!defaults}>
            <RotateCcw aria-hidden />
            Padrão
          </Button>
          <Button size="sm" variant="primary" onClick={save} disabled={!draft}>
            <Save aria-hidden />
            Salvar
          </Button>
        </>
      }
    >
      {!draft ? (
        <p className="text-sm text-muted" role="status">
          Carregando parâmetros…
        </p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
            {groups.map((g) => (
              <fieldset key={g.title} className="space-y-3">
                <legend className="text-sm font-semibold">{g.title}</legend>
                <p className="text-xs text-muted">{g.description}</p>
                {g.fields.map((fd) => (
                  <SliderField
                    key={fd.key}
                    label={fd.label}
                    value={draft[fd.key]}
                    onValueChange={(v) => update({ ...draft, [fd.key]: v })}
                    min={fd.min}
                    max={fd.max}
                    step={fd.step}
                    unit={fd.unit}
                    unitSpoken={fd.unitSpoken}
                    digits={fd.digits}
                  />
                ))}
              </fieldset>
            ))}
          </div>
          <SwitchField
            label="Inverter pitch"
            description="Use se, na bancada, o nariz do avião subir e a frente da plataforma descer (a frente física da cadeira fica no lado −X). Vale para as duas telas."
            checked={draft.invert_pitch}
            onCheckedChange={(v) => update({ ...draft, invert_pitch: v })}
          />
        </div>
      )}
    </Card>
  );
}
