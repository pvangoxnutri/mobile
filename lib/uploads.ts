import { apiFetch } from '@/lib/api';

export async function uploadImageIfNeeded(uri: string | null | undefined, filePrefix = 'image') {
  if (!uri) {
    return null;
  }

  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }

  const formData = new FormData();
  formData.append('file', {
    uri,
    name: `${filePrefix}-${Date.now()}.jpg`,
    type: 'image/jpeg',
  } as never);

  const response = await apiFetch('/api/images/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error((await response.text()) || 'Could not upload the image.');
  }

  const data = (await response.json()) as { url?: string };
  return data.url ?? null;
}
