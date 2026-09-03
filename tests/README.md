# Pruebas automáticas de Creately

## Para qué sirven

`index.html` tiene ~4,400 líneas y todo vive en un solo archivo. Sin pruebas, la única
forma de saber si un cambio rompió algo es que un usuario se queje. Estas pruebas abren
la app en un navegador de verdad, hacen clic como lo haría una persona, y avisan si algo
dejó de funcionar — en segundos, antes de publicar.

## Cómo correrlas

```bash
npm install
npx playwright install chromium   # solo la primera vez
npm test
```

Para verlas correr paso a paso en una ventana: `npm run test:ui`.
Si algo falla, `npm run test:report` abre el reporte con capturas y video.

## Cómo funcionan sin tocar datos reales

Las pruebas **nunca** se conectan a Firebase ni gastan crédito de la API de IA.

Antes de que la página cargue, `fixtures.js` intercepta las descargas de Firebase y en
su lugar entrega los "dobles de prueba" de `stubs/`: piezas falsas que imitan a Firebase
pero guardan todo en la memoria del navegador. Por eso las pruebas son rápidas, funcionan
sin internet, y dan siempre el mismo resultado.

Los dobles también exponen datos útiles para las pruebas:

| Variable | Para qué |
|---|---|
| `window.__TEST_STORE__` | Los documentos guardados, para revisar qué quedó en la "base de datos" |
| `window.__TEST_WRITES__` | Cuántas veces se escribió, para detectar guardados de más |
| `window.__TEST_FILES__` | Los archivos subidos |
| `window.__TEST_START_SIGNED_OUT__` | Arrancar la prueba sin sesión iniciada |

## Qué cubre hoy

`smoke.spec.js` — las pruebas de humo, lo mínimo que nunca debe romperse:

- Entrar y salir de la app (con sesión y sin sesión).
- Que las **10 pestañas abran sin errores de JavaScript**. Esta es la de mayor valor:
  la fixture falla la prueba ante cualquier error no atrapado, que es justo la clase de
  bug que hoy solo se descubre en producción.
- Crear un deal, verlo en la lista, y que sobreviva a recargar la página.
- Que una acción sencilla no dispare una avalancha de escrituras a la base de datos.

## Una prueba que falla a propósito

La última prueba (`un nombre de marca con caracteres de HTML…`) está marcada con
`test.fail()`: documenta una deuda técnica real: la app arma su HTML pegando texto del
usuario sin escaparlo. **Playwright la cuenta como esperada, así que CI sigue en verde.**

El día que arreglemos el escapado, Playwright avisará que la prueba "pasó cuando se
esperaba que fallara" — ahí se quita la marca `test.fail()` y queda como prueba normal.
