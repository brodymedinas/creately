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
  const headers = Array.isArray((body || {}).headers) ? body.headers.map((h) => String(h == null ? '' : h)) : [];
  const sampleRows = Array.isArray((body || {}).sampleRows) ? body.sampleRows.slice(0, 5) : [];

  if (!headers.length) {
    res.status(400).json({ error: 'No se recibieron columnas' });
    return;
  }
  if (headers.length > 60) {
    res.status(400).json({ error: 'Ese archivo tiene demasiadas columnas (maximo 60).' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'El servidor no tiene configurada la llave de la API de IA todavia. Contacta al administrador de la plataforma.' });
    return;
  }

  const previewLines = [headers.join(' | ')];
  sampleRows.forEach((row) => {
    previewLines.push((Array.isArray(row) ? row : []).map((c) => (c == null ? '' : String(c))).join(' | '));
  });
  const previewText = previewLines.join('\n');

  const systemPrompt = [
    'Eres un asistente que ayuda a mapear las columnas de una tabla (Excel/CSV) que un creador de contenido subio, hacia los campos de "deals" (colaboraciones pagadas con marcas) de la app Creately.',
    '',
    'Te doy los encabezados de columna y unas filas de muestra (separadas por " | "). Para CADA columna, en el mismo orden en que aparecen, decide a que corresponde usando la herramienta "mapear_columnas":',
    '- "marca": el nombre de la marca/empresa/cliente.',
    '- "monto": el pago en dinero (numero).',
    '- "moneda": codigo de moneda (MXN, USD, EUR).',
    '- "fecha": la fecha del deal.',
    '- "estadoPago": si ya se pago, esta pendiente, etc.',
    '- "plataformas": redes sociales involucradas (Instagram, TikTok, YouTube, etc).',
    '- "custom": cuando la columna tiene informacion util pero NO encaja en ninguno de los campos anteriores (por ejemplo: numero de contrato, talla de producto, contacto de la marca, tipo de contenido, etc). En este caso agrega tambien "customNombre" (un nombre corto en espanol para ese campo nuevo, basado en el encabezado original) y "customTipo" ("numero" si los valores de muestra son numericos, si no "texto").',
    '- "ignorar": columnas vacias, irrelevantes, o que sean solo un identificador interno sin valor para el creador.',
    '',
    'Regla importante: como mucho UNA columna debe mapearse a "marca" (es obligatoria), y como mucho una a "monto". Si varias columnas parecen nombres de marca, elige la mas clara y marca las demas como "custom" o "ignorar" segun aplique.',
    '',
    'Devuelve un arreglo "columnas" con exactamente un objeto por cada columna, en el mismo orden que te las di.',
  ].join('\n');

  const toolSchema = {
    name: 'mapear_columnas',
    description: 'Registra a que campo de Creately corresponde cada columna de la tabla subida',
    input_schema: {
      type: 'object',
      properties: {
        columnas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              target: { type: 'string', enum: ['marca', 'monto', 'moneda', 'fecha', 'estadoPago', 'plataformas', 'custom', 'ignorar'] },
              customNombre: { type: 'string' },
              customTipo: { type: 'string', enum: ['texto', 'numero'] },
            },
            required: ['target'],
          },
        },
      },
      required: ['columnas'],
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
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Encabezados y filas de muestra (separados por " | "):\n\n' + previewText.slice(0, 6000) }],
        tools: [toolSchema],
        tool_choice: { type: 'tool', name: 'mapear_columnas' },
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Anthropic API error:', apiRes.status, errText);
      res.status(502).json({ error: 'No se pudo analizar las columnas en este momento. Intenta de nuevo en unos segundos.' });
      return;
    }

    const data = await apiRes.json();
    const toolUse = (data.content || []).find((block) => block.type === 'tool_use');
    if (!toolUse || !toolUse.input || !Array.isArray(toolUse.input.columnas)) {
      res.status(502).json({ error: 'No se pudo interpretar la respuesta de la IA. Intenta de nuevo.' });
      return;
    }

    const columnas = headers.map((h, i) => {
      const c = toolUse.input.columnas[i] || { target: 'ignorar' };
      return {
        header: h,
        target: c.target || 'ignorar',
        customNombre: c.customNombre || h,
        customTipo: c.customTipo === 'numero' ? 'numero' : 'texto',
      };
    });

    res.status(200).json({ columnas });
  } catch (err) {
    console.error('map-columns error:', err);
    res.status(500).json({ error: 'Ocurrio un error inesperado al analizar las columnas.' });
  }
};
