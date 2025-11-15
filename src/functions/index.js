

const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");
const {Buffer} = require("buffer");
const {v4: uuidv4} = require("uuid");
const fetch = require("node-fetch");
const { MercadoPagoConfig, Point } = require("mercadopago");

console.log('Functions starting up. Version: ' + new Date().toISOString());

// Initialize Firebase Admin SDK only once
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// --- MERCADO PAGO CONFIG (CORREGIDO PARA USAR FIRESTORE) ---
const getMercadoPagoConfig = async () => {
  const db = admin.firestore();
  const settingsDoc = await db.collection('configuracion').doc('pagos').get();
  
  if (!settingsDoc.exists) {
      throw new HttpsError('internal', 'La configuración de Mercado Pago no ha sido establecida en Firestore.');
  }
  
  const settings = settingsDoc.data();
  const accessToken = settings?.mercadoPagoAccessToken;
  
  if (!accessToken) {
      throw new HttpsError('internal', 'El Access Token de Mercado Pago no está configurado en Firestore.');
  }
  
  // Retorna el objeto de configuración del SDK y el token
  return { client: new MercadoPagoConfig({ accessToken }), accessToken };
};


/**
 * =================================================================
 * TWILIO FUNCTIONS
 * =================================================================
 */

/**
 * Downloads media from Twilio and uploads it to Firebase Storage.
 * @param {string} mediaUrl The private Twilio media URL.
 * @param {string} from The sender's phone number.
 * @param {string} mediaType The MIME type of the media.
 * @returns {Promise<string>} The public URL of the uploaded file in Firebase Storage.
 */
async function transferMediaToStorage(mediaUrl, from, mediaType) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error(
      "Twilio credentials are not configured as environment variables."
    );
  }

  // 1. Download from Twilio using Basic Authentication
  const twilioAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: `Basic ${twilioAuth}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download media from Twilio: ${response.status} ${response.statusText}`
    );
  }

  const imageBuffer = await response.buffer();

  // 2. Upload to Firebase Storage
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error(
      "Firebase Storage bucket not configured. Check NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET env var."
    );
  }
  const bucket = admin.storage().bucket(bucketName);

  const extension = mediaType.split("/")[1] || "jpeg"; // E.g., 'image/jpeg' -> 'jpeg'
  const fileName = `whatsapp_media/${from.replace(
    /\D/g,
    ""
  )}-${uuidv4()}.${extension}`;
  const file = bucket.file(fileName);

  await file.save(imageBuffer, {
    metadata: {
      contentType: mediaType,
      cacheControl: "public, max-age=31536000", // Cache for 1 year
    },
  });
  
  // 3. Make the file public and return its public URL
  await file.makePublic();
  
  return `https://storage.googleapis.com/${bucketName}/${fileName}`;
}


/**
 * Handles automated replies for appointment confirmation/cancellation.
 * @param {admin.firestore.Firestore} db The Firestore database instance.
 * @param {string} from The sender's phone number (e.g., 'whatsapp:+1...').
 * @param {string} body The text of the incoming message.
 * @returns {Promise<boolean>} True if the reply was handled as a command, false otherwise.
 */
async function handleAutomatedReply(db, from, body) {
  const normalizedBody = body.toLowerCase().trim();
  const isConfirmation = normalizedBody.includes("confirmado");
  const isCancellation = normalizedBody.includes("cancelar");

  if (!isConfirmation && !isCancellation) {
    return false; // Not a command we handle automatically
  }
  
  const phoneOnly = from.replace(/\D/g, "").slice(-10);
  const clientsRef = db.collection("clientes");
  const clientQuery = await clientsRef.where("telefono", "==", phoneOnly).limit(1).get();

  if (clientQuery.empty) {
    console.log(`No client found for phone number: ${phoneOnly}`);
    return false;
  }
  const clientId = clientQuery.docs[0].id;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today
  const todayStr = today.toISOString().split('T')[0];

  const reservationsRef = db.collection("reservas");
  const reservationQuery = await reservationsRef
      .where("cliente_id", "==", clientId)
      .where("fecha", ">=", todayStr)
      .orderBy("fecha")
      .orderBy("hora_inicio")
      .limit(1)
      .get();
  
  if (reservationQuery.empty) {
    console.log(`No upcoming reservations found for client ID: ${clientId}`);
    return false;
  }

  const reservationDoc = reservationQuery.docs[0];
  const reservation = reservationDoc.data();
  
  // Don't process already finalized states
  if (["Asiste", "Cancelado", "No asiste"].includes(reservation.estado)) {
      return false;
  }

  if (isConfirmation) {
      await reservationDoc.ref.update({ estado: "Confirmado" });
      console.log(`Reservation ${reservationDoc.id} confirmed for client ${clientId}.`);
  } else if (isCancellation) {
      await db.runTransaction(async (transaction) => {
          const clientRef = db.collection("clientes").doc(clientId);
          transaction.update(reservationDoc.ref, { estado: "Cancelado" });
          transaction.update(clientRef, { citas_canceladas: admin.firestore.FieldValue.increment(1) });
      });
      console.log(`Reservation ${reservationDoc.id} cancelled for client ${clientId}.`);
  }

  return true; // Command was handled
}


/**
 * Saves a general incoming message to the Firestore database.
 */
async function saveMessage(from, body, mediaUrl, mediaType) {
  const db = admin.firestore();

  // First, try to handle it as an automated reply.
  if (body) {
    const wasHandled = await handleAutomatedReply(db, from, body);
    if (wasHandled) {
      // If it was a confirmation/cancellation, we don't need to save it as a chat message.
      return; 
    }
  }

  const conversationId = from; // e.g., 'whatsapp:+14155238886'
  const conversationRef = db.collection("conversations").doc(conversationId);

  const messageData = {
    senderId: "client",
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
  };

  if (body) messageData.text = body;

  let finalMediaUrl = null;
  if (mediaUrl && mediaType) {
    try {
      finalMediaUrl = await transferMediaToStorage(mediaUrl, from, mediaType);
      messageData.mediaUrl = finalMediaUrl;

      if (mediaType.startsWith("image/")) {
        messageData.mediaType = "image";
      } else if (mediaType.startsWith("audio/")) {
        messageData.mediaType = "audio";
      } else if (mediaType === "application/pdf") {
        messageData.mediaType = "document";
      }
    } catch (mediaError) {
      console.error(
        `[MEDIA_ERROR] Failed to process media for ${from}:`,
        mediaError.message
      );
      messageData.text = (body || "") + `\n\n[Error al procesar archivo adjunto]`;
    }
  }

  // Use a transaction to ensure atomicity
  await db.runTransaction(async (transaction) => {
    const convDoc = await transaction.get(conversationRef);
    const lastMessageText = body || `[${messageData.mediaType || "Archivo"}]`;

    if (convDoc.exists) {
      transaction.update(conversationRef, {
        lastMessageText,
        lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        unreadCount: admin.firestore.FieldValue.increment(1),
      });
    } else {
      let clientName = from;
      try {
        const phoneOnly = from.replace(/\D/g, "").slice(-10);
        const clientsRef = db.collection("clientes");
        const querySnapshot = await clientsRef
          .where("telefono", "==", phoneOnly)
          .limit(1)
          .get();

        if (!querySnapshot.empty) {
          const clientData = querySnapshot.docs[0].data();
          clientName = `${clientData.nombre} ${clientData.apellido}`;
        }
      } catch (clientError) {
        console.warn("Could not fetch client name:", clientError);
      }

      transaction.set(conversationRef, {
        clientName: clientName,
        lastMessageText,
        lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        unreadCount: 1,
      });
    }

    const messagesCollectionRef = conversationRef.collection("messages");
    const newMessageRef = messagesCollectionRef.doc();
    transaction.set(newMessageRef, messageData);
  });
}

