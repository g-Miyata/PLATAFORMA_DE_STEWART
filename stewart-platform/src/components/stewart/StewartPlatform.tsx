'use client';
import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';

import { Pose, PlatformData } from '@/lib/stewart/types';
import { useWebSocket } from '@/hooks/useWebsocket';
import StatusIndicator from './StatusIndicator';
import PlatformControls from './PlatformControls';
import Platform3DView from './Platform3DView';
import ActuatorGrid from './ActuatorGrid';

export default function StewartPlatformApp() {
  const [pose, setPose] = useState<Pose>({
    x: 0,
    y: 0,
    z: 432,
    roll: 0,
    pitch: 0,
    yaw: 0,
  });

  const [platformData, setPlatformData] = useState<PlatformData | null>(null);
  const [liveData, setLiveData] = useState<PlatformData | null>(null);
  const [isValid, setIsValid] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isConnected, lastMessage } = useWebSocket('/api/ws');

  // Calculate position when pose changes
  useEffect(() => {
    calculatePosition();
  }, [pose]);

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      try {
        const msg = JSON.parse(lastMessage);
        if (msg.type === 'telemetry' && msg.pose_live) {
          const liveUpdate: PlatformData = {
            pose: msg.pose_live,
            base_points: msg.base_points,
            platform_points: msg.platform_points_live,
            actuators:
              msg.actuator_lengths_abs?.map((length: number, i: number) => ({
                id: i + 1,
                length: length,
                percentage: ((length - 200) / 400) * 100,
                valid: length >= 200 && length <= 600,
              })) || [],
            valid: true,
          };
          setLiveData(liveUpdate);
        }
      } catch (e) {
        console.error('Error parsing WebSocket message:', e);
      }
    }
  }, [lastMessage]);

  const calculatePosition = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pose),
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setPlatformData(data);
      setIsValid(data.valid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error calculating position:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const resetPosition = () => {
    setPose({
      x: 0,
      y: 0,
      z: 432,
      roll: 0,
      pitch: 0,
      yaw: 0,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 pb-6 border-b border-slate-200">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-2 tracking-tight">🔧 Stewart Platform</h1>
          <p className="text-slate-600 font-medium">Instituto Federal de São Paulo</p>
        </div>

        {/* Status */}
        <StatusIndicator isValid={isValid} />

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <PlatformControls pose={pose} onPoseChange={setPose} onCalculate={calculatePosition} onReset={resetPosition} isLoading={isLoading} error={error} />

          <Platform3DView previewData={platformData} liveData={liveData} isConnected={isConnected} />
        </div>

        {/* Actuators */}
        {platformData?.actuators && <ActuatorGrid actuators={platformData.actuators} />}
      </div>
    </div>
  );
}
