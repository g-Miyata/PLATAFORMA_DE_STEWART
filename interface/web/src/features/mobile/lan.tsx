import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, RefreshCw, Smartphone, Wifi, WifiOff } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/status';
import { api, type LanInfo } from '@/lib/api';

/** Modo rede do backend e se este aparelho já pode comandar. */
export function useLanStatus() {
  return useQuery({ queryKey: ['lan-status'], queryFn: api.lanStatus, refetchInterval: 5_000, retry: false });
}

/** URLs, PIN e aparelhos conectados (só no PC da bancada). */
export function useLanInfo(enabled: boolean) {
  return useQuery({ queryKey: ['lan-info'], queryFn: api.lanInfo, enabled, refetchInterval: enabled ? 3_000 : false, retry: false });
}

/** "Android", "iPhone"... a partir do user-agent (só para o PC reconhecer o aparelho). */
export function deviceName(agent: string) {
  if (/iPhone/i.test(agent)) return 'iPhone';
  if (/iPad/i.test(agent)) return 'iPad';
  if (/Android/i.test(agent)) return /Mobile/i.test(agent) ? 'Celular Android' : 'Tablet Android';
  if (/Windows|Macintosh|Linux/i.test(agent)) return 'Computador';
  return 'Aparelho';
}

/** 5 s, 3 min, 1 h 20 min */
export function ago(s: number) {
  if (s < 60) return `${Math.max(0, Math.round(s))} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

function Qr({ text }: { text: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { margin: 1, width: 220, errorCorrectionLevel: 'M' })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [text]);
  return src ? <img src={src} alt={`QR code para abrir ${text}`} className="size-44 rounded-lg bg-white p-2" /> : null;
}

/** Chamadas do PC que devolvem o LanInfo novo: atualiza o cache na hora. */
function useLanAction<A>(fn: (arg: A) => Promise<LanInfo>, ok?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (info) => {
      qc.setQueryData(['lan-info'], info);
      void qc.invalidateQueries({ queryKey: ['lan-status'] });
      if (ok) toast.success(ok);
    },
    onError: (err) => toast.error('Não deu certo', { description: (err as Error).message }),
  });
}

/**
 * No PC: liga o modo rede, mostra o QR code, o endereço e o PIN para o celular e,
 * se já houver um celular conectado, avisa (um por vez) e deixa desconectá-lo.
 */
export function LanConnectCard() {
  const status = useLanStatus();
  const onPc = !!status.data?.local;
  const info = useLanInfo(onPc);
  const start = useLanAction(() => api.lanStart(), 'Modo rede ligado');
  const stop = useLanAction(() => api.lanStop(), 'Modo rede desligado');
  const newPin = useLanAction(() => api.lanNewPin(), 'PIN novo gerado');
  const kick = useLanAction((id: string) => api.lanKick(id), 'Celular desconectado');

  if (status.isError)
    return (
      <Alert tone="danger" title="Não deu para ligar o celular agora">
        O backend não respondeu sobre o modo rede. Se ele está aberto, é uma versão anterior: feche a janela do backend e abra de novo com start.bat.
      </Alert>
    );
  if (!status.data || (onPc && !info.data)) return <p className="text-sm text-muted">Verificando a rede…</p>;
  if (!onPc) return null;
  const data = info.data!;

  if (!data.lan)
    return (
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <p className="flex items-center gap-2 font-semibold">
          <WifiOff aria-hidden className="size-5 text-muted" />O celular ainda não enxerga este PC
        </p>
        <p className="text-sm text-muted">
          Hoje o backend só atende aqui mesmo (localhost). Ligue o modo rede e o celular, no mesmo Wi-Fi, abre esta tela pelo endereço do PC na rede (
          <span className="font-mono">https://IP-do-PC:{data.https_port}</span>), com um QR code e um PIN.
        </p>
        <Button variant="primary" onClick={() => start.mutate(undefined)} disabled={start.isPending}>
          <Wifi aria-hidden />
          {start.isPending ? 'Ligando…' : 'Ligar o modo rede'}
        </Button>
        <p className="text-xs text-muted">
          Na primeira vez, o Windows pergunta se libera o Python no firewall: permita em <strong>redes privadas</strong>. Também dá para abrir já ligado, com{' '}
          <code className="rounded bg-surface-2 px-1">start.bat rede</code>.
        </p>
      </div>
    );

  const connected = data.devices.filter((d) => d.active);
  const first = data.urls[0];
  return (
    <div className="space-y-3">
      {connected.length > 0 ? (
        <Alert tone="warning" title="Já tem um celular conectado">
          {connected.map((d) => (
            <div key={d.id} className="mt-1 space-y-2">
              <p>
                <strong>{deviceName(d.agent)}</strong> em <span className="font-mono">{d.ip}</span>, conectado há {ago(d.since_s)}. Só um celular comanda por vez: para
                abrir em outro aparelho, desconecte este primeiro (no próprio celular, em Desconectar, ou aqui).
              </p>
              <Button size="sm" variant="secondary" onClick={() => kick.mutate(d.id)} disabled={kick.isPending}>
                Desconectar este celular
              </Button>
            </div>
          ))}
        </Alert>
      ) : first ? (
        <div className="flex flex-wrap items-center gap-4">
          <Qr text={first.https} />
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <p>
              Aponte a câmera do celular para o QR code, ou digite no navegador dele:
              <br />
              <span className="break-all font-mono font-semibold">{first.https}</span>
            </p>
            <p className="text-muted">O celular avisa que o certificado não é confiável: é o certificado do próprio PC. Aceite uma vez (Avançado → continuar).</p>
            <div className="flex flex-wrap items-center gap-2 text-base">
              <KeyRound aria-hidden className="size-4 text-brand" />
              PIN:{' '}
              <span className="font-mono text-2xl font-bold tracking-widest" aria-label={`PIN ${data.pin?.split('').join(' ')}`}>
                {data.pin}
              </span>
              <Button size="sm" variant="ghost" onClick={() => newPin.mutate(undefined)} disabled={newPin.isPending}>
                <RefreshCw aria-hidden />
                Outro PIN
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Alert tone="warning" title="Nenhuma rede encontrada neste PC">
          Conecte o PC no Wi-Fi (o mesmo do celular) e abra esta tela de novo.
        </Alert>
      )}

      {connected.length === 0 &&
        data.waiting.map((w) => (
          <p key={w.ip} className="flex items-center gap-2 text-sm text-info">
            <Smartphone aria-hidden className="size-4" />
            {deviceName(w.agent)} em <span className="font-mono">{w.ip}</span> abriu a página e está esperando o PIN.
          </p>
        ))}

      {data.urls.length > 1 && connected.length === 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Não abriu? Outros endereços deste PC</summary>
          <ul className="mt-1 space-y-0.5 font-mono text-xs">
            {data.urls.slice(1).map((u) => (
              <li key={u.ip}>{u.https}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted">
        <Wifi aria-hidden className="size-4 text-brand" />
        {data.mode === 'startup' ? (
          <span>Modo rede ligado pelo start.bat rede (HTTP e HTTPS na rede).</span>
        ) : (
          <>
            <span>Modo rede ligado (HTTPS na porta {data.https_port}).</span>
            <Button size="sm" variant="ghost" onClick={() => stop.mutate(undefined)} disabled={stop.isPending}>
              Desligar o modo rede
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** No celular sem PIN: pede o PIN que aparece no PC (ou avisa que outro celular está na vez). */
export function PinGate({ busy }: { busy: boolean }) {
  const qc = useQueryClient();
  const [pin, setPin] = useState('');
  const [sending, setSending] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      await api.lanAuth(pin);
      await qc.invalidateQueries({ queryKey: ['lan-status'] });
      toast.success('Celular liberado para comandar');
    } catch (err) {
      toast.error('Não liberou', { description: (err as Error).message });
      void qc.invalidateQueries({ queryKey: ['lan-status'] });
    } finally {
      setSending(false);
    }
  }
  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-4 rounded-xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Smartphone aria-hidden className="size-5 text-brand" />
        Digite o PIN
      </h2>
      {busy ? (
        <Alert tone="warning" title="Outro celular está conectado">
          Só um celular comanda por vez. Desconecte o outro (nele, em Desconectar, ou no PC, na tela Celular) e tente de novo.
        </Alert>
      ) : (
        <p className="text-sm text-muted">Ele aparece no PC da bancada, na tela Celular. Sem o PIN, este celular só acompanha; o botão PARAR funciona sempre.</p>
      )}
      <label className="block">
        <span className="text-sm font-medium">PIN de 6 dígitos</span>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          className="mt-1 h-14 w-full rounded-lg border border-border-strong bg-surface-2 px-3 text-center font-mono text-3xl tracking-[0.4em]"
        />
      </label>
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pin.length !== 6 || sending || busy}>
        Liberar
      </Button>
    </form>
  );
}
