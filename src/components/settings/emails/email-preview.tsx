'use client';

import { ScrollArea } from "@/components/ui/scroll-area";

interface EmailPreviewProps {
    config: any;
    type: 'confirmation' | 'reminder';
}

export function EmailPreview({ config, type }: EmailPreviewProps) {

    const getHtml = () => {
        const clientName = "Juan Pérez";
        const senderName = "VATOS ALFA Barber Shop";
        const logoUrl = "https://firebasestorage.googleapis.com/v0/b/agenda-1ae08.appspot.com/o/empresa%2Flogo.png?alt=media";
        const secondaryColor = "#314177";
        const dateStr = "Lunes, 12 de Octubre, 2026";
        const timeStr = "10:00 AM";
        const professionalName = "Carlos Barbero";
        const localAddress = "Av. Cerro Sombrerete 1001";
        const localPhone = "442-123-4567";
        const whatsappLink = "#";

        if (type === 'confirmation') {
            const subject = config.confirmSubject || `Confirmación de Cita`;
            // Handle {nombre} replacement nicely
            let headline = config.confirmHeadline || `¡Hola {nombre}, tu cita está confirmada!`;
            headline = headline.replace('{nombre}', clientName);

            const footerNote = config.confirmationEmailNote || 'Favor de llegar 5 minutos antes de la hora de tu cita.';
            const whatsappText = config.confirmWhatsappText || 'Contáctanos por WhatsApp';

            return `
            <div style="font-family: 'Roboto', Arial, sans-serif; color: #333; max-width: 100%; padding: 20px;">
            <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet">
            
            <div style="max-width: 400px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div style="background-color: #ffffff; padding: 25px 20px 10px 20px; text-align: center;">
                    <img src="${logoUrl}" alt="${senderName}" style="width: 100%; max-width: 280px; height: auto; object-fit: contain;" />
                </div>

                <div style="padding: 25px;">
                    <h2 style="color: ${secondaryColor}; text-align: center; margin-top: 5px; margin-bottom: 5px; font-family: 'Roboto', Arial, sans-serif; font-weight: 700; font-size: 24px; line-height: 1.2;">${headline}</h2>
                    
                    <div style="margin-bottom: 25px; text-align: center;"><div style="margin-bottom: 8px; font-family: 'Roboto', Arial, sans-serif; font-size: 1.4em; font-weight: 700; color: #333;">Corte de Cabello</div></div>

                    <table style="width: 100%; border-collapse: separate; border-spacing: 0 12px;">
                            <tr>
                            <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/2693/2693507.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td> 
                            <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${dateStr}</td>
                            </tr>
                            
                            <tr>
                            <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/2972/2972531.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                            <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${timeStr}</td>
                            </tr>

                            <tr>
                                <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/1077/1077114.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                                <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${professionalName}</td>
                            </tr>

                            <tr>
                                <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/535/535239.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                                <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${localAddress}</td>
                            </tr>
                    </table>

                    <div style="background-color: #ffffff; color: #333; padding: 15px; border-radius: 8px; font-size: 0.9em; margin-top: 25px; text-align: center; border: 1px solid #000000;">
                        ${footerNote}
                    </div>

                    <div style="margin-top: 25px; text-align: left;">
                        <div style="margin-bottom: 12px; padding-left: 2px;">
                            <a href="${whatsappLink}" style="text-decoration: none; color: #333; display: inline-flex; align-items: center;">
                                <img src="https://cdn-icons-png.flaticon.com/512/3670/3670051.png" width="20" style="margin-right: 12px;" alt="WhatsApp" />
                                <span style="font-weight: 700; font-size: 1em;">${whatsappText}</span>
                            </a>
                        </div>
                        <div style="display: flex; align-items: center; color: #333; padding-left: 2px;">
                                <img src="https://cdn-icons-png.flaticon.com/512/724/724664.png" width="20" style="margin-right: 12px; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);" alt="Teléfono" />
                                <span style="font-weight: 700; font-size: 1em;">${localPhone}</span>
                        </div>
                    </div>
                </div>
                
                <div style="background-color: #ffffff; padding: 20px; text-align: center; font-size: 0.75em; color: #bbb; border-top: 1px solid #f9f9f9;">
                    ${config.signature || senderName}
                </div>
            </div>
        </div>`;

        } else {
            // Reminder
            const headline = (config.reminderHeadline || '¡{nombre}, recordatorio de tu cita!').replace('{nombre}', clientName);
            const subHeadline = config.reminderSubHeadline || 'Reserva Agendada';
            const footerNote = config.reminderFooterNote || 'Te esperamos 5 minutos antes de tu cita.';
            const whatsappText = config.reminderWhatsappText || 'Contáctanos por WhatsApp';

            return `
               <div style="font-family: 'Roboto', Arial, sans-serif; color: #333; max-width: 100%; padding: 20px;">
                <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet">
                <div style="max-width: 400px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                   <div style="background-color: #ffffff; padding: 25px 20px 10px 20px; text-align: center;">
                       <img src="${logoUrl}" alt="${senderName}" style="width: 100%; max-width: 280px; height: auto; object-fit: contain;" />
                   </div>
                   <div style="padding: 25px;">
                        <h2 style="color: #333; text-align: center; margin-top: 5px; margin-bottom: 5px; font-family: 'Roboto', Arial, sans-serif; font-weight: 700; font-size: 24px; line-height: 1.2;">${headline}</h2>
                        <p style="text-align: center; color: #999; font-size: 0.9em; margin-bottom: 25px;">${subHeadline}</p>
                        
                        <div style="margin-bottom: 25px; text-align: center;">
                            <div style="margin-bottom: 8px; font-family: 'Roboto', Arial, sans-serif; font-size: 1.4em; font-weight: 700; color: #333;">Corte de Cabello</div>
                        </div>

                        <table style="width: 100%; border-collapse: separate; border-spacing: 0 12px;">
                             <tr>
                                <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/2693/2693507.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td> 
                                <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${dateStr}</td>
                             </tr>
                             <tr>
                                <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/2972/2972531.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                                <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${timeStr}</td>
                             </tr>
                             <tr>
                                 <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/1077/1077114.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                                 <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${professionalName}</td>
                             </tr>
                             <tr>
                                 <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/535/535239.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                                 <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${localAddress}</td>
                             </tr>
                        </table>

                        <div style="background-color: #ffffff; color: #333; padding: 15px; border-radius: 8px; font-size: 0.9em; margin-top: 25px; text-align: center; border: 1px solid #000000;">
                           ${footerNote}
                        </div>

                        <div style="margin-top: 25px; text-align: left;">
                            <div style="margin-bottom: 12px; padding-left: 2px;">
                                <a href="${whatsappLink}" style="text-decoration: none; color: #333; display: inline-flex; align-items: center;">
                                    <img src="https://cdn-icons-png.flaticon.com/512/3670/3670051.png" width="20" style="margin-right: 12px;" alt="WhatsApp" />
                                    <span style="font-weight: 700; font-size: 1em;">${whatsappText}</span>
                                </a>
                            </div>
                            <div style="display: flex; align-items: center; color: #333; padding-left: 2px;">
                                 <img src="https://cdn-icons-png.flaticon.com/512/724/724664.png" width="20" style="margin-right: 12px; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);" alt="Teléfono" />
                                 <span style="font-weight: 700; font-size: 1em;">${localPhone}</span>
                            </div>
                        </div>
                   </div>
                   <div style="background-color: #ffffff; padding: 20px; text-align: center; font-size: 0.75em; color: #bbb; border-top: 1px solid #f9f9f9;">
                        ${config.signature || senderName}
                   </div>
                </div>
            </div>`;
        }
    }

    return (
        <div className="border rounded-md bg-gray-100/50 overflow-hidden flex flex-col h-full min-h-[600px] shadow-inner">
            <div className="bg-muted px-4 py-2 text-xs uppercase font-semibold text-muted-foreground border-b flex items-center justify-between">
                <span>Vista Previa ({type === 'confirmation' ? 'Confirmación' : 'Recordatorio'})</span>
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">En vivo</span>
            </div>
            <ScrollArea className="flex-1 w-full bg-gray-100">
                <div className="w-full min-h-full flex items-start justify-center p-6">
                    <div
                        dangerouslySetInnerHTML={{ __html: getHtml() }}
                        className="w-full max-w-[450px] bg-transparent origin-top transform transition-all"
                        style={{ isolation: 'isolate' }}
                    />
                </div>
            </ScrollArea>
        </div>
    );
}
