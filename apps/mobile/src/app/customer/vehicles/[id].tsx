/**
 * Add/edit vehicle (context.txt §5, Phase 03).
 *
 * One screen for both: `id === 'new'` skips the fetch and posts to
 * `/api/vehicles`; any other `id` loads that vehicle and `PATCH`es it. Same
 * form, same Zod schema (`VehicleRequestSchema`, shared with the backend), so
 * there is only one place the vehicle-number rules are written down.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  VehicleRequestSchema,
  type Vehicle,
  type VehicleRequest,
  type VehicleRequestParsed,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
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

            <TextField
              control={control}
              name="number"
              label="Vehicle number"
              placeholder="MH04AB1234"
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="next"
            />

            <View style={styles.field}>
              <ThemedText type="smallBold">Vehicle type</ThemedText>
              <Controller
                control={control}
                name="type"
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
              name="makeModel"
              label="Make / model"
              placeholder="Honda Activa"
              autoCapitalize="words"
              hint="Optional — helps tell two vehicles apart."
              returnKeyType="done"
              onSubmitEditing={handleSubmit(onSubmit)}
            />

            <AppButton
              label={isNew ? 'Add vehicle' : 'Save changes'}
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
