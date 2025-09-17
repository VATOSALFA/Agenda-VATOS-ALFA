
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import {
  collection,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  getDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

import { Loader2, Send, ChevronLeft, Paperclip, X, FileText, Download, Play, Pause, MessageSquareText } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { sendWhatsAppMessage } from '@/ai/flows/send-whatsapp-flow';
import type { Client } from '@/lib/types';


interface Message {
  id: string;
  senderId: 'client' | 'vatosalfa';
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'audio' | 'document';
  timestamp: any;
}

interface Conversation {
  id: string; // Corresponds to the client's phone number
  clientName?: string;
  lastMessageText?: string;
  lastMessageTimestamp?: any;
  unreadCount?: number;
}


const AudioPlayer = ({ src }: { src: string }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };
  
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      const handleEnded = () => setIsPlaying(false);
      audio.addEventListener('ended', handleEnded);
      return () => {
        audio.removeEventListener('ended', handleEnded);
      }
    }
  }, []);

  return (
    <div className="flex items-center gap-2 p-2 rounded-md">
      <audio ref={audioRef} src={src} preload="metadata"></audio>
      <Button onClick={togglePlayPause} size="icon" variant="ghost" className="h-8 w-8">
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <span className="text-xs text-muted-foreground">Audio</span>
    </div>
  );
};


