
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

const professionals = [
  { name: 'Beatriz Elizarraga Casas', serviceCount: 12 },
  { name: 'Gloria Ivon', serviceCount: 11 },
  { name: 'Karina Ruiz Rosales', serviceCount: 11 },
  { name: 'Lupita', serviceCount: 12 },
  { name: 'Erick', serviceCount: 13 },
];

export default function ComisionesPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Comisiones</h2>
      </div>

      <div className="pb-4">
        <Button variant="link" asChild className="px-0">
          <Link href="#">
            Ver las comisiones por profesional <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {professionals.map((prof, index) => (
          <Card key={index} className="flex items-center justify-between p-4">
            <div>
              <p className="font-bold">{prof.name}</p>
              <p className="text-sm text-muted-foreground">
                Número De Servicios {prof.serviceCount}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">Editar</Button>
              <Button variant="secondary" size="sm">Editar Por Defecto</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
