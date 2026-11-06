import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { getBasicUsageStats } from 'genkit/model';
import { downloadRequestMedia } from '@genkit-ai/ai/model/middleware';

const GEMINI_35_FLASH_LITE_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_35_FLASH_LITE_FULL = `googleai/${GEMINI_35_FLASH_LITE_MODEL}`;

function getGeminiApiKey(configApiKey?: string): string {
  const key =
    configApiKey ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY;
  if (!key) {
    throw new Error(
      'Falta configurar GEMINI_API_KEY o GOOGLE_API_KEY en las variables de entorno.'
    );
  }
  return key;
}

function convertSchemaProperty(property: any): any {
  if (!property || !property.type) {
    return undefined;
  }
  const baseSchema: Record<string, any> = {};
  if (property.description) {
    baseSchema.description = property.description;
  }
  if (property.enum) {
    baseSchema.type = 'STRING';
    baseSchema.enum = property.enum;
  }
  if (property.nullable) {
    baseSchema.nullable = property.nullable;
  }
  let propertyType: string | undefined;
  if (Array.isArray(property.type)) {
    const types = property.type as string[];
    if (types.includes('null')) {
      baseSchema.nullable = true;
    }
    propertyType = types.find((t) => t !== 'null');
  } else {
    propertyType = property.type;
  }
  if (!propertyType) {
    return undefined;
  }
  if (propertyType === 'object') {
    const nestedProperties: Record<string, any> = {};
    const props = property.properties || {};
    Object.keys(props).forEach((key) => {
      const converted = convertSchemaProperty(props[key]);
      if (converted !== undefined) {
        nestedProperties[key] = converted;
      }
    });
    return {
      ...baseSchema,
      type: 'OBJECT',
      properties: nestedProperties,
      ...(Array.isArray(property.required) && property.required.length > 0
        ? { required: property.required }
        : {}),
    };
  } else if (propertyType === 'array') {
    return {
      ...baseSchema,
      type: 'ARRAY',
      items: convertSchemaProperty(property.items) || { type: 'STRING' },
    };
  } else {
    return {
      ...baseSchema,
      type: propertyType.toUpperCase(),
    };
  }
}

