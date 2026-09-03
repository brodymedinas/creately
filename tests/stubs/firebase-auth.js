/* Doble de prueba de firebase-auth.

   Simula a un usuario que ya inició sesión con Google, sin ventana emergente ni red.
   La prueba puede cambiar el usuario (o arrancar sin sesión) poniendo window.__TEST_USER__
   antes de que cargue la página; ver tests/fixtures.js. */
const DEFAULT_USER = {
  uid: 'test-uid-001',
  displayName: 'Usuaria de Prueba',
  email: 'prueba@creately.test',
  photoURL: '',
};

export const browserLocalPersistence = 'local';
export const browserSessionPersistence = 'session';
export const inMemoryPersistence = 'none';
export const browserPopupRedirectResolver = {};

export class GoogleAuthProvider {}

export function initializeAuth() {
  const auth = {
    currentUser: null,
    _listeners: [],
    _emit() {
      for (const cb of this._listeners) cb(this.currentUser);
    },
  };
  window.__TEST_AUTH__ = auth;
  return auth;
}

export function onAuthStateChanged(auth, cb) {
  auth._listeners.push(cb);
  /* El Firebase real avisa de forma asíncrona (después de revisar la sesión guardada).
     Imitamos eso para que la app pase por su pantalla de carga igual que en producción. */
  const startSignedIn = window.__TEST_START_SIGNED_OUT__ !== true;
  setTimeout(() => {
    auth.currentUser = startSignedIn ? { ...DEFAULT_USER, ...(window.__TEST_USER__ || {}) } : null;
    cb(auth.currentUser);
  }, 0);
  return () => {
    auth._listeners = auth._listeners.filter((l) => l !== cb);
  };
}

export async function signInWithPopup(auth) {
  if (window.__TEST_SIGNIN_ERROR__) {
    const err = new Error('error de prueba');
    err.code = window.__TEST_SIGNIN_ERROR__;
    throw err;
  }
  auth.currentUser = { ...DEFAULT_USER, ...(window.__TEST_USER__ || {}) };
  auth._emit();
  return { user: auth.currentUser };
}

export async function signOut(auth) {
  auth.currentUser = null;
  auth._emit();
}

export async function reauthenticateWithPopup(user) {
  return { user };
}

export async function deleteUser(auth) {
  if (auth && auth._emit) { auth.currentUser = null; auth._emit(); }
}

export async function getIdToken() {
  return 'token-de-prueba';
}
