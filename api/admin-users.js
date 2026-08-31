const crypto = require('crypto');

const FIREBASE_WEB_API_KEY = 'AIzaSyCXNroGX2qq3OjOXFZ1x3AVxlxb6maom3g';
const FIREBASE_PROJECT_ID = 'creately-965f0';

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getGoogleAccessToken(clientEmail, privateKey) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/datastore.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claims));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signatureB64url = signer
    .sign(privateKey)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const jwt = unsigned + '.' + signatureB64url;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error('No se pudo obtener un token de Google: ' + t);
  }
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

function fsValue(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsValue);
  if ('mapValue' in v) return fsFields(v.mapValue.fields || {});
  if ('nullValue' in v) return null;
  return null;
}
function fsFields(fields) {
  const out = {};
  Object.keys(fields || {}).forEach((k) => {
    out[k] = fsValue(fields[k]);
  });
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metodo no permitido' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const idToken = ((body && body.idToken) || '').toString();
  if (!idToken) {
    res.status(400).json({ error: 'Falta la sesion. Vuelve a iniciar sesion.' });
    return;
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  const adminUids = (process.env.ADMIN_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean);

  if (!clientEmail || !privateKeyRaw || !adminUids.length) {
    res.status(500).json({ error: 'El backoffice todavia no esta configurado en el servidor (faltan variables de entorno). Contacta al administrador de la plataforma.' });
    return;
  }
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

  try {
    // 1. Verificar el ID token del que llama y obtener su uid, usando la API publica de Firebase Auth.
    const lookupRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!lookupRes.ok) {
      res.status(401).json({ error: 'Tu sesion no es valida o expiro. Vuelve a iniciar sesion.' });
      return;
    }
    const lookupData = await lookupRes.json();
    const callerUid = lookupData.users && lookupData.users[0] && lookupData.users[0].localId;
    if (!callerUid || !adminUids.includes(callerUid)) {
      res.status(403).json({ error: 'Tu cuenta no tiene permiso para ver esta pagina.' });
      return;
    }

    // 2. Obtener un token de administrador (con la llave de servicio) y listar todos los documentos de usuarios.
    const accessToken = await getGoogleAccessToken(clientEmail, privateKey);
    let documents = [];
    let pageToken = '';
    do {
      const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/userdata?pageSize=300${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
      const listRes = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
      if (!listRes.ok) {
        const t = await listRes.text();
        throw new Error('Error listando usuarios en Firestore: ' + t);
      }
      const listData = await listRes.json();
      documents = documents.concat(listData.documents || []);
      pageToken = listData.nextPageToken || '';
    } while (pageToken);

    const users = documents.map((d) => {
      const uid = d.name.split('/').pop();
      const data = fsFields(d.fields || {});
      const perfil = (data.creatorProfiles && data.creatorProfiles[0]) || {};
      const agencia = (data.agencies && data.agencies[0]) || {};
      return {
        uid,
        nombre: perfil.nombre || agencia.nombre || '(sin nombre)',
        email: perfil.email || '',
        deals: Array.isArray(data.creatorDeals) ? data.creatorDeals.length : 0,
        marcas: Array.isArray(data.creatorBrands) ? data.creatorBrands.length : 0,
        propuestas: Array.isArray(data.creatorPropuestas) ? data.creatorPropuestas.length : 0,
        talento: Array.isArray(data.talent) ? data.talent.length : 0,
        creadoEn: d.createTime,
        actualizadoEn: d.updateTime,
      };
    }).sort((a, b) => String(b.creadoEn || '').localeCompare(String(a.creadoEn || '')));

    res.status(200).json({ users, total: users.length });
  } catch (err) {
    console.error('admin-users error:', err);
    res.status(500).json({ error: 'Ocurrio un error inesperado al cargar los datos de usuarios.' });
  }
};
