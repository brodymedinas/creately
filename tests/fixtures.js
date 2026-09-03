/* Preparación común de todas las pruebas.

   Hace dos cosas antes de que la página cargue:
   1) Intercepta las descargas de Firebase (www.gstatic.com) y en su lugar entrega
      nuestros dobles de prueba de tests/stubs/. Así las pruebas nunca tocan la base
      de datos real, corren sin internet y son instantáneas.
   2) Intercepta las llamadas a /api/ (las funciones de IA) para que tampoco gasten
      crédito de verdad; cada prueba puede definir qué debe responder.

   Se usa igual que Playwright normal, pero importando desde aquí:
       const { test, expect } = require('./fixtures');
*/
const base = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const STUB_DIR = path.join(__dirname, 'stubs');

const test = base.test.extend({
  page: async ({ page }, use) => {
    await page.route('https://www.gstatic.com/firebasejs/**', (route) => {
      const name = path.basename(new URL(route.request().url()).pathname);
      const file = path.join(STUB_DIR, name);
      if (!fs.existsSync(file)) {
        /* Si la app empieza a importar un módulo de Firebase que todavía no tiene doble,
           es mejor fallar ruidosamente aquí que dar un error confuso dentro del navegador. */
        return route.fulfill({
          status: 500,
          contentType: 'text/javascript',
          body: `throw new Error("Falta un doble de prueba para ${name}: créalo en tests/stubs/");`,
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        body: fs.readFileSync(file, 'utf8'),
      });
    });

    /* Por defecto, cualquier llamada a las funciones de IA falla de forma controlada.
       Una prueba que quiera probar el importador debe definir su propia respuesta con
       page.route('**\/api/parse-deals', ...) ANTES de navegar. */
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'IA desactivada en pruebas' }) })
    );

    /* Fallar la prueba si la app lanza un error de JavaScript que nadie atrapó:
       es la clase de bug que hoy solo descubriríamos porque un usuario se queja. */
    const crashes = [];
    page.on('pageerror', (err) => crashes.push(err.message));

    await use(page);

    if (crashes.length) {
      throw new Error('La app lanzó errores de JavaScript no atrapados:\n- ' + crashes.join('\n- '));
    }
  },
});

/* Abre la app ya con sesión iniciada y espera a que termine de cargar los datos. */
async function abrirApp(page, opciones = {}) {
  if (opciones.sinSesion) {
    await page.addInitScript(() => { window.__TEST_START_SIGNED_OUT__ = true; });
  }
  await page.goto('/');
  if (opciones.sinSesion) {
    await base.expect(page.locator('#authGate')).toBeVisible();
  } else {
    await base.expect(page.locator('#app')).toBeVisible();
  }
}

module.exports = { test, expect: base.expect, abrirApp };
