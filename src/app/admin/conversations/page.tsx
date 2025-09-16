
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ConversationsPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Conversaciones</h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Bandeja de Entrada de WhatsApp</CardTitle>
          <CardDescription>Aquí podrás ver y responder los mensajes de tus clientes.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Esta sección está en construcción. ¡Pronto podrás gestionar tus chats desde aquí!</p>
        </CardContent>
      </Card>
    </div>
  );
}
