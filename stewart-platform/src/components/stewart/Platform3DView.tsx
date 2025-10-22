'use client';
import React, { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, RotateCcw } from 'lucide-react';
import { PlatformData } from '@/lib/stewart/types';
import { init3DScene, draw3DPlatform, resetCamera } from '@/lib/stewart/three-renderer';

interface Props {
  previewData: PlatformData | null;
  liveData: PlatformData | null;
  isConnected: boolean;
}

export default function Platform3DView({ previewData, liveData, isConnected }: Props) {
  const previewRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const scenesRef = useRef<{ preview?: any; live?: any }>({});

  useEffect(() => {
    const loadThreeJS = async () => {
      const script1 = document.createElement('script');
      script1.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      script1.async = true;

      const script2 = document.createElement('script');
      script2.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
      script2.async = true;

      script1.onload = () => {
        script2.onload = () => {
          if (previewRef.current) {
            scenesRef.current.preview = init3DScene(previewRef.current);
          }
          if (liveRef.current) {
            scenesRef.current.live = init3DScene(liveRef.current);
          }
        };
        document.body.appendChild(script2);
      };

      document.body.appendChild(script1);
    };

    loadThreeJS();
  }, []);

  useEffect(() => {
    if (previewData && scenesRef.current.preview) {
      draw3DPlatform(scenesRef.current.preview, previewData);
    }
  }, [previewData]);

  useEffect(() => {
    if (liveData && scenesRef.current.live) {
      draw3DPlatform(scenesRef.current.live, liveData);
    }
  }, [liveData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Visualização 3D</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Preview */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Preview (Simulada)</p>
            <Button size="sm" variant="outline" onClick={() => scenesRef.current.preview && resetCamera(scenesRef.current.preview, previewData)}>
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset View
            </Button>
          </div>
          <div ref={previewRef} className="w-full h-[400px] bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg relative overflow-hidden border border-slate-700" />
        </div>

        {/* Live */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-700">Live (WebSocket)</p>
              <Activity className={`w-4 h-4 ${isConnected ? 'text-green-500' : 'text-slate-400'}`} />
            </div>
            <Button size="sm" variant="outline" onClick={() => scenesRef.current.live && resetCamera(scenesRef.current.live, liveData)}>
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset View
            </Button>
          </div>
          <div ref={liveRef} className="w-full h-[400px] bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg relative overflow-hidden border border-slate-700" />
        </div>
      </CardContent>
    </Card>
  );
}
