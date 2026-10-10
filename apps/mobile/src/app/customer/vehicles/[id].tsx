/**
 * Add/edit vehicle (context.txt §5, Phase 03).
 *
 * One screen for both: `id === 'new'` skips the fetch and posts to
 * `/api/vehicles`; any other `id` loads that vehicle and `PATCH`es it. Same
 * form, same Zod schema (`VehicleRequestSchema`, shared with the backend), so
 * there is only one place the vehicle-number rules are written down.
 */
import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import {
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  VehicleRequestSchema,
  type Vehicle,
  type VehicleRequest,
  type VehicleRequestParsed,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { SectionHeader } from '@/components/section-header';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';
import { applyApiError } from '@/lib/form-errors';

export default function VehicleFormScreen() {
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
  } = useForm<VehicleRequest, unknown, VehicleRequestParsed>({
    resolver: zodResolver(VehicleRequestSchema),
    defaultValues: { number: '', type: 'CAR', makeModel: '' },
  });

  useEffect(() => {
    if (isNew) return;

    let cancelled = false;
    (async () => {
      try {
        const vehicle = await apiRequest<Vehicle>(`/api/vehicles/${id}`);
        if (cancelled) return;
        reset({ number: vehicle.number, type: vehicle.type, makeModel: vehicle.makeModel ?? '' });
      } catch (error) {
        if (cancelled) return;
        setFormError(error instanceof ApiError ? error.message : 'Could not load this vehicle.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, isNew, reset]);

  const onSubmit = async (values: VehicleRequestParsed) => {
    setFormError(null);
    try {
      if (isNew) {
        await apiRequest<Vehicle>('/api/vehicles', { method: 'POST', body: values });
      } else {
        await apiRequest<Vehicle>(`/api/vehicles/${id}`, { method: 'PATCH', body: values });
      }
      router.back();
    } catch (error) {
      setFormError(applyApiError(error, setError));
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'Add vehicle' : 'Edit vehicle' }} />

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

          <SectionHeader title="Vehicle identity" divided={false} />

          <TextField
            control={control}
            name="number"
            label="Vehicle number"
            placeholder="MH04AB1234"
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="next"
          />

          <TextField
            control={control}
            name="makeModel"
            label="Make / model"
            placeholder="Honda Activa"
            autoCapitalize="words"
            hint="Optional — helps tell two vehicles apart."
            returnKeyType="done"
            onSubmitEditing={handleSubmit(onSubmit)}
          />

          <SectionHeader title="Vehicle type" />

          <Controller
            control={control}
            name="type"
            render={({ field: { onChange, value } }) => (
              <View style={styles.row}>
                {VEHICLE_TYPES.map((type) => {
                  const selected = value === type;
                  return (
                    <Pressable
                      key={type}
                      onPress={() => onChange(type)}
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
                        {VEHICLE_TYPE_LABELS[type]}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            )}
          />

          <AppButton
            label={isNew ? 'Add vehicle' : 'Save changes'}
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
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
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
