
'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Loader2, MessageSquareText, User, Send, ChevronLeft, Paperclip, X, Mic, Square } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { format, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import type { Client, Message } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { sendWhatsappReply } from '@/ai/flows/send-whatsapp-reply-flow';
import { addDoc, collection, writeBatch, doc, Timestamp } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';

interface Conversation {
    contactId: string;
    displayName: string;
    messages: Message[];
    lastMessageTimestamp: Date;
    client?: Client;
    unreadCount: number;
}

export default function ConversationsPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const phoneParam = searchParams.get('phone');
  const nameParam = searchParams.get('name');
  const [queryKey, setQueryKey] = useState(0);
  const { data: messages, loading: messagesLoading } = useFirestoreQuery<Message>('conversaciones', queryKey);
  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileType, setFileType] = useState<'image' | 'audio' | null>(null);
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);


  const conversations = useMemo(() => {
    if (messagesLoading || clientsLoading) return [];

    const clientMap = new Map<string, Client>();
    clients.forEach(client => {
      if (client.telefono) {
        // Normalize phone number to match Twilio's format (e.g., whatsapp:+521XXXXXXXXXX)
        let normalizedPhone = client.telefono.replace(/\D/g, '');
        if (normalizedPhone.length === 10) {
            normalizedPhone = `521${normalizedPhone}`;
        }
        const fullNormalizedPhone = `whatsapp:+${normalizedPhone}`;
        clientMap.set(fullNormalizedPhone, client);
      }
    });

    const groupedByContact = messages.reduce((acc, msg) => {
      // Determine contact number based on direction
      const contactNumber = msg.direction === 'inbound' ? msg.from : msg.to;
      if (!contactNumber) return acc;
      
      if (!acc[contactNumber]) {
        acc[contactNumber] = [];
      }
      acc[contactNumber].push(msg);
      return acc;
    }, {} as Record<string, Message[]>);

    return Object.entries(groupedByContact)
      .map(([contactNumber, messages]) => {
        const sortedMessages = messages.sort((a, b) => a.timestamp.seconds - b.timestamp.seconds);
        const client = clientMap.get(contactNumber);
        const unreadCount = messages.filter(m => m.direction === 'inbound' && !m.read).length;
        
        return {
          contactId: contactNumber,
          displayName: client ? `${client.nombre} ${client.apellido}` : contactNumber.replace('whatsapp:', ''),
          messages: sortedMessages,
          lastMessageTimestamp: new Date(sortedMessages[sortedMessages.length - 1].timestamp.seconds * 1000),
          client: client,
          unreadCount: unreadCount,
        };
      })
      .sort((a, b) => b.lastMessageTimestamp.getTime() - a.lastMessageTimestamp.getTime());
  }, [messages, clients, messagesLoading, clientsLoading]);
  
  useEffect(() => {
    if (phoneParam && !messagesLoading && conversations.length > 0) {
      let normalizedPhone = phoneParam.replace(/\D/g, '');
      if (normalizedPhone.length === 10) {
          normalizedPhone = `521${normalizedPhone}`;
      }
      const fullNormalizedPhone = `whatsapp:+${normalizedPhone}`;
      const conversationToSelect = conversations.find(c => c.contactId === fullNormalizedPhone);
      
      if (conversationToSelect) {
        handleSelectConversation(conversationToSelect);
      } else if (nameParam) {
        // Create a "phantom" conversation for a new chat
        const phantomConversation: Conversation = {
          contactId: fullNormalizedPhone,
          displayName: nameParam,
          messages: [],
          lastMessageTimestamp: new Date(),
          unreadCount: 0,
        };
        setSelectedConversation(phantomConversation);
      }
    }
  }, [phoneParam, nameParam, conversations, messagesLoading]);


  const markAsRead = async (conversation: Conversation) => {
    const unreadMessages = conversation.messages.filter(m => m.direction === 'inbound' && !m.read);
    if (unreadMessages.length === 0) return;

    try {
      const batch = writeBatch(db);
      unreadMessages.forEach(msg => {
        const msgRef = doc(db, 'conversaciones', msg.id);
        batch.update(msgRef, { read: true });
      });
      await batch.commit();
      // Optimistically update the UI, or let the real-time listener handle it
      setQueryKey(prev => prev + 1); 
    } catch (error) {
      console.error("Error marking messages as read:", error);
    }
  };

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    if(conversation.messages.length > 0) {
        markAsRead(conversation);
    }
  };

  useEffect(() => {
    if (scrollAreaRef.current) {
        const scrollContainer = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
        if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
    }
  }, [selectedConversation, messages]);

  const formatMessageTimestamp = (date: Date) => {
    if (isToday(date)) {
      return format(date, 'HH:mm');
    }
    if (isYesterday(date)) {
      return 'Ayer';
    }
    return format(date, 'dd/MM/yy', { locale: es });
  };
  
  const handleSendMessage = async () => {
    if ((!replyMessage.trim() && !selectedFile) || !selectedConversation) return;
    setIsSending(true);

    let mediaUrl: string | undefined = undefined;
    let mediaType: string | undefined = selectedFile?.type;

    try {
        if (selectedFile) {
            const uniqueFileName = `${crypto.randomUUID()}-${selectedFile.name.replace(/\s+/g, '_')}`;
            const storageRef = ref(storage, `whatsapp_media/${uniqueFileName}`);
            const snapshot = await uploadBytes(storageRef, selectedFile);
            mediaUrl = await getDownloadURL(snapshot.ref);
        }

        const result = await sendWhatsappReply({
            to: selectedConversation.contactId,
            body: replyMessage,
            mediaUrl: mediaUrl,
        });

        if (result.sid && result.from) {
            const messageData: any = {
                from: result.from,
                to: selectedConversation.contactId,
                body: replyMessage,
                messageSid: result.sid,
                timestamp: Timestamp.now(),
                direction: 'outbound',
                read: true,
            };
            
            if (mediaUrl) {
                messageData.mediaUrl = mediaUrl;
                messageData.mediaContentType = mediaType;
            }
            
            await addDoc(collection(db, 'conversaciones'), messageData);

            toast({ title: "Mensaje enviado" });
            setReplyMessage('');
            clearSelectedFile();
            setQueryKey(prev => prev + 1);
        } else {
            throw new Error(result.error || 'Error desconocido al enviar el mensaje.');
        }

    } catch (error: any) {
        console.error("Error sending reply:", error);
        toast({
            variant: "destructive",
            title: "Error al enviar mensaje",
            description: error.message || "No se pudo enviar el mensaje.",
        });
    } finally {
        setIsSending(false);
    }
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (file.type.startsWith('image/')) {
        setFileType('image');
        const reader = new FileReader();
        reader.onloadend = () => {
          setFilePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith('audio/')) {
        setFileType('audio');
        setFilePreview(file.name); // Just show the file name for audio
      } else {
        setFileType(null);
        setFilePreview(null);
      }
    }
  };

  const openFilePicker = (accept: string) => {
    if (fileInputRef.current) {
        fileInputRef.current.accept = accept;
        fileInputRef.current.click();
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    setFileType(null);
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  }

  // Audio Recording Logic
  const startRecording = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = event => {
            audioChunksRef.current.push(event.data);
        };
        
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const uniqueFileName = `voice-message-${crypto.randomUUID()}.webm`;
            const audioFile = new File([audioBlob], uniqueFileName, { type: 'audio/webm' });
            
            setSelectedFile(audioFile);
            setFileType('audio');
            setFilePreview('Mensaje de voz grabado');
            
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
    } catch (err) {
        console.error("Microphone permission denied:", err);
        toast({
            variant: 'destructive',
            title: 'Permiso de micrófono denegado',
            description: 'Por favor, habilita el acceso al micrófono en la configuración de tu navegador.',
        });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleMicClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };


  const isLoading = messagesLoading || clientsLoading;
  
  const getMediaProxyUrl = (mediaUrl: string, messageSid: string) => {
    const mediaSid = mediaUrl.split('/').pop();
    return `/api/twilio-media/${messageSid}/${mediaSid}`;
  }

  const renderMedia = (msg: Message) => {
    const hasMedia = !!msg.mediaUrl;
    const hasBody = msg.body && msg.body.trim().length > 0;

    if (!hasMedia) {
        return <p className="text-sm">{msg.body}</p>;
    }
    
    const url = msg.direction === 'inbound' ? getMediaProxyUrl(msg.mediaUrl!, msg.messageSid) : msg.mediaUrl!;
    const mediaType = msg.mediaContentType;
    
    if (mediaType?.startsWith('image/')) {
        return (
            <div className="space-y-2">
                <Image src={url} alt="Imagen adjunta" width={300} height={300} className="rounded-lg object-cover" />
                {hasBody && <p className="text-sm mt-2">{msg.body}</p>}
            </div>
        );
    }
    
    if (mediaType?.startsWith('audio/')) {
        return (
            <div className="space-y-2 w-64">
                <audio controls src={url} className="w-full h-10">Tu navegador no soporta el elemento de audio.</audio>
                {hasBody && <p className="text-sm mt-1">{msg.body}</p>}
            </div>
        );
    }
    
    // Fallback for other media types or when media is present but type is unknown
    return (
        <div className="space-y-2">
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm underline flex items-center gap-2">
                <Paperclip className="h-4 w-4" /> Ver archivo adjunto
            </a>
            {hasBody && <p className="text-sm mt-1">{msg.body}</p>}
        </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-muted/40">
      <aside className={cn(
        "w-full md:w-80 border-r bg-background flex flex-col transition-transform duration-300 ease-in-out",
        selectedConversation && "hidden md:flex"
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
          {isLoading ? (
            <div className="flex justify-center items-center h-full p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {conversations.map(convo => (
                <button
                  key={convo.contactId}
                  onClick={() => handleSelectConversation(convo)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg hover:bg-muted transition-colors",
                    selectedConversation?.contactId === convo.contactId && "bg-primary/10"
                  )}
                >
                  <div className="flex justify-between items-center">
                    <p className="font-semibold text-sm truncate">{convo.displayName}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground flex-shrink-0">{formatMessageTimestamp(convo.lastMessageTimestamp)}</p>
                      {convo.unreadCount > 0 && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white">
                              {convo.unreadCount}
                          </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{convo.messages.length > 0 ? convo.messages[convo.messages.length - 1].body || '[Archivo adjunto]' : 'Sin mensajes aún'}</p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </aside>

      <main className={cn(
        "flex-1 flex-col bg-gray-100",
        selectedConversation ? "flex" : "hidden md:flex"
      )}>
        {selectedConversation ? (
          <>
            <header className="p-4 border-b flex items-center gap-4 bg-background flex-shrink-0">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSelectedConversation(null)}>
                    <ChevronLeft className="h-6 w-6" />
                </Button>
                <Avatar>
                    <AvatarFallback><User className="h-5 w-5"/></AvatarFallback>
                </Avatar>
                <div>
                    <h3 className="font-semibold">{selectedConversation.displayName}</h3>
                    <p className="text-xs text-muted-foreground">
                        {selectedConversation.messages.length > 0
                            ? `Último mensaje: ${format(selectedConversation.lastMessageTimestamp, "Pp", { locale: es })}`
                            : 'Inicia la conversación'
                        }
                    </p>
                </div>
            </header>
            
            <ScrollArea className="flex-1" ref={scrollAreaRef}>
                <div className="p-4 space-y-4">
                    {selectedConversation.messages.length === 0 && (
                        <div className="text-center text-muted-foreground p-8 text-sm">
                            No hay mensajes en esta conversación. ¡Envía el primero!
                        </div>
                    )}
                    {selectedConversation.messages.map(msg => (
                        <div key={msg.id} className={cn("flex", msg.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                            <div className={cn(
                                "max-w-md p-3 rounded-2xl shadow-sm",
                                msg.direction === 'outbound' 
                                    ? "bg-blue-500 text-white rounded-br-none" 
                                    : "bg-white text-gray-800 rounded-bl-none"
                            )}>
                                {renderMedia(msg)}
                                <p className="text-xs opacity-75 mt-1 text-right">{format(new Date(msg.timestamp.seconds * 1000), 'HH:mm')}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>
            
             <footer className="p-4 border-t bg-background flex-shrink-0">
                {filePreview && (
                  <div className="relative w-full mb-2 p-2 border rounded-md">
                    {fileType === 'image' ? (
                        <Image src={filePreview} alt="Vista previa" width={96} height={96} style={{objectFit: 'cover'}} className="rounded"/>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Mic className="h-5 w-5 text-muted-foreground"/>
                            <p className="text-sm text-muted-foreground truncate">{filePreview}</p>
                        </div>
                    )}
                    <Button variant="ghost" size="icon" className="absolute -top-3 -right-3 h-7 w-7 rounded-full bg-gray-600/50 hover:bg-gray-800/80 text-white" onClick={clearSelectedFile}>
                        <X className="h-4 w-4"/>
                    </Button>
                  </div>
                )}
                <div className="relative">
                    <Textarea 
                        placeholder={isRecording ? "Grabando mensaje de voz..." : "Escribe un mensaje..."} 
                        className="pr-28 resize-none"
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                        disabled={isRecording}
                    />
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden"/>
                    <div className="absolute left-1 bottom-2 flex items-center">
                        <Button size="icon" variant="ghost" className="h-10 w-10 text-muted-foreground" onClick={() => openFilePicker('image/*,audio/*')}>
                            <Paperclip className="h-5 w-5" />
                        </Button>
                         <Button size="icon" variant={isRecording ? "destructive" : "ghost"} className="h-10 w-10 text-muted-foreground" onClick={handleMicClick}>
                            {isRecording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                        </Button>
                    </div>
                    <Button 
                        size="icon" 
                        className="absolute right-2 bottom-2 h-10 w-10 rounded-full"
                        onClick={handleSendMessage}
                        disabled={isSending || isRecording || (!replyMessage.trim() && !selectedFile)}
                    >
                        {isSending ? <Loader2 className="h-5 w-5 animate-spin"/> : <Send className="h-5 w-5" />}
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
  );
}
