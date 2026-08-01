// Renders a chat photo, whichever of the two storage generations it belongs to.
//
//   * Legacy — the message carries a public `imageUrl`. Render it directly,
//     exactly as before. These are pre-migration rows and must keep working.
//   * Private — the message carries `hasPrivateImage` and no URL. Trade the
//     message id for a short-lived signed URL, cached in memory only.
//
// The visual result is identical in both cases: same <Image>, same style, same
// press behaviour. Only where the bytes come from differs.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleProp, View, ViewStyle, ImageStyle } from 'react-native';

import { getChatImageUrl, invalidateChatImageUrl } from '@/lib/chat-image-access';

type Props = {
  tripId: string;
  messageId: string;
  /** Public URL for legacy messages, or a local file URI while sending. */
  directUri?: string | null;
  /** True when the image lives in the private bucket and must be signed for. */
  hasPrivateImage?: boolean;
  style: StyleProp<ImageStyle>;
  /** Receives the URI actually being displayed — for the fullscreen viewer. */
  onPress?: (uri: string) => void;
  disabled?: boolean;
  placeholderStyle?: StyleProp<ViewStyle>;
};

export function ChatImage({
  tripId,
  messageId,
  directUri,
  hasPrivateImage,
  style,
  onPress,
  disabled,
  placeholderStyle,
}: Props) {
  const [signedUri, setSignedUri] = useState<string | null>(null);
  // Set when directUri turns out to be unusable — typically the local file of
  // a just-sent photo that the OS has since cleaned up. For a private image
  // that is recoverable: fall through to the signed URL.
  const [directFailed, setDirectFailed] = useState(false);
  // Guards against setState after unmount, and against a slow response for a
  // message that has since been replaced (optimistic entry → real message).
  const activeRef = useRef(true);
  // One retry per mount. An expired URL is worth re-requesting once; a
  // genuinely missing object would otherwise loop forever, one request per
  // failed load.
  const retriedRef = useRef(false);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  useEffect(() => {
    setDirectFailed(false);
    retriedRef.current = false;
  }, [directUri, messageId]);

  const resolve = useCallback(async () => {
    // getChatImageUrl dedupes and serves from its in-memory cache, so this is
    // cheap on every re-render and chat poll — it only hits the network when
    // there is no fresh URL for this message.
    const url = await getChatImageUrl(tripId, messageId);
    if (activeRef.current) setSignedUri(url);
  }, [tripId, messageId]);

  // A local/legacy URI wins while it works: it is either the optimistic
  // preview of a send (no round-trip needed to show the user their own photo)
  // or a pre-migration public URL.
  const useDirect = Boolean(directUri) && !directFailed;
  const uri = useDirect ? directUri : signedUri;

  useEffect(() => {
    if (!hasPrivateImage || useDirect) return;
    void resolve();
  }, [hasPrivateImage, useDirect, resolve]);

  const handleError = useCallback(() => {
    if (!hasPrivateImage) return;

    if (useDirect) {
      // The local preview is gone; the private object is still there.
      setDirectFailed(true);
      return;
    }

    if (retriedRef.current) return;
    retriedRef.current = true;
    // An expired or revoked signed URL is indistinguishable from a broken
    // image, so drop the cached entry and ask the server once more.
    invalidateChatImageUrl(tripId, messageId);
    setSignedUri(null);
    void resolve();
  }, [hasPrivateImage, useDirect, tripId, messageId, resolve]);

  if (!uri) {
    // Private image still resolving (or unavailable). A neutral placeholder at
    // the same size keeps the bubble from jumping when it lands.
    return (
      <View style={[style as StyleProp<ViewStyle>, placeholderStyle]}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  const image = <Image source={{ uri }} style={style} onError={handleError} />;

  if (!onPress) return image;

  return (
    <Pressable onPress={() => onPress(uri)} disabled={disabled}>
      {image}
    </Pressable>
  );
}
