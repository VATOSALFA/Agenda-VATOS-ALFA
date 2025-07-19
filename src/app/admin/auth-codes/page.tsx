
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AuthCodesPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Códigos de Autorización</h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Gestión de Códigos de Autorización</CardTitle>
          <CardDescription>Esta sección estará disponible próximamente.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Aquí podrás administrar los códigos de autorización para tu personal.</p>
        </CardContent>
      </Card>
    </div>
  );
}