/**
 * Cloud Function to handle incoming Twilio webhook requests.
 */
exports.twilioWebhook = onRequest({cors: true}, async (request, response) => {
    try {
      const {From, Body, MediaUrl0, MediaContentType0} = request.body;

      if (!From) {
        console.error("Webhook received without 'From' parameter.");
        response.status(200).send("<Response/>");
        return;
      }

      await saveMessage(From, Body, MediaUrl0, MediaContentType0);

      response.set("Content-Type", "text/xml");
      response.status(200).send("<Response/>");
    } catch (error) {
      console.error("[FATAL] Unhandled error in twilioWebhook function:", error);
      response.set("Content-Type", "text/xml");
      response.status(200).send("<Response/>");
    }
  }
);


/**
 * =================================================================
 * MERCADO PAGO FUNCTIONS
 * =================================================================
 */

exports.getPointTerminals = onCall({cors: true}, async ({ auth }) => {
  if (!auth) {
      throw new HttpsError('unauthenticated', 'La función debe ser llamada por un usuario autenticado.');
  }

  try {
      const { client } = await getMercadoPagoConfig();
      const point = new Point(client); 
      
      const devices = await point.getDevices({}); 

      return { success: true, devices: devices.devices || [] };
  } catch(error) {
      console.error("Error fetching Mercado Pago terminals: ", error);
      if (error instanceof HttpsError) {
          throw error;
      }
      throw new HttpsError('internal', error.message || "No se pudo comunicar con Mercado Pago para obtener las terminales.");
  }
});


exports.setTerminalPDVMode = onCall({cors: true}, async ({ auth, data }) => {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'La función debe ser llamada por un usuario autenticado.');
  }
  const { terminalId } = data;
  if (!terminalId) {
    throw new HttpsError('invalid-argument', 'The function must be called with a "terminalId" argument.');
  }

  try {
    const { client } = await getMercadoPagoConfig();
    const point = new Point(client);
    const result = await point.changeDeviceOperatingMode({
      device_id: terminalId,
      operating_mode: "PDV"
    });
    return { success: true, data: result };
  } catch (error) {
    console.error(`Error setting PDV mode for ${terminalId}:`, error);
    if (error instanceof HttpsError) {
        throw error;
    }
    throw new HttpsError('internal', error.message || `No se pudo activar el modo PDV para la terminal ${terminalId}.`);
  }
});


exports.createPointPayment = onCall({cors: true}, async ({ auth, data }) => {
    if (!auth) {
      throw new HttpsError('unauthenticated', 'La función debe ser llamada por un usuario autenticado.');
    }
    const { amount, terminalId, referenceId, payer, items } = data;

    if (!amount || !terminalId || !referenceId) {
        throw new HttpsError('invalid-argument', 'Missing required arguments: amount, terminalId, or referenceId.');
    }

    try {
        const { accessToken } = await getMercadoPagoConfig();

        const orderData = {
          external_reference: referenceId,
          title: "Venta en VATOS ALFA",
          description: `Venta en VATOS ALFA Barber Shop`,
          notification_url: `https://us-central1-agenda-1ae08.cloudfunctions.net/mercadoPagoWebhook`,
          total_amount: amount,
          items: items,
          payer: payer,
          cash_out: {
            amount: 0
          }
        };

        const response = await fetch(`https://api.mercadopago.com/point/integration-api/orders`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify(orderData),
        });

        const result = await response.json();

        if (!response.ok) {
          console.error("Error response from Mercado Pago:", result);
          throw new HttpsError('internal', result.message || 'Error al crear la orden de pago en Mercado Pago.');
        }

        const pointResponse = await fetch(`https://api.mercadopago.com/point/integration-api/devices/${terminalId}/payment-intents`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                amount: amount,
                additional_info: {
                    external_reference: referenceId,
                    print_on_terminal: false
                }
            })
        });

        const pointResult = await pointResponse.json();
         if (!pointResponse.ok) {
          console.error("Error response from Mercado Pago Point:", pointResult);
          throw new HttpsError('internal', pointResult.message || 'Error al enviar la intención de pago a la terminal.');
        }


        return { success: true, data: pointResult };
    } catch(error) {
        console.error("Error creating payment order:", error);
         if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', error.message || "No se pudo crear la intención de pago en la terminal.");
    }
});


