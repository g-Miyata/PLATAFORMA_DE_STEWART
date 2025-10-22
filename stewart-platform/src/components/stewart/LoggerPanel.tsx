import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Trash2, FileText } from 'lucide-react';
import { DataLogger } from '@/lib/stewart/logger';

interface Props {
  currentPose: any;
  currentActuators: any[];
  isValid: boolean;
}

export default function LoggerPanel({ currentPose, currentActuators, isValid }: Props) {
  const [logger] = useState(() => new DataLogger());
  const [logCount, setLogCount] = useState(0);
  const [isLogging, setIsLogging] = useState(false);

  useEffect(() => {
    if (isLogging && currentPose && currentActuators) {
      logger.log({
        pose: currentPose,
        actuators: currentActuators,
        valid: isValid,
      });
      setLogCount(logger.getLogs().length);
    }
  }, [currentPose, currentActuators, isValid, isLogging, logger]);

  const handleDownload = () => {
    logger.downloadCSV();
  };

  const handleClear = () => {
    logger.clear();
    setLogCount(0);
  };

  const toggleLogging = () => {
    setIsLogging(!isLogging);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Registro de Dados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">
            Registros: <span className="font-bold text-slate-900">{logCount}</span>
          </span>
          <Button onClick={toggleLogging} size="sm" variant={isLogging ? 'destructive' : 'default'} className={isLogging ? '' : 'bg-green-600 hover:bg-green-700'}>
            {isLogging ? '⏸️ Pausar' : '▶️ Iniciar'}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={handleDownload} disabled={logCount === 0} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
          <Button onClick={handleClear} disabled={logCount === 0} variant="outline" size="sm">
            <Trash2 className="w-4 h-4 mr-2" />
            Limpar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
