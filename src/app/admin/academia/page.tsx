
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminAcademiaPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Academia</h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Cursos y Capacitaciones</CardTitle>
          <CardDescription>Esta sección estará disponible próximamente para gestionar el material de la academia.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Aquí podrás administrar los cursos para tus profesionales.</p>
        </CardContent>
      </Card>
    </div>
  );
}
