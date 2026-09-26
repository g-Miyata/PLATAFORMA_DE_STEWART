import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '@/components/ui/button';
import type { Pose } from '@/lib/types';
import { useLibrary } from './library';

/** Acrescenta a pose atual ao fim da gravação aberta em "Gravar e reproduzir". */
export function AddKeyButton({ getPose, ...props }: { getPose: () => Pose } & Omit<ButtonProps, 'onClick'>) {
  const navigate = useNavigate();
  return (
    <Button
      variant="secondary"
      {...props}
      onClick={() => {
        const rec = useLibrary.getState().appendKey(getPose());
        toast.success(`Pose-chave ${rec.keys.length} em “${rec.name}”`, {
          action: { label: 'Abrir', onClick: () => navigate('/gravar') },
        });
      }}
    >
      <Plus aria-hidden />
      Pose-chave
    </Button>
  );
}
