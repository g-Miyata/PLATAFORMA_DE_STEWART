import { OrbitControls } from '@react-three/drei';
import { Download, FlaskConical, Ruler, Wrench } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@/components/Canvas3D';
import { PageHeader } from '@/components/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SliderField } from '@/components/ui/field';
import { Alert } from '@/components/ui/status';
import {
  assemblyNumbers,
  currentGeometry,
  DEFAULT_WEDGE,
  envelope,
  headingTable,
  kitPieces,
  toStl,
  wedgeGeometry,
  wedgeMesh,
  type Envelope,
  type LabGeometry,
  type Mesh,
  type WedgeParams,
} from '@/features/lab/wedge';
import { WedgeDemo } from '@/features/lab/WedgeDemo';
import { WedgeRealModel } from '@/features/lab/WedgeRealModel';
import { useGeometry } from '@/features/platform3d/geometry';
import { cn } from '@/lib/cn';
import { checkPose, REASON_TEXT } from '@/lib/limits';
import { fmt, PISTON_COLORS } from '@/lib/pistons';
import type { Pose } from '@/lib/types';

function downloadStl(name: string, mesh: Mesh) {
  const url = URL.createObjectURL(new Blob([toStl(mesh, name)], { type: 'model/stl' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.stl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PiecePreview({ mesh }: { mesh: Mesh }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
    g.setIndex(mesh.indices);
    // faces planas (arestas vivas): cada triângulo com a própria normal
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    g.dispose();
    return flat;
  }, [mesh]);
  return (
    <Canvas camera={{ position: [42, -58, 46], up: [0, 0, 1], fov: 35, near: 1, far: 1000 }} dpr={[1, 2]}>
      <color attach="background" args={['#1b2027']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[40, -30, 80]} intensity={2.2} />
      <directionalLight position={[-50, 40, 20]} intensity={0.6} />
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#2f6fd6" roughness={0.55} metalness={0.05} />
      </mesh>
      <gridHelper args={[80, 16, '#3a4452', '#2a323d']} rotation={[Math.PI / 2, 0, 0]} />
      <OrbitControls makeDefault target={[0, 0, 3]} />
    </Canvas>
  );
}

const ROWS: { label: string; get: (e: Envelope) => string; delta?: (a: Envelope, b: Envelope) => number; unit?: string }[] = [
  { label: 'Inclinação máxima (qualquer direção)', get: (e) => `±${fmt(e.tilt, 1)}°`, delta: (a, b) => b.tilt - a.tilt, unit: '°' },
  { label: 'O que trava a inclinação', get: (e) => e.limiter },
  { label: 'Roll', get: (e) => `${fmt(e.reach.roll[0], 1)}° a ${fmt(e.reach.roll[1], 1)}°`, delta: (a, b) => b.reach.roll[1] - a.reach.roll[1], unit: '°' },
  { label: 'Pitch', get: (e) => `${fmt(e.reach.pitch[0], 1)}° a ${fmt(e.reach.pitch[1], 1)}°`, delta: (a, b) => b.reach.pitch[1] - a.reach.pitch[1], unit: '°' },
  { label: 'Yaw', get: (e) => `${fmt(e.reach.yaw[0], 1)}° a ${fmt(e.reach.yaw[1], 1)}°` },
  { label: 'Z (a partir do home)', get: (e) => `${fmt(e.reach.z[0], 0)} a ${fmt(e.reach.z[1], 0)} mm` },
  { label: 'X', get: (e) => `${fmt(e.reach.x[0], 0)} a ${fmt(e.reach.x[1], 0)} mm` },
  { label: 'Y', get: (e) => `${fmt(e.reach.y[0], 0)} a ${fmt(e.reach.y[1], 0)} mm` },
  { label: 'Cardã do tampo, parado no home', get: (e) => `${fmt(e.homeTop, 1)}°`, delta: (a, b) => b.homeTop - a.homeTop, unit: '°' },
  { label: 'Altura do home (tampo)', get: (e) => `${fmt(e.home, 0)} mm` },
];

function PoseTest({ now, wedge, top }: { now: LabGeometry; wedge: LabGeometry; top: number }) {
  const [p, setP] = useState({ roll: 16, pitch: 0, yaw: 0, dz: 0 });
  const pose = (g: LabGeometry): Pose => ({ x: 0, y: 0, z: g.home_z + p.dz, roll: p.roll, pitch: p.pitch, yaw: p.yaw });
  const a = checkPose(pose(now), now);
  const b = checkPose(pose(wedge), wedge);
  const verdict = (c: typeof a) =>
    c.valid ? (
      <span className="font-semibold text-brand-text">aceita</span>
    ) : (
      <span className="font-semibold text-danger">recusada: {REASON_TEXT[c.reasons.flat()[0]]}</span>
    );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <SliderField label="Roll" value={p.roll} onValueChange={(v) => setP((s) => ({ ...s, roll: v }))} min={-30} max={30} step={0.5} unit="°" unitSpoken="graus" />
        <SliderField label="Pitch" value={p.pitch} onValueChange={(v) => setP((s) => ({ ...s, pitch: v }))} min={-30} max={30} step={0.5} unit="°" unitSpoken="graus" />
        <SliderField label="Yaw" value={p.yaw} onValueChange={(v) => setP((s) => ({ ...s, yaw: v }))} min={-40} max={40} step={1} unit="°" unitSpoken="graus" digits={0} />
        <SliderField label="Z (a partir do home)" value={p.dz} onValueChange={(v) => setP((s) => ({ ...s, dz: v }))} min={-120} max={120} step={1} unit="mm" unitSpoken="milímetros" digits={0} />
      </div>
      <p className="text-sm">
        Hoje: {verdict(a)} · Com calço: {verdict(b)}
      </p>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Pernas na pose de teste">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Perna</th>
              <th className="py-1 pr-3 font-medium">Comprimento</th>
              <th className="py-1 pr-3 font-medium">Cardã do tampo hoje</th>
              <th className="py-1 font-medium">Com calço</th>
            </tr>
          </thead>
          <tbody>
            {PISTON_COLORS.map((c, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1 pr-3">
                  <span className="mr-1.5 inline-block size-2.5 rounded-full" style={{ background: c }} aria-hidden />P{i + 1}
                </td>
                <td className="py-1 pr-3">
                  {fmt(a.lengths[i], 0)} → {fmt(b.lengths[i], 0)} mm
                </td>
                <td className={cn('py-1 pr-3', a.topDeg[i] > top && 'font-semibold text-danger')}>{fmt(a.topDeg[i], 1)}°</td>
                <td className={cn('py-1', b.topDeg[i] > top && 'font-semibold text-danger')}>{fmt(b.topDeg[i], 1)}°</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Em vermelho: acima do limite de operação do cardã do tampo ({fmt(top, 1)}°).</p>
    </div>
  );
}

/**
 * Laboratório (fora do menu): simula um calço inclinado embaixo de cada cardã do tampo e
 * gera as peças para imprimir. Nada daqui muda os limites que a bancada usa.
 */
export default function WedgeLabPage() {
  const geometry = useGeometry();
  const [params, setParams] = useState<WedgeParams>(DEFAULT_WEDGE);
  const [piece, setPiece] = useState<'wedge' | 'washer'>('wedge');
  const p = useDeferredValue(params);
  const set = (k: keyof WedgeParams) => (v: number) => setParams((s) => ({ ...s, [k]: v }));

  const now = useMemo(() => currentGeometry(geometry, p.margin), [geometry, p.margin]);
  const wedge = useMemo(() => wedgeGeometry(geometry, p), [geometry, p]);
  const eNow = useMemo(() => envelope(now), [now]);
  const eWedge = useMemo(() => envelope(wedge), [wedge]);
  const kit = useMemo(() => kitPieces(p), [p]);
  const meshes = useMemo(() => ({ wedge: wedgeMesh(kit.wedge), washer: wedgeMesh(kit.washer) }), [kit]);
  const nums = assemblyNumbers(p);
  const headings = useMemo(() => headingTable(geometry), [geometry]);
  const topLimit = now.limits?.operational.cardan_top_max_deg ?? 36;
  const name = (k: 'wedge' | 'washer') => `${k === 'wedge' ? 'calco-cardan' : 'arruela-inclinada'}-${fmt(p.angleDeg, 0)}graus-M${Number.isInteger(p.screwMm) ? p.screwMm : p.screwMm.toFixed(1)}`;

  return (
    <>
      <PageHeader
        title="Laboratório: calço do cardã do tampo"
        description="Simula um calço inclinado embaixo de cada cardã do tampo, compara com a montagem de hoje e gera as peças para imprimir. É só simulação: os limites que a bancada usa continuam os mesmos."
      />
      <div className="space-y-5">
        <Alert tone="info" title="Experimental">
          Hoje o cardã do tampo fica reto no tampo e a perna chega inclinada: parado no home ele já está a {fmt(eNow.homeTop, 0)}° dos {fmt(now.limits?.physical.cardan_top_max_deg ?? 45, 0)}°, e é ele que trava a inclinação. O calço vira o
          assento na direção da perna e devolve esse ângulo. Depois de montar e testar, os limites da bancada precisam passar a considerar o calço (ainda não fazem).
        </Alert>

        <Card
          title="Demonstração: hoje × com calço"
          icon={<FlaskConical aria-hidden />}
          description="As duas montagens recebem o mesmo comando ao mesmo tempo e cada uma vai até o próprio limite. Arraste para girar a vista."
        >
          <WedgeDemo now={now} wedge={wedge} envNow={eNow} envWedge={eWedge} angleDeg={p.angleDeg} jointMm={p.jointMm} />
        </Card>

        <Card
          title="No modelo real: o encaixe"
          icon={<Wrench aria-hidden />}
          description="A bancada detalhada com o calço montado em cada cardã do tampo. Escolha uma perna para ver o encaixe de perto (calço, tampo, arruela e parafuso), e mova a pose para ver os cardãs trabalhando."
        >
          <WedgeRealModel geometry={geometry} params={p} now={now} wedge={wedge} />
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Parâmetros" icon={<Ruler aria-hidden />}>
            <div className="space-y-4">
              <SliderField label="Inclinação do calço" value={params.angleDeg} onValueChange={set('angleDeg')} min={0} max={24} step={1} unit="°" unitSpoken="graus" digits={0} />
              <SliderField
                label="Margem de segurança (simulação)"
                value={Math.round(params.margin * 100)}
                onValueChange={(v) => setParams((s) => ({ ...s, margin: v / 100 }))}
                min={5}
                max={30}
                step={5}
                unit="%"
                unitSpoken="por cento"
                digits={0}
              />
              <details className="rounded-lg border border-border px-3 py-2" open>
                <summary className="cursor-pointer text-sm font-medium">Medidas da peça e da montagem</summary>
                <div className="mt-3 space-y-4">
                  <SliderField label="Diâmetro do parafuso do cardã" value={params.screwMm} onValueChange={set('screwMm')} min={3} max={12} step={0.5} unit="mm" unitSpoken="milímetros" />
                  <SliderField label="Diâmetro do calço" value={params.outerMm} onValueChange={set('outerMm')} min={20} max={50} step={1} unit="mm" unitSpoken="milímetros" digits={0} />
                  <SliderField label="Espessura na ponta (lado fino)" value={params.minMm} onValueChange={set('minMm')} min={1} max={6} step={0.5} unit="mm" unitSpoken="milímetros" />
                  <SliderField label="Espessura do tampo" value={params.plateMm} onValueChange={set('plateMm')} min={2} max={20} step={0.5} unit="mm" unitSpoken="milímetros" />
                  <SliderField label="Do tampo ao centro da cruzeta" value={params.jointMm} onValueChange={set('jointMm')} min={10} max={40} step={1} unit="mm" unitSpoken="milímetros" digits={0} />
                </div>
              </details>
            </div>
          </Card>

          <Card title="Hoje × com o calço" icon={<FlaskConical aria-hidden />} description={`Mesma margem nos dois: ${fmt(p.margin * 100, 0)}% (cardã do tampo até ${fmt(topLimit, 1)}°).`}>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Comparação da montagem de hoje com o calço">
              <table className="w-full text-sm tabular-nums">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1 pr-3 font-medium" />
                    <th className="py-1 pr-3 font-medium">Hoje</th>
                    <th className="py-1 pr-3 font-medium">Com calço de {fmt(p.angleDeg, 0)}°</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => {
                    const d = r.delta?.(eNow, eWedge);
                    return (
                      <tr key={r.label} className="border-t border-border">
                        <th scope="row" className="py-1.5 pr-3 text-left font-normal text-muted">
                          {r.label}
                        </th>
                        <td className="py-1.5 pr-3">{r.get(eNow)}</td>
                        <td className="py-1.5 pr-3 font-medium">
                          {r.get(eWedge)}
                          {d !== undefined && Math.abs(d) >= 0.1 && (
                            <span className={cn('ml-1.5 text-xs', (r.label.startsWith('Cardã') ? d < 0 : d > 0) ? 'text-brand-text' : 'text-danger')}>
                              ({d > 0 ? '+' : ''}
                              {fmt(d, 1)}
                              {r.unit})
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            title="A peça"
            icon={<Download aria-hidden />}
            description="Imprima com a face plana na mesa. A ponta aponta para onde a perna desce."
            actions={
              <div className="flex gap-1" role="group" aria-label="Peça mostrada">
                <Button size="sm" variant={piece === 'wedge' ? 'primary' : 'ghost'} aria-pressed={piece === 'wedge'} onClick={() => setPiece('wedge')}>
                  Calço
                </Button>
                <Button size="sm" variant={piece === 'washer' ? 'primary' : 'ghost'} aria-pressed={piece === 'washer'} onClick={() => setPiece('washer')}>
                  Arruela
                </Button>
              </div>
            }
          >
            <div className="space-y-3">
              <div className="h-64 overflow-hidden rounded-lg border border-border" aria-hidden>
                <PiecePreview mesh={meshes[piece]} />
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm tabular-nums sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">Na ponta</dt>
                  <dd>{fmt(kit[piece].minMm, 1)} mm</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">No centro</dt>
                  <dd>{fmt(kit[piece].minMm + (kit[piece].outerMm / 2 + kit[piece].tabMm) * Math.tan((p.angleDeg * Math.PI) / 180), 1)} mm</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Diâmetro</dt>
                  <dd>{fmt(kit[piece].outerMm, 0)} mm</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Furo</dt>
                  <dd>{fmt(kit[piece].holeMm, 1)} mm</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => downloadStl(name('wedge'), meshes.wedge)}>
                  <Download aria-hidden />
                  Baixar calço (STL)
                </Button>
                <Button variant="secondary" onClick={() => downloadStl(name('washer'), meshes.washer)}>
                  <Download aria-hidden />
                  Baixar arruela (STL)
                </Button>
              </div>
              <p className="text-xs text-muted">São 6 de cada (uma por cardã do tampo). Sugestão: PETG ou PLA com 100% de preenchimento, camada de 0,2 mm; a peça trabalha em compressão.</p>
            </div>
          </Card>

          <Card title="Testar uma pose" description="A mesma pose na montagem de hoje e com o calço (cada uma com o seu home).">
            <PoseTest now={now} wedge={wedge} top={topLimit} />
          </Card>
        </div>

        <Card title="Montagem" icon={<Wrench aria-hidden />}>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              <strong>Alargue o furo do tampo</strong> de cada cardã para <strong>Ø {fmt(nums.plateHoleMm, 1)} mm</strong> (ou faça um oblongo na direção da ponta): o parafuso passa inclinado a {fmt(p.angleDeg, 0)}°.
            </li>
            <li>
              <strong>Embaixo do tampo</strong>, entre o tampo e o cardã, vai o <strong>calço</strong>, com a face plana encostada no tampo e a <strong>ponta apontando para onde a perna desce</strong> (para a junta de baixo da mesma perna,
              vista de cima).
            </li>
            <li>
              <strong>Em cima do tampo</strong>, embaixo da cabeça do parafuso, vai a <strong>arruela inclinada</strong>, com a face plana no tampo e a ponta para o lado <strong>contrário</strong> da ponta do calço.
            </li>
            <li>
              O parafuso fica <strong>~{fmt(nums.screwExtraMm, 0)} mm mais comprido</strong> que o de hoje (calço no centro com {fmt(nums.wedgeCenterMm, 1)} mm, no máximo {fmt(nums.wedgeMaxMm, 1)} mm).
            </li>
            <li>
              Monte um cardã, confira a direção e o aperto (o calço não pode girar), e só então os outros. Teste na bancada subindo a inclinação devagar, olhando os cardãs do tampo.
            </li>
          </ol>
          <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Direção da ponta do calço em cada perna">
            <table className="text-sm tabular-nums">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 pr-4 font-medium">Perna</th>
                  <th className="py-1 pr-4 font-medium">Ponta em relação a "para fora do tampo" (vista de cima)</th>
                </tr>
              </thead>
              <tbody>
                {headings.map((h) => (
                  <tr key={h.leg} className="border-t border-border">
                    <td className="py-1 pr-4">
                      <span className="mr-1.5 inline-block size-2.5 rounded-full" style={{ background: PISTON_COLORS[h.leg - 1] }} aria-hidden />P{h.leg}
                    </td>
                    <td className="py-1 pr-4">
                      {fmt(Math.abs(h.relDeg), 0)}° {h.relDeg >= 0 ? 'no sentido anti-horário' : 'no sentido horário'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
