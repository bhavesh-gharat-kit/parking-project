/**
 * Admin add/edit location (context.txt §3, §6, §23, Phase 04).
 *
 * Same one-screen-for-both pattern as the customer's vehicle form: `id ===
 * 'new'` skips the fetch and posts to `/api/admin/locations`; any other `id`
 * loads that location and `PATCH`es it. Same `ParkingLocationRequestSchema`
 * the backend validates against, so the form and the route handler can never
 * disagree about what a valid location looks like.
 */
import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import {
  ParkingLocationRequestSchema,
  type AdminParkingLocation,
  type ParkingLocationRequest,
  type ParkingLocationRequestParsed,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { SectionHeader } from '@/components/section-header';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';
import { applyApiError } from '@/lib/form-errors';

export default function AdminLocationFormScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { isSubmitting },
  } = useForm<ParkingLocationRequest, unknown, ParkingLocationRequestParsed>({
    resolver: zodResolver(ParkingLocationRequestSchema),
    defaultValues: {
      name: '',
      code: '',
      addressLine: '',
      city: '',
      state: '',
      pincode: '',
      contactPhone: '',
      capacity: '',
      isActive: true,
      upiVpa: '',
      upiQrImageUrl: '',
    },
  });

  useEffect(() => {
    if (isNew) return;

    let cancelled = false;
    (async () => {
      try {
        const location = await apiRequest<AdminParkingLocation>(`/api/admin/locations/${id}`);
        if (cancelled) return;
        reset({
          name: location.name,
          code: location.code,
          addressLine: location.addressLine,
          city: location.city,
          state: location.state,
          pincode: location.pincode ?? '',
          contactPhone: location.contactPhone ?? '',
          capacity: location.capacity == null ? '' : String(location.capacity),
          isActive: location.isActive,
          upiVpa: location.upiVpa ?? '',
          upiQrImageUrl: location.upiQrImageUrl ?? '',
        });
      } catch (error) {
        if (cancelled) return;
        setFormError(error instanceof ApiError ? error.message : 'Could not load this location.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, isNew, reset]);

  const onSubmit = async (values: ParkingLocationRequestParsed) => {
    setFormError(null);
    try {
      if (isNew) {
        await apiRequest<AdminParkingLocation>('/api/admin/locations', {
          method: 'POST',
          body: values,
        });
      } else {
        await apiRequest<AdminParkingLocation>(`/api/admin/locations/${id}`, {
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
      <Stack.Screen options={{ title: isNew ? 'Add location' : 'Edit location' }} />

      {loading ? (
        <View style={[styles.loading, { backgroundColor: theme.background }]}>
          <ActivityIndicator color={theme.text} />
        </View>
      ) : (
        <KeyboardAwareScrollView
          style={[styles.flex, { backgroundColor: theme.background }]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bottomOffset={Spacing.four}
        >
          {formError ? (
            <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
              <Ionicons name="alert-circle" size={18} color={theme.danger} />
              <ThemedText type="small" themeColor="danger" style={styles.bannerText}>
                {formError}
              </ThemedText>
            </View>
          ) : null}

          <SectionHeader title="Location details" divided={false} />

          <TextField
              control={control}
              name="name"
              label="Location name"
              placeholder="Kalyan"
              autoCapitalize="words"
              returnKeyType="next"
            />

            <TextField
              control={control}
              name="code"
              label="Branch code"
              placeholder="KLY"
              autoCapitalize="characters"
              autoCorrect={false}
              hint="2-8 letters/numbers, used as the booking-number prefix."
              returnKeyType="next"
            />

            <TextField
              control={control}
              name="addressLine"
              label="Address"
              placeholder="Station Road, near Kalyan Railway Station"
              autoCapitalize="sentences"
              returnKeyType="next"
            />

            <TextField
              control={control}
              name="city"
              label="City"
              placeholder="Kalyan"
              autoCapitalize="words"
              returnKeyType="next"
            />

            <TextField
              control={control}
              name="state"
              label="State"
              placeholder="Maharashtra"
              autoCapitalize="words"
              returnKeyType="next"
            />

            <TextField
              control={control}
              name="pincode"
              label="Pincode"
              placeholder="421301"
              keyboardType="number-pad"
              hint="Optional"
              returnKeyType="next"
            />

            <TextField
              control={control}
              name="contactPhone"
              label="Contact number"
              placeholder="98765 43210"
              keyboardType="phone-pad"
              hint="Optional"
              returnKeyType="next"
            />

            <TextField
              control={control}
              name="capacity"
              label="Capacity"
              placeholder="e.g. 50"
              keyboardType="number-pad"
              hint="Optional headcount, shown on the admin dashboard."
              returnKeyType="next"
            />

            <SectionHeader title="UPI payment" />

            <TextField
              control={control}
              name="upiVpa"
              label="UPI ID"
              placeholder="business@okhdfcbank"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              hint="Optional — shown on the customer's UPI payment screen (§11)."
              returnKeyType="next"
            />

            <TextField
              control={control}
              name="upiQrImageUrl"
              label="UPI QR code image URL"
              placeholder="https://example.com/kalyan-upi-qr.png"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              hint="Optional — a static QR image the app displays for UPI payment."
              returnKeyType="done"
              onSubmitEditing={handleSubmit(onSubmit)}
            />

            <SectionHeader title="Status" />

            <View style={styles.field}>
              <Controller
                control={control}
                name="isActive"
                render={({ field: { onChange, value } }) => (
                  <View style={styles.row}>
                    {[
                      { label: 'Active', active: true },
                      { label: 'Inactive', active: false },
                    ].map((option) => {
                      const selected = value === option.active;
                      return (
                        <Pressable
                          key={option.label}
                          onPress={() => onChange(option.active)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
                              borderColor: selected ? theme.primary : theme.border,
                            },
                          ]}
                        >
                          <ThemedText type="small" style={selected ? { color: theme.primary } : undefined}>
                            {option.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              />
              <ThemedText type="small" themeColor="textSecondary">
                Inactive locations no longer appear in the customer app.
              </ThemedText>
            </View>

            <AppButton
              label={isNew ? 'Add location' : 'Save changes'}
              onPress={handleSubmit(onSubmit)}
              loading={isSubmitting}
              disabled={isSubmitting}
            />
        </KeyboardAwareScrollView>
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
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.control,
    borderWidth: 1,
    padding: Spacing.three,
  },
  bannerText: { flex: 1 },
});
