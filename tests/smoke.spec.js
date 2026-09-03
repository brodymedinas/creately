/* Pruebas de humo: lo mínimo que NUNCA debe romperse.

   Si alguna de estas falla, la app está rota para todos los usuarios, no en un caso
   raro. Corren contra dobles de Firebase (ver tests/fixtures.js), así que no tocan
   datos reales ni gastan crédito de la API de IA. */
const { test, expect, abrirApp } = require('./fixtures');

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

    /* Ojo con el modelo de datos: el deal NO guarda el nombre de la marca, guarda una
       referencia (marcaId). El nombre vive en creatorBrands, que la app crea sola si
       la marca no existía. */
    const datos = await page.evaluate(() => window.__TEST_STORE__.get('userdata/test-uid-001'));
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
  /* Protege contra el problema conocido de saveAll(): hoy escribe el documento
     completo del usuario en cada cambio. Esta prueba deja constancia de cuántas
     escrituras cuesta una sola acción, para que se note si alguien lo empeora. */
  test('crear un deal no dispara una avalancha de escrituras', async ({ page }) => {
    await abrirApp(page);
    await page.evaluate(() => { window.__TEST_WRITES__ = 0; });

    await page.locator('.nav-item[data-tab="deals"]').click();
    await page.locator('#btnDealsNewCta').click();
    await page.locator('#cd_marca').fill('Marca Contador');
    await page.locator('#creatorDealForm').evaluate((f) => f.requestSubmit());
    await expect(page.locator('#view-root')).toContainText('Marca Contador');

    const escrituras = await page.evaluate(() => window.__TEST_WRITES__);
    expect(escrituras).toBeGreaterThan(0);
    expect(escrituras).toBeLessThanOrEqual(3);
  });
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