function toGemini35ToolDeclaration(tool: any) {
  return {
    name: tool.name.replace(/\//g, '__'),
    description: tool.description || '',
    parameters: convertSchemaProperty(tool.inputSchema),
  };
}

function toInlineData(part: any) {
  const dataUrl: string = part.media.url;
  const b64Data = dataUrl.substring(dataUrl.indexOf(',') + 1);
  const contentType =
    part.media.contentType ||
    dataUrl.substring(dataUrl.indexOf(':') + 1, dataUrl.indexOf(';'));
  return { inlineData: { mimeType: contentType, data: b64Data } };
}

function toFileData(part: any) {
  return {
    fileData: {
      mimeType: part.media.contentType || 'application/octet-stream',
      fileUri: part.media.url,
    },
  };
}

function toGemini35Part(part: any): any {
  if (part.text !== undefined) {
    const out: Record<string, any> = { text: part.text || ' ' };
    if (part.metadata?.thoughtSignature) {
      out.thoughtSignature = part.metadata.thoughtSignature;
    }
    return out;
  }
  if (part.media) {
    if (part.media.url.startsWith('data:')) return toInlineData(part);
    return toFileData(part);
  }
  if (part.toolRequest) {
    const fc: Record<string, any> = {
      name: part.toolRequest.name,
      args: part.toolRequest.input || {},
    };
    const callId = part.metadata?.callId || part.toolRequest.ref;
    if (callId && String(callId).startsWith('call_')) {
      fc.id = String(callId);
    }
    const out: Record<string, any> = { functionCall: fc };
    if (part.metadata?.thoughtSignature) {
      out.thoughtSignature = part.metadata.thoughtSignature;
    }
    return out;
  }
  if (part.toolResponse) {
    const rawOutput = part.toolResponse.output;
    const responsePayload =
      rawOutput !== null && typeof rawOutput === 'object' && !Array.isArray(rawOutput)
        ? rawOutput
        : { name: part.toolResponse.name, content: rawOutput };
    const fr: Record<string, any> = {
      name: part.toolResponse.name,
      response: responsePayload,
    };
    const callId = part.metadata?.callId || part.toolResponse.ref;
    if (callId) {
      fr.id = String(callId);
    }
    return { functionResponse: fr };
  }
  if (typeof part.reasoning === 'string') {
    const out: Record<string, any> = { thought: true };
    if (part.metadata?.thoughtSignature) {
      out.thoughtSignature = part.metadata.thoughtSignature;
    }
    if (part.reasoning.length > 0) {
      out.text = part.reasoning;
    }
    return out;
  }
  return { text: ' ' };
}

function fromGemini35Part(part: any, index: number): any {
  const thoughtSignature = part.thoughtSignature;
  const baseMetadata = thoughtSignature ? { thoughtSignature } : undefined;

  if ('thought' in part && part.thought) {
    return {
      reasoning: part.text || '',
      ...(baseMetadata ? { metadata: baseMetadata } : {}),
    };
  }
  if (part.functionCall) {
    const callId = part.functionCall.id || index.toString();
    return {
      toolRequest: {
        name: part.functionCall.name,
        input: part.functionCall.args || {},
        ref: callId,
      },
      metadata: {
        ...(baseMetadata || {}),
        callId,
      },
    };
  }
  if (part.functionResponse) {
    return {
      toolResponse: {
        name: part.functionResponse.name.replace(/__/g, '/'),
        output: part.functionResponse.response,
        ...(part.functionResponse.id ? { ref: part.functionResponse.id } : {}),
      },
    };
  }
  if (part.inlineData) {
    const { mimeType, data } = part.inlineData;
    return {
      media: {
        url: `data:${mimeType};base64,${data}`,
        contentType: mimeType,
      },
      ...(baseMetadata ? { metadata: baseMetadata } : {}),
    };
  }
  if (typeof part.text === 'string') {
    return {
      text: part.text,
      ...(baseMetadata ? { metadata: baseMetadata } : {}),
    };
  }
  return { text: '' };
}

function fromGeminiFinishReason(reason?: string): 'stop' | 'length' | 'blocked' | 'unknown' {
  if (!reason) return 'unknown';
  switch (reason) {
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case 'SAFETY':
    case 'RECITATION':
      return 'blocked';
    default:
      return 'unknown';
  }
}

export const ai = genkit({
  plugins: [googleAI()],
  model: GEMINI_35_FLASH_LITE_FULL,
});

/**
 * Adaptador nativo de Gemini 3.5 Flash-Lite para Genkit:
 * Cumple con todas las reglas estrictas de validación de Gemini 3.5 Flash-Lite:
 * 1. Preserva `thoughtSignature` en todos los turnos del modelo (`functionCall` y `text`).
 * 2. Incluye `id` (`call_id`) y `name` en cada `functionResponse` usando el rol válido `user`.
 * 3. Configura `thinkingLevel: 'MEDIUM'` automáticamente cuando hay herramientas (`tools`) y `'MINIMAL'` para transcripción/texto directo.
 * 4. Ignora y elimina parámetros de muestreo obsoletos (`temperature`, `topP`, `topK`, `candidateCount`).
 */
ai.defineModel(
  {
    name: GEMINI_35_FLASH_LITE_FULL,
    label: 'Google AI - Gemini 3.5 Flash-Lite',
    configSchema: z
      .object({
        apiKey: z.string().optional(),
        thinkingLevel: z.enum(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH']).optional(),
        maxOutputTokens: z.number().optional(),
        stopSequences: z.array(z.string()).optional(),
      })
      .passthrough(),
    supports: {
      multiturn: true,
      media: true,
      tools: true,
      toolChoice: true,
      systemRole: true,
      output: ['text', 'json'],
    },
    use: [
      downloadRequestMedia({
        maxBytes: 1024 * 1024 * 10,
        filter: (part) => {
          try {
            const url = new URL(part.media.url);
            if (
              [
                'generativelanguage.googleapis.com',
                'www.youtube.com',
                'youtube.com',
                'youtu.be',
              ].includes(url.hostname)
            ) {
              return false;
            }
          } catch {
            // data: URI or relative URL
          }
          return true;
        },
      }),
    ],
  },
  async (request) => {
    const reqConfig = (request.config || {}) as Record<string, any>;
    const apiKey = getGeminiApiKey(reqConfig.apiKey);

    const messages = [...request.messages];
    if (messages.length === 0) {
      throw new Error('No messages provided to Gemini 3.5 Flash-Lite.');
    }

    let systemInstruction: { parts: any[] } | undefined;
    const systemMsgIndex = messages.findIndex((m) => m.role === 'system');
    if (systemMsgIndex !== -1) {
      const [sysMsg] = messages.splice(systemMsgIndex, 1);
      systemInstruction = {
        parts: sysMsg.content.map(toGemini35Part),
      };
    }

    const toolsPayload: any[] = [];
    if (request.tools?.length) {
      toolsPayload.push({
        functionDeclarations: request.tools.map(toGemini35ToolDeclaration),
      });
    }

    // En Gemini 3.5 Flash-Lite el rol 'function' no está permitido; las respuestas de herramientas van con rol 'user'
    const contents = messages.map((msg) => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: msg.content.map(toGemini35Part),
    }));

    const hasTools = Boolean(request.tools && request.tools.length > 0);
    const rawThinkingLevel =
      reqConfig.thinkingLevel ||
      reqConfig.thinking_level ||
      (hasTools ? 'MEDIUM' : 'MINIMAL');
    const normalizedThinkingLevel = String(rawThinkingLevel).toUpperCase();

    const jsonMode =
      request.output?.format === 'json' ||
      (request.output?.contentType === 'application/json' && toolsPayload.length === 0);

    const generationConfig: Record<string, any> = {
      thinkingConfig: {
        thinkingLevel: normalizedThinkingLevel,
      },
    };
    if (reqConfig.maxOutputTokens) {
      generationConfig.maxOutputTokens = reqConfig.maxOutputTokens;
    }
    if (reqConfig.stopSequences) {
      generationConfig.stopSequences = reqConfig.stopSequences;
    }
    if (jsonMode) {
      generationConfig.responseMimeType = 'application/json';
    }

    const bodyPayload: Record<string, any> = {
      contents,
      generationConfig,
    };
    if (systemInstruction) {
      bodyPayload.systemInstruction = systemInstruction;
    }
    if (toolsPayload.length > 0) {
      bodyPayload.tools = toolsPayload;
    }
    if (reqConfig.safetySettings) {
      bodyPayload.safetySettings = reqConfig.safetySettings;
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_35_FLASH_LITE_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `[Gemini 3.5 Flash-Lite Error ${res.status}]: ${errText}`
      );
    }

    const responseJson = await res.json();
    const rawCandidates: any[] = responseJson.candidates || [];
    if (rawCandidates.length === 0) {
      throw new Error('Gemini 3.5 Flash-Lite no devolvió candidatos válidos.');
    }

    const candidateData = rawCandidates.map((cand, idx) => {
      const parts: any[] = cand.content?.parts || [];
      return {
        index: cand.index ?? idx,
        message: {
          role: 'model' as const,
          content: parts.map((p, pIdx) => fromGemini35Part(p, pIdx)),
        },
        finishReason: fromGeminiFinishReason(cand.finishReason),
        finishMessage: cand.finishMessage,
        custom: {
          safetyRatings: cand.safetyRatings,
          citationMetadata: cand.citationMetadata,
        },
      };
    });

    return {
      candidates: candidateData,
      custom: responseJson,
      usage: {
        ...getBasicUsageStats(request.messages, candidateData),
        inputTokens: responseJson.usageMetadata?.promptTokenCount,
        outputTokens: responseJson.usageMetadata?.candidatesTokenCount,
        totalTokens: responseJson.usageMetadata?.totalTokenCount,
        thoughtsTokens: responseJson.usageMetadata?.thoughtsTokenCount,
        cachedContentTokens: responseJson.usageMetadata?.cachedContentTokenCount,
      },
    };
  }
);
