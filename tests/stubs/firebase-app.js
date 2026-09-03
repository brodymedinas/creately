/* Doble de prueba de firebase-app. No se conecta a nada: solo devuelve un objeto
   que las demás piezas puedan recibir. Ver tests/README.md. */
export function initializeApp(config) {
  return { name: '[TEST]', options: config };
}