export default function ConversationsPage() {
  const { toast } = useToast();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations, loading: conversationsLoading } = useFirestoreQuery<Conversation>('conversations', orderBy('lastMessageTimestamp', 'desc'));
  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes');

  const clientMap = useMemo(() => {
    if (clientsLoading) return new Map();
    return new Map(clients.map(c => [c.telefono, c.nombre + ' ' + c.apellido]));
  }, [clients, clientsLoading]);

  const conversationsWithNames = useMemo(() => {
    return conversations.map(conv => {
        const phone = conv.id.replace('whatsapp:+521', '').replace('whatsapp:+52', '');
        return {
            ...conv,
            clientName: conv.clientName || clientMap.get(phone) || phone,
        }
    })
  }, [conversations, clientMap]);

  useEffect(() => {
    if (activeConversationId) {
      setIsLoadingMessages(true);
      const messagesQuery = query(collection(db, `conversations/${activeConversationId}/messages`), orderBy('timestamp', 'asc'));
      
      const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
        const fetchedMessages: Message[] = [];
        snapshot.forEach(doc => {
          fetchedMessages.push({ id: doc.id, ...doc.data() } as Message);
        });
        setMessages(fetchedMessages);
        setIsLoadingMessages(false);
      });

      return () => unsubscribe();
    }
  }, [activeConversationId]);

  const handleSelectConversation = async (conversationId: string) => {
    setActiveConversationId(conversationId);
    const convRef = doc(db, 'conversations', conversationId);
    const convSnap = await getDoc(convRef);
    if(convSnap.exists() && convSnap.data().unreadCount > 0) {
        await updateDoc(convRef, { unreadCount: 0 });
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  useEffect(scrollToBottom, [messages]);
  
  const handleSendMessage = async () => {
    if (!currentMessage.trim() && !file) return;
    if (!activeConversationId) return;

    setIsSending(true);
    
    try {
      let mediaUrl: string | undefined = undefined;
      let mediaType: 'image' | 'audio' | 'document' | undefined = undefined;

      if(file) {
        toast({ title: 'Subiendo archivo...', description: 'Por favor espera.' });
        const storageRef = ref(storage, `whatsapp_media/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        mediaUrl = await getDownloadURL(storageRef);

        if (file.type.startsWith('image/')) mediaType = 'image';
        else if (file.type.startsWith('audio/')) mediaType = 'audio';
        else if (file.type === 'application/pdf') mediaType = 'document';
      }

      toast({ title: 'Enviando mensaje...', description: 'Comunicándose con Twilio.' });
      
      const phoneOnly = activeConversationId.replace('whatsapp:', '').replace('+521', '').replace('+52','');
      
      const result = await sendWhatsAppMessage({
        to: phoneOnly,
        text: currentMessage,
        mediaUrl: mediaUrl,
      });

      if (result.success) {
          toast({ title: '¡Mensaje enviado!', description: `SID: ${result.sid}`});
          setCurrentMessage('');
          setFile(null);
      } else {
           throw new Error(result.error || 'Error desconocido al enviar el mensaje.');
      }
    } catch (error: any) {
        console.error("Error sending message:", error);
        toast({
            variant: 'destructive',
            title: 'Error de envío',
            description: error.message || 'No se pudo enviar el mensaje a través de Twilio.'
        })
    } finally {
        setIsSending(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
    }
  };


  const activeConversation = conversationsWithNames.find(c => c.id === activeConversationId);

  return (
    <>
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
            <p className="text-sm text-muted-foreground">{conversations.length} chats activos</p>
          </div>
        </div>
        <ScrollArea className="flex-1">
            {conversationsLoading ? (
                 <div className="p-4 space-y-4">
                     {Array.from({length: 5}).map((_, i) => <div key={i} className="h-16 bg-muted rounded-md animate-pulse"/>)}
                 </div>
            ) : conversationsWithNames.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                    No hay conversaciones.
                </div>
            ) : (
                <div className="p-2 space-y-1">
                    {conversationsWithNames.map(conv => (
                        <button key={conv.id} onClick={() => handleSelectConversation(conv.id)} className={cn(
                            'w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors',
                            activeConversationId === conv.id ? 'bg-primary/10' : 'hover:bg-muted'
                        )}>
                            <Avatar className="h-10 w-10">
                                <AvatarFallback>{conv.clientName?.substring(0, 2)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 overflow-hidden">
                                <p className="font-semibold truncate">{conv.clientName}</p>
                                <p className="text-xs text-muted-foreground truncate">{conv.lastMessageText}</p>
                            </div>
                            <div className="flex flex-col items-end text-xs text-muted-foreground space-y-1">
                               <span>
                                  {conv.lastMessageTimestamp ? formatDistanceToNow(conv.lastMessageTimestamp.toDate(), { locale: es, addSuffix: true }) : ''}
                               </span>
                               {conv.unreadCount && conv.unreadCount > 0 && (
                                   <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white">{conv.unreadCount}</span>
                               )}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </ScrollArea>
      </aside>

      <main className={"flex-1 flex flex-col bg-gray-100"}>
          {activeConversationId ? (
              <>
              <header className="p-4 border-b bg-background flex items-center gap-3">
                  <Avatar>
                      <AvatarFallback>{activeConversation?.clientName?.substring(0,2)}</AvatarFallback>
                  </Avatar>
                  <div>
                      <h3 className="font-semibold">{activeConversation?.clientName}</h3>
                      <p className="text-xs text-muted-foreground">{activeConversationId.replace('whatsapp:', '')}</p>
                  </div>
              </header>
              <ScrollArea className="flex-1 p-4 md:p-6">
                <div className="space-y-4">
                  {isLoadingMessages ? (
                    <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                  ) : (
                     messages.map(msg => (
                        <div key={msg.id} className={cn('flex items-end gap-2', msg.senderId === 'vatosalfa' ? 'justify-end' : 'justify-start')}>
                           <div className={cn(
                               'max-w-md rounded-2xl p-3 text-sm shadow-md',
                               msg.senderId === 'vatosalfa' ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-background rounded-bl-none'
                           )}>
                               {msg.mediaUrl ? (
                                   <div className="space-y-2">
                                       {msg.mediaType === 'image' && <Image src={msg.mediaUrl} alt="Imagen adjunta" width={300} height={300} className="rounded-lg object-cover" />}
                                       {msg.mediaType === 'audio' && <AudioPlayer src={msg.mediaUrl} />}
                                       {msg.mediaType === 'document' && (
                                           <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg hover:bg-muted">
                                               <FileText className="h-6 w-6 text-primary"/>
                                               <span>Documento PDF</span>
                                               <Download className="h-4 w-4 ml-auto text-muted-foreground"/>
                                           </a>
                                       )}
                                       {msg.text && <p>{msg.text}</p>}
                                   </div>
                               ) : (
                                   <p>{msg.text}</p>
                               )}
                               <p className="text-xs mt-1 text-right text-muted-foreground/80">{msg.timestamp ? formatDistanceToNow(msg.timestamp.toDate(), { locale: es, addSuffix: true }) : ''}</p>
                           </div>
                        </div>
                     ))
                  )}
                </div>
                <div ref={messagesEndRef} />
              </ScrollArea>
               <footer className="p-4 bg-background border-t">
                  {file && (
                    <div className="mb-2 p-2 bg-muted rounded-lg flex items-center justify-between text-sm">
                      <span className="truncate">{file.name}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFile(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Textarea 
                      placeholder="Escribe un mensaje..." 
                      className="resize-none" 
                      rows={1}
                      value={currentMessage}
                      onChange={(e) => setCurrentMessage(e.target.value)}
                      onKeyDown={(e) => {
                          if(e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage();
                          }
                      }}
                      disabled={isSending}
                    />
                     <Button type="button" size="icon" variant="ghost" onClick={() => fileInputRef.current?.click()}>
                        <Paperclip className="h-5 w-5" />
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,audio/*,application/pdf" />
                     </Button>
                     <Button onClick={handleSendMessage} disabled={isSending || (!currentMessage.trim() && !file)}>
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4" />}
                     </Button>
                  </div>
                </footer>
              </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <MessageSquareText className="h-16 w-16 text-muted-foreground/50" />
                <h3 className="mt-4 text-xl font-semibold">Selecciona una conversación</h3>
                <p className="mt-1 text-muted-foreground">Elige un chat de la lista para ver los mensajes y responder.</p>
            </div>
          )}
      </main>
    </div>
    </>
  );
}
