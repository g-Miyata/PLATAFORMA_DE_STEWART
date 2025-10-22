import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plug, Unplug, Activity } from 'lucide-react';
import { SerialManager } from '@/lib/stewart/serial-manager';

export default function SerialControls() {
  const [serialManager] = useState(() => new SerialManager());
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    try {
      setError(null);
      await serialManager.connect();
      setIsConnected(true);

      // Start reading data
      serialManager.startReading((data) => {
        console.log('Serial data:', data);
        // Process serial data here
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const handleDisconnect = async () => {
    try {
      await serialManager.disconnect();
      setIsConnected(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className={`w-5 h-5 ${isConnected ? 'text-green-500' : 'text-slate-400'}`} />
          Controle Serial
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button onClick={handleConnect} disabled={isConnected} className="flex-1 bg-blue-600 hover:bg-blue-700">
            <Plug className="w-4 h-4 mr-2" />
            Conectar
          </Button>
          <Button onClick={handleDisconnect} disabled={!isConnected} variant="outline" className="flex-1">
            <Unplug className="w-4 h-4 mr-2" />
            Desconectar
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isConnected && (
          <Alert className="border-green-500 bg-green-50">
            <AlertDescription className="text-green-800">✅ Conectado à porta serial</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
