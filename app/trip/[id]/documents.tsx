import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import GlunoDocumentAnalysisSheet from '@/components/gluno/GlunoDocumentAnalysisSheet';
import ModalSheet from '@/components/modal-sheet';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { apiJson } from '@/lib/api';
import {
  getGlunoDocumentStatus,
  isAnalysableDocument,
  type GlunoDocumentStatus,
} from '@/lib/gluno-documents';
import {
  createTripDocument,
  deleteTripDocument,
  getTripDocumentOpenUrl,
  getTripDocuments,
  inferTripDocumentMimeType,
  TRIP_DOCUMENT_CATEGORIES,
  TRIP_DOCUMENT_MAX_BYTES,
  TripDocumentApiError,
  tripDocumentNameFromFile,
  updateTripDocument,
  validatePickedTripDocumentFile,
  type PickedTripDocumentFile,
  type TripDocument,
  type TripDocumentCategory,
  type TripDocumentErrorCode,
  type TripDocumentMetadataInput,
} from '@/lib/trip-documents';
import {
  isTripDocumentLoadErrorCode,
  normalizeTripDocumentRouteId,
  type TripDocumentLoadErrorCode,
} from '@/lib/trip-documents-contract';
import type { SideQuestActivity } from '@/lib/types';
import type { AppTheme } from '@/constants/themes';
import { RADIUS, SPACING, TYPOGRAPHY } from '@/constants/design-tokens';

type CategoryFilter = 'all' | TripDocumentCategory;

type DocumentLoadFailure = {
  code: TripDocumentLoadErrorCode;
  status: number;
};

type DocumentDraft = {
  name: string;
  category: TripDocumentCategory;
  date: string | null;
  activityId: string | null;
  note: string;
  bookingReference: string;
};

const EMPTY_DRAFT: DocumentDraft = {
  name: '',
  category: 'other',
  date: null,
  activityId: null,
  note: '',
  bookingReference: '',
};

const CATEGORY_ICONS: Record<TripDocumentCategory, keyof typeof Ionicons.glyphMap> = {
  car_rental: 'car-outline',
  flight: 'airplane-outline',
  train: 'train-outline',
  ferry: 'boat-outline',
  accommodation: 'bed-outline',
  insurance: 'shield-checkmark-outline',
  booking: 'calendar-outline',
  identification_visa: 'id-card-outline',
  other: 'document-text-outline',
};

const CATEGORY_LABEL_KEYS: Record<TripDocumentCategory, string> = {
  car_rental: 'trip.documents.category.carRental',
  flight: 'trip.documents.category.flight',
  train: 'trip.documents.category.train',
  ferry: 'trip.documents.category.ferry',
  accommodation: 'trip.documents.category.accommodation',
  insurance: 'trip.documents.category.insurance',
  booking: 'trip.documents.category.booking',
  identification_visa: 'trip.documents.category.identificationVisa',
  other: 'trip.documents.category.other',
};

