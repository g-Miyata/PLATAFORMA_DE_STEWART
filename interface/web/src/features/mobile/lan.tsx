import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/status';
import { api } from '@/lib/api';

/** Modo rede do backend e se este aparelho já pode comandar. */
export function useLanStatus() {
  return useQuery({ queryKey: ['lan-status'], queryFn: api.lanStatus, refetchInterval: 10_000, retry: false });
}

/** URLs e PIN (só no PC da bancada). */
export function useLanInfo(enabled: boolean) {
  return useQuery({ queryKey: ['lan-info'], queryFn: api.lanInfo, enabled, staleTime: 60_000, retry: false });
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

/** No PC: QR code, endereços e PIN para o celular (ou como ligar o modo rede). */
export function LanConnectCard() {
  const status = useLanStatus();
  const info = useLanInfo(!!status.data?.lan && !!status.data?.local);
  if (!status.data?.lan)
    return (
      <Alert tone="info" title="Modo rede desligado">
        Para usar o celular, feche o backend e abra de novo com <code className="rounded bg-surface-2 px-1">start.bat rede</code>. O celular precisa estar no mesmo
        Wi-Fi do PC; se o Windows perguntar, permita o Python em redes privadas.
      </Alert>
    );
  const first = info.data?.urls[0];
  return (
    <div className="space-y-3">
      {first ? (
        <div className="flex flex-wrap items-center gap-4">
          <Qr text={first.https} />
          <div className="space-y-2 text-sm">
            <p>
              Aponte a câmera do celular para o QR code, ou digite:
              <br />
              <span className="break-all font-mono font-semibold">{first.https}</span>
            </p>
            <p className="text-muted">O celular avisa que o certificado não é confiável: é o certificado do próprio PC. Aceite uma vez (Avançado → continuar).</p>
            <p className="flex items-center gap-2 text-base">
              <KeyRound aria-hidden className="size-4 text-brand" />
              PIN: <span className="font-mono text-2xl font-bold tracking-widest">{info.data?.pin}</span>
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Nenhuma rede encontrada neste PC.</p>
      )}
      {info.data && info.data.urls.length > 1 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Outros endereços deste PC</summary>
          <ul className="mt-1 space-y-0.5 font-mono text-xs">
            {info.data.urls.slice(1).map((u) => (
              <li key={u.ip}>{u.https}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** No celular sem PIN: pede o PIN que aparece no PC. */
export function PinGate() {
  const qc = useQueryClient();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.lanAuth(pin);
      await qc.invalidateQueries({ queryKey: ['lan-status'] });
      toast.success('Celular liberado para comandar');
    } catch (err) {
      toast.error('PIN não aceito', { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-4 rounded-xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Smartphone aria-hidden className="size-5 text-brand" />
        Digite o PIN
      </h2>
      <p className="text-sm text-muted">Ele aparece no PC da bancada, no botão “Celular” do cabeçalho. Sem o PIN, este celular só acompanha; o botão PARAR funciona sempre.</p>
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
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pin.length !== 6 || busy}>
        Liberar
      </Button>
    </form>
  );
}
