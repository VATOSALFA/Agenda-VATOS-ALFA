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

const COMMON_NAMES: Record<string, string> = {
  "jose": "José",
  "maria": "María",
  "alejandro": "Alejandro",
  "jesus": "Jesús",
  "angel": "Ángel",
  "sofia": "Sofía",
  "monica": "Mónica",
  "hector": "Héctor",
  "raul": "Raúl",
  "oscar": "Óscar",
  "andres": "Andrés",
  "martin": "Martín",
  "cesar": "César",
  "victor": "Víctor",
  "ramon": "Ramón",
  "simon": "Simón",
  "joaquin": "Joaquín",
  "agustin": "Agustín",
  "benjamin": "Benjamín",
  "fabiola": "Fabiola",
  "rebeca": "Rebeca",
  "veronica": "Verónica",
  "angelica": "Angélica",
  "patricia": "Patricia",
  "claudia": "Claudia",
  "fernando": "Fernando",
  "gabriel": "Gabriel",
  "roberto": "Roberto",
  "carlos": "Carlos",
  "daniel": "Daniel",
  "eduardo": "Eduardo",
  "francisco": "Francisco",
  "gerardo": "Gerardo",
  "hugo": "Hugo",
  "ignacio": "Ignacio",
  "javier": "Javier",
  "luis": "Luis",
  "manuel": "Manuel",
  "nicolas": "Nicolás",
  "pedro": "Pedro",
  "ricardo": "Ricardo",
  "sergio": "Sergio",
  "tomas": "Tomás",
  "ulises": "Ulises",
  "xavier": "Xavier",
  "yolanda": "Yolanda",
  "zacarias": "Zacarías",
  "aaron": "Aarón",
  "adrian": "Adrián",
  "alan": "Alan",
  "alexis": "Alexis",
  "alfonso": "Alfonso",
  "alvaro": "Álvaro",
  "ana": "Ana",
  "antonio": "Antonio",
  "arturo": "Arturo",
  "beatriz": "Beatriz",
  "brian": "Brian",
  "camila": "Camila",
  "carmen": "Carmen",
  "carolina": "Carolina",
  "catalina": "Catalina",
  "cecilia": "Cecilia",
  "christian": "Christian",
  "cristina": "Cristina",
  "david": "David",
  "diana": "Diana",
  "diego": "Diego",
  "elena": "Elena",
  "elias": "Elías",
  "elisa": "Elisa",
  "elizabeth": "Elizabeth",
  "emilio": "Emilio",
  "enrique": "Enrique",
  "eric": "Eric",
  "erika": "Erika",
  "ernesto": "Ernesto",
  "esteban": "Esteban",
  "felipe": "Felipe",
  "felix": "Félix",
  "fernanda": "Fernanda",
  "gabriela": "Gabriela",
  "german": "Germán",
  "gloria": "Gloria",
  "guadalupe": "Guadalupe",
  "guillermo": "Guillermo",
  "gustavo": "Gustavo",
  "isabel": "Isabel",
  "ivan": "Iván",
  "jaime": "Jaime",
  "jorge": "Jorge",
  "juan": "Juan",
  "julia": "Julia",
  "julian": "Julián",
  "julio": "Julio",
  "karina": "Karina",
  "kevin": "Kevin",
  "laura": "Laura",
  "leonardo": "Leonardo",
  "leticia": "Leticia",
  "lorenzo": "Lorenzo",
  "lucia": "Lucía",
  "mariana": "Mariana",
  "mario": "Mario",
  "marta": "Marta",
  "mateo": "Mateo",
  "mauricio": "Mauricio",
  "miguel": "Miguel",
  "natalia": "Natalia",
  "olga": "Olga",
  "omar": "Omar",
  "pablo": "Pablo",
  "paola": "Paola",
  "paulo": "Paulo",
  "rafael": "Rafael",
  "raquel": "Raquel",
  "rene": "René",
  "rosa": "Rosa",
  "ruben": "Rubén",
  "salvador": "Salvador",
  "samuel": "Samuel",
  "santiago": "Santiago",
  "sara": "Sara",
  "sebastian": "Sebastián",
  "silvia": "Silvia",
  "susana": "Susana",
  "teresa": "Teresa",
  "valeria": "Valeria",
  "vanesa": "Vanesa",
  "victoria": "Victoria"
};

export async function spellCheck(text: string): Promise<SpellCheckOutput> {
  const trimmedText = text.trim();

  // If the text is very short, don't attempt to correct it.
  if (trimmedText.length <= 2) {
    return { correctedText: text, hasCorrection: false };
  }

  // 1. Dictionary Check (Instant & Offline)
  const lowerText = trimmedText.toLowerCase();

  // Check exact match in dictionary
  if (COMMON_NAMES[lowerText] && COMMON_NAMES[lowerText] !== trimmedText) {
    return { correctedText: COMMON_NAMES[lowerText], hasCorrection: true };
  }

  // Check if it's multiple names (e.g. "juan carlos")
  const parts = lowerText.split(/\s+/);
  if (parts.length > 1) {
    // Attempt to correct each part if found in dictionary
    const correctedParts = parts.map(part => COMMON_NAMES[part] || (part.length > 1 ? (part.charAt(0).toUpperCase() + part.slice(1)) : part));
    const reconstructed = correctedParts.join(' ');

    // Check if distinct from original input
    if (reconstructed !== trimmedText) {
      // Only return if at least one part was definitely corrected by dictionary OR casing changed significantly
      // To be safe, let's trust the reconstruction if simple casing fix
      return { correctedText: reconstructed, hasCorrection: true };
    }
  }

  // 2. AI Fallback (if configured)
  try {
    const result = await spellCheckFlow({ text });
    return result;
  } catch (error) {
    console.error("Spell check failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Stack trace:", error.stack);
    }

    // Final fallback: Title Case if single word and looks like a name
    if (parts.length === 1 && /^[a-z]+$/.test(lowerText) && lowerText === trimmedText && trimmedText.length > 2) {
      const simpleCapitalized = lowerText.charAt(0).toUpperCase() + lowerText.slice(1);
      if (simpleCapitalized !== trimmedText) {
        return { correctedText: simpleCapitalized, hasCorrection: true };
      }
    }

    return { correctedText: text, hasCorrection: false };
  }
}

const spellCheckPrompt = ai.definePrompt({
  name: 'spellCheckPrompt',
  input: { schema: SpellCheckInputSchema },
  output: { schema: SpellCheckOutputSchema },
  prompt: `
    You are an expert spell checker, specialized in correcting proper names in Spanish.
    Your task is to correct and standardize checking for spelling mistakes, capitalization errors, and missing accents in the provided text.

    - Analyze the following text: {{{text}}}
    - **Capitalization**: Ensure the text is properly capitalized (Title Case). (e.g., "jose" -> "Jose").
    - **Accents**: CRITICAL: Ensure proper Spanish accents are applied to common names (e.g., "Jose" -> "José", "Maria" -> "María", "Sofia" -> "Sofía", "Angel" -> "Ángel").
    - If you find a spelling mistake, capitalization error, or missing accent, provide the corrected version in 'correctedText'. Set 'hasCorrection' to true.
    - Be careful with uncommon but valid names. Do not correct names that are simply unusual. Only correct clear typographical errors or missing accents on common names.
    - If the text is already spelled correctly (including accents and capitalization), return the original text in 'correctedText' and set 'hasCorrection' to false.
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
