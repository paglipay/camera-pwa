const UPLOAD_URL = import.meta.env.VITE_UPLOAD_URL || '/files/upload';
const API_KEY     = import.meta.env.VITE_UPLOAD_API_KEY || '';
const FOLDER      = import.meta.env.VITE_UPLOAD_FOLDER || '';

console.log('[upload] config →', { UPLOAD_URL, hasApiKey: !!API_KEY, FOLDER });

/**
 * Upload a single queued image item to the Flask /files/upload endpoint.
 * Throws on network error, non-2xx response, or Flask error payload.
 */
export async function uploadImage(item) {
  console.log('[upload] attempting →', { id: item.id, fileName: item.fileName, blobSize: item.blob?.size, retries: item.retries });

  const body = new FormData();
  // Flask expects the field named 'file'
  body.append('file', item.blob, item.fileName);
  if (FOLDER) body.append('folder', FOLDER);

  const headers = {};
  if (API_KEY) headers['X-API-Key'] = API_KEY;

  let res;
  try {
    res = await fetch(UPLOAD_URL, { method: 'POST', body, headers });
    console.log('[upload] response →', { status: res.status, ok: res.ok, contentType: res.headers.get('content-type') });
  } catch (networkErr) {
    console.error('[upload] network error (fetch threw) →', networkErr.message, { url: UPLOAD_URL, online: navigator.onLine });
    throw networkErr;
  }

  const contentType = res.headers.get('content-type') ?? '';
  const json = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const msg = json?.message ?? `${res.status} ${res.statusText}`;
    console.error('[upload] server error →', { status: res.status, msg, json });
    throw new Error(`Upload failed — ${msg}`);
  }

  // Flask returns { status, filename, path, size_bytes, download_url }
  if (json?.status === 'error') {
    console.error('[upload] flask error payload →', json);
    throw new Error(`Upload failed — ${json.message ?? 'unknown error'}`);
  }

  console.log('[upload] success →', { fileName: item.fileName, result: json });
  return json;
}
