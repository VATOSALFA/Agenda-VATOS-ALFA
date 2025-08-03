
'use server';
/**
 * @fileOverview A flow to send an email notification for low stock alerts.
 *
 * - sendStockAlert - A function that sends the email.
 * - StockAlertInput - The input type for the sendStockAlert function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const StockAlertInputSchema = z.object({
    productName: z.string().describe("The name of the product that is low on stock."),
    currentStock: z.number().describe("The current stock quantity of the product."),
    recipientEmail: z.string().email().describe("The email address to send the alert to."),
});
export type StockAlertInput = z.infer<typeof StockAlertInputSchema>;

const stockAlertPrompt = ai.definePrompt({
    name: 'stockAlertPrompt',
    input: { schema: StockAlertInputSchema },
    prompt: `
        Subject: Alerta de Bajo Stock: {{{productName}}}

        Hola,

        Este es un aviso automático para informarte que el stock del producto "{{{productName}}}" está bajo.

        Cantidad actual en stock: {{{currentStock}}}

        Por favor, considera reabastecer este producto pronto.

        Saludos,
        Tu Sistema de Gestión de Inventario
    `,
});

export async function sendStockAlert(input: StockAlertInput): Promise<void> {
    const emailContent = await stockAlertPrompt(input);
    console.log(`Simulating sending email to ${input.recipientEmail}`);
    console.log(emailContent.text);
    // In a real application, you would integrate an email sending service here.
    // For example, using Nodemailer, SendGrid, etc.
}
