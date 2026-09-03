/* Pruebas de humo: lo mínimo que NUNCA debe romperse.

   Si alguna de estas falla, la app está rota para todos los usuarios, no en un caso
   raro. Corren contra dobles de Firebase (ver tests/fixtures.js), así que no tocan
   datos reales ni gastan crédito de la API de IA. */
const { test, expect, abrirApp } = require('./fixtures');

/* Lee el documento del usuario tal como quedó en la "base de datos" de prueba. */
const leerDatos = (page) => page.evaluate(() => window.__TEST_STORE__.get('userdata/test-uid-001'));

/* Crea un deal desde la interfaz, como lo haría un usuario. */
async function crearDeal(page, marca) {
  await page.locator('.nav-item[data-tab="deals"]').click();
  await page.locator('#btnDealsNewCta').click();
  await page.locator('#cd_marca').fill(marca);
  await page.locator('#creatorDealForm').evaluate((f) => f.requestSubmit());
  await expect(page.locator('#view-root')).toContainText(marca);
}

/* Las 10 pestañas del workspace Creador, con la clave interna que usa el código
   (ver CREATOR_TABS en index.html). El workspace Agencia está oculto a propósito. */
const TABS = [
  ['dashboard', 'Dashboard'],
  ['board', 'Tablero'],
  ['propuestas', 'Propuestas'],
  ['deals', 'Deals'],
  ['contacts', 'Contactos'],
  ['calendar', 'Calendario'],
  ['finance', 'Finanzas'],
  ['aprende', 'Aprende'],
  ['plan', 'Mi plan'],
  ['config', 'Configuración'],
];

