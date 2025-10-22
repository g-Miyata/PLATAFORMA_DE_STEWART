import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings } from 'lucide-react';

interface Config {
  h0: number;
  strokeMin: number;
  strokeMax: number;
}

export default function ConfigPanel() {
  const [config, setConfig] = useState<Config>({
    h0: 432,
    strokeMin: 200,
    strokeMax: 600,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();
      setConfig(data);
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const saveConfig = async () => {
    setIsSaving(true);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
    } catch (error) {
      console.error('Error saving config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Configuração da Plataforma
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Altura Inicial (h0) - mm</Label>
          <Input type="number" value={config.h0} onChange={(e) => setConfig({ ...config, h0: parseFloat(e.target.value) })} />
        </div>

        <div className="space-y-2">
          <Label>Curso Mínimo - mm</Label>
          <Input type="number" value={config.strokeMin} onChange={(e) => setConfig({ ...config, strokeMin: parseFloat(e.target.value) })} />
        </div>

        <div className="space-y-2">
          <Label>Curso Máximo - mm</Label>
          <Input type="number" value={config.strokeMax} onChange={(e) => setConfig({ ...config, strokeMax: parseFloat(e.target.value) })} />
        </div>

        <Button onClick={saveConfig} disabled={isSaving} className="w-full bg-blue-600 hover:bg-blue-700">
          {isSaving ? 'Salvando...' : 'Salvar Configuração'}
        </Button>
      </CardContent>
    </Card>
  );
}
