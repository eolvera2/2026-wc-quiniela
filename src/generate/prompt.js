/**
 * Prompt assembly for the WC26 article generation engine.
 *
 * Reference: docs/plan.md "Phase 3 — Generation Engine" + "AI & Agentic Discoverability"
 * + "Legal & Compliance (Entertainment Positioning)"
 *
 * Key requirements:
 * - Seasoned TUDN/TV Azteca analyst voice, Mexican Spanish vernacular
 * - Answer-first content structure (GEO/AEO optimization)
 * - Question-phrased H2s
 * - "Puntos Clave" TL;DR block
 * - JSON output schema (h1_title, meta_description, analisis_tactico_html, pronostico_quiniela, url_slug)
 * - Banned-language enforcement
 * - Per-article_type task variants
 */

/**
 * Disclaimer footer injected into every published page by wordpress.js.
 * Reference: docs/plan.md "Legal & Compliance" section.
 */
export const DISCLAIMER_FOOTER = `
<div class="disclaimer-footer" style="margin-top:2em;padding:1em;border-top:1px solid #ccc;font-size:0.85em;color:#666;">
  <p><strong>Aviso legal:</strong> Este sitio es de entretenimiento e información únicamente. No somos operadores de juego. Las apuestas conllevan riesgos; apuesta solo lo que puedas permitirte perder. Ninguna predicción está garantizada. Debes tener 18+ años (21+ en algunos estados de EE.UU.) para participar en apuestas donde sea legal.</p>
  <p><strong>Disclaimer:</strong> This site is for entertainment and informational purposes only. We are not a gambling operator. Gambling involves risk; only bet what you can afford to lose. No prediction is guaranteed. You must be 18+ (21+ in some US states) where gambling is legal.</p>
  <p><strong>Juego responsable:</strong> Si necesitas ayuda, contacta: <a href="tel:18006973735">1-800-MY-RESET (1-800-697-3735)</a> (EE.UU., bilingüe 24/7) | <a href="https://cij.org.mx" rel="noopener">cij.org.mx</a> (México, CONADIC/CIJ)</p>
  <p><strong>Divulgación de afiliados:</strong> Recibimos una comisión si haces clic en ciertos enlaces y te registras, sin costo adicional para ti. Todos los enlaces de afiliados están marcados con rel="sponsored".</p>
</div>
`.trim();

const BANNED_LANGUAGE = [
  'ganador garantizado', '100% seguro', 'gana dinero fácil',
  'pronóstico infalible', 'guaranteed winner', 'sure thing',
  'make money fast', 'ganancia garantizada',
];

const COMMON_SYSTEM_PREAMBLE = `Eres un analista deportivo experimentado con el tono y estilo de los comentaristas de TUDN y TV Azteca. Escribes en español mexicano informal (tuteo), usando terminología futbolística mexicana: "momios" (nunca "cuotas"), "el Tri", "la afición", "el quinto partido", "el área chica", "contención", "cancha", "portero", "medio de contención".

REGLAS DE CONTENIDO:
- Las primeras 1-2 oraciones después de cada H2 DEBEN responder directamente la pregunta del encabezado (estructura "answer-first" para optimización GEO/AEO).
- Incluye un bloque "Puntos Clave" (TL;DR) cerca del inicio con 4-5 datos clave (predicción, resumen de momios, enfrentamiento clave, nota de lesión).
- Usa H2s formulados como pregunta en español (ej: "¿Cuáles son los momios de México vs Alemania?").
- Incluye una tabla comparativa por partido (récord W/L, promedio de goles, estado de jugador clave, H2H reciente).
- NUNCA uses estas frases (contenido prohibido): ${BANNED_LANGUAGE.map(b => `"${b}"`).join(', ')}.
- En vez, usa: "para fines de entretenimiento; los resultados pasados no garantizan resultados futuros."
- Solo referencia jugadores, momios y estadísticas presentes en los datos proporcionados — NO inventes datos.

FORMATO DE SALIDA — responde ÚNICAMENTE con JSON válido:
{
  "h1_title": "string — título H1 optimizado para SEO",
  "meta_description": "string — 150-160 chars, incluye equipo + tipo de contenido",
  "puntos_clave": ["string", "string", "string", "string"],
  "analisis_tactico_html": "string — artículo completo en HTML (mínimo 600 palabras)",
  "pronostico_quiniela": "string — predicción concisa (ej: 'México 2-1')",
  "url_slug": "string — slug SEO-friendly sin acentos"
}`;