exports.mercadoPagoWebhook = onRequest({cors: true}, async (request, response) => {
    console.log("========== MERCADO PAGO WEBHOOK RECEIVED ==========");
    
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    if (!secret) {
        console.error("MERCADO_PAGO_WEBHOOK_SECRET is not configured.");
        response.status(500).send("Webhook secret not configured.");
        return;
    }

    try {
        const xSignature = request.headers['x-signature'];
        const xRequestId = request.headers['x-request-id'];
        
        // This is a 'payment' notification, not an 'order' notification, so data.id is in the body.
        const dataId = request.body.data?.id;

        if (!xSignature || !xRequestId || !dataId) {
            console.warn("Webhook received without x-signature, x-request-id, or data.id in body.");
            response.status(400).send("Missing required headers or body data.");
            return;
        }

        const parts = xSignature.split(',');
        const tsPart = parts.find(p => p.startsWith('ts='));
        const v1Part = parts.find(p => p.startsWith('v1='));

        if (!tsPart || !v1Part) {
            throw new Error("Invalid signature format");
        }
        
        const ts = tsPart.split('=')[1];
        const v1 = v1Part.split('=')[1];
        
        const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
        
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(manifest);
        const sha = hmac.digest('hex');

        if (sha !== v1) {
            console.warn("Webhook signature validation failed. Expected:", sha, "Got:", v1);
            response.status(403).send("Invalid signature.");
            return;
        }
        console.log("Webhook signature validation successful.");
        
        const { body } = request;
        if (body.action === 'payment.updated' && body.data?.id) {
            const { accessToken } = await getMercadoPagoConfig();
            const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${body.data.id}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const paymentData = await paymentResponse.json();
            
            if (paymentData.status === 'approved' && paymentData.external_reference) {
                const ventaRef = admin.firestore().collection('ventas').doc(paymentData.external_reference);
                const ventaDoc = await ventaRef.get();
                if (ventaDoc.exists) {
                    await ventaRef.update({
                        pago_estado: 'Pagado',
                        mercado_pago_status: 'approved',
                        mercado_pago_id: paymentData.id,
                        mercado_pago_order_id: paymentData.order.id
                    });
                    console.log(`Updated sale ${paymentData.external_reference} to 'Pagado'.`);
                }
            }
        }
    } catch (error) {
        console.error("Error processing Mercado Pago webhook:", error);
        response.status(500).send("Internal Server Error");
        return;
    }
    
    console.log("===================================================");
    response.status(200).send("OK");
});
    

    

```
- src/components/sales/new-sale-sheet.tsx:
```tsx

'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, addDoc, Timestamp, doc, updateDoc, runTransaction, DocumentReference, getDoc, deleteDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { cn } from '@/lib/utils';
import type { Client, Product, Service as ServiceType, Profesional, Local, User } from '@/lib/types';
import { sendStockAlert } from '@/ai/flows/send-stock-alert-flow';
import { sendGoogleReviewRequest } from '@/ai/flows/send-google-review-flow';
import { functions, httpsCallable } from '@/lib/firebase-client';


import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Plus, Minus, ShoppingCart, Users, Scissors, CreditCard, Loader2, Trash2, UserPlus, X, AvatarIcon, Mail, Phone, Edit, Percent, DollarSign, Calculator, Send } from 'lucide-react';
import { NewClientForm } from '../clients/new-client-form';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useLocal } from '@/contexts/local-context';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Combobox } from '../ui/combobox';

interface ReminderSettings {
    notifications: {
        google_review?: {
            enabled: boolean;
        };
    };
}


interface CartItem { 
    id: string; 
    nombre: string; 
    precio: number; 
    cantidad: number; 
    tipo: 'producto' | 'servicio'; 
    barbero_id?: string; 
    presentation_id?: string;
    discountValue?: string | number;
    discountType?: 'fixed' | 'percentage';
}

const saleSchema = (total: number) => z.object({
  cliente_id: z.string().min(1, 'Debes seleccionar un cliente.'),
  local_id: z.string().min(1, 'Debes seleccionar un local.'),
  metodo_pago: z.string().min(1, 'Debes seleccionar un método de pago.'),
  pago_efectivo: z.coerce.number().optional().default(0),
  pago_tarjeta: z.coerce.number().optional().default(0),
  notas: z.string().optional(),
}).refine(data => {
    if (data.metodo_pago === 'combinado') {
        const combinedTotal = Number(data.pago_efectivo || 0) + Number(data.pago_tarjeta || 0);
        return combinedTotal === total;
    }
    return true;
}, {
    message: `La suma debe ser exactamente $${total.toLocaleString('es-MX')}`,
    path: ['pago_tarjeta'],
});


type SaleFormData = z.infer<ReturnType<typeof saleSchema>>;

interface NewSaleSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  initialData?: {
    client: Client;
    items: (Product | ServiceType)[];
    reservationId?: string;
    local_id?: string;
  };
  onSaleComplete?: () => void;
}

const DiscountInput = ({ item, onDiscountChange }: { item: CartItem, onDiscountChange: (itemId: string, value: string, type: 'fixed' | 'percentage') => void }) => {
    const [internalValue, setInternalValue] = useState<string>(String(item.discountValue || ''));

    useEffect(() => {
        setInternalValue(String(item.discountValue || ''));
    }, [item.discountValue]);

    const handleBlur = () => {
        onDiscountChange(item.id, internalValue, item.discountType || 'fixed');
    };

    return (
        <Input
            placeholder="Desc."
            type="number"
            value={internalValue}
            onChange={(e) => setInternalValue(e.target.value)}
            onBlur={handleBlur}
            className="h-8 text-xs"
        />
    )
}

