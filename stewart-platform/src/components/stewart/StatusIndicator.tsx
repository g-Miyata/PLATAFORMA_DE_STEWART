import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface Props {
  isValid: boolean;
}

export default function StatusIndicator({ isValid }: Props) {
  return (
    <Alert className={`mb-6 ${isValid ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
      {isValid ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-red-600" />}
      <AlertDescription className={isValid ? 'text-green-800' : 'text-red-800'}>{isValid ? '✅ Posição VÁLIDA - Todos os atuadores dentro dos limites' : '❌ Posição INVÁLIDA - Alguns atuadores fora dos limites'}</AlertDescription>
    </Alert>
  );
}