const ARTICLE_TYPE_INSTRUCTIONS = {
  pronostico_momios: `
TAREA ESPECÍFICA: Escribe un artículo de pronóstico y momios para el partido.
- Analiza los momios proporcionados y explica el valor de cada línea.
- Incluye análisis táctico de cómo se enfrentarán ambos equipos.
- Da un pronóstico claro con marcador y explicación.
- Menciona momios específicos con el formato "Momios: Local X.XX | Empate X.XX | Visitante X.XX".
- El H1 debe seguir el patrón: "Pronósticos y momios [Equipo A] vs [Equipo B]"`,

  alineacion_probable: `
TAREA ESPECÍFICA: Escribe un artículo de alineación probable para el partido.
- Predice el XI titular de cada equipo basándote en las lesiones y forma proporcionada.
- Explica por qué ciertos jugadores serían titulares o suplentes.
- Incluye análisis de cómo la alineación probable impacta la táctica.
- El H1 debe seguir el patrón: "Alineación probable [Equipo A] vs [Equipo B]"`,

  quiniela_verdict: `
TAREA ESPECÍFICA: Escribe un veredicto de quiniela (¿quién gana?) para el partido.
- Da un veredicto claro: Compra / Espera / Evita para cada equipo en la quiniela.
- Respalda el veredicto con datos concretos del H2H y forma.
- Enfocado en quiniela casual (no apuestas deportivas directas).
- El H1 debe seguir el patrón: "¿Quién gana la quiniela: [A] o [B]?"`,

  analisis_apostar: `
TAREA ESPECÍFICA: Escribe un análisis de apuestas (over/under, tarjetas, props) para el partido.
- Analiza líneas de over/under, props de jugadores, mercados de tarjetas.
- Explica qué apuestas tienen valor basándote en los datos.
- Incluye análisis de tendencias (ej: "México ha tenido over 2.5 en 4 de 5 partidos").
- El H1 debe seguir el patrón: "Análisis para apostar en [Team]"`,
};

/**
 * Builds the system prompt for a given article type.
 * @param {'pronostico_momios'|'alineacion_probable'|'quiniela_verdict'|'analisis_apostar'} articleType
 * @returns {string}
 */
export function buildSystemPrompt(articleType) {
  const typeInstruction = ARTICLE_TYPE_INSTRUCTIONS[articleType] || ARTICLE_TYPE_INSTRUCTIONS.pronostico_momios;
  return `${COMMON_SYSTEM_PREAMBLE}\n${typeInstruction}`;
}

/**
 * Builds the user prompt with match data injected.
 * @param {{ teamA: string, teamB: string, h2h: string, form: string, injuries: string, odds: object, kickoffUtc: string }} data
 * @returns {string}
 */
export function buildUserPrompt(data) {
  const { teamA, teamB, h2h, form, injuries, odds, kickoffUtc } = data;
  const fmtOdd = (v) => (typeof v === 'number' ? v.toFixed(2) : (v || 'N/A'));
  return `DATOS DEL PARTIDO:
- Equipos: ${teamA} vs ${teamB}
- Fecha (UTC): ${kickoffUtc}
- Head-to-Head: ${h2h}
- Forma reciente: ${form}
- Lesiones/Bajas: ${injuries || 'Ninguna reportada'}
- Momios: Local ${fmtOdd(odds?.home)} | Empate ${fmtOdd(odds?.draw)} | Visitante ${fmtOdd(odds?.away)}

Genera el artículo siguiendo las instrucciones del sistema. Responde SOLO con el JSON.`;
}
