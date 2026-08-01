import * as ImageManipulator from 'expo-image-manipulator';

import { apiFetch } from '@/lib/api';

// Re-encode local picks to an actual JPEG before upload. The multipart part is
// declared image/jpeg, but library picks can be HEIC/WebP originals (or
// content:// URIs), and the backend now decides the type from the bytes — an
// unconverted HEIC is rejected outright. The create-adventure flow never hit
// this only because its crop step happens to re-encode to JPEG.
async function normalizeToJpeg(uri: string) {
  try {
    const normalized = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return normalized.uri;
  } catch {
    // Odd/unreadable source — try uploading the original rather than failing
    // outright; the backend still validates it.
    return uri;
  }
}

/**
 * Sends a chat message with a photo.
 *
 * Deliberately NOT built on uploadImageIfNeeded: that path stores into the
 * PUBLIC bucket and hands back a permanent URL, which is exactly what chat
 * images must no longer do. Here the upload and the message are one authorized
 * request against the adventure — the server checks membership, stores the file
 * privately, and returns the created message. Nothing about the stored object
 * ever passes through this client.
 */
export async function sendChatImageMessage(tripId: string, uri: string, text: string) {
  const uploadUri = await normalizeToJpeg(uri);

  const formData = new FormData();
  formData.append('file', {
    uri: uploadUri,
    name: `chat-${Date.now()}.jpg`,
    type: 'image/jpeg',
  } as never);
  formData.append('text', text);

  const response = await apiFetch(
    `/api/trips/${encodeURIComponent(tripId)}/chat/image`,
    { method: 'POST', body: formData },
    // Uploads can be slow on a phone connection; the default 15s is tight for
    // a 10 MB photo.
    60_000,
    // The response is the created chat message — private conversation content.
    { privateEndpointName: 'trip_chat_image_send' },
  );

  if (!response.ok) {
    throw new Error((await response.text()) || 'Could not send the image.');
  }

  return response.json();
}

export async function uploadImageIfNeeded(uri: string | null | undefined, filePrefix = 'image') {
  if (!uri) {
    return null;
  }

  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }

  const uploadUri = await normalizeToJpeg(uri);

  const formData = new FormData();
  formData.append('file', {
    uri: uploadUri,
    name: `${filePrefix}-${Date.now()}.jpg`,
    type: 'image/jpeg',
  } as never);

  // Marked private so a failed upload logs its status only. The response body
  // carries the stored file's permanent URL, and that must not end up in device
  // logs, where anything reading them would get a working link to the image.
  const response = await apiFetch(
    '/api/images/upload',
    { method: 'POST', body: formData },
    undefined,
    { privateEndpointName: 'image_upload' },
  );

  if (!response.ok) {
    throw new Error((await response.text()) || 'Could not upload the image.');
  }

  const data = (await response.json()) as { url?: string };
  return data.url ?? null;
}
