import { publishCard } from './index.js';

process.env.ADAPTERS_DRY_RUN = process.env.ADAPTERS_DRY_RUN || 'true';

const payload = {
  caption: 'México llega encendido: nuestra predicción del día para la quiniela mundialista.',
  alt_text: 'Gráfico de PredictaGol con predicción mundialista para México.',
  hashtags: ['#PredictaGol', '#Mundial2026', '#ElTri'],
  assets: {
    '1080x1920': '.squad/agents/shuri/outputs/creative/2026-06-11/c_smoke/1080x1920.png',
    '1080x1350': '.squad/agents/shuri/outputs/creative/2026-06-11/c_smoke/1080x1350.png',
    '1080x1080': '.squad/agents/shuri/outputs/creative/2026-06-11/c_smoke/1080x1080.png',
  },
  video: {
    path: '.squad/agents/shuri/outputs/creative/2026-06-11/c_smoke/short.mp4',
    duration_seconds: 22,
  },
  shorts_title: 'Predicción México del día #Shorts',
};

const card = {
  id: 'c_smoke',
  title: 'Predicción México del día',
  pillar: 'pronostico_del_dia',
  platforms_json: JSON.stringify(['x', 'youtube', 'instagram', 'threads', 'tiktok']),
  payload_json: JSON.stringify(payload),
};

const result = await publishCard(card);
console.log(JSON.stringify(result, null, 2));
