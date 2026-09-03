/* Doble de prueba de firebase-storage. Guarda los archivos en memoria y devuelve una
   URL falsa, para poder probar la interfaz de adjuntar archivos sin una bodega real. */
const files = new Map();

export function getStorage() {
  window.__TEST_FILES__ = files;
  return {};
}

export function ref(_storage, path) {
  return { fullPath: path };
}

export async function uploadBytes(sref, file) {
  if (window.__TEST_UPLOAD_ERROR__) throw new Error(window.__TEST_UPLOAD_ERROR__);
  files.set(sref.fullPath, { name: file && file.name, size: file && file.size });
  return { ref: sref };
}

export async function getDownloadURL(sref) {
  return `https://archivos-de-prueba.invalid/${encodeURIComponent(sref.fullPath)}`;
}

export async function deleteObject(sref) {
  files.delete(sref.fullPath);
}
