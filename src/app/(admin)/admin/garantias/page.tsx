import { GarantiasManager } from '@/components/admin/garantias-manager';

export const metadata = {
  title: 'Garantías y Retoques de Satisfacción | VATOS ALFA',
  description: 'Gestión de políticas de garantías y protocolo de atención inteligente.',
};

export default function AdminGarantiasPage() {
  return (
    <div className="container mx-auto py-6 px-4 sm:px-6">
      <GarantiasManager />
    </div>
  );
}