export default function TripDocumentsScreen() {
  const { id: routeTripId } = useLocalSearchParams<{ id?: string | string[] }>();
  const tripId = normalizeTripDocumentRouteId(routeTripId);
  const hasResolvedRouteParam = routeTripId !== undefined;
  const { t, language } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const [documents, setDocuments] = useState<TripDocument[]>([]);
  const [activities, setActivities] = useState<SideQuestActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<DocumentLoadFailure | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingDocument, setEditingDocument] = useState<TripDocument | null>(null);
  const [draft, setDraft] = useState<DocumentDraft>(EMPTY_DRAFT);
  const [pickedFile, setPickedFile] = useState<PickedTripDocumentFile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formErrorCode, setFormErrorCode] = useState<TripDocumentErrorCode | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [activityPickerOpen, setActivityPickerOpen] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  /** Whether Gluno can read documents here at all. Asked once, on open. */
  const [glunoDocuments, setGlunoDocuments] = useState<GlunoDocumentStatus | null>(null);
  const [analyzingDocumentId, setAnalyzingDocumentId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pickerBusyRef = useRef(false);
  const loadGenerationRef = useRef(0);

  const load = useCallback(async (isRefresh = false) => {
    const generation = ++loadGenerationRef.current;

    if (!tripId) {
      if (hasResolvedRouteParam) {
        setLoadError({ code: 'invalid_route', status: 0 });
        setLoading(false);
        setRefreshing(false);
      }
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    try {
      const [documentData, activityData] = await Promise.all([
        getTripDocuments(tripId),
        apiJson<SideQuestActivity[]>(
          `/api/trips/${encodeURIComponent(tripId)}/activities`,
          {},
          { privateEndpointName: 'trip_document_activities' },
        )
          .catch(() => []),
      ]);
      if (generation !== loadGenerationRef.current) return;
      setDocuments(sortDocuments(documentData));
      setActivities(activityData.filter((activity) => !activity.isHiddenForViewer));
    } catch (error) {
      if (generation !== loadGenerationRef.current) return;
      setLoadError(toDocumentLoadFailure(error));
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [hasResolvedRouteParam, tripId]);

  // Asked once per screen, not per document. A failure just leaves the action
  // hidden — the document screen works exactly as it did before without it.
  useEffect(() => {
    let cancelled = false;
    getGlunoDocumentStatus()
      .then((status) => {
        if (!cancelled) setGlunoDocuments(status);
      })
      .catch(() => {
        if (!cancelled) setGlunoDocuments(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        loadGenerationRef.current += 1;
      };
    }, [load]),
  );

  const filteredDocuments = useMemo(
    () => categoryFilter === 'all'
      ? documents
      : documents.filter((document) => document.category === categoryFilter),
    [categoryFilter, documents],
  );

  const selectedActivity = useMemo(
    () => activities.find((activity) => activity.id === draft.activityId) ?? null,
    [activities, draft.activityId],
  );
  const selectedActivityLabel = selectedActivity?.title?.trim()
    || (
      draft.activityId
      && draft.activityId === editingDocument?.activityId
      && editingDocument.activityTitle?.trim()
    )
    || null;

  function openAddEditor() {
    setEditingDocument(null);
    setDraft(EMPTY_DRAFT);
    setPickedFile(null);
    setFormErrorCode(null);
    setDatePickerOpen(false);
    setEditorVisible(true);
  }

  function openEditEditor(document: TripDocument) {
    if (!document.canEdit) return;
    setEditingDocument(document);
    setDraft({
      name: document.name,
      category: document.category,
      date: document.date?.slice(0, 10) ?? null,
      activityId: document.activityId ?? null,
      note: document.note ?? '',
      bookingReference: document.bookingReference ?? '',
    });
    setPickedFile(null);
    setFormErrorCode(null);
    setDatePickerOpen(false);
    setEditorVisible(true);
  }

  function closeEditor() {
    if (submitting) return;
    setEditorVisible(false);
    setActivityPickerOpen(false);
    setDatePickerOpen(false);
  }

  async function pickFile() {
    if (pickerBusyRef.current || submitting) return;
    pickerBusyRef.current = true;
    setFormErrorCode(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const mimeType = inferTripDocumentMimeType(asset.name, asset.mimeType);
      const file: PickedTripDocumentFile = {
        uri: asset.uri,
        name: asset.name,
        mimeType: mimeType ?? asset.mimeType ?? '',
        size: asset.size,
      };
      const validationError = validatePickedTripDocumentFile(file);
      if (validationError) {
        setFormErrorCode(validationError);
        return;
      }
      applyPickedFile(file);
    } catch {
      // Never surface native picker errors: they can contain a private path.
      setFormErrorCode('request_failed');
    } finally {
      pickerBusyRef.current = false;
    }
  }

  async function pickImage() {
    if (pickerBusyRef.current || submitting) return;
    pickerBusyRef.current = true;
    setFormErrorCode(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setFormErrorCode('permission');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsMultipleSelection: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const fileName = asset.fileName
        ?? `document-${Date.now()}.${extensionForMimeType(asset.mimeType)}`;
      const mimeType = inferTripDocumentMimeType(fileName, asset.mimeType);
      const file: PickedTripDocumentFile = {
        uri: asset.uri,
        name: fileName,
        mimeType: mimeType ?? asset.mimeType ?? '',
        size: asset.fileSize,
      };
      const validationError = validatePickedTripDocumentFile(file);
      if (validationError) {
        setFormErrorCode(validationError);
        return;
      }
      applyPickedFile(file);
    } catch {
      setFormErrorCode('request_failed');
    } finally {
      pickerBusyRef.current = false;
    }
  }

  async function takePhoto() {
    if (pickerBusyRef.current || submitting) return;
    pickerBusyRef.current = true;
    setFormErrorCode(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setFormErrorCode('permission');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const file: PickedTripDocumentFile = {
        uri: asset.uri,
        name: `document-photo-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        size: asset.fileSize,
      };
      const validationError = validatePickedTripDocumentFile(file);
      if (validationError) {
        setFormErrorCode(validationError);
        return;
      }
      applyPickedFile(file);
    } catch {
      setFormErrorCode('request_failed');
    } finally {
      pickerBusyRef.current = false;
    }
  }

  function applyPickedFile(file: PickedTripDocumentFile) {
    setPickedFile(file);
    setDraft((current) => ({
      ...current,
      name: current.name.trim() ? current.name : tripDocumentNameFromFile(file.name),
    }));
  }

  async function submitEditor() {
    if (submitting || !tripId || !draft.name.trim()) return;
    if (!editingDocument && !pickedFile) {
      setFormErrorCode('not_found');
      return;
    }

    setSubmitting(true);
    setFormErrorCode(null);
    const metadata: TripDocumentMetadataInput = {
      name: draft.name,
      category: draft.category,
      date: draft.date,
      activityId: draft.activityId,
      note: draft.note,
      bookingReference: draft.bookingReference,
    };

    try {
      if (editingDocument) {
        const updated = await updateTripDocument(tripId, editingDocument.id, metadata);
        setDocuments((current) => sortDocuments(
          current.map((document) => document.id === updated.id ? updated : document),
        ));
      } else {
        const created = await createTripDocument(tripId, pickedFile!, metadata);
        setDocuments((current) => sortDocuments([created, ...current]));
      }
      setEditorVisible(false);
      setActivityPickerOpen(false);
      setDatePickerOpen(false);
    } catch (error) {
      setFormErrorCode(error instanceof TripDocumentApiError ? error.code : 'request_failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function openDocument(document: TripDocument) {
    if (openingId || !tripId) return;
    setOpeningId(document.id);
    try {
      const { url } = await getTripDocumentOpenUrl(tripId, document.id);
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) throw new TripDocumentApiError('open_failed');
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(
        t('trip.documents.openErrorTitle'),
        t(error instanceof TripDocumentApiError && isDocumentPermissionError(error.code)
          ? 'trip.documents.permissionError'
          : 'trip.documents.openError'),
      );
    } finally {
      setOpeningId(null);
    }
  }

  function confirmDelete(document: TripDocument) {
    if (!document.canEdit || deletingId || !tripId) return;
    Alert.alert(
      t('trip.documents.deleteConfirmTitle'),
      t('trip.documents.deleteConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeletingId(document.id);
              try {
                await deleteTripDocument(tripId, document.id);
                setDocuments((current) => current.filter((item) => item.id !== document.id));
              } catch (error) {
                Alert.alert(
                  t('trip.documents.deleteErrorTitle'),
                  t(error instanceof TripDocumentApiError && isDocumentPermissionError(error.code)
                    ? 'trip.documents.permissionError'
                    : 'trip.documents.deleteError'),
                );
              } finally {
                setDeletingId(null);
              }
            })();
          },
        },
      ],
    );
  }

  function handleDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS !== 'ios') setDatePickerOpen(false);
    if (event.type === 'dismissed' || !selected) return;
    setDraft((current) => ({ ...current, date: toLocalIsoDate(selected) }));
  }

  const editorErrorText = formErrorCode
    ? t(documentErrorTranslationKey(formErrorCode, Boolean(pickedFile) || Boolean(editingDocument)))
    : null;
  const loadErrorCopy = loadError
    ? documentLoadErrorUserCopy(loadError.code, language)
    : null;
  const loadErrorDiagnostic = __DEV__ && loadError
    ? documentLoadErrorDeveloperCopy(loadError, language)
    : null;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) + 4 }]}>
        <TouchableOpacity
          style={styles.headerButton}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={23} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{t('trip.documents.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('trip.documents.subtitle')}</Text>
        </View>
        <TouchableOpacity
          style={[styles.headerButton, styles.headerAddButton]}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel={t('trip.documents.add')}
          onPress={openAddEditor}>
          <Ionicons name="add" size={23} color={theme.colors.white} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.centeredCopy}>{t('trip.documents.loading')}</Text>
        </View>
      ) : loadError ? (
        <View style={styles.centered}>
          <View style={styles.centeredIcon}>
            <Ionicons name="cloud-offline-outline" size={34} color={theme.colors.textMuted} />
          </View>
          <Text style={styles.centeredTitle}>{t('trip.documents.loadErrorTitle')}</Text>
          <Text style={styles.centeredCopy}>{loadErrorCopy}</Text>
          {loadErrorDiagnostic ? (
            <Text style={styles.developmentError}>{loadErrorDiagnostic}</Text>
          ) : null}
          <TouchableOpacity
            style={styles.retryButton}
            accessibilityRole="button"
            onPress={() => void load(false)}>
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 20) + 36 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={theme.colors.primary}
            />
          )}>
          <View style={styles.privacyCard}>
            <View style={styles.privacyIcon}>
              <Ionicons name="lock-closed" size={15} color={theme.colors.secondary} />
            </View>
            <Text style={styles.privacyText}>{t('trip.documents.privateHint')}</Text>
          </View>

          {documents.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
              contentContainerStyle={styles.filterContent}>
              {(['all', ...TRIP_DOCUMENT_CATEGORIES] as CategoryFilter[]).map((category) => {
                const selected = categoryFilter === category;
                return (
                  <TouchableOpacity
                    key={category}
                    style={[styles.filterChip, selected && styles.filterChipActive]}
                    activeOpacity={0.82}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setCategoryFilter(category)}>
                    <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                      {category === 'all'
                        ? t('trip.documents.filterAll')
                        : t(CATEGORY_LABEL_KEYS[category])}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          {documents.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="documents-outline" size={38} color={theme.colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>{t('trip.documents.emptyTitle')}</Text>
              <Text style={styles.emptyCopy}>{t('trip.documents.emptyBody')}</Text>
              <TouchableOpacity
                style={styles.emptyButton}
                activeOpacity={0.88}
                accessibilityRole="button"
                onPress={openAddEditor}>
                <Ionicons name="add" size={18} color={theme.colors.white} />
                <Text style={styles.emptyButtonText}>{t('trip.documents.add')}</Text>
              </TouchableOpacity>
            </View>
          ) : filteredDocuments.length === 0 ? (
            <View style={styles.filteredEmpty}>
              <Ionicons name="filter-outline" size={28} color={theme.colors.textMuted} />
              <Text style={styles.filteredEmptyText}>{t('trip.documents.filterEmpty')}</Text>
            </View>
          ) : (
            <View style={styles.documentList}>
              {filteredDocuments.map((document) => (
                <DocumentCard
                  key={document.id}
                  document={document}
                  language={language}
                  opening={openingId === document.id}
                  deleting={deletingId === document.id}
                  onOpen={() => void openDocument(document)}
                  onEdit={() => openEditEditor(document)}
                  onDelete={() => confirmDelete(document)}
                  onAnalyze={
                    glunoDocuments?.available
                      && isAnalysableDocument(document.fileType, glunoDocuments.supportedFormats)
                      ? () => setAnalyzingDocumentId(document.id)
                      : null
                  }
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <ModalSheet
        visible={editorVisible}
        height={getEditorHeight(windowHeight, insets.top)}
        onClose={closeEditor}>
        <KeyboardAvoidingView
          style={styles.editorFlex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheetHandle} />
          <View style={styles.editorHeader}>
            <View style={styles.editorHeaderCopy}>
              <Text style={styles.editorEyebrow}>{t('trip.documents.walletEyebrow')}</Text>
              <Text style={styles.editorTitle}>
                {editingDocument ? t('trip.documents.edit') : t('trip.documents.add')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              onPress={closeEditor}>
              <Ionicons name="close" size={21} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.editorContent,
              { paddingBottom: Math.max(insets.bottom, 16) + 24 },
            ]}>
            {!editingDocument ? (
              <>
                <Text style={styles.fieldLabel}>{t('trip.documents.sourceLabel')}</Text>
                <View style={styles.sourceRow}>
                  <SourceButton
                    icon="document-attach-outline"
                    label={t('trip.documents.chooseFile')}
                    onPress={() => void pickFile()}
                  />
                  <SourceButton
                    icon="images-outline"
                    label={t('trip.documents.chooseImage')}
                    onPress={() => void pickImage()}
                  />
                  <SourceButton
                    icon="camera-outline"
                    label={t('trip.documents.takePhoto')}
                    onPress={() => void takePhoto()}
                  />
                </View>
                <Text style={styles.sourceHint}>
                  {t('trip.documents.fileHint', { size: TRIP_DOCUMENT_MAX_BYTES / 1024 / 1024 })}
                </Text>
                {pickedFile ? (
                  <View style={styles.pickedFile}>
                    <View style={styles.pickedFileIcon}>
                      <Ionicons
                        name={pickedFile.mimeType === 'application/pdf' ? 'document-text' : 'image'}
                        size={19}
                        color={theme.colors.primary}
                      />
                    </View>
                    <View style={styles.pickedFileCopy}>
                      <Text style={styles.pickedFileName} numberOfLines={1}>{pickedFile.name}</Text>
                      <Text style={styles.pickedFileMeta}>
                        {fileTypeLabel(pickedFile.mimeType)}
                        {typeof pickedFile.size === 'number' ? ` · ${formatFileSize(pickedFile.size)}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.remove')}
                      onPress={() => setPickedFile(null)}>
                      <Ionicons name="close-circle" size={21} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            ) : null}

            <Text style={styles.fieldLabel}>{t('trip.documents.name')}</Text>
            <TextInput
              style={styles.input}
              value={draft.name}
              onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
              placeholder={t('trip.documents.namePlaceholder')}
              placeholderTextColor={theme.colors.placeholderText}
              keyboardAppearance={theme.keyboardAppearance}
              maxLength={120}
              autoCapitalize="sentences"
              returnKeyType="next"
            />

            <Text style={styles.fieldLabel}>{t('trip.documents.category')}</Text>
            <View style={styles.categoryGrid}>
              {TRIP_DOCUMENT_CATEGORIES.map((category) => {
                const selected = draft.category === category;
                return (
                  <TouchableOpacity
                    key={category}
                    style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setDraft((current) => ({ ...current, category }))}>
                    <Ionicons
                      name={CATEGORY_ICONS[category]}
                      size={15}
                      color={selected ? theme.colors.white : theme.colors.textSecondary}
                    />
                    <Text
                      style={[styles.categoryChipText, selected && styles.categoryChipTextSelected]}
                      numberOfLines={1}>
                      {t(CATEGORY_LABEL_KEYS[category])}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.fieldHeadingRow}>
              <Text style={styles.fieldLabel}>{t('trip.documents.date')}</Text>
              <Text style={styles.optionalLabel}>{t('trip.documents.optional')}</Text>
            </View>
            <TouchableOpacity
              style={styles.selector}
              activeOpacity={0.8}
              accessibilityRole="button"
              onPress={() => setDatePickerOpen(true)}>
              <Ionicons name="calendar-outline" size={18} color={theme.colors.textMeta} />
              <Text style={[styles.selectorText, !draft.date && styles.selectorPlaceholder]}>
                {draft.date
                  ? formatDocumentDate(draft.date, language)
                  : t('trip.documents.selectDate')}
              </Text>
              {draft.date ? (
                <TouchableOpacity
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('trip.documents.clearDate')}
                  onPress={() => {
                    setDatePickerOpen(false);
                    setDraft((current) => ({ ...current, date: null }));
                  }}>
                  <Ionicons name="close-circle" size={19} color={theme.colors.textMuted} />
                </TouchableOpacity>
              ) : (
                <Ionicons name="chevron-down" size={17} color={theme.colors.textMuted} />
              )}
            </TouchableOpacity>
            {datePickerOpen ? (
              <View style={styles.datePickerWrap}>
                <DateTimePicker
                  value={draft.date ? dateFromIso(draft.date) : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={handleDateChange}
                  themeVariant={theme.isDark ? 'dark' : 'light'}
                />
                {Platform.OS === 'ios' ? (
                  <TouchableOpacity
                    style={styles.dateDone}
                    onPress={() => setDatePickerOpen(false)}>
                    <Text style={styles.dateDoneText}>{t('common.done')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            <View style={styles.fieldHeadingRow}>
              <Text style={styles.fieldLabel}>{t('trip.documents.activity')}</Text>
              <Text style={styles.optionalLabel}>{t('trip.documents.optional')}</Text>
            </View>
            <TouchableOpacity
              style={styles.selector}
              activeOpacity={0.8}
              accessibilityRole="button"
              onPress={() => setActivityPickerOpen(true)}>
              <Ionicons name="sparkles-outline" size={18} color={theme.colors.textMeta} />
              <Text
                style={[styles.selectorText, !selectedActivityLabel && styles.selectorPlaceholder]}
                numberOfLines={1}>
                {selectedActivityLabel || t('trip.documents.noActivity')}
              </Text>
              <Ionicons name="chevron-down" size={17} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.fieldHeadingRow}>
              <Text style={styles.fieldLabel}>{t('trip.documents.bookingReference')}</Text>
              <Text style={styles.optionalLabel}>{t('trip.documents.optional')}</Text>
            </View>
            <TextInput
              style={styles.input}
              value={draft.bookingReference}
              onChangeText={(bookingReference) => setDraft((current) => ({ ...current, bookingReference }))}
              placeholder={t('trip.documents.bookingReferencePlaceholder')}
              placeholderTextColor={theme.colors.placeholderText}
              keyboardAppearance={theme.keyboardAppearance}
              maxLength={200}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="next"
            />

            <View style={styles.fieldHeadingRow}>
              <Text style={styles.fieldLabel}>{t('trip.documents.note')}</Text>
              <Text style={styles.optionalLabel}>{t('trip.documents.optional')}</Text>
            </View>
            <TextInput
              style={[styles.input, styles.noteInput]}
              value={draft.note}
              onChangeText={(note) => setDraft((current) => ({ ...current, note }))}
              placeholder={t('trip.documents.notePlaceholder')}
              placeholderTextColor={theme.colors.placeholderText}
              keyboardAppearance={theme.keyboardAppearance}
              maxLength={1000}
              multiline
              textAlignVertical="top"
            />

            {editorErrorText ? (
              <View style={styles.formError}>
                <Ionicons name="alert-circle-outline" size={17} color={theme.colors.error} />
                <Text style={styles.formErrorText}>{editorErrorText}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.saveButton,
                (!draft.name.trim() || (!editingDocument && !pickedFile) || submitting) && styles.saveButtonDisabled,
              ]}
              activeOpacity={0.88}
              accessibilityRole="button"
              disabled={!draft.name.trim() || (!editingDocument && !pickedFile) || submitting}
              onPress={() => void submitEditor()}>
              {submitting ? (
                <>
                  <ActivityIndicator size="small" color={theme.colors.white} />
                  <Text style={styles.saveButtonText}>
                    {editingDocument
                      ? t('trip.documents.saving')
                      : t('trip.documents.uploading')}
                  </Text>
                </>
              ) : (
                <Text style={styles.saveButtonText}>
                  {editingDocument ? t('common.save') : t('trip.documents.add')}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </ModalSheet>

      <Modal
        visible={activityPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setActivityPickerOpen(false)}>
        <View style={styles.pickerBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setActivityPickerOpen(false)} />
          <View style={[styles.activitySheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.activitySheetHeader}>
              <Text style={styles.activitySheetTitle}>{t('trip.documents.chooseActivity')}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
                onPress={() => setActivityPickerOpen(false)}>
                <Ionicons name="close" size={21} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <ActivityOption
                label={t('trip.documents.noActivity')}
                selected={!draft.activityId}
                onPress={() => {
                  setDraft((current) => ({ ...current, activityId: null }));
                  setActivityPickerOpen(false);
                }}
              />
              {activities.map((activity) => (
                <ActivityOption
                  key={activity.id}
                  label={activity.title?.trim() || t('trip.documents.untitledActivity')}
                  meta={activity.date}
                  selected={draft.activityId === activity.id}
                  onPress={() => {
                    setDraft((current) => ({ ...current, activityId: activity.id }));
                    setActivityPickerOpen(false);
                  }}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Opt-in, per document, and closing it stops the polling. Nothing is
          analysed on upload or in the background. */}
      <GlunoDocumentAnalysisSheet
        documentId={analyzingDocumentId}
        visible={analyzingDocumentId != null}
        onClose={() => setAnalyzingDocumentId(null)}
      />
    </View>
  );
}

function DocumentCard({
  document,
  language,
  opening,
  deleting,
  onOpen,
  onEdit,
  onDelete,
  onAnalyze,
}: {
  document: TripDocument;
  language: 'en' | 'sv';
  opening: boolean;
  deleting: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /**
   * Null when Gluno analysis is off, unconfigured, or this format cannot be
   * read. A button that always fails is worse than no button.
   */
  onAnalyze?: (() => void) | null;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const isImage = document.fileType.startsWith('image/');

  return (
    <View style={styles.documentCard}>
      <TouchableOpacity
        style={styles.documentMain}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel={t('trip.documents.openAccessibility', { name: document.name })}
        onPress={onOpen}>
        <View style={styles.documentIcon}>
          <Ionicons
            name={isImage ? 'image-outline' : 'document-text-outline'}
            size={23}
            color={theme.colors.primary}
          />
          <View style={styles.categoryMiniIcon}>
            <Ionicons name={CATEGORY_ICONS[document.category]} size={9} color={theme.colors.white} />
          </View>
        </View>
        <View style={styles.documentCopy}>
          <Text style={styles.documentName} numberOfLines={2}>{document.name}</Text>
          <Text style={styles.documentCategory}>{t(CATEGORY_LABEL_KEYS[document.category])}</Text>
          <View style={styles.documentMetaRow}>
            {document.date ? (
              <>
                <Text style={styles.documentMeta}>{formatDocumentDate(document.date, language)}</Text>
                <Text style={styles.metaDot}>·</Text>
              </>
            ) : null}
            <Text style={styles.documentMeta}>{fileTypeLabel(document.fileType)}</Text>
            {typeof document.fileSize === 'number' ? (
              <>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.documentMeta}>{formatFileSize(document.fileSize)}</Text>
              </>
            ) : null}
          </View>
          <Text style={styles.documentUploader} numberOfLines={1}>
            {t('trip.documents.addedBy', { name: document.createdByName })}
          </Text>
          {document.activityTitle ? (
            <View style={styles.linkedActivity}>
              <Ionicons name="sparkles-outline" size={11} color={theme.colors.secondary} />
              <Text style={styles.linkedActivityText} numberOfLines={1}>{document.activityTitle}</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>

      <View style={styles.documentActions}>
        {onAnalyze ? (
          <TouchableOpacity
            style={styles.iconAction}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('gluno.documents.action')}
            onPress={onAnalyze}>
            <Ionicons name="sparkles-outline" size={17} color={theme.colors.primary} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.openButton}
          activeOpacity={0.84}
          accessibilityRole="button"
          onPress={onOpen}>
          {opening ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <Ionicons name="open-outline" size={16} color={theme.colors.primary} />
          )}
          <Text style={styles.openButtonText}>{t('common.open')}</Text>
        </TouchableOpacity>
        {document.canEdit ? (
          <>
            <TouchableOpacity
              style={styles.iconAction}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('trip.documents.editAccessibility', { name: document.name })}
              onPress={onEdit}>
              <Ionicons name="create-outline" size={17} color={theme.colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconAction}
              activeOpacity={0.8}
              disabled={deleting}
              accessibilityRole="button"
              accessibilityLabel={t('trip.documents.deleteAccessibility', { name: document.name })}
              onPress={onDelete}>
              {deleting ? (
                <ActivityIndicator size="small" color={theme.colors.error} />
              ) : (
                <Ionicons name="trash-outline" size={17} color={theme.colors.error} />
              )}
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </View>
  );
}

function SourceButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <TouchableOpacity
      style={styles.sourceButton}
      activeOpacity={0.82}
      accessibilityRole="button"
      onPress={onPress}>
      <View style={styles.sourceButtonIcon}>
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
      </View>
      <Text style={styles.sourceButtonText} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

function ActivityOption({
  label,
  meta,
  selected,
  onPress,
}: {
  label: string;
  meta?: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <TouchableOpacity
      style={[styles.activityOption, selected && styles.activityOptionSelected]}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}>
      <View style={styles.activityOptionIcon}>
        <Ionicons name="sparkles-outline" size={16} color={theme.colors.secondary} />
      </View>
      <View style={styles.activityOptionCopy}>
        <Text style={styles.activityOptionText} numberOfLines={2}>{label}</Text>
        {meta ? <Text style={styles.activityOptionMeta}>{meta}</Text> : null}
      </View>
      {selected ? <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} /> : null}
    </TouchableOpacity>
  );
}

function sortDocuments(documents: TripDocument[]): TripDocument[] {
  return [...documents].sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
}

function extensionForMimeType(mimeType?: string | null): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function documentErrorTranslationKey(
  code: TripDocumentErrorCode,
  hasFile: boolean,
): string {
  if (isDocumentPermissionError(code)) return 'trip.documents.permissionError';
  if (code === 'too_large') return 'trip.documents.tooLarge';
  if (code === 'invalid_type') return 'trip.documents.invalidType';
  if (code === 'not_found' && !hasFile) return 'trip.documents.fileRequired';
  return 'trip.documents.saveError';
}

function isDocumentPermissionError(code: TripDocumentErrorCode): boolean {
  return code === 'permission' || code === 'authentication' || code === 'forbidden';
}

function toDocumentLoadFailure(error: unknown): DocumentLoadFailure {
  if (error instanceof TripDocumentApiError && isTripDocumentLoadErrorCode(error.code)) {
    return { code: error.code, status: error.status };
  }
  return { code: 'request_failed', status: 0 };
}

function documentLoadErrorUserCopy(
  code: TripDocumentLoadErrorCode,
  language: string,
): string {
  const isSwedish = language === 'sv';
  switch (code) {
    case 'authentication':
      return isSwedish
        ? 'Din session har gått ut. Logga in igen och försök på nytt.'
        : 'Your session has expired. Sign in again and retry.';
    case 'forbidden':
      return isSwedish
        ? 'Du har inte behörighet till den här resans dokument.'
        : "You don't have access to this trip's documents.";
    case 'endpoint_missing':
      return isSwedish
        ? 'Documents är inte tillgängligt just nu. Försök igen senare.'
        : "Documents isn't available right now. Please try again later.";
    case 'network':
      return isSwedish
        ? 'Kontrollera anslutningen och försök igen.'
        : 'Check your connection and try again.';
    case 'invalid_route':
      return isSwedish
        ? 'Resan kunde inte öppnas. Gå tillbaka och försök igen.'
        : 'This trip could not be opened. Go back and try again.';
    case 'server':
    case 'parse':
    case 'request_failed':
      return isSwedish
        ? 'Documents kan inte hämtas just nu. Försök igen.'
        : "Documents can't be loaded right now. Please try again.";
  }
}

function documentLoadErrorDeveloperCopy(
  failure: DocumentLoadFailure,
  language: string,
): string {
  const isSwedish = language === 'sv';
  switch (failure.code) {
    case 'authentication':
      return isSwedish
        ? 'Development: 401 — anropet saknade giltig autentisering.'
        : 'Development: 401 — the request was not authenticated.';
    case 'forbidden':
      return isSwedish
        ? 'Development: 403 — servern nekade medlemskap eller åtkomst.'
        : 'Development: 403 — the server denied membership or access.';
    case 'endpoint_missing':
      return isSwedish
        ? 'Development: 404 — Documents-endpointen finns inte på den här servern.'
        : 'Development: 404 — the Documents endpoint is unavailable on this server.';
    case 'network':
      return isSwedish
        ? 'Development: nätverksfel före HTTP-svar.'
        : 'Development: network failure before an HTTP response.';
    case 'server':
      return isSwedish
        ? `Development: serverfel (HTTP ${failure.status}).`
        : `Development: server error (HTTP ${failure.status}).`;
    case 'parse':
      return isSwedish
        ? 'Development: servern returnerade ett ogiltigt Documents-svar.'
        : 'Development: the server returned an invalid Documents response.';
    case 'invalid_route':
      return isSwedish
        ? 'Development: route-parametern är inte ett giltigt UUID.'
        : 'Development: the route parameter is not a valid UUID.';
    case 'request_failed':
      if (failure.status > 0) {
        return isSwedish
          ? `Development: HTTP ${failure.status} (ANROPSFEL).`
          : `Development: HTTP ${failure.status} (REQUEST_ERROR).`;
      }
      return isSwedish
        ? 'Development: ANROPSFEL före ett användbart svar.'
        : 'Development: REQUEST_ERROR before a usable response.';
  }
}

function fileTypeLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType === 'image/jpeg') return 'JPEG';
  if (mimeType === 'image/png') return 'PNG';
  if (mimeType === 'image/webp') return 'WebP';
  return mimeType.split('/').pop()?.toUpperCase() || 'FILE';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function dateFromIso(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(year, Math.max(0, month - 1), day, 12);
}

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDocumentDate(iso: string, language: 'en' | 'sv'): string {
  const date = dateFromIso(iso);
  if (!Number.isFinite(date.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat(language === 'sv' ? 'sv-SE' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function getEditorHeight(windowHeight: number, topInset: number): number {
  // Keep the sheet below the top safe area while adapting to compact phones
  // and landscape instead of assuming one fixed device height.
  return Math.max(280, Math.min(windowHeight * 0.9, windowHeight - Math.max(topInset, 8)));
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderPrimary,
    backgroundColor: theme.colors.bgPrimary,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderPrimary,
  },
  headerAddButton: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  headerCopy: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.45,
  },
  headerSubtitle: {
    color: theme.colors.textMeta,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  centeredIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgLight,
    marginBottom: 18,
  },
  centeredTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  centeredCopy: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 9,
    maxWidth: 280,
  },
  developmentError: {
    color: theme.colors.textMeta,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 10,
    maxWidth: 300,
  },
  retryButton: {
    marginTop: 20,
    minHeight: 44,
    paddingHorizontal: 22,
    borderRadius: RADIUS.circle,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: theme.colors.primaryLight12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderPrimary,
  },
  privacyIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceElevated,
  },
  privacyText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  filterScroll: {
    marginHorizontal: -SPACING.xl,
    marginTop: SPACING.lg,
  },
  filterContent: {
    paddingHorizontal: SPACING.xl,
    gap: 8,
  },
  filterChip: {
    borderRadius: RADIUS.circle,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderPrimary,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterChipText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: theme.colors.white,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 74,
    paddingHorizontal: 18,
  },
  emptyIcon: {
    width: 94,
    height: 94,
    borderRadius: 47,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primaryLight12,
    marginBottom: 24,
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  emptyCopy: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 290,
    marginTop: 10,
  },
  emptyButton: {
    marginTop: 24,
    minHeight: 48,
    borderRadius: RADIUS.circle,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    ...theme.shadows.medium,
  },
  emptyButtonText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  filteredEmpty: {
    alignItems: 'center',
    paddingVertical: 72,
    gap: 12,
  },
  filteredEmptyText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  documentList: {
    gap: 12,
    marginTop: SPACING.lg,
  },
  documentCard: {
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 1,
    borderColor: theme.colors.borderPrimary,
    overflow: 'hidden',
    ...theme.shadows.subtle,
  },
  documentMain: {
    flexDirection: 'row',
    gap: 13,
    padding: 15,
  },
  documentIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primaryLight12,
  },
  categoryMiniIcon: {
    position: 'absolute',
    right: -4,
    bottom: -3,
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.secondary,
    borderWidth: 2,
    borderColor: theme.colors.surfaceElevated,
  },
  documentCopy: {
    flex: 1,
    minWidth: 0,
  },
  documentName: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  documentCategory: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 3,
  },
  documentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 7,
  },
  documentMeta: {
    color: theme.colors.textMeta,
    fontSize: 11,
    fontWeight: '600',
  },
  metaDot: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginHorizontal: 5,
  },
  documentUploader: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 5,
  },
  linkedActivity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 7,
  },
  linkedActivityText: {
    flex: 1,
    color: theme.colors.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  documentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderPrimary,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  openButton: {
    flex: 1,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 12,
    backgroundColor: theme.colors.primaryLight12,
  },
  openButtonText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  iconAction: {
    width: 38,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgLight,
  },
  editorFlex: {
    flex: 1,
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.sheetHandle,
    alignSelf: 'center',
    marginTop: 9,
    marginBottom: 12,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderPrimary,
  },
  editorHeaderCopy: {
    flex: 1,
  },
  editorEyebrow: {
    ...TYPOGRAPHY.eyebrow,
    color: theme.colors.primary,
  },
  editorTitle: {
    color: theme.colors.textPrimary,
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -0.7,
    marginTop: 3,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgLight,
  },
  editorContent: {
    paddingTop: 16,
  },
  fieldLabel: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 16,
    marginBottom: 8,
  },
  fieldHeadingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 7,
  },
  optionalLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  sourceRow: {
    flexDirection: 'row',
    gap: 9,
  },
  sourceButton: {
    flex: 1,
    minHeight: 92,
    borderRadius: 16,
    paddingHorizontal: 7,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgLight,
    borderWidth: 1,
    borderColor: theme.colors.borderPrimary,
  },
  sourceButtonIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    marginBottom: 7,
  },
  sourceButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  sourceHint: {
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  pickedFile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 14,
    padding: 11,
    marginTop: 12,
    backgroundColor: theme.colors.primaryLight12,
  },
  pickedFileIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceElevated,
  },
  pickedFileCopy: {
    flex: 1,
    minWidth: 0,
  },
  pickedFileName: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  pickedFileMeta: {
    color: theme.colors.textMeta,
    fontSize: 10,
    marginTop: 2,
  },
  input: {
    minHeight: 48,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: theme.colors.bgLightest,
    borderWidth: 1,
    borderColor: theme.colors.borderInput,
    color: theme.colors.textPrimary,
    fontSize: 14,
  },
  noteInput: {
    minHeight: 102,
    lineHeight: 20,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    width: '48%',
    minHeight: 40,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: 13,
    backgroundColor: theme.colors.bgLight,
    borderWidth: 1,
    borderColor: theme.colors.borderPrimary,
  },
  categoryChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  categoryChipText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  categoryChipTextSelected: {
    color: theme.colors.white,
  },
  selector: {
    minHeight: 48,
    borderRadius: 15,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.bgLightest,
    borderWidth: 1,
    borderColor: theme.colors.borderInput,
  },
  selectorText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  selectorPlaceholder: {
    color: theme.colors.placeholderText,
    fontWeight: '500',
  },
  datePickerWrap: {
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: theme.colors.bgLight,
  },
  dateDone: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dateDoneText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  formError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 13,
    padding: 11,
    marginTop: 16,
    backgroundColor: theme.colors.errorLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.errorBorder,
  },
  formErrorText: {
    flex: 1,
    color: theme.colors.error,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  saveButton: {
    minHeight: 50,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: theme.colors.primary,
    marginTop: 20,
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  saveButtonText: {
    color: theme.colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  pickerBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.isDark ? 'rgba(0,0,0,0.6)' : 'rgba(12,14,19,0.3)',
  },
  activitySheet: {
    maxHeight: '72%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: SPACING.xl,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderBottomWidth: 0,
    borderColor: theme.colors.borderPrimary,
  },
  activitySheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  activitySheetTitle: {
    color: theme.colors.textPrimary,
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.45,
  },
  activityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 58,
    borderRadius: 15,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginBottom: 7,
    backgroundColor: theme.colors.bgLight,
    borderWidth: 1,
    borderColor: theme.colors.borderPrimary,
  },
  activityOptionSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight12,
  },
  activityOptionIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceElevated,
  },
  activityOptionCopy: {
    flex: 1,
  },
  activityOptionText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  activityOptionMeta: {
    color: theme.colors.textMeta,
    fontSize: 11,
    marginTop: 2,
  },
});
