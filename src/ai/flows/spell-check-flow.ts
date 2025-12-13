'use server';
/**
 * @fileOverview A flow for spell checking text, specifically for names.
 *
 * - spellCheck - A function that takes a string and returns a spelling correction if needed.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const SpellCheckInputSchema = z.object({
  text: z.string().describe('The text to be spell-checked.'),
});

const SpellCheckOutputSchema = z.object({
  correctedText: z.string().describe('The corrected text. If no correction is needed, it should be the same as the input text.'),
  hasCorrection: z.boolean().describe('Whether a correction was made.'),
});

export type SpellCheckOutput = z.infer<typeof SpellCheckOutputSchema>;

export async function spellCheck(text: string): Promise<SpellCheckOutput> {
  // If the text is very short, don't attempt to correct it.
  if (text.trim().length <= 2) {
    return { correctedText: text, hasCorrection: false };
  }
  const result = await spellCheckFlow({ text });
  return result;
}

const spellCheckPrompt = ai.definePrompt({
  name: 'spellCheckPrompt',
  input: { schema: SpellCheckInputSchema },
  output: { schema: SpellCheckOutputSchema },
  prompt: `
    You are an expert spell checker, specialized in correcting proper names in Spanish.
    Your task is to correct any spelling mistakes in the provided text.

    - Analyze the following text: {{{text}}}
    - If you find a spelling mistake, provide the corrected version in 'correctedText'. Set 'hasCorrection' to true.
    - Be careful with uncommon but valid names. Do not correct names that are simply unusual. Only correct clear typographical errors. For example, "Alexandr" might be a valid name, but "Alejandroo" is likely a typo for "Alejandro".
    - If the text is already spelled correctly, return the original text in 'correctedText' and set 'hasCorrection' to false.
  `,
});

const spellCheckFlow = ai.defineFlow(
  {
    name: 'spellCheckFlow',
    inputSchema: SpellCheckInputSchema,
    outputSchema: SpellCheckOutputSchema,
  },
  async (input) => {
    const { output } = await spellCheckPrompt(input);
    return output!;
  }
);
