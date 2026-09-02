/* Puerta de entrada compartida para las funciones de IA (parse-deals, map-columns):
   1) Exige un usuario de Firebase con sesión iniciada (via el token que manda el
      frontend en el header Authorization).
   2) Aplica un límite diario de usos por usuario, para que una sola cuenta (comprometida
      o con un script) no pueda agotar el crédito de la API de Anthropic.

   Devuelve el uid si todo está bien: la función que llama debe seguir su lógica normal.
   Si devuelve null, ya mandó la respuesta de error (401/429) y la función debe hacer
   "return" de inmediato sin hacer nada más. */
const admin = require('./firebaseAdmin');

const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT_PER_USER || 60);

async function requireAuthAndRateLimit(req, res) {
  const authHeader = req.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(authHeader);
  if (!match) {
    res.status(401).json({ error: 'Necesitas iniciar sesión en Creately para usar esta función.' });
    return null;
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(match[1]);
  } catch (err) {
    res.status(401).json({ error: 'Tu sesión no es válida o expiró. Vuelve a iniciar sesión e intenta de nuevo.' });
    return null;
  }
  const uid = decoded.uid;

  try {
    const db = admin.firestore();
    const ref = db.collection('apiUsage').doc(uid);
    const today = new Date().toISOString().slice(0, 10);
    const countToday = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      let count = data.date === today ? (data.count || 0) : 0;
      count += 1;
      tx.set(ref, { date: today, count }, { merge: true });
      return count;
    });
    if (countToday > DAILY_LIMIT) {
      res.status(429).json({ error: 'Alcanzaste el límite de usos de IA por hoy. Puedes intentar de nuevo mañana, o mientras tanto agregar tus deals manualmente.' });
      return null;
    }
  } catch (err) {
    // Si falla el chequeo de límite (p. ej. un problema temporal de Firestore), no
    // bloqueamos al usuario por un error de infraestructura — solo lo registramos.
    console.error('Error al revisar el límite de uso de IA:', err);
  }

  return uid;
}

module.exports = { requireAuthAndRateLimit };
