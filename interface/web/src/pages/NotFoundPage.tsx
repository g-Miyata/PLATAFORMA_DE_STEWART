import { Link } from 'react-router';
import { PageHeader } from '@/components/PageLayout';

export default function NotFoundPage() {
  return (
    <>
      <PageHeader title="Página não encontrada" description="O endereço acessado não existe nesta interface." />
      <Link to="/" className="font-medium text-brand-text underline">
        Voltar ao início
      </Link>
    </>
  );
}
