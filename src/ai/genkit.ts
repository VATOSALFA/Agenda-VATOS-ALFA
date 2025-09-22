import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
<<<<<<< HEAD
  plugins: [googleAI({firebase: true})],
=======
  plugins: [googleAI()],
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
  model: 'googleai/gemini-2.0-flash',
});
