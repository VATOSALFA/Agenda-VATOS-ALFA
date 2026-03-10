'use server';
/**
 * @fileOverview A flow to send an email notification for low stock alerts.
 *
 * - sendStockAlert - A function that sends the email.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { sendEmail } from '@/lib/services/email';

const StockAlertInputSchema = z.object({
    productName: z.string().describe("The name of the product that is low on stock."),
    currentStock: z.number().describe("The current stock quantity of the product."),
    recipientEmail: z.string().email().describe("The email address to send the alert to."),
    productImage: z.string().optional().describe("URL of the product image."),
});
type StockAlertInput = z.infer<typeof StockAlertInputSchema>;

export async function sendStockAlert(input: StockAlertInput): Promise<string> {
    const subject = `⚠️ Alerta de Stock Bajo: ${input.productName}`;

    // Construct HTML Email
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background-color: #1a1a1a; padding: 20px; text-align: center; }
            .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
            .content { padding: 30px; text-align: center; }
            .product-image { max-width: 200px; max-height: 200px; object-fit: cover; border-radius: 8px; margin-bottom: 20px; }
            .stock-count { font-size: 48px; font-weight: bold; color: #e11d48; margin: 10px 0; }
            .label { color: #666; font-size: 16px; margin-bottom: 5px; }
            .footer { background-color: #f9fafb; padding: 15px; text-align: center; font-size: 12px; color: #999; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Alerta de Inventario</h1>
            </div>
            <div class="content">
                ${input.productImage ? `<img src="${input.productImage}" alt="${input.productName}" class="product-image" />` : ''}
                <h2>${input.productName}</h2>
                <p class="label">Stock Actual en Locales</p>
                <div class="stock-count">${input.currentStock}</div>
                <p style="color: #4b5563; margin-top: 20px;">
                    El inventario de este producto ha descendido por debajo del límite permitido. 
                    Se recomienda reabastecer lo antes posible para evitar quiebres de stock.
                </p>
            </div>
            <div class="footer">
                Enviado automáticamente por Agenda VATOS ALFA
            </div>
        </div>
    </body>
    </html>
    `;

    try {
        await sendEmail({
            to: input.recipientEmail,
            subject: subject,
            html: htmlContent,
            text: `El producto ${input.productName} tiene un stock bajo de ${input.currentStock}.`
        });

        console.log(`Stock alert sent to ${input.recipientEmail} for ${input.productName}`);
        return "Email sent successfully";
    } catch (error) {
        console.error("Failed to send stock alert email:", error);
        return "Failed to send email";
    }
}
