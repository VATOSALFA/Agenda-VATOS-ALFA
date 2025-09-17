
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MessageSquareText, User, Send, ChevronLeft, Paperclip, X, Mic } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';

export default function ConversationsPage() {

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-muted/40">
      <aside className={cn(
        "w-full md:w-80 border-r bg-background flex flex-col transition-transform duration-300 ease-in-out"
      )}>
        <div className="p-4 border-b flex items-center gap-2 flex-shrink-0">
           <Link href="/">
                <Button variant="ghost" size="icon" className="h-9 w-9">
                    <ChevronLeft className="h-6 w-6"/>
                </Button>
            </Link>
          <div>
            <h2 className="text-xl font-bold">Conversaciones</h2>
            <p className="text-sm text-muted-foreground">0 chats activos</p>
          </div>
        </div>
        <ScrollArea className="flex-1">
            <div className="p-8 text-center text-sm text-muted-foreground">
                No hay conversaciones.
            </div>
        </ScrollArea>
      </aside>

      <main className={"flex-1 flex-col bg-gray-100 flex"}>
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <MessageSquareText className="h-16 w-16 text-muted-foreground/50" />
            <h3 className="mt-4 text-xl font-semibold">Selecciona una conversación</h3>
            <p className="mt-1 text-muted-foreground">Elige un chat de la lista para ver los mensajes y responder.</p>
        </div>
      </main>
    </div>
  );
}
