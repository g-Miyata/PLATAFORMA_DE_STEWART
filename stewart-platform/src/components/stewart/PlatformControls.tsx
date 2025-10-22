'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, RotateCcw } from 'lucide-react';
import ControlInput from './ControlInput';
import { Pose } from '@/lib/stewart/types';

interface Props {
  pose: Pose;
  onPoseChange: (pose: Pose) => void;
  onCalculate: () => void;
  onReset: () => void;
  isLoading: boolean;
  error: string | null;
}

export default function PlatformControls({ pose, onPoseChange, onCalculate, onReset, isLoading, error }: Props) {
  if (!pose) {
    return null;
  }

  const updatePose = (key: keyof Pose, value: number) => {
    onPoseChange({ ...pose, [key]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Controles de Posição</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Translation */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">Translação (mm)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ControlInput label="X" value={pose.x} onChange={(v) => updatePose('x', v)} min={-50} max={50} step={1} />
            <ControlInput label="Y" value={pose.y} onChange={(v) => updatePose('y', v)} min={-50} max={50} step={1} />
            <ControlInput label="Z" value={pose.z} onChange={(v) => updatePose('z', v)} min={200} max={600} step={1} />
          </div>
        </div>

        {/* Rotation */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">Rotação (graus)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ControlInput label="Roll" value={pose.roll} onChange={(v) => updatePose('roll', v)} min={-15} max={15} step={0.1} />
            <ControlInput label="Pitch" value={pose.pitch} onChange={(v) => updatePose('pitch', v)} min={-15} max={15} step={0.1} />
            <ControlInput label="Yaw" value={pose.yaw} onChange={(v) => updatePose('yaw', v)} min={-15} max={15} step={0.1} />
          </div>
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-2 gap-4 pt-4">
          <Button onClick={onCalculate} disabled={isLoading} className="bg-green-600 hover:bg-green-700">
            {isLoading ? 'Calculando...' : 'Calcular'}
          </Button>
          <Button onClick={onReset} variant="outline">
            <RotateCcw className="w-4 h-4 mr-2" />
            Resetar
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
