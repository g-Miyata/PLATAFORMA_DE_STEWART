import { Smartphone, Unplug } from 'lucide-react';
import { useEffect, useState } from 'react';
import { deviceName, pinLink, Qr } from '@/features/mobile/lan';
import type { LanDevice, LanInfo } from '@/lib/api';
import { fmt } from '@/lib/pistons';
import type { Pose } from '@/lib/types';

/** Convite no canto da apresentação: QR code que abre o controle no celular, já com o PIN. */
export function PhoneQrCard({ info, withPin }: { info: LanInfo; withPin: boolean }) {
  const first = info.urls[0];
  if (!first) return null;
  return (
    <section
      aria-label="Controle a plataforma pelo celular"
      className="scene-enter pointer-events-none flex items-center gap-4 rounded-2xl border border-[var(--ex-border)] bg-[var(--ex-panel)] p-3 pr-5 shadow-2xl backdrop-blur"
    >
      <Qr text={withPin ? pinLink(first.https, info.pin) : first.https} label="QR code para controlar a plataforma pelo celular" className="size-32 rounded-xl bg-white p-1.5 xl:size-40" />
      <div className="max-w-[13rem] space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ex-accent)]">
          <Smartphone aria-hidden className="size-4" />
          Experimente
        </p>
        <p className="text-xl font-bold leading-tight">Controle pelo seu celular</p>
        <p className="text-sm text-[var(--ex-muted)]">
          Aponte a câmera, no mesmo Wi-Fi. Aceite o aviso de segurança uma vez{withPin ? '.' : ' e peça o PIN ao apresentador.'}
        </p>
      </div>
    </section>
  );
}

/** Enquanto um visitante comanda pelo celular: quem está no controle e a pose medida. */
export function PhoneHud({ device, getPose, onDisconnect }: { device: LanDevice; getPose: () => Pose; onDisconnect: () => void }) {
  const [pose, setPose] = useState<Pose>(getPose);
  useEffect(() => {
    const id = setInterval(() => setPose(getPose()), 200);
    return () => clearInterval(id);
  }, [getPose]);
  return (
    <section aria-labelledby="celular-titulo" className="scene-enter">
      <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.3em] text-[var(--ex-accent)]">
        <Smartphone aria-hidden className="size-4" />
        Controle pelo celular
      </p>
      <h2 id="celular-titulo" className="text-5xl font-extrabold tracking-tight sm:text-6xl">
        Um visitante está no comando
      </h2>
      <p className="mt-2 text-lg tabular-nums text-[var(--ex-muted)]">
        {deviceName(device.agent)} · roll {fmt(pose.roll, 1)}° · pitch {fmt(pose.pitch, 1)}° · Z {fmt(pose.z, 0)} mm
      </p>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onDisconnect}
        className="pointer-events-auto mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-[var(--ex-border)] bg-[var(--ex-panel)] px-4 text-sm font-semibold transition-colors hover:bg-[var(--ex-track)]"
      >
        <Unplug aria-hidden className="size-4" />
        Desconectar celular e voltar ao show
      </button>
    </section>
  );
}
