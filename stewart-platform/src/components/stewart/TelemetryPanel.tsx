import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';
import { Pose } from '@/lib/stewart/types';

interface Props {
  pose: Pose | null;
  isConnected: boolean;
}

export default function TelemetryPanel({ pose, isConnected }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className={`w-5 h-5 ${isConnected ? 'text-green-500' : 'text-slate-400'}`} />
          Telemetria em Tempo Real
        </CardTitle>
      </CardHeader>
      <CardContent>
        {pose ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-700">Posição (mm)</p>
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600">X:</span>
                  <span className="font-mono">{pose.x.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Y:</span>
                  <span className="font-mono">{pose.y.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Z:</span>
                  <span className="font-mono">{pose.z.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-700">Rotação (°)</p>
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600">Roll:</span>
                  <span className="font-mono">{pose.roll.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Pitch:</span>
                  <span className="font-mono">{pose.pitch.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Yaw:</span>
                  <span className="font-mono">{pose.yaw.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500 text-center py-4">Aguardando dados de telemetria...</p>
        )}
      </CardContent>
    </Card>
  );
}
