import type { WidgetId } from '../types';
import { ActuatorWidget, DofChallenge, PartsWidget, PointsTable, PoseWidget } from './basic';
import { FkConstraints, FkExperiment, FkSolver } from './fk';
import { Homogeneous, IkLegs, IkSteps, RotationMatrices, ZyxOrder } from './math';
import { Arm2RWidget, UrFkWidget, UrIkWidget } from './serial';

const TITLES: Partial<Record<WidgetId, string>> = {
  'arm-2r': 'Braço de duas juntas',
  'ur-ik': 'Inversa do UR5e',
  'ur-fk': 'Direta do UR5e',
  'fk-solver': 'Solver passo a passo',
  'fk-constraints': 'Restrições',
  'fk-experiment': 'Experimento',
  'ik-steps': 'A conta de uma perna',
  'rotation-matrices': 'Matrizes com os números de agora',
  homogeneous: 'Transformação homogênea',
};

function Widget({ id }: { id: WidgetId }) {
  switch (id) {
    case 'parts':
      return <PartsWidget />;
    case 'pose-xyz':
      return <PoseWidget fields={['x', 'y', 'z']} />;
    case 'pose-rpy':
      return <PoseWidget fields={['roll', 'pitch', 'yaw']} />;
    case 'pose-all':
      return <PoseWidget />;
    case 'pose-wide':
      return <PoseWidget wide />;
    case 'dof-challenge':
      return <DofChallenge />;
    case 'actuator':
      return <ActuatorWidget />;
    case 'points-base':
      return <PointsTable kind="base" />;
    case 'points-plate':
      return <PointsTable kind="plate" />;
    case 'ur-fk':
      return <UrFkWidget />;
    case 'arm-2r':
      return <Arm2RWidget />;
    case 'ur-ik':
      return <UrIkWidget />;
    case 'ik-legs':
      return <IkLegs />;
    case 'rotation-matrices':
      return <RotationMatrices />;
    case 'zyx-order':
      return <ZyxOrder />;
    case 'homogeneous':
      return <Homogeneous />;
    case 'ik-steps':
      return <IkSteps />;
    case 'fk-experiment':
      return <FkExperiment />;
    case 'fk-constraints':
      return <FkConstraints />;
    case 'fk-solver':
      return <FkSolver />;
  }
}

/** Widget interativo da etapa, com título opcional. */
export function LessonWidget({ id }: { id: WidgetId }) {
  const title = TITLES[id];
  return (
    <section aria-label={title ?? 'Interação'} className="space-y-2 rounded-xl border border-border bg-surface p-3 sm:p-4">
      {title && <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h3>}
      <Widget id={id} />
    </section>
  );
}
