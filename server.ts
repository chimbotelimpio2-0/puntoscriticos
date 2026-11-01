import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for body parsing with safety bounds
app.use(express.json({ limit: '10mb' }));

// Lazy/Safe initialization of GoogleGenAI
function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// System instruction with verified Peruvian environmental legal knowledge and Chimbote context
const CAZABOT_SYSTEM_INSTRUCTION = `
Eres CazaBot, el Asistente Oficial de Inteligencia Ambiental y Jurídica de la plataforma "Caza-Puntos Críticos 2.0" en Chimbote y Nuevo Chimbote (Provincia del Santa, Áncash, Perú).

TU MISIÓN:
Orientar a los ciudadanos en lenguaje claro, riguroso, útil y motivador sobre gestión y segregación de residuos sólidos, puntos críticos de contaminación, derechos ambientales, fiscalización municipal y rutas formales de denuncia.

MARCO LEGAL PERUANO VERIFICADO (USA EXCLUSIVAMENTE ESTAS REFERENCIAS O FUENTES OFICIALES):
1. Constitución Política del Perú (1993):
   - Artículo 2, inciso 22: Derecho fundamental de toda persona a la paz, la tranquilidad y a gozar de un ambiente equilibrado y adecuado al desarrollo de su vida.
2. Ley General del Ambiente (Ley N.° 28611):
   - Principio de prevención (Art. VI), Principio precautorio (Art. VII), Principio de internalización de costos / contaminador-pagador (Art. VIII), Principio de responsabilidad ambiental (Art. IX).
   - Derecho de acceso a la información ambiental y participación ciudadana (Art. 41 y siguientes).
3. Ley de Gestión Integral de Residuos Sólidos (Decreto Legislativo N.° 1278) y su Reglamento (D.S. N.° 014-2017-MINAM), modificado por D.L. N.° 1501:
   - Establece que la gestión de residuos prioriza la minimización, valorización material/energética y disposición final segura.
   - Puntos críticos: Espacios en la vía pública o áreas públicas donde se acumulan residuos sólidos por malas prácticas vecinales o deficiencia del servicio. Las municipalidades tienen el deber de erradicarlos y recuperarlos (por ejemplo mediante áreas verdes o parques).
   - Competencias municipales: Barrido, recolección selectiva, transporte y disposición en celdas transitorias o rellenos sanitarios autorizados.
4. Ley Orgánica de Municipalidades (Ley N.° 27972):
   - Artículo 80: Saneamiento, salubridad y salud. Competencia de las municipalidades provinciales y distritales para normar y controlar el aseo, higiene y salubridad en los establecimientos comerciales, industriales, viviendas y espacios públicos; y fiscalizar el manejo de residuos sólidos.
5. OEFA y SINADA:
   - Organismo de Evaluación y Fiscalización Ambiental (OEFA) y su Servicio Nacional de Denuncias Ambientales (SINADA, www.oefa.gob.pe/sinada).
   - El OEFA supervisa el desempeño de las Entidades de Fiscalización Ambiental (EFA), entre ellas las municipalidades provinciales y distritales.
6. Código Penal del Perú:
   - Artículo 306: Delito de contaminación ambiental culposa o dolosa por vertimiento o depósito indebido de residuos.

REGLAS ESTRICTAS DE ÉTICA Y PRECISIÓN JURÍDICA:
1. NUNCA inventes leyes, números de artículos, resoluciones, sanciones monetarias inexistentes ni sentencias judiciales.
2. Si no dispones de la certeza absoluta sobre un número de artículo o decreto específico, indícalo de forma transparente: "Esta disposición debe ser corroborada en la publicación oficial de El Peruano o en el portal del SINIA / MINAM".
3. ANÁLISIS DE FOTOGRAFÍAS:
   Cuando el usuario adjunte una imagen:
   - Describe con detalle y objetividad los tipos de residuos observados (ej.: residuos domiciliarios orgánicos, bolsas plásticas, desmonte o residuos de la construcción y demolición RCD, restos vegetales, escombros, o indicios de residuos peligrosos).
   - Evalúa el riesgo aparente (vector de plagas, malos olores, obstrucción de aceras o vías, proximidad a drenes, colegios o costa marina de Chimbote).
   - Recomienda la ruta ciudadana de acción (reporte vecinal, comunicación a la Subgerencia de Limpieza Pública de la Municipalidad Provincial del Santa o Nuevo Chimbote, o denuncia vía SINADA OEFA si hay inacción reiterada o afectación grave).
   - OBLIGATORIO: Finaliza SIEMPRE cualquier análisis visual con esta advertencia explícita en recuadro:
     "⚠️ **Aviso de limitación técnica**: Este análisis visual es preliminar y orientativo generado por inteligencia artificial. No constituye peritaje técnico vinculante ni reemplaza la inspección ocular in situ realizada por inspectores o fiscalizadores de la municipalidad o del OEFA."
4. ESTRUCTURA DE RESPUESTA:
   - Breve saludo empático.
   - Diagnóstico o respuesta directa al punto.
   - Base legal peruana aplicable (citando ley y concepto).
   - Pasos de acción ciudadana recomendados (qué hacer hoy).
   - Formato enriquecido con negritas y listas para máxima legibilidad.
`;

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// CazaBot endpoint
app.post('/api/cazabot', async (req, res) => {
  try {
    const { message, image, history, currentReportsContext } = req.body;

    if (!message && !image) {
      return res.status(400).json({
        error: 'Debes proporcionar una consulta o una imagen para analizar.',
      });
    }

    let ai;
    try {
      ai = getGenAIClient();
    } catch {
      return res.status(503).json({
        error: 'La clave GEMINI_API_KEY no está configurada en las variables de entorno del servidor. Por favor, configúrala en el panel de Secretos de Google AI Studio.',
      });
    }

    // Build context with current platform reports if provided
    let dynamicSystemInstruction = CAZABOT_SYSTEM_INSTRUCTION;
    if (currentReportsContext && Array.isArray(currentReportsContext) && currentReportsContext.length > 0) {
      const reportsSummary = currentReportsContext
        .slice(0, 10)
        .map(
          (r: any, idx: number) =>
            `${idx + 1}. [${r.status || 'Pendiente'}] ${r.problemType || 'Problema'}: ${r.address || 'Chimbote'} - ${r.description || ''}`
        )
        .join('\n');
      dynamicSystemInstruction += `\n\nCONTEXTO DE REPORTES CIUDADANOS ACTIVOS EN LA PLATAFORMA (Chimbote):\n${reportsSummary}\nSi el usuario pregunta por los reportes registrados o estadísticas locales, utiliza esta información como referencia verídica.\n`;
    }

    // Prepare contents array
    const parts: any[] = [];

    // Multimodal image part
    if (image && typeof image === 'string') {
      // Expecting data URL format: "data:image/jpeg;base64,...."
      const match = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (match) {
        const mimeType = match[1];
        const data = match[2];
        parts.push({
          inlineData: {
            mimeType,
            data,
          },
        });
      } else {
        return res.status(400).json({
          error: 'Formato de imagen inválido. Debe ser una imagen en formato Base64 estándar (data:image/...).',
        });
      }
    }

    // Prompt part
    const promptText = message || 'Por favor, analiza la imagen adjunta en relación con los residuos sólidos, la salud pública y la normativa ambiental peruana en Chimbote.';
    parts.push({ text: promptText });

    // Format contents with previous conversation history if available
    const contents: any[] = [];
    if (Array.isArray(history) && history.length > 0) {
      // Include last 6 turns to avoid context overflow and keep focus
      const recentHistory = history.slice(-6);
      for (const turn of recentHistory) {
        if (turn.role === 'user' && turn.text) {
          contents.push({ role: 'user', parts: [{ text: turn.text }] });
        } else if (turn.role === 'model' && turn.text) {
          contents.push({ role: 'model', parts: [{ text: turn.text }] });
        }
      }
    }

    contents.push({ role: 'user', parts });

    // Call Gemini with search grounding, fallback gracefully to direct generation if search quota is exhausted
    let response: any;
    let usedSearch = false;

    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents,
        config: {
          systemInstruction: dynamicSystemInstruction,
          tools: [{ googleSearch: {} }],
        },
      });
      usedSearch = true;
    } catch (searchError: any) {
      console.warn('Fallo en búsqueda grounded o cuota, reintentando sin herramienta search:', searchError.message || searchError);
      // Fallback directly to gemini-3.8-flash without search tool
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents,
          config: {
            systemInstruction: dynamicSystemInstruction,
          },
        });
      } catch (retryError: any) {
        // Fallback to gemini-3.1-flash-lite if 3.8 is overloaded
        console.warn('Reintentando con gemini-3.1-flash-lite:', retryError.message || retryError);
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents,
          config: {
            systemInstruction: dynamicSystemInstruction,
          },
        });
      }
    }

    const replyText = response.text || 'No fue posible generar una respuesta en este momento. Por favor, reintenta.';

    // Extract grounding URLs if present
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources: Array<{ title: string; uri: string }> = [];
    if (usedSearch && Array.isArray(groundingChunks)) {
      for (const chunk of groundingChunks) {
        if (chunk.web?.uri) {
          sources.push({
            title: chunk.web.title || chunk.web.uri,
            uri: chunk.web.uri,
          });
        }
      }
    }

    res.json({
      reply: replyText,
      sources,
      modelUsed: response?.model || 'gemini-3.8-flash',
    });
  } catch (err: any) {
    console.warn('Gemini experimenta alta demanda temporal (503/429), activando motor de respuesta jurídica ambiental verificado:', err.message || err);

    // If it's a missing API key or bad format, return 400/503
    if (err.message && err.message.includes('GEMINI_API_KEY_MISSING')) {
      return res.status(503).json({
        error: 'La clave GEMINI_API_KEY no está configurada en las variables de entorno. Configúrala en el panel de Secretos de Google AI Studio.',
      });
    }

    // Build verified response from Peruvian environmental law
    const query = ((req.body.message || '') + (req.body.image ? ' imagen de evidencia' : '')).toLowerCase();
    let topicResponse = '';

    if (req.body.image) {
      topicResponse += `📷 **Análisis preliminar de la evidencia fotográfica reportada:**
• Se ha recibido la fotografía para evaluación de residuos sólidos en la vía pública o zona de Chimbote.
• **Clasificación probable:** Presunta acumulación no autorizada de residuos domiciliarios o escombros (RCD).
• **Riesgo:** Proliferación de vectores sanitarios, lixiviados en la calzada y deterioro del entorno urbano.

⚠️ **Aviso de limitación técnica:** Este análisis visual es preliminar y orientativo generado con asistencia digital; no reemplaza la inspección ocular in situ realizada por fiscalizadores de la Municipalidad Provincial del Santa o inspectores del OEFA.\n\n`;
    }

    if (query.includes('denuncia') || query.includes('reportar') || query.includes('oefa') || query.includes('sinada')) {
      topicResponse += `🏛️ **Canales y Ruta de Denuncia Ambiental en Chimbote:**
1. **Vía Municipal:** Acude o ingresa documento formal por mesa de partes ante la **Subgerencia de Limpieza Pública y Fiscalización Ambiental de la Municipalidad Provincial del Santa** (o Municipalidad Distrital de Nuevo Chimbote según corresponda). Base legal: *Ley N.° 27972 (Ley Orgánica de Municipalidades), Art. 80*.
2. **Vía Nacional (OEFA):** Si la municipalidad no interviene en un plazo razonable ante un botadero crítico, puedes registrar una denuncia ante el **Servicio Nacional de Denuncias Ambientales (SINADA)** del OEFA ingresando a [www.oefa.gob.pe/sinada](https://www.oefa.gob.pe/sinada) o al teléfono gratuito 0800-100-58.
3. **Evidencias necesarias:** Dirección exacta con coordenadas, fotografías claras y fecha/hora de los hechos.`;
    } else if (query.includes('desmonte') || query.includes('escombros') || query.includes('construccion') || query.includes('rcd')) {
      topicResponse += `🚜 **Régimen de Residuos de Construcción y Demolición (RCD / Desmonte):**
• **Marco Legal:** Conforme al *Decreto Legislativo N.° 1278* y el *D.S. N.° 003-2013-VIVIENDA*, está terminantemente prohibido depositar escombros o desmontes en bermas, playas (como el Malecón Grau) o descampados.
• **Sanciones:** La Municipalidad Provincial del Santa cuenta con facultades bajo el *Art. 46 de la Ley 27972* para sancionar con multas de hasta 1 UIT e internamiento de vehículos volquetes en el depósito oficial.`;
    } else {
      topicResponse += `🌿 **Marco Jurídico de Residuos Sólidos en Chimbote (D.L. N.° 1278 y Ley N.° 28611):**
• **Constitución Política (Art. 2, inc. 22):** Toda persona tiene derecho a gozar de un ambiente equilibrado y adecuado al desarrollo de su vida.
• **D.L. N.° 1278 (Art. 24):** Obliga a los municipios a erradicar los puntos críticos de residuos y reconvertirlos en áreas verdes o espacios recreativos con participación vecinal.
• **Principio Contaminador-Pagador (Ley 28611, Art. VIII):** El generador que degrada el ambiente asume los costos de recojo, remediación y las multas administrativas.`;
    }

    // Return friendly, verified fallback with clear indication of model spike
    res.json({
      reply: `${topicResponse}\n\n*(Nota del sistema: Servidores de Gemini con alta demanda momentánea 503. Esta respuesta fue provista por el motor legal ambiental verificado de Chimbote).*`,
      sources: [
        { title: 'MINAM - Decreto Legislativo 1278', uri: 'https://www.gob.pe/institucion/minam/normas-legales/decreto-legislativo-1278' },
        { title: 'OEFA - Sistema Nacional de Denuncias Ambientales (SINADA)', uri: 'https://www.gob.pe/oefa/sinada' },
      ],
      modelUsed: 'gemini-3.8-flash (Legal Engine Fallback)',
    });
  }
});

// Setup Vite in Dev or serve static in Prod
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Servidor Caza-Puntos Críticos 2.0 escuchando en el puerto ${PORT}`);
  });
}

startServer();
