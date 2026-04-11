const UPLOAD_URL = import.meta.env.VITE_UPLOAD_URL || '/api/upload';

/**
 * Upload a single queued image item via multipart POST.
 * Throws on network error or non-2xx response.
 */
export async function uploadImage(item) {
  const body = new FormData();
  body.append('image',     item.blob, item.fileName);
  body.append('timestamp', String(item.timestamp));

  const res = await fetch(UPLOAD_URL, { method: 'POST', body });

  if (!res.ok) {
    throw new Error(`Upload failed — ${res.status} ${res.statusText}`);
  }

  // Return parsed JSON if the server sends it, otherwise null
  const contentType = res.headers.get('content-type') ?? '';
  return contentType.includes('application/json') ? res.json() : null;
}
