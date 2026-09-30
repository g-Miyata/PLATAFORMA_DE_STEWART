import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertDialog } from 'radix-ui';
import { Cpu, Monitor, Plug, RefreshCw, Unplug, Zap } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { api } from '@/lib/api';
import type { SerialPortInfo } from '@/lib/types';
import { useConnection } from '@/stores/connection';
import { useTelemetry } from '@/stores/telemetry';
import { refreshSerialStatus } from './status';

export const SIM_PORT = 'SIMULADOR';

function portLabel(p: SerialPortInfo) {
  if (p.simulated) return 'Simulador (plataforma virtual, sem hardware)';
  const tag = p.is_esp32 ? (p.confidence >= 90 ? ' ✓' : ' ?') : '';
  return `${p.device}: ${p.display_name}${tag}`;
}

/** Padrão seguro: simulador, a menos que haja um ESP32-S3 identificado com confiança. */
function defaultPort(ports: SerialPortInfo[]) {
  const esp = ports.find((p) => !p.simulated && p.is_esp32 && p.confidence >= 90);
  return esp?.device ?? SIM_PORT;
}

export function SerialConnect({ compact = false }: { compact?: boolean }) {
  const serial = useConnection((s) => s.serial);
  const backendOnline = useConnection((s) => s.backendOnline);
  const qc = useQueryClient();
  const ports = useQuery({ queryKey: ['ports'], queryFn: api.listPorts, enabled: backendOnline !== false });
  const [chosen, setChosen] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Até o usuário escolher, vale o padrão seguro (derivado da lista de portas)
  const selected = chosen && ports.data?.some((p) => p.device === chosen) ? chosen : ports.data ? defaultPort(ports.data) : '';

  const selectedInfo = ports.data?.find((p) => p.device === selected);
  const isHardware = selected !== '' && selected !== SIM_PORT;

  async function open() {
    setBusy(true);
    try {
      await api.openSerial(selected);
      useTelemetry.getState().pushLog('info', `Conectado em ${selected}`);
      toast.success(selected === SIM_PORT ? 'Simulador conectado' : `Conectado em ${selected}`, {
        description: selected === SIM_PORT ? 'Nenhum hardware vai se mover.' : 'Comandos agora movem a plataforma real.',
      });
    } catch (err) {
      toast.error('Não foi possível conectar', { description: (err as Error).message });
    } finally {
      await refreshSerialStatus();
      setBusy(false);
    }
  }

  async function close() {
    setBusy(true);
    try {
      await api.closeSerial();
      useTelemetry.getState().pushLog('info', 'Desconectado');
    } catch (err) {
      toast.error('Erro ao desconectar', { description: (err as Error).message });
    } finally {
      await refreshSerialStatus();
      setBusy(false);
    }
  }

  if (serial.connected) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm">
          {serial.simulated ? <Monitor aria-hidden className="size-4 text-info" /> : <Cpu aria-hidden className="size-4 text-danger" />}
          <span className="text-muted">Porta:</span>
          <span className="font-mono font-medium">{serial.port}</span>
        </span>
        <Button size="sm" variant="outline" onClick={close} disabled={busy}>
          <Unplug aria-hidden />
          Desconectar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <SelectField
        label="Porta serial"
        hideLabel={compact}
        value={selected}
        onChange={(e) => setChosen(e.target.value)}
        disabled={busy || !ports.data}
        className="min-w-[14rem] flex-1"
      >
        {!ports.data && <option value="">{ports.isError ? 'Backend offline' : 'Carregando portas…'}</option>}
        {ports.data?.map((p) => (
          <option key={p.device} value={p.device}>
            {portLabel(p)}
          </option>
        ))}
      </SelectField>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Atualizar lista de portas"
        onClick={() => qc.invalidateQueries({ queryKey: ['ports'] })}
        disabled={busy}
      >
        <RefreshCw aria-hidden className={ports.isFetching ? 'animate-spin' : undefined} />
      </Button>
      <Button
        variant={isHardware ? 'danger' : 'primary'}
        onClick={() => (isHardware ? setConfirmOpen(true) : open())}
        disabled={busy || !selected || backendOnline === false}
      >
        {isHardware ? <Zap aria-hidden /> : <Plug aria-hidden />}
        {isHardware ? 'Conectar hardware' : 'Conectar'}
      </Button>

      <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-xl">
            <AlertDialog.Title className="flex items-center gap-2 text-lg font-semibold">
              <Zap aria-hidden className="size-5 text-danger" />
              Conectar ao hardware real?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-muted">
              Você vai conectar em <strong className="font-mono text-fg">{selectedInfo?.device}</strong>. A partir daí, aplicar
              poses, rotinas, joystick ou IMU <strong className="text-fg">move a plataforma física</strong>. Confira se a área em
              volta está livre. A tecla Esc aciona a parada de emergência.
            </AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="secondary">Cancelar</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant="danger" onClick={open}>
                  Conectar ao hardware
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
