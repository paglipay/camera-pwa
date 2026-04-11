const UPLOAD_URL = import.meta.env.VITE_UPLOAD_URL || '/files/upload';
const API_KEY     = import.meta.env.VITE_UPLOAD_API_KEY || '';
const FOLDER      = import.meta.env.VITE_UPLOAD_FOLDER || '';

/**
 * Upload a single queued image item to the Flask /files/upload endpoint.
 * Throws on network error, non-2xx response, or Flask error payload.
 */
export async function uploadImage(item) {
  const body = new FormData();
  // Flask expects the field named 'file'
  body.append('file', item.blob, item.fileName);
  if (FOLDER) body.append('folder', FOLDER);

  const headers = {};
  if (API_KEY) headers['X-API-Key'] = API_KEY;

  const res = await fetch(UPLOAD_URL, { method: 'POST', body, headers });

  const contentType = res.headers.get('content-type') ?? '';
  const json = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const msg = json?.message ?? `${res.status} ${res.statusText}`;
    throw new Error(`Upload failed — ${msg}`);
  }

  // Flask returns { status, filename, path, size_bytes, download_url }
  if (json?.status === 'error') {
    throw new Error(`Upload failed — ${json.message ?? 'unknown error'}`);
  }

  return json;
}
