import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import {nextPlugin} from '@genkit-ai/next/plugin';

export const ai = genkit({
  plugins: [googleAI({firebase: true}), nextPlugin({firebase: true})],
  model: 'googleai/gemini-2.0-flash',
});
