import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Actuator } from '@/lib/stewart/types';

interface Props {
  actuators: Actuator[];
}

export default function ActuatorGrid({ actuators }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Status dos Atuadores</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {actuators.map((actuator) => (
            <div key={actuator.id} className={`p-4 rounded-lg border-2 text-center transition-all hover:shadow-lg ${actuator.valid ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
              <div className="font-semibold text-slate-900 mb-1">Atuador {actuator.id}</div>
              <div className="text-sm text-slate-600 mb-2">{actuator.length.toFixed(1)} mm</div>
              <div className={`font-bold ${actuator.valid ? 'text-green-600' : 'text-red-600'}`}>{actuator.percentage.toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
