/* Doble de prueba de App Check. En pruebas no hay reCAPTCHA ni bots que verificar. */
export function initializeAppCheck() { return {}; }
export class ReCaptchaV3Provider {
  constructor(siteKey) { this.siteKey = siteKey; }
}
