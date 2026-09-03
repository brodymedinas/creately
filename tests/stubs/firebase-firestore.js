/* Doble de prueba de firebase-firestore.

   Guarda los documentos en memoria (se borran al recargar la página), imitando la
   forma real: doc() devuelve una referencia, getDoc() una "foto" con .exists() y
   .data(), y onSnapshot() avisa cada vez que alguien escribe.

   Además lleva la cuenta de cuántas veces se escribió (window.__TEST_WRITES__), que
   es justo lo que necesitamos para probar que saveAll() no escriba de más. */
/* Los documentos se respaldan en sessionStorage para que sobrevivan a un recargar
   de la página dentro de la misma prueba (así podemos probar que los datos persisten),
   pero desaparecen al terminar la prueba. */
const KEY = '__creately_test_store__';
const store = new Map(JSON.parse(sessionStorage.getItem(KEY) || '[]'));
const watchers = new Map();

function persist() {
  sessionStorage.setItem(KEY, JSON.stringify([...store.entries()]));
}

export function getFirestore() {
  window.__TEST_STORE__ = store;
  window.__TEST_WRITES__ = 0;
  return { _store: store };
}

export function doc(_db, collection, id) {
  return { path: `${collection}/${id}` };
}

export async function getDoc(ref) {
  const data = store.get(ref.path);
  return {
    exists: () => data !== undefined,
    data: () => (data === undefined ? undefined : JSON.parse(JSON.stringify(data))),
  };
}

export async function setDoc(ref, data) {
  window.__TEST_WRITES__ = (window.__TEST_WRITES__ || 0) + 1;
  store.set(ref.path, JSON.parse(JSON.stringify(data)));
  persist();
  notify(ref.path);
}

export async function deleteDoc(ref) {
  store.delete(ref.path);
  persist();
  notify(ref.path);
}

export function onSnapshot(ref, cb) {
  const list = watchers.get(ref.path) || [];
  list.push(cb);
  watchers.set(ref.path, list);
  /* Primer aviso asíncrono, igual que el Firestore real. */
  setTimeout(() => emit(ref.path, cb), 0);
  return () => {
    watchers.set(ref.path, (watchers.get(ref.path) || []).filter((c) => c !== cb));
  };
}

function emit(path, cb) {
  const data = store.get(path);
  cb({
    exists: () => data !== undefined,
    data: () => (data === undefined ? undefined : JSON.parse(JSON.stringify(data))),
  });
}

function notify(path) {
  for (const cb of watchers.get(path) || []) emit(path, cb);
}