const ResumenCarrito = ({ cart, subtotal, totalDiscount, total, step, updateQuantity, updateItemProfessional, updateItemDiscount, removeFromCart, sellers, addItemSearchTerm, setAddItemSearchTerm, addItemFilteredServices, addItemFilteredProducts, servicesLoading, productsLoading, addToCart }: any) => (
    <div className="col-span-1 bg-card/50 rounded-lg flex flex-col shadow-lg">
      <div className="p-4 border-b flex justify-between items-center flex-shrink-0">
        <h3 className="font-semibold flex items-center text-lg"><ShoppingCart className="mr-2 h-5 w-5" /> Carrito de Venta</h3>
        {step === 2 && (
          <DialogTrigger asChild>
            <Button variant="outline" size="sm"><Plus className="mr-2 h-4 w-4" /> Agregar</Button>
          </DialogTrigger>
        )}
      </div>
      
      <ScrollArea className="flex-grow">
        <div className="p-4 space-y-4">
          {cart.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">El carrito está vacío.</p>
          ) : cart.map((item: CartItem) => (
            <div key={item.id} className="flex items-start justify-between p-2 rounded-md hover:bg-muted/50">
              <div className="flex-grow pr-2">
                <p className="font-medium capitalize">{item.nombre}</p>
                <p className="text-xs text-muted-foreground capitalize">{item.tipo} &middot; ${item.precio?.toLocaleString('es-MX') || '0'}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Button size="icon" variant="outline" className="h-6 w-6 rounded-full" onClick={() => updateQuantity(item.id, item.cantidad - 1)}><Minus className="h-3 w-3" /></Button>
                  <span className="w-5 text-center font-bold">{item.cantidad}</span>
                  <Button size="icon" variant="outline" className="h-6 w-6 rounded-full" onClick={() => updateQuantity(item.id, item.cantidad + 1)}><Plus className="h-3 w-3" /></Button>
                </div>
                <div className="mt-2">
                  <Select onValueChange={(value) => updateItemProfessional(item.id, value)} value={item.barbero_id}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Seleccionar vendedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {sellers.map((b: {id: string, name: string}) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 mt-2">
                    <DiscountInput item={item} onDiscountChange={updateItemDiscount} />
                    <Select value={item.discountType || 'fixed'} onValueChange={(value: 'fixed' | 'percentage') => updateItemDiscount(item.id, String(item.discountValue || '0'), value)}>
                        <SelectTrigger className="w-[60px] h-8 text-xs">
                        <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                        <SelectItem value="fixed">$</SelectItem>
                        <SelectItem value="percentage">%</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-semibold">${((item.precio || 0) * item.cantidad).toLocaleString('es-MX')}</p>
                <Button variant="ghost" size="icon" className="h-7 w-7 mt-1 text-destructive/70 hover:text-destructive" onClick={() => removeFromCart(item.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      {cart.length > 0 && (
      <div className="p-4 border-t space-y-2 text-sm flex-shrink-0">
          <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>${subtotal.toLocaleString('es-MX')}</span>
          </div>
          <div className="flex justify-between text-destructive">
          <span>Descuento:</span>
          <span>-${totalDiscount.toLocaleString('es-MX')}</span>
          </div>
          <div className="flex justify-between font-bold text-xl pt-2 border-t">
          <span>Total:</span>
          <span className="text-primary">${total.toLocaleString('es-MX')}</span>
          </div>
      </div>
      )}
    </div>
);


export function NewSaleSheet({ isOpen, onOpenChange, initialData, onSaleComplete }: NewSaleSheetProps) {
  const { toast } = useToast();
  const { user, db } = useAuth();
  const [step, setStep] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [addItemSearchTerm, setAddItemSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [clientQueryKey, setClientQueryKey] = useState(0);
  const [reservationId, setReservationId] = useState<string | undefined>(undefined);
  const { selectedLocalId } = useLocal();
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);
  const [isSendingToTerminal, setIsSendingToTerminal] = useState(false);
  
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [currentSaleId, setCurrentSaleId] = useState<string | null>(null);


  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes', clientQueryKey);
  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
  const { data: users, loading: usersLoading } = useFirestoreQuery<User>('usuarios');
  const { data: services, loading: servicesLoading } = useFirestoreQuery<ServiceType>('servicios');
  const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
  const { data: terminals, loading: terminalsLoading } = useFirestoreQuery<any>('terminales');
  const { data: cashboxSettings, loading: cashboxSettingsLoading } = useFirestoreQuery<any>('configuracion', undefined, doc(db, 'configuracion', 'caja'));
  const mainTerminalId = cashboxSettings?.[0]?.mercadoPagoTerminalId;

  const sellers = useMemo(() => {
    const allSellers = new Map<string, { id: string; name: string }>();
    if (professionals) {
      professionals.forEach(p => allSellers.set(p.id, { id: p.id, name: p.name }));
    }
    if (users) {
      users.forEach(u => {
        if (u.role !== 'Administrador general' && u.role !== 'Administrador local') {
          if (!allSellers.has(u.id)) {
            allSellers.set(u.id, { id: u.id, name: u.name });
          }
        }
      });
    }
    return Array.from(allSellers.values());
  }, [professionals, users]);

  const subtotal = useMemo(() =>
    cart.reduce((acc, item) => acc + (item.precio || 0) * item.cantidad, 0),
    [cart]
  );
  
  const totalDiscount = useMemo(() => {
    return cart.reduce((acc, item) => {
        const itemTotal = (item.precio || 0) * item.cantidad;
        const discountValue = Number(item.discountValue) || 0;
        if (item.discountType === 'percentage') {
            return acc + (itemTotal * discountValue) / 100;
        }
        return acc + discountValue;
    }, 0);
  }, [cart]);

  const total = useMemo(() => Math.max(0, subtotal - totalDiscount), [subtotal, totalDiscount]);
  
  const form = useForm<SaleFormData>({
    resolver: zodResolver(saleSchema(total)),
    defaultValues: {
        notas: '',
        pago_efectivo: 0,
        pago_tarjeta: 0,
    },
  });
  
  const selectedClientId = form.watch('cliente_id');
  const selectedClient = useMemo(() => {
    return clients.find(c => c.id === selectedClientId)
  }, [selectedClientId, clients]);

  useEffect(() => {
    if (isOpen) {
        if (initialData?.local_id) {
            form.setValue('local_id', initialData.local_id);
        } else if (selectedLocalId) {
          form.setValue('local_id', selectedLocalId);
        } else if (!localesLoading && locales.length > 0) {
          form.setValue('local_id', locales[0].id);
        }
    }
  }, [isOpen, locales, localesLoading, form, selectedLocalId, initialData]);

  useEffect(() => {
    if(mainTerminalId && terminals?.some(t => t.id === mainTerminalId)) {
        setSelectedTerminalId(mainTerminalId);
    } else if (terminals?.length === 1) {
        setSelectedTerminalId(terminals[0].id);
    } else {
        setSelectedTerminalId(null);
    }
  }, [terminals, mainTerminalId]);


  const filteredServices = useMemo(() => {
    if (!services) return [];
    return services.filter(s => s && s.name && s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [searchTerm, services]);
  
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(p => p && p.nombre && p.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [searchTerm, products]);
  
  const addItemFilteredServices = useMemo(() => {
    if (!services) return [];
    return services.filter(s => s && s.name && s.name.toLowerCase().includes(addItemSearchTerm.toLowerCase()));
  }, [addItemSearchTerm, services]);

  const addItemFilteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(p => p && p.nombre && p.nombre.toLowerCase().includes(addItemSearchTerm.toLowerCase()));
  }, [addItemSearchTerm, products]);


  const addToCart = (item: Product | ServiceType, tipo: 'producto' | 'servicio') => {
    setCart(prev => {
      const existingItem = prev.find(ci => ci.id === item.id);
      if (existingItem) {
        return prev.map(ci =>
          ci.id === item.id ? { ...ci, cantidad: ci.cantidad + 1 } : ci
        );
      }
      
      const itemPrice = tipo === 'producto' ? (item as Product).public_price : (item as ServiceType).price;
      const itemName = tipo === 'producto' ? (item as Product).nombre : (item as ServiceType).name;
      const presentation_id = tipo === 'producto' ? (item as Product).presentation_id : undefined;

      return [...prev, { id: item.id, nombre: itemName, precio: itemPrice || 0, cantidad: 1, tipo, presentation_id }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
  };

  const updateQuantity = (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) {
      removeFromCart(itemId);
      return;
    }
    setCart(prev =>
      prev.map(item => (item.id === itemId ? { ...item, cantidad: newQuantity } : item))
    );
  };
  
  const updateItemProfessional = (itemId: string, barberoId: string) => {
    setCart(prev =>
      prev.map(item => (item.id === itemId ? { ...item, barbero_id: barberoId } : item))
    );
  };

  const updateItemDiscount = (itemId: string, value: string, type: 'fixed' | 'percentage') => {
      setCart(prev => prev.map(item => {
          if (item.id === itemId) {
              return {...item, discountValue: value, discountType: type};
          }
          return item;
      }));
  }

  
  const paymentMethod = form.watch('metodo_pago');
  
  const isCombinedPaymentInvalid = useMemo(() => {
    if (paymentMethod !== 'combinado') return false;
    const cashAmount = Number(form.getValues('pago_efectivo') || 0);
    const cardAmount = Number(form.getValues('pago_tarjeta') || 0);
    return cashAmount + cardAmount !== total;
  }, [form, paymentMethod, total]);

  const combinedTotal = useMemo(() => {
    if (paymentMethod !== 'combinado') return 0;
    const cashAmount = Number(form.getValues('pago_efectivo') || 0);
    const cardAmount = Number(form.getValues('pago_tarjeta') || 0);
    return cashAmount + cardAmount;
  }, [form, paymentMethod]);
  
  const remainingAmount = total - combinedTotal;


  useEffect(() => {
    if (isOpen && initialData) {
        form.setValue('cliente_id', initialData.client.id);
        if(initialData.local_id) {
            form.setValue('local_id', initialData.local_id);
        }
        if(initialData.reservationId) {
            setReservationId(initialData.reservationId);
        }
        const initialCartItems = initialData.items.map(item => {
            const tipo = 'duration' in item ? 'servicio' : 'producto';
            const precio = tipo === 'servicio' ? (item as ServiceType).price : (item as Product).public_price;
            const nombre = tipo === 'servicio' ? (item as ServiceType).name : (item as ServiceType).nombre;
            const presentation_id = tipo === 'producto' ? (item as Product).presentation_id : undefined;
            return {
                id: item.id,
                nombre,
                precio: precio || 0,
                cantidad: 1,
                tipo,
                presentation_id,
                barbero_id: (item as any).barbero_id || undefined,
            };
        });
        setCart(initialCartItems);
        setStep(2);
    }
  }, [initialData, form, isOpen]);

  const handleSendToTerminal = async () => {
    if (!selectedTerminalId || total <= 0 || !selectedClient) return;
    setIsSendingToTerminal(true);

    const saleRef = doc(collection(db, 'ventas'));
    setCurrentSaleId(saleRef.id);

    try {
      await onSubmit(form.getValues(), saleRef.id, 'Pendiente');

      const payer = {
          first_name: selectedClient.nombre,
          last_name: selectedClient.apellido,
          email: selectedClient.correo,
      };

      const items = cart.map(item => ({
        title: item.nombre,
        quantity: item.cantidad,
        unit_price: item.precio,
      }));

      const createPayment = httpsCallable(functions, 'createPointPayment');
      const result: any = await createPayment({
        amount: total,
        terminalId: selectedTerminalId,
        referenceId: saleRef.id,
        payer: payer,
        items: items
      });

      if (result.data.success) {
        toast({ title: 'Cobro enviado', description: 'Por favor, completa el pago en la terminal.'});
      } else {
        throw new Error(result.data.message || 'Error al enviar cobro a la terminal.');
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error de Terminal', description: error.message });
      setIsSendingToTerminal(false);
      if(currentSaleId) {
          await deleteDoc(doc(db, 'ventas', currentSaleId));
          setCurrentSaleId(null);
      }
    }
  }

  const handleNextStep = () => {
    if (cart.length === 0) {
      toast({ variant: 'destructive', title: 'Carrito vacío', description: 'Debes agregar al menos un ítem para continuar.' });
      return;
    }
    if (cart.some(item => !item.barbero_id)) {
      toast({ variant: 'destructive', title: 'Vendedor no asignado', description: 'Por favor, asigna un vendedor a cada ítem del carrito.' });
      return;
    }
    setStep(2);
  };

  const resetFlow = () => {
    setCart([]);
    setSearchTerm('');
    setStep(1);
    form.reset();
    setIsSubmitting(false);
    setAmountPaid(0);
    setIsSendingToTerminal(false);
    setCurrentSaleId(null);
    if(initialData) {
        onOpenChange(false);
    }
  }

  const handleClientCreated = (newClientId: string) => {
    setIsClientModalOpen(false);
    setClientQueryKey(prev => prev + 1); // Refetch clients
    form.setValue('cliente_id', newClientId, { shouldValidate: true });
  }

  async function onSubmit(data: SaleFormData, saleDocId?: string, paymentStatus: 'Pagado' | 'Pendiente' = 'Pagado') {
     setIsSubmitting(true);
    try {
      await runTransaction(db, async (transaction) => {
        const productRefs: { ref: DocumentReference, item: CartItem }[] = [];
        for (const item of cart) {
          if (item.tipo === 'producto') {
            const productRef = doc(db, 'productos', item.id);
            productRefs.push({ ref: productRef, item });
          }
        }
        
        const productDocs = await Promise.all(
          productRefs.map(p => transaction.get(p.ref))
        );

        for(const [index, productDoc] of productDocs.entries()) {
            const { item, ref } = productRefs[index];
            if (!productDoc.exists()) {
              throw new Error(`Producto con ID ${item.id} no encontrado.`);
            }
            const productData = productDoc.data() as Product;
            const currentStock = productData.stock;
            const newStock = currentStock - item.cantidad;
            if (newStock < 0) {
              throw new Error(`Stock insuficiente para ${item.nombre}.`);
            }
            transaction.update(ref, { stock: newStock });
            
            if (productData.stock_alarm_threshold && newStock <= productData.stock_alarm_threshold && productData.notification_email) {
                sendStockAlert({
                    productName: productData.nombre,
                    currentStock: newStock,
                    recipientEmail: productData.notification_email,
                }).catch(console.error);
            }
        }
        
        const ventaRef = saleDocId ? doc(db, "ventas", saleDocId) : doc(collection(db, "ventas"));
        const itemsToSave = cart.map(item => {
            const itemSubtotal = (item.precio || 0) * item.cantidad;
            const itemDiscountValue = Number(item.discountValue) || 0;
            const itemDiscountType = item.discountType || 'fixed';
            const itemDiscountAmount = itemDiscountType === 'percentage' 
                ? (itemSubtotal * itemDiscountValue) / 100 
                : itemDiscountValue;

            return {
                id: item.id,
                nombre: item.nombre,
                tipo: item.tipo,
                barbero_id: item.barbero_id || null,
                precio_unitario: item.precio || 0,
                cantidad: item.cantidad,
                subtotal: itemSubtotal,
                descuento: {
                    valor: itemDiscountValue,
                    tipo: itemDiscountType,
                    monto: itemDiscountAmount
                }
            };
        });
  
        const saleDataToSave: any = {
            ...data,
            items: itemsToSave,
            subtotal: subtotal,
            descuento: {
                valor: totalDiscount,
                tipo: 'fixed',
                monto: totalDiscount
            },
            total,
            fecha_hora_venta: Timestamp.now(),
            creado_por_id: user?.uid,
            creado_por_nombre: user?.displayName || user?.email,
            pago_estado: paymentStatus,
        };
        
        if (data.metodo_pago === 'combinado') {
            saleDataToSave.detalle_pago_combinado = {
                efectivo: data.pago_efectivo,
                tarjeta: data.pago_tarjeta,
            };
        }

        if (reservationId) {
            saleDataToSave.reservationId = reservationId;
        }

        if (saleDocId) {
            transaction.set(ventaRef, saleDataToSave);
        } else {
             transaction.set(ventaRef, {
                ...saleDataToSave,
                creado_en: Timestamp.now(),
            });
        }
        
        if (reservationId) {
            const reservationRef = doc(db, 'reservas', reservationId);
            transaction.update(reservationRef, { 
                pago_estado: 'Pagado',
                estado: 'Asiste'
            });
        }
      });

      if (paymentStatus === 'Pagado') {
        toast({
          title: '¡Venta registrada!',
          description: 'La venta se ha guardado correctamente.',
        });

        const settingsRef = doc(db, 'configuracion', 'recordatorios');
        const settingsSnap = await getDoc(settingsRef);
        const settings = settingsSnap.data() as ReminderSettings | undefined;
        const isReviewEnabled = settings?.notifications?.google_review?.enabled ?? false;

        if (isReviewEnabled) {
            const client = clients.find(c => c.id === data.cliente_id);
            const local = locales.find(l => l.id === data.local_id);
            if (client?.telefono && local) {
                setTimeout(() => {
                    sendGoogleReviewRequest({
                        clientId: client.id,
                        clientName: client.nombre,
                        clientPhone: client.telefono,
                        localName: local.name,
                    }).catch(err => {
                        console.error("Failed to send Google review request:", err);
                    });
                }, 30 * 60 * 1000);
            }
        }
        resetFlow();
        onOpenChange(false);
        onSaleComplete?.();
      }
    } catch (error: any) {
      console.error('Error al registrar la venta: ', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudo registrar la venta. Por favor, intenta de nuevo.',
      });
    } finally {
      if (paymentStatus === 'Pagado') {
          setIsSubmitting(false);
      }
    }
  }

  const clientOptions = useMemo(() => {
    return clients.map(client => ({
      value: client.id,
      label: `${client.nombre} ${client.apellido}`,
    }));
  }, [clients]);
  
  const isLocalAdmin = user?.role !== 'Administrador general';

  return (
    <>
    <Sheet open={isOpen} onOpenChange={(open) => {
        if(!open) resetFlow();
        onOpenChange(open);
    }}>
      <SheetContent className="w-full sm:max-w-4xl flex flex-col p-0">
        <SheetHeader className="p-6 border-b">
          <SheetTitle>Registrar Nueva Venta</SheetTitle>
          <SheetDescription>
            {step === 1 ? 'Busca y agrega servicios o productos al carrito.' : 'Completa los detalles para finalizar la venta.'}
          </SheetDescription>
        </SheetHeader>
        
        <Form {...form}>
            {step === 1 && (
                <div className="flex-grow grid grid-cols-3 gap-6 px-6 py-4 overflow-hidden">
                    {/* Item Selection & Client */}
                    <div className="col-span-2 flex flex-col gap-4">
                        <div className="flex-shrink-0">
                           {selectedClient ? (
                                <Card>
                                    <CardContent className="p-3">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-9 w-9">
                                                    <AvatarFallback>{selectedClient.nombre?.[0]}{selectedClient.apellido?.[0]}</AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <p className="font-semibold text-sm">{selectedClient.nombre} {selectedClient.apellido}</p>
                                                    <p className="text-xs text-muted-foreground">{selectedClient.telefono}</p>
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => form.setValue('cliente_id', '')}><X className="h-4 w-4" /></Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ) : (
                                <FormField control={form.control} name="cliente_id" render={({ field }) => (
                                    <FormItem>
                                        <div className="flex justify-between items-center">
                                        <FormLabel>Cliente *</FormLabel>
                                        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setIsClientModalOpen(true)}>
                                                <UserPlus className="h-3 w-3 mr-1" /> Nuevo cliente
                                        </Button>
                                        </div>
                                         <Combobox
                                            options={clientOptions}
                                            value={field.value}
                                            onChange={field.onChange}
                                            placeholder="Busca o selecciona un cliente..."
                                            loading={clientsLoading}
                                        />
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                            )}
                        </div>
                        <div className="relative mb-4 flex-shrink-0">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar servicio o producto..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        <Tabs defaultValue="servicios" className="flex-grow flex flex-col">
                            <TabsList>
                                <TabsTrigger value="servicios">Servicios</TabsTrigger>
                                <TabsTrigger value="productos">Productos</TabsTrigger>
                            </TabsList>
                            <ScrollArea className="flex-grow mt-4 pr-4">
                                <TabsContent value="servicios" className="mt-0">
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {(servicesLoading ? Array.from({length: 6}) : filteredServices).map((service, idx) => (
                                        service ? (
                                        <Card key={service.id} className="cursor-pointer hover:border-primary transition-all" onClick={() => addToCart(service, 'servicio')}>
                                            <CardContent className="p-4">
                                                <p className="font-semibold">{service.name}</p>
                                                <p className="text-sm text-primary">${(service.price || 0).toLocaleString('es-MX')}</p>
                                            </CardContent>
                                        </Card>
                                        ) : (
                                            <Card key={idx}><CardContent className="p-4"><div className="h-16 w-full bg-muted animate-pulse rounded-md" /></CardContent></Card>
                                        )
                                    ))}
                                    </div>
                                </TabsContent>
                                <TabsContent value="productos" className="mt-0">
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {(productsLoading ? Array.from({length: 6}) : filteredProducts).map((product, idx) => (
                                        product ? (
                                        <Card key={product.id} className="cursor-pointer hover:border-primary transition-all" onClick={() => addToCart(product, 'producto')}>
                                            <CardContent className="p-4">
                                                <p className="font-semibold">{product.nombre}</p>
                                                <p className="text-sm text-primary">${(product.public_price || 0).toLocaleString('es-MX')}</p>
                                                <p className="text-xs text-muted-foreground">{product.stock} en stock</p>
                                            </CardContent>
                                        </Card>
                                        ) : (
                                            <Card key={idx}><CardContent className="p-4"><div className="h-16 w-full bg-muted animate-pulse rounded-md" /></CardContent></Card>
                                        )
                                    ))}
                                    </div>
                                </TabsContent>
                            </ScrollArea>
                        </Tabs>
                    </div>
                    {/* Cart */}
                    <ResumenCarrito cart={cart} subtotal={subtotal} totalDiscount={totalDiscount} total={total} step={step} updateQuantity={updateQuantity} updateItemProfessional={updateItemProfessional} updateItemDiscount={updateItemDiscount} removeFromCart={removeFromCart} sellers={sellers} addItemSearchTerm={addItemSearchTerm} setAddItemSearchTerm={setAddItemSearchTerm} addItemFilteredServices={addItemFilteredServices} addItemFilteredProducts={addItemFilteredProducts} servicesLoading={servicesLoading} productsLoading={productsLoading} addToCart={addToCart}/>
                </div>
            )}

            {step === 2 && (
                <form onSubmit={form.handleSubmit((data) => onSubmit(data))} className="h-full flex flex-col overflow-hidden">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-6 py-4 flex-grow overflow-y-auto">
                        {/* Sale Details Form */}
                        <div className="space-y-4">
                            
                            {selectedClient ? (
                                <Card>
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-4">
                                                <Avatar className="h-10 w-10">
                                                    <AvatarFallback>{selectedClient.nombre?.[0]}{selectedClient.apellido?.[0]}</AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <p className="font-bold">{selectedClient.nombre} {selectedClient.apellido}</p>
                                                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                                                        <Mail className="h-3 w-3" /> {selectedClient.correo || 'Sin correo'}
                                                        <Phone className="h-3 w-3 ml-2" /> {selectedClient.telefono}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsClientModalOpen(true)}><Edit className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => form.setValue('cliente_id', '')}><X className="h-4 w-4" /></Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ) : (
                                <FormField control={form.control} name="cliente_id" render={({ field }) => (
                                    <FormItem>
                                        <div className="flex justify-between items-center">
                                        <FormLabel>Cliente</FormLabel>
                                        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setIsClientModalOpen(true)}>
                                                <UserPlus className="h-3 w-3 mr-1" /> Nuevo cliente
                                        </Button>
                                        </div>
                                         <Combobox
                                            options={clientOptions}
                                            value={field.value}
                                            onChange={field.onChange}
                                            placeholder="Busca o selecciona un cliente..."
                                            loading={clientsLoading}
                                        />
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                            )}

                            <FormField
                                control={form.control}
                                name="local_id"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Local</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value} disabled={isLocalAdmin}>
                                        <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecciona un local" />
                                        </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                        {locales.map(l => (
                                            <SelectItem key={l.id} value={l.id}>
                                            {l.name}
                                            </SelectItem>
                                        ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                            
                            <FormField
                            control={form.control}
                            name="metodo_pago"
                            render={({ field }) => (
                                <FormItem className="space-y-3">
                                <FormLabel className="flex items-center"><CreditCard className="mr-2 h-4 w-4" /> Método de Pago</FormLabel>
                                <FormControl>
                                    <RadioGroup
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                    className="flex flex-wrap gap-2"
                                    >
                                    <FormItem>
                                        <FormControl><RadioGroupItem value="efectivo" id="efectivo" className="sr-only" /></FormControl>
                                        <FormLabel htmlFor="efectivo" className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3", field.value === 'efectivo' && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')}>Efectivo</FormLabel>
                                    </FormItem>
                                    <FormItem>
                                        <FormControl><RadioGroupItem value="tarjeta" id="tarjeta" className="sr-only" /></FormControl>
                                        <FormLabel htmlFor="tarjeta" className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3", field.value === 'tarjeta' && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')}>Tarjeta</FormLabel>
                                    </FormItem>
                                    <FormItem>
                                        <FormControl><RadioGroupItem value="transferencia" id="transferencia" className="sr-only" /></FormControl>
                                        <FormLabel htmlFor="transferencia" className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3", field.value === 'transferencia' && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')}>Transferencia</FormLabel>
                                    </FormItem>
                                    <FormItem>
                                        <FormControl><RadioGroupItem value="combinado" id="combinado" className="sr-only" /></FormControl>
                                        <FormLabel htmlFor="combinado" className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3", field.value === 'combinado' && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')}>Pago Combinado</FormLabel>
                                    </FormItem>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                            />
                            
                            {paymentMethod === 'tarjeta' && (
                                <Card className="p-4 bg-muted/50">
                                    <FormLabel className="flex items-center text-sm font-medium mb-2"><CreditCard className="mr-2 h-4 w-4" /> Cobro con Terminal Point</FormLabel>
                                    <div className="space-y-2">
                                        <Select value={selectedTerminalId || ''} onValueChange={setSelectedTerminalId} disabled={terminalsLoading}>
                                            <SelectTrigger>
                                                <SelectValue placeholder={terminalsLoading ? "Buscando terminales..." : "Selecciona una terminal"} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {terminals.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.display_name || t.id}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <Button type="button" onClick={handleSendToTerminal} disabled={isSendingToTerminal || terminalsLoading || !selectedTerminalId || total <= 0} className="w-full">
                                            {isSendingToTerminal ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4" />}
                                            Cobrar ${total.toLocaleString('es-MX')} en Terminal
                                        </Button>
                                    </div>
                                    {!terminals.length && !terminalsLoading && <p className="text-xs text-muted-foreground mt-2">No se encontraron terminales en modo PDV. Ve a Ajustes > Terminal para activarlas.</p>}
                                </Card>
                            )}
                            {paymentMethod === 'efectivo' && (
                                <Card className="p-4 bg-muted/50">
                                    <FormLabel className="flex items-center text-sm font-medium mb-2"><Calculator className="mr-2 h-4 w-4" /> Calculadora de Cambio</FormLabel>
                                    <div className="space-y-2">
                                        <div className="grid grid-cols-2 gap-4 items-center">
                                            <FormItem>
                                                <FormLabel className="text-xs">Paga con</FormLabel>
                                                <div className="relative">
                                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                                  <Input type="number" placeholder="0" className="pl-6" value={amountPaid || ''} onChange={(e) => setAmountPaid(Number(e.target.value))} />
                                                </div>
                                            </FormItem>
                                            <div className="text-center">
                                                <p className="text-xs text-muted-foreground">Cambio</p>
                                                <p className="font-bold text-lg text-primary">${Math.max(0, amountPaid - total).toLocaleString('es-MX')}</p>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            )}

                            {paymentMethod === 'combinado' && (
                            <Card className="p-4 bg-muted/50">
                                <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="pago_efectivo"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Efectivo</FormLabel>
                                        <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                                    </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="pago_tarjeta"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tarjeta</FormLabel>
                                        <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                                    </FormItem>
                                    )}
                                />
                                </div>
                                <div className="mt-4 space-y-1 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Total Ingresado:</span>
                                        <span className="font-medium">${combinedTotal.toLocaleString('es-MX')}</span>
                                    </div>
                                    <div className={cn("flex justify-between font-semibold", remainingAmount === 0 ? "text-green-600" : "text-destructive")}>
                                        <span>Faltante:</span>
                                        <span>${remainingAmount.toLocaleString('es-MX')}</span>
                                    </div>
                                </div>
                                <FormMessage className="mt-2 text-center text-xs">
                                {form.formState.errors.pago_tarjeta?.message}
                                </FormMessage>
                            </Card>
                            )}
                            <FormField control={form.control} name="notas" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Notas (Opcional)</FormLabel>
                                    <FormControl><Textarea placeholder="Añade un comentario sobre la venta..." {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>
                        {/* Order Summary */}
                        <Dialog>
                            <ResumenCarrito cart={cart} subtotal={subtotal} totalDiscount={totalDiscount} total={total} step={step} updateQuantity={updateQuantity} updateItemProfessional={updateItemProfessional} updateItemDiscount={updateItemDiscount} removeFromCart={removeFromCart} sellers={sellers} addItemSearchTerm={addItemSearchTerm} setAddItemSearchTerm={setAddItemSearchTerm} addItemFilteredServices={addItemFilteredServices} addItemFilteredProducts={addItemFilteredProducts} servicesLoading={servicesLoading} productsLoading={productsLoading} addToCart={addToCart}/>
                             <DialogContent className="sm:max-w-2xl">
                                <DialogHeader>
                                <DialogTitle>Agregar Ítem a la Venta</DialogTitle>
                                </DialogHeader>
                                <div className="flex flex-col h-[60vh]">
                                <div className="relative mb-4">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Buscar servicio o producto..." className="pl-10" value={addItemSearchTerm} onChange={e => setAddItemSearchTerm(e.target.value)} />
                                </div>
                                <Tabs defaultValue="servicios" className="flex-grow flex flex-col overflow-hidden">
                                    <TabsList>
                                    <TabsTrigger value="servicios">Servicios</TabsTrigger>
                                    <TabsTrigger value="productos">Productos</TabsTrigger>
                                    </TabsList>
                                    <ScrollArea className="flex-grow mt-4 pr-4">
                                    <TabsContent value="servicios" className="mt-0">
                                        <div className="space-y-2">
                                        {(servicesLoading ? Array.from({ length: 3 }) : addItemFilteredServices).map((service, idx) => (
                                            service ? (
                                            <div key={service.id} className="flex items-center justify-between p-2 rounded-md border">
                                                <div>
                                                <p className="font-semibold">{service.name}</p>
                                                <p className="text-sm text-primary">${(service.price || 0).toLocaleString('es-MX')}</p>
                                                </div>
                                                <Button size="sm" onClick={() => addToCart(service, 'servicio')}>Agregar</Button>
                                            </div>
                                            ) : (<div key={idx} className="h-16 w-full bg-muted animate-pulse rounded-md" />)
                                        ))}
                                        </div>
                                    </TabsContent>
                                    <TabsContent value="productos" className="mt-0">
                                        <div className="space-y-2">
                                        {(productsLoading ? Array.from({ length: 3 }) : addItemFilteredProducts).map((product, idx) => (
                                            product ? (
                                            <div key={product.id} className="flex items-center justify-between p-2 rounded-md border">
                                                <div>
                                                <p className="font-semibold">{product.nombre}</p>
                                                <p className="text-sm text-primary">${(product.public_price || 0).toLocaleString('es-MX')}</p>
                                                <p className="text-xs text-muted-foreground">{product.stock} en stock</p>
                                                </div>
                                                <Button size="sm" onClick={() => addToCart(product, 'producto')}>Agregar</Button>
                                            </div>
                                            ) : (<div key={idx} className="h-16 w-full bg-muted animate-pulse rounded-md" />)
                                        ))}
                                        </div>
                                    </TabsContent>
                                    </ScrollArea>
                                </Tabs>
                                </div>
                                <SheetFooter>
                                <DialogClose asChild>
                                    <Button type="button" variant="secondary">Cerrar</Button>
                                </DialogClose>
                                </SheetFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                    <SheetFooter className="p-6 bg-background border-t mt-auto">
                        <Button type="button" variant="outline" onClick={() => setStep(1)}>Volver</Button>
                        <Button type="submit" disabled={isSubmitting || isCombinedPaymentInvalid || paymentMethod === 'tarjeta'}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Finalizar Venta por ${total.toLocaleString('es-MX')}
                        </Button>
                    </SheetFooter>
                  </form>
            )}
        </Form>
        
        {step === 1 && (
            <SheetFooter className="p-6 bg-background border-t">
                 <Button
                    type="button"
                    className="w-full text-lg py-6 bg-primary hover:bg-primary/90 text-white"
                    onClick={handleNextStep}
                    disabled={cart.length === 0 || !selectedClientId || cart.some(item => !item.barbero_id)}
                >
                    Continuar
                </Button>
            </SheetFooter>
        )}
      </SheetContent>
    </Sheet>

    <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
        <DialogContent className="sm:max-w-lg">
             <DialogHeader>
                <DialogTitle>Crear Nuevo Cliente</DialogTitle>
                <DialogDescription>
                    Completa la información para registrar un nuevo cliente en el sistema.
                </DialogDescription>
              </DialogHeader>
            <NewClientForm onFormSubmit={handleClientCreated} />
        </DialogContent>
    </Dialog>
    </>
  );
}
