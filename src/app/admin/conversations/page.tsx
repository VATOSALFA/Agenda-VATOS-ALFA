
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Loader2, MessageSquareText, User } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { format, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

interface Message {
    id: string;
    from: string;
    body: string;
    timestamp: {
        seconds: number;
        nanoseconds: number;
    };
    direction: 'inbound' | 'outbound';
}

interface Conversation {
    contact: string;
    messages: Message[];
    lastMessageTimestamp: Date;
}

export default function ConversationsPage() {
  const { data: messages, loading } = useFirestoreQuery<Message>('conversaciones');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  const conversations = useMemo(() => {
    if (!messages) return [];

    const groupedByContact = messages.reduce((acc, msg) => {
      const contact = msg.from;
      if (!acc[contact]) {
        acc[contact] = [];
      }
      acc[contact].push(msg);
      return acc;
    }, {} as Record<string, Message[]>);

    return Object.entries(groupedByContact)
      .map(([contact, messages]) => {
        const sortedMessages = messages.sort((a, b) => a.timestamp.seconds - b.timestamp.seconds);
        return {
          contact,
          messages: sortedMessages,
          lastMessageTimestamp: new Date(sortedMessages[sortedMessages.length - 1].timestamp.seconds * 1000)
        };
      })
      .sort((a, b) => b.lastMessageTimestamp.getTime() - a.lastMessageTimestamp.getTime());
  }, [messages]);

  const formatMessageTimestamp = (date: Date) => {
    if (isToday(date)) {
      return format(date, 'HH:mm');
    }
    if (isYesterday(date)) {
      return 'Ayer';
    }
    return format(date, 'dd/MM/yy', { locale: es });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-muted/40">
      {/* Sidebar de Conversaciones */}
      <div className="w-80 border-r bg-background flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-xl font-bold">Conversaciones</h2>
          <p className="text-sm text-muted-foreground">{conversations.length} chats activos</p>
        </div>
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {conversations.map(convo => (
                <button
                  key={convo.contact}
                  onClick={() => setSelectedConversation(convo)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg hover:bg-muted transition-colors",
                    selectedConversation?.contact === convo.contact && "bg-primary/10"
                  )}
                >
                  <div className="flex justify-between items-center">
                    <p className="font-semibold text-sm">{convo.contact.replace('whatsapp:', '')}</p>
                    <p className="text-xs text-muted-foreground">{formatMessageTimestamp(convo.lastMessageTimestamp)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{convo.messages[convo.messages.length - 1].body}</p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Panel de Mensajes */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            <div className="p-4 border-b flex items-center gap-4 bg-background">
                <Avatar>
                    <AvatarFallback><User className="h-5 w-5"/></AvatarFallback>
                </Avatar>
                <div>
                    <h3 className="font-semibold">{selectedConversation.contact.replace('whatsapp:', '')}</h3>
                    <p className="text-xs text-muted-foreground">Último mensaje: {format(selectedConversation.lastMessageTimestamp, "Pp", { locale: es })}</p>
                </div>
            </div>
            <ScrollArea className="flex-1 p-4 bg-gray-100">
                <div className="space-y-4">
                    {selectedConversation.messages.map(msg => (
                        <div key={msg.id} className={cn("flex", msg.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                             <div className={cn(
                                "max-w-md p-3 rounded-2xl",
                                msg.direction === 'outbound' 
                                    ? "bg-blue-500 text-white rounded-br-none" 
                                    : "bg-white text-gray-800 rounded-bl-none shadow-sm"
                            )}>
                                <p className="text-sm">{msg.body}</p>
                                <p className="text-xs opacity-75 mt-1 text-right">{format(new Date(msg.timestamp.seconds * 1000), 'HH:mm')}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>
             <div className="p-4 border-t bg-background">
                <p className="text-center text-sm text-muted-foreground">La funcionalidad para responder estará disponible aquí.</p>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquareText className="h-16 w-16 text-muted-foreground/50" />
            <h3 className="mt-4 text-xl font-semibold">Selecciona una conversación</h3>
            <p className="mt-1 text-muted-foreground">Elige un chat de la lista para ver los mensajes.</p>
          </div>
        )}
      </div>
    </div>
  );
}
