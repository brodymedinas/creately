/* Inicializa una sola vez el SDK de administrador de Firebase, compartido por todas las
   funciones serverless en /api. Usa una cuenta de servicio (no las llaves públicas del
   cliente) para poder verificar tokens de sesión y leer/escribir Firestore sin pasar por
   las reglas de seguridad del cliente.

   Requiere la variable de entorno FIREBASE_SERVICE_ACCOUNT_JSON en Vercel, con el
   contenido completo del archivo JSON de la cuenta de servicio (ver Project Settings >
   Service accounts > Generate new private key, en la consola de Firebase). */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.error('Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT_JSON en Vercel: las funciones de IA no podrán verificar sesiones.');
  } else {
    try {
      const serviceAccount = JSON.parse(raw);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } catch (err) {
      console.error('FIREBASE_SERVICE_ACCOUNT_JSON no es un JSON válido:', err.message);
    }
  }
}

module.exports = admin;
