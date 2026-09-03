# Creately — contexto del proyecto

## Qué es

SaaS para **creadores de contenido** (y, en el futuro, agencias de talento). Permite llevar
deals con marcas, entregables, contactos/marcas, propuestas, calendario y finanzas.
Monetización planeada: Plan Creador $15/mes. Todavía **no se ha lanzado** ni se cobra.

El fundador (Andres) **no es técnico**: lidera negocio, marketing y ventas. Explica siempre
en lenguaje simple, sin jerga, y di claramente qué pasos requieren que él entre a una consola
(Firebase, Vercel, GitHub) porque esos no se pueden hacer desde aquí.

## Stack

| Pieza | Qué se usa |
|---|---|
| Frontend | **Un solo `index.html`** (~4,400 líneas): HTML + CSS + JS vanilla inline. Sin framework, sin build step. |
| Auth | Firebase Authentication, login con Google vía `signInWithPopup` |
| Base de datos | Firestore. **Un documento por usuario**: `userdata/{uid}` con todo el estado adentro |
| Archivos | Firebase Storage, ruta `uploads/{uid}/deals/{dealId}/...` |
| Backend | 2 funciones serverless en `api/`: `parse-deals.js` y `map-columns.js` (llaman a Claude Haiku) |
| Hosting | Vercel → https://creately-seven.vercel.app/ |
| Repo | `brodymedinas/creately` (público), rama principal `main` |
| Proyecto Firebase | `creately-965f0` |

## Reglas importantes al trabajar aquí

- **`index.html` es un archivo monolítico gigante.** Los cambios se hacen con ediciones
  quirúrgicas, no reescribiendo secciones enteras. Antes de tocar, ubica la función exacta.
- **La `apiKey` de Firebase en `index.html` no es un secreto** — es pública por diseño. La
  seguridad real vive en `firestore.rules` y `storage.rules`. GitHub a veces la marca como
  "secreto detectado": es un falso positivo, se puede descartar.
- **Los secretos reales viven solo en variables de entorno de Vercel**, nunca en el repo:
  `ANTHROPIC_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `AI_DAILY_LIMIT_PER_USER` (opcional).
- **Nunca commitear** llaves de cuenta de servicio, archivos `.env` ni `node_modules/`.
- El workspace **Agencia** está oculto en el UI (decisión de producto), pero su código y datos
  siguen intactos. No lo borres.

## Deudas técnicas conocidas (ordenadas por riesgo)

1. **`saveAll()` reescribe el documento completo del usuario en cada cambio**
   (`index.html`, ~línea 1280; 46 puntos de llamada, sin debounce). Firestore tiene un tope
   duro de **1 MiB por documento**: un usuario con muchos datos lo va a topar y el guardado
   fallará. Además `onSnapshot` (~línea 1343) reemplaza el objeto `DB` entero, así que **dos
   pestañas abiertas del mismo usuario pueden perder datos** (gana la última escritura).
2. **Cero pruebas versionadas.** Se corrieron suites de Playwright en sesiones pasadas pero
   nunca se commitearon. No hay CI. Cualquier cambio en un archivo de 4,400 líneas es a ciegas.
3. **~51 usos de `innerHTML` con datos del usuario sin escapar.** Hoy el impacto es bajo
   (cada usuario solo ve sus propios datos), pero rompe el UI con nombres que traen `<` o `"`,
   y se vuelve una vulnerabilidad real en cuanto exista cualquier vista compartida.
4. **Sin respaldos de Firestore.** Si un usuario borra su cuenta o un bug corrompe su
   documento, no hay forma de recuperarlo.
5. **App Check está cableado pero apagado** (`RECAPTCHA_V3_SITE_KEY = 'PENDIENTE...'`).
   Se activa cuando esté definido el dominio final.

## Cosas que solo Andres puede hacer (requieren consola / contraseña)

- Variables de entorno en Vercel (Project Settings → Environment Variables).
- Generar la cuenta de servicio de Firebase y la site key de reCAPTCHA v3.
- Publicar reglas en las consolas de Firebase (aunque esto se puede automatizar con
  `firebase deploy --only firestore:rules,storage` una vez que el Firebase CLI esté logueado).

## Historia relevante

- El login usa `signInWithPopup` a propósito. Se intentó `signInWithRedirect` y **rompió el
  login** en Chrome/Firefox/Safari modernos, porque el dominio de la app (Vercel) no coincide
  con el `authDomain` de Firebase. No volver a intentar redirect sin resolver eso primero.
- Hubo un backoffice de admin (`admin.html` + `api/admin-users.js`); se quitó a propósito en
  el commit `a10fc67`. Para ver datos de usuarios se usa la Consola de Firebase.

## Documentación de producto

Vive un nivel arriba, en `~/Desktop/Creately/`: `Creatly-Estado-del-Proyecto.md` (estado
técnico) y `Creatly-Ideas-Backlog.md` (backlog de producto, 22 entradas con historial de
decisiones). Ojo: partes de esos documentos están desactualizadas respecto al repo real —
el repo manda.
