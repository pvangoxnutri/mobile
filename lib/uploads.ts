import * as ImageManipulator from 'expo-image-manipulator';

import { apiFetch } from '@/lib/api';

export async function uploadImageIfNeeded(uri: string | null | undefined, filePrefix = 'image') {
  if (!uri) {
    return null;
  }

  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }

  // Re-encode local picks to an actual JPEG before upload. The multipart part
  // is declared image/jpeg below, but library picks can be HEIC/WebP
  // originals (or content:// URIs) — the backend rejects those as "Only
  // image files are allowed". The create-adventure flow never hit this only
  // because its crop step happens to re-encode to JPEG; this makes every
  // other callsite (edit cover, chat, receipts, support) just as safe.
  let uploadUri = uri;
  try {
    const normalized = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    uploadUri = normalized.uri;
  } catch {
    // Odd/unreadable source — try uploading the original rather than failing
    // outright; the backend still validates it.
  }

  const formData = new FormData();
  formData.append('file', {
    uri: uploadUri,
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
