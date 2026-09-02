const { requireAuthAndRateLimit } = require('./_lib/authGuard');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metodo no permitido' });
    return;
  }

  const uid = await requireAuthAndRateLimit(req, res);
  if (!uid) return;

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const text = ((body && body.text) || '').toString();

  if (!text.trim()) {
    res.status(400).json({ error: 'Texto vacio' });
    return;
  }
  if (text.length > 8000) {
    res.status(400).json({ error: 'El texto es demasiado largo (maximo 8000 caracteres). Divide tu importacion en partes mas chicas.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'El servidor no tiene configurada la llave de la API de IA todavia. Contacta al administrador de la plataforma.' });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  const systemPrompt = [
    'Eres un asistente que extrae informacion de "deals" (colaboraciones pagadas entre un creador de contenido y una marca) a partir de texto libre en espanol que el usuario pega tal cual lo tenia anotado (notas, WhatsApp, memoria, etc).',
    '',
    'Devuelve SIEMPRE tu respuesta usando la herramienta "extraer_deals", con un arreglo "deals". Reglas:',
    '- Un objeto por cada deal/colaboracion distinta que detectes en el texto. Si el texto es ambiguo y no puedes saber si son deals distintos o el mismo, prefiere separarlos.',
    '- "marca": el nombre de la marca o empresa. Si no puedes identificarla, usa "Marca sin identificar".',
    '- "monto": numero (sin simbolos de moneda ni separadores de miles). Si no se menciona monto, usa null.',
    '- "moneda": codigo de 3 letras (MXN, USD, EUR, etc). Si no se menciona, usa "MXN" como valor por defecto de Mexico.',
    '- "fecha": formato YYYY-MM-DD si el texto menciona una fecha (aunque sea aproximada; si solo dan mes/anio usa el dia 1 de ese mes). Si no hay ninguna fecha mencionada, usa null. Hoy es ' + today + '.',
    '- "estadoPago": una de "pagado", "parcial", "pendiente". Si no es claro, usa "pendiente".',
    '- "plataformas": arreglo de strings con las plataformas mencionadas (Instagram, TikTok, YouTube, etc), vacio si no se menciona ninguna.',
    '- "notas": cualquier detalle relevante que no encaje en los campos anteriores (texto corto), o "" si no hay nada que agregar.',
    '- "confianza": "alta" si estas seguro de marca y monto, "baja" si tuviste que adivinar datos importantes.',
    '',
    'No inventes marcas ni montos que no esten sugeridos por el texto. Si el usuario pega algo que claramente no son deals (saludos, instrucciones, etc), ignoralo y no generes un deal para eso.',
  ].join('\n');

  const toolSchema = {
    name: 'extraer_deals',
    description: 'Registra la lista de deals detectados en el texto pegado por el usuario',
    input_schema: {
      type: 'object',
      properties: {
        deals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              marca: { type: 'string' },
              monto: { type: ['number', 'null'] },
              moneda: { type: 'string' },
              fecha: { type: ['string', 'null'] },
              estadoPago: { type: 'string', enum: ['pagado', 'parcial', 'pendiente'] },
              plataformas: { type: 'array', items: { type: 'string' } },
              notas: { type: 'string' },
              confianza: { type: 'string', enum: ['alta', 'baja'] },
            },
            required: ['marca', 'monto', 'moneda', 'fecha', 'estadoPago', 'plataformas', 'notas', 'confianza'],
          },
        },
      },
      required: ['deals'],
    },
  };

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: text.slice(0, 8000) }],
        tools: [toolSchema],
        tool_choice: { type: 'tool', name: 'extraer_deals' },
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Anthropic API error:', apiRes.status, errText);
      res.status(502).json({ error: 'No se pudo procesar el texto en este momento. Intenta de nuevo en unos segundos.' });
      return;
    }

    const data = await apiRes.json();
    const toolUse = (data.content || []).find((block) => block.type === 'tool_use');
    if (!toolUse || !toolUse.input || !Array.isArray(toolUse.input.deals)) {
      res.status(502).json({ error: 'No se pudo interpretar la respuesta de la IA. Intenta de nuevo.' });
      return;
    }

    res.status(200).json({ deals: toolUse.input.deals });
  } catch (err) {
    console.error('parse-deals error:', err);
    res.status(500).json({ error: 'Ocurrio un error inesperado al procesar el texto.' });
  }
};
