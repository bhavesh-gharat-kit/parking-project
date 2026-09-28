/**
 * Admin add/edit rate (context.txt §7, §24, Phase 04).
 *
 * `rateId === 'new'` skips the fetch and posts to
 * `/api/admin/locations/:id/rates`; any other `rateId` loads that rate and
 * `PATCH`es it. `label` is not a field here — the backend derives it from
 * `durationMinutes` with the same `formatDuration` shown live below the
 * duration input, so the preview always matches what the customer will see.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  formatDuration,
  paiseToRupees,
  ParkingRateRequestSchema,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  type AdminParkingRate,
  type ParkingRateRequest,
  type ParkingRateRequestParsed,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';
import { applyApiError } from '@/lib/form-errors';

export default function AdminRateFormScreen() {
  const theme = useTheme();
  const { id: locationId, rateId } = useLocalSearchParams<{ id: string; rateId: string }>();
  const isNew = rateId === 'new';

  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { isSubmitting },
  } = useForm<ParkingRateRequest, unknown, ParkingRateRequestParsed>({
    resolver: zodResolver(ParkingRateRequestSchema),
    defaultValues: {
      vehicleType: 'CAR',
      durationMinutes: 60,
      priceInRupees: '' as unknown as number,
      sortOrder: 0,
      isActive: true,
    },
  });

  const durationMinutes = useWatch({ control, name: 'durationMinutes' });
  const durationPreview =
    typeof durationMinutes === 'number' && durationMinutes > 0
      ? formatDuration(durationMinutes)
      : typeof durationMinutes === 'string' && Number(durationMinutes) > 0
        ? formatDuration(Number(durationMinutes))
        : null;

  useEffect(() => {
    if (isNew) return;

    let cancelled = false;
    (async () => {
      try {
        const rate = await apiRequest<AdminParkingRate>(
          `/api/admin/locations/${locationId}/rates/${rateId}`,
        );
        if (cancelled) return;
        reset({
          vehicleType: rate.vehicleType,
          durationMinutes: rate.durationMinutes,
          priceInRupees: paiseToRupees(rate.priceInPaise),
          sortOrder: rate.sortOrder,
          isActive: rate.isActive,
        });
      } catch (error) {
        if (cancelled) return;
        setFormError(error instanceof ApiError ? error.message : 'Could not load this rate.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [locationId, rateId, isNew, reset]);

  const onSubmit = async (values: ParkingRateRequestParsed) => {
    setFormError(null);
    try {
      if (isNew) {
        await apiRequest<AdminParkingRate>(`/api/admin/locations/${locationId}/rates`, {
          method: 'POST',
          body: values,
        });
      } else {
        await apiRequest<AdminParkingRate>(`/api/admin/locations/${locationId}/rates/${rateId}`, {
          method: 'PATCH',
          body: values,
        });
      }
      router.back();
    } catch (error) {
      setFormError(applyApiError(error, setError));
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'Add rate' : 'Edit rate' }} />

      {loading ? (
        <View style={[styles.loading, { backgroundColor: theme.background }]}>
          <ActivityIndicator color={theme.text} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={[styles.flex, { backgroundColor: theme.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {formError ? (
              <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
                <ThemedText type="small" themeColor="danger">
                  {formError}
                </ThemedText>
              </View>
            ) : null}

            <View style={styles.field}>
              <ThemedText type="smallBold">Vehicle type</ThemedText>
              <Controller
                control={control}
                name="vehicleType"
                render={({ field: { onChange, value } }) => (
                  <View style={styles.row}>
                    {VEHICLE_TYPES.map((type) => (
                      <Pressable
                        key={type}
                        onPress={() => onChange(type)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor:
                              value === type ? theme.backgroundSelected : theme.backgroundElement,
                          },
                        ]}
                      >
                        <ThemedText type="small">{VEHICLE_TYPE_LABELS[type]}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                )}
              />
            </View>

            <TextField
              control={control}
              name="durationMinutes"
              label="Duration (minutes)"
              placeholder="60"
              keyboardType="number-pad"
              hint={durationPreview ? `Shown to customers as "${durationPreview}"` : 'e.g. 60, 120, 1440 (full day)'}
              returnKeyType="next"
            />

            <TextField
              control={control}
              name="priceInRupees"
              label="Price (₹)"
              placeholder="70"
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={handleSubmit(onSubmit)}
            />

            <View style={styles.field}>
              <ThemedText type="smallBold">Status</ThemedText>
              <Controller
                control={control}
                name="isActive"
                render={({ field: { onChange, value } }) => (
                  <View style={styles.row}>
                    {[
                      { label: 'Active', active: true },
                      { label: 'Retired', active: false },
                    ].map((option) => (
                      <Pressable
                        key={option.label}
                        onPress={() => onChange(option.active)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor:
                              value === option.active ? theme.backgroundSelected : theme.backgroundElement,
                          },
                        ]}
                      >
                        <ThemedText type="small">{option.label}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                )}
              />
            </View>

            <AppButton
              label={isNew ? 'Add rate' : 'Save changes'}
              onPress={handleSubmit(onSubmit)}
              loading={isSubmitting}
              disabled={isSubmitting}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  field: { gap: Spacing.one },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: 999,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  banner: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
});
