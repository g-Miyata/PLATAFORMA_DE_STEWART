import { Home, Send } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SwitchField } from '@/components/ui/field';
import { Alert, StatusPill } from '@/components/ui/status';
import { PoseEditor } from '@/features/control/PoseEditor';
import { AddKeyButton } from '@/features/recorder/AddKeyButton';
import { useBackendValidation } from '@/features/control/useBackendValidation';
import { useAutoDisable, useCanCommand } from '@/features/control/useControlGate';
import { useGeometry } from '@/features/platform3d/geometry';
import { PlatformViewer } from '@/features/platform3d/PlatformViewer';
import { api } from '@/lib/api';
import { solvePose, zeroPose } from '@/lib/kinematics';
import type { Pose } from '@/lib/types';
import { useConnection } from '@/stores/connection';

const AUTO_APPLY_MS = 100;

export default function KinematicsPage() {
  const geometry = useGeometry();
  const [pose, setPose] = useState<Pose>(() => zeroPose(geometry.home_z));
  const [autoApply, setAutoApply] = useState(false);
  const [applying, setApplying] = useState(false);
  const canCommand = useCanCommand();
  const simulated = useConnection((s) => s.serial.simulated);
  const local = useMemo(() => solvePose(pose, geometry), [pose, geometry]);
  const { result, error } = useBackendValidation(pose);
  const valid = result ? result.valid : local.valid;

  useAutoDisable(autoApply, () => setAutoApply(false));

  async function apply(p: Pose, quiet = false) {
    setApplying(true);
    try {
      const r = await api.applyPose(p);
      if (!r.applied) {
        if (!quiet) toast.error('Pose não aplicada', { description: r.message ?? 'Pose fora dos limites.' });
      } else if (!quiet) {
        toast.success(simulated ? 'Pose aplicada no simulador' : 'Pose aplicada na plataforma');
      }
    } catch (err) {
      toast.error('Erro ao aplicar', { description: (err as Error).message });
      setAutoApply(false);
    } finally {
      setApplying(false);
    }
  }

  // Aplicar automático: segue os sliders, limitado a 10 Hz e só com pose válida
  const lastSent = useRef(0);
  useEffect(() => {
    if (!autoApply || !local.valid) return;
    const wait = Math.max(0, AUTO_APPLY_MS - (Date.now() - lastSent.current));
    const id = setTimeout(() => {
      lastSent.current = Date.now();
      apply(pose, true);
    }, wait);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose, autoApply, local.valid]);

  return (
    <>
      <PageHeader
        title="Cinemática"
        description="Monte uma pose e compare, lado a lado, a plataforma calculada (como deveria ficar) com a real (o que chega pela telemetria do WebSocket)."
      />
      <div className="space-y-5">
        <Card
          title="Pose desejada"
          actions={
            valid ? <StatusPill tone="success">Pose válida</StatusPill> : <StatusPill tone="danger">Fora do curso</StatusPill>
          }
        >
          <PoseEditor pose={pose} onChange={setPose} />
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-4 border-t border-border pt-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setPose(zeroPose(geometry.home_z))}>
                <Home aria-hidden />
                Voltar ao home
              </Button>
              <Button variant="primary" onClick={() => apply(pose)} disabled={!canCommand || !valid || applying || autoApply}>
                <Send aria-hidden />
                Aplicar {simulated ? 'no simulador' : 'na plataforma'}
              </Button>
              <AddKeyButton getPose={() => pose} />
            </div>
            <div className="min-w-[18rem] flex-1">
              <SwitchField
                label="Aplicar automaticamente"
                description="Envia cada mudança dos controles (até 10 vezes por segundo). Desliga sozinho na parada de emergência."
                checked={autoApply}
                onCheckedChange={setAutoApply}
                disabled={!canCommand}
              />
            </div>
          </div>
          {!canCommand && (
            <Alert tone="info" className="mt-4">
              Conecte o simulador ou a porta serial no topo para aplicar poses e ver a plataforma real. A pose calculada funciona sem conexão.
            </Alert>
          )}
          {error && (
            <Alert tone="warning" className="mt-4" title="Validação do backend indisponível">
              {error}
            </Alert>
          )}
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <PlatformViewer
              expandable
              source="target"
              target={pose}
              title="Calculada (prevista)"
              targetLabel="Calculada"
              canvasClassName="h-80 sm:h-[26rem]"
            />
          </Card>
          <Card>
            <PlatformViewer expandable source="live" reference={pose} title={simulated ? 'Real (modelo virtual)' : 'Real (WebSocket)'} canvasClassName="h-80 sm:h-[26rem]" />
          </Card>
        </div>
      </div>
    </>
  );
}
