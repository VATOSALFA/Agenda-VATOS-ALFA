
'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle, Send } from "lucide-react";
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { sendWhatsAppMessage } from '@/ai/flows/send-whatsapp-message-flow';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function DiagnosticoPage() {
    const { toast } = useToast();
    const [isTestingFirestore, setIsTestingFirestore] = useState(false);
    const [firestoreStatus, setFirestoreStatus] = useState<'idle' | 'success' | 'error'>('idle');
    
    const [isTestingTwilio, setIsTestingTwilio] = useState(false);
    const [twilioStatus, setTwilioStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [testPhoneNumber, setTestPhoneNumber] = useState('');


    const handleTestFirestore = async () => {
        setIsTestingFirestore(true);
        setFirestoreStatus('idle');
        try {
            const docRef = doc(db, "empresa", "main");
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                setFirestoreStatus('success');
                toast({
                    title: "¡Éxito!",
                    description: "La conexión con Firestore es correcta y se pudo leer la configuración de la empresa.",
                    className: 'bg-green-100 text-green-800'
                });
            } else {
                throw new Error("No se encontró el documento de configuración de la empresa.");
            }
        } catch (error) {
            console.error("Error al probar Firestore:", error);
            setFirestoreStatus('error');
            toast({
                variant: "destructive",
                title: "Error de Conexión con Firestore",
                description: "No se pudo leer desde la base de datos. Revisa los permisos y la configuración.",
            });
        } finally {
            setIsTestingFirestore(false);
        }
    }

    const handleTestTwilio = async () => {
        if (!testPhoneNumber || testPhoneNumber.length < 10) {
            toast({ variant: 'destructive', title: 'Número inválido', description: 'Por favor, ingresa un número de teléfono válido de 10 dígitos.'});
            return;
        }

        setIsTestingTwilio(true);
        setTwilioStatus('idle');
        try {
            const result = await sendWhatsAppMessage({
                to: testPhoneNumber,
                text: '¡Hola! Esta es una prueba de conexión desde tu aplicación de Agenda VATOS ALFA.'
            });

            if (result.success) {
                setTwilioStatus('success');
                 toast({
                    title: "¡Éxito!",
                    description: `Mensaje de prueba enviado a ${testPhoneNumber}. SID: ${result.sid}`,
                    className: 'bg-green-100 text-green-800'
                });
            } else {
                throw new Error(result.error || 'Error desconocido al enviar el mensaje.');
            }
        } catch (error: unknown) {
            console.error("Error al probar Twilio:", error);
            setTwilioStatus('error');
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            toast({
                variant: "destructive",
                title: "Error de Conexión con Twilio",
                description: errorMessage,
            });
        } finally {
            setIsTestingTwilio(false);
        }
    }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
        <div>
            <h2 className="text-3xl font-bold tracking-tight">Diagnóstico del Sistema</h2>
            <p className="text-muted-foreground">
                Verifica el estado de las conexiones principales de tu aplicación.
            </p>
        </div>
        
        <div className="space-y-8 max-w-4xl">
            <Card>
                <CardHeader>
                    <CardTitle>Conexión a Firestore</CardTitle>
                    <CardDescription>
                        Esta prueba verifica si la aplicación puede leer datos de tu base de datos Firestore. Es esencial para cargar clientes, servicios, reservas, etc.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-4">
                    <Button onClick={handleTestFirestore} disabled={isTestingFirestore}>
                        {isTestingFirestore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Probar Conexión a Base de Datos
                    </Button>
                    {firestoreStatus === 'success' && <CheckCircle className="h-6 w-6 text-green-500" />}
                    {firestoreStatus === 'error' && <XCircle className="h-6 w-6 text-destructive" />}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Conexión con Twilio (WhatsApp)</CardTitle>
                    <CardDescription>
                        Esta prueba intenta enviar un mensaje de WhatsApp de prueba a través de tu cuenta de Twilio. Verifica que tus secretos (Account SID, Auth Token) estén configurados correctamente.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-end gap-4">
                        <div className="flex-grow">
                            <Label htmlFor="test-phone">Número de teléfono de prueba (10 dígitos)</Label>
                            <Input 
                                id="test-phone" 
                                placeholder="Ej: 5512345678"
                                value={testPhoneNumber}
                                onChange={(e) => setTestPhoneNumber(e.target.value)}
                            />
                        </div>
                        <Button onClick={handleTestTwilio} disabled={isTestingTwilio}>
                            {isTestingTwilio ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                            Enviar Mensaje de Prueba
                        </Button>
                    </div>
                     <div className="mt-4 flex items-center gap-2">
                        {twilioStatus === 'success' && <CheckCircle className="h-6 w-6 text-green-500" />}
                        {twilioStatus === 'error' && <XCircle className="h-6 w-6 text-destructive" />}
                     </div>
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