test.describe('Entrada a la app', () => {
  test('sin sesión muestra la pantalla de inicio de sesión, no la app', async ({ page }) => {
    await abrirApp(page, { sinSesion: true });
    await expect(page.locator('#btnGoogleSignIn')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
  });

  test('con sesión entra a la app y muestra el nombre del usuario', async ({ page }) => {
    await abrirApp(page);
    await expect(page.locator('#userName')).toHaveText('Usuaria de Prueba');
    await expect(page.locator('#authGate')).toBeHidden();
  });

  test('al primer ingreso se crea el perfil inicial del usuario', async ({ page }) => {
    await abrirApp(page);
    const datos = await page.evaluate(() => window.__TEST_STORE__.get('userdata/test-uid-001'));
    expect(datos.creatorProfiles).toHaveLength(1);
    expect(datos.preferencias.monedaDefault).toBe('MXN');
  });

  test('cerrar sesión regresa a la pantalla de inicio de sesión', async ({ page }) => {
    await abrirApp(page);
    await page.locator('#btnSignOut').click();
    await expect(page.locator('#authGate')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
  });
});

test.describe('Navegación', () => {
  /* Esta es la prueba de mayor valor del archivo: recorre toda la app buscando
     errores de JavaScript. La fixture falla la prueba si encuentra cualquiera. */
  for (const [key, etiqueta] of TABS) {
    test(`la pestaña ${etiqueta} abre sin errores`, async ({ page }) => {
      await abrirApp(page);
      await page.locator(`.nav-item[data-tab="${key}"]`).click();
      await expect(page.locator(`.nav-item[data-tab="${key}"]`)).toHaveClass(/active/);
      await expect(page.locator('#view-root')).not.toBeEmpty();
    });
  }
});

test.describe('Crear un deal', () => {
  test('un deal nuevo aparece en la lista y queda guardado', async ({ page }) => {
    await abrirApp(page);
    await page.locator('.nav-item[data-tab="deals"]').click();
    await page.locator('#btnDealsNewCta').click();

    await page.locator('#cd_marca').fill('Marca de Prueba');
    await page.locator('#creatorDealForm').evaluate((f) => f.requestSubmit());

    await expect(page.locator('#view-root')).toContainText('Marca de Prueba');

    /* El guardado ya no es inmediato: se juntan los cambios de un momento y se hace
       una sola escritura. Por eso hay que esperar a que aterrice. */
    await expect.poll(() => leerDatos(page).then((d) => (d.creatorBrands || []).length), { timeout: 5_000 })
      .toBeGreaterThan(0);

    /* Ojo con el modelo de datos: el deal NO guarda el nombre de la marca, guarda una
       referencia (marcaId). El nombre vive en creatorBrands, que la app crea sola si
       la marca no existía. */
    const datos = await leerDatos(page);
    const marca = datos.creatorBrands.find((b) => b.nombre === 'Marca de Prueba');
    expect(marca, 'la marca debería quedar guardada en creatorBrands').toBeTruthy();
    expect(datos.creatorDeals.some((d) => d.marcaId === marca.id)).toBe(true);
  });

  test('el deal sobrevive a recargar la página', async ({ page }) => {
    await abrirApp(page);
    await page.locator('.nav-item[data-tab="deals"]').click();
    await page.locator('#btnDealsNewCta').click();
    await page.locator('#cd_marca').fill('Marca Persistente');
    await page.locator('#creatorDealForm').evaluate((f) => f.requestSubmit());
    await expect(page.locator('#view-root')).toContainText('Marca Persistente');

    await page.reload();
    await expect(page.locator('#app')).toBeVisible();
    await page.locator('.nav-item[data-tab="deals"]').click();
    await expect(page.locator('#view-root')).toContainText('Marca Persistente');
  });
});

test.describe('Guardado en la nube', () => {
  /* La app guarda TODA la información del usuario en un solo documento. Escribir en
     cada cambio significaba volver a subir el documento completo cada vez. Estas
     pruebas protegen el comportamiento nuevo: juntar cambios y escribir una sola vez. */

  test('varios cambios seguidos se juntan en una sola escritura', async ({ page }) => {
    await abrirApp(page);
    await crearDeal(page, 'Marca Base');

    /* Duplicar un deal es un clic que guarda. Cuatro clics seguidos son cuatro
       cambios: antes costaban cuatro escrituras del documento completo. */
    const duplicar = page.locator('[data-action="duplicate-creator-deal"]').first();
    await expect(duplicar).toBeVisible();

    await page.evaluate(() => { window.__TEST_WRITES__ = 0; });
    for (let i = 0; i < 4; i++) await duplicar.click();

    await expect.poll(() => page.evaluate(() => window.__TEST_WRITES__), { timeout: 5_000 })
      .toBeGreaterThan(0);

    const escrituras = await page.evaluate(() => window.__TEST_WRITES__);
    expect(escrituras, '4 cambios seguidos deberían costar 1 escritura, no 4').toBe(1);

    /* Y lo importante: no se perdió ninguno de los 4 cambios. */
    const datos = await leerDatos(page);
    expect(datos.creatorDeals).toHaveLength(5);
  });

  test('al salir de la pestaña se guarda lo pendiente sin esperar', async ({ page }) => {
    await abrirApp(page);
    await crearDeal(page, 'Marca Salida');
    await page.evaluate(() => { window.__TEST_WRITES__ = 0; });
    await page.locator('[data-action="duplicate-creator-deal"]').first().click();

    /* Simular que el usuario cambia de pestaña, minimiza o cierra. */
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await expect.poll(() => page.evaluate(() => window.__TEST_WRITES__), { timeout: 2_000 })
      .toBeGreaterThan(0);
  });
});

test.describe('Cuando falla el guardado', () => {
  /* Antes, cualquier error al guardar mostraba siempre el mismo mensaje:
     "revisa las reglas de Firestore" — inútil para un usuario, y casi siempre falso.
     Ahora el mensaje corresponde a lo que de verdad pasó. */
  const CASOS = [
    ['permission-denied', /vuelve a entrar/i],
    ['unavailable', /conexión/i],
    ['invalid-argument', /demasiado grandes/i],
  ];

  for (const [codigo, esperado] of CASOS) {
    test(`el error "${codigo}" se explica en lenguaje entendible`, async ({ page }) => {
      await abrirApp(page);
      await page.evaluate((c) => { window.__TEST_WRITE_ERROR__ = c; }, codigo);

      await page.locator('.nav-item[data-tab="deals"]').click();
      await page.locator('#btnDealsNewCta').click();
      await page.locator('#cd_marca').fill('Marca Que Falla');
      await page.locator('#creatorDealForm').evaluate((f) => f.requestSubmit());

      const aviso = page.locator('.toast, #toast').filter({ hasText: esperado });
      await expect(aviso).toBeVisible({ timeout: 5_000 });
      /* Y nunca el mensaje viejo que culpaba a las reglas de seguridad. */
      await expect(page.locator('body')).not.toContainText('revisa las reglas de Firestore');
    });
  }
});

test.describe('Seguridad de los datos que escribe el usuario', () => {
  /* DEUDA CONOCIDA: la app arma su HTML pegando texto del usuario sin escaparlo
     (~51 usos de innerHTML). Un nombre de marca con < o " rompe el UI.
     Esta prueba está marcada como "se espera que falle": el día que arreglemos el
     escapado, Playwright avisará que ya pasa y hay que quitar esta marca. */
  test.fail();
  test('un nombre de marca con caracteres de HTML se muestra como texto, no se interpreta', async ({ page }) => {
    await abrirApp(page);
    await page.locator('.nav-item[data-tab="deals"]').click();
    await page.locator('#btnDealsNewCta').click();
    await page.locator('#cd_marca').fill('<b>Marca</b> "rara"');
    await page.locator('#creatorDealForm').evaluate((f) => f.requestSubmit());

    await expect(page.locator('#view-root')).toContainText('<b>Marca</b> "rara"');
    await expect(page.locator('#view-root b')).toHaveCount(0);
  });
});
