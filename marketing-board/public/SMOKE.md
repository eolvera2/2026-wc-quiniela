# PredictaGol Agent Board smoke test

1. Serve `marketing-board/public` with any static server.
2. In DevTools, monkey-patch `fetch` before loading `board.js`:
   ```js
   window.fetch = async (url) => {
     if (String(url).includes('/api/board')) {
       return new Response(JSON.stringify({
         version: 1,
         cards: [
           {
             id: 'PG-101',
             stage: 'to_be_posted',
             title: 'México vs Alemania: pronóstico listo para publicar',
             pillar: 'pronostico_del_dia',
             owner: 'Cap',
             next_actor: 'Publisher',
             platforms: ['IG', 'TT'],
             created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
             updated_at: new Date(Date.now() - 3600000 * 6).toISOString(),
             payload_json: {
               caption: 'Predicción lista para redes.',
               hashtags: '#PredictaGol #WorldCup',
               assets: [{ platform: 'IG', path: '/mock-card.png' }]
             }
           }
         ]
       }), { status: 200, headers: { 'Content-Type': 'application/json' } });
     }
     if (String(url).includes('/api/auth')) return new Response('{}', { status: 200 });
     return new Response('', { status: 404 });
   };
   ```
3. Verify TO BE POSTED and POSTED expand by default, cards filter with `f`, capsules expand with Enter/Space, and the drawer opens/closes.
4. Change the mock to `return new Response('', { status: 503 })` for `/api/board`; verify the top error toast appears with retry.
