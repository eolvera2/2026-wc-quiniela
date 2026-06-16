export async function notifyToBePosted(card) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return false;

  try {
    const response = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: {
        Title: 'PredictaGol listo para publicar',
        Tags: 'soccer,rocket',
      },
      body: `${card.title} (${card.platforms.join(', ') || 'sin plataformas'})`,
    });
    return response.ok;
  } catch (error) {
    console.warn(`[board] ntfy ignored failure: ${error.message}`);
    return false;
  }
}
