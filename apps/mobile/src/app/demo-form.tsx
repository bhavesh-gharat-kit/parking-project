/**
 * Proves the form stack works end to end before any real form depends on it:
 * React Hook Form → `@hookform/resolvers/zod` → a Zod schema imported from
 * `@parking/shared`.
 *
 * That last link is the point of the screen. The schema here
 * (`DemoVehicleFormSchema`) is the same module the API validates its request
 * bodies against, using the same primitives Phase 03's real vehicle form will
 * use — so this screen also demonstrates that the shared-package plumbing
 * (Metro `watchFolders`, workspace resolution) actually resolves at runtime and
 * not just in the type checker.
 *
 * Delete this screen once Phase 03 ships the real vehicle form.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import {
  DemoVehicleFormSchema,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  formatInr,
  type DemoVehicleFormParsed,
  type DemoVehicleFormValues,
} from '@parking/shared';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function DemoFormScreen() {
  const theme = useTheme();
  const [submitted, setSubmitted] = useState<DemoVehicleFormParsed | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DemoVehicleFormValues, unknown, DemoVehicleFormParsed>({
    resolver: zodResolver(DemoVehicleFormSchema),
    defaultValues: {
      ownerName: '',
      phone: '',
      vehicleNumber: '',
      vehicleType: 'BIKE',
    },
  });

  const onSubmit = (values: DemoVehicleFormParsed) => {
    // No API call — Phase 03 owns the real endpoint. Showing the *parsed* values
    // is the interesting part: the plate arrives upper-cased and unspaced and the
    // phone arrives without its +91, because the shared schema transformed them.
    setSubmitted(values);
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <ThemedText themeColor="textSecondary" type="small">
        Type a messy plate like &quot;mh 04-ab 1234&quot; and a phone like &quot;+91 98765
        43210&quot;, then submit: the parsed output below comes back normalised by the shared
        Zod schema the backend also uses.
      </ThemedText>

      <Field label="Owner name" error={errors.ownerName?.message}>
        <Controller
          control={control}
          name="ownerName"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              placeholder="Ramesh Patil"
              placeholderTextColor={theme.textSecondary}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              autoCapitalize="words"
            />
          )}
        />
      </Field>

      <Field label="Mobile number" error={errors.phone?.message}>
        <Controller
          control={control}
          name="phone"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              placeholder="98765 43210"
              placeholderTextColor={theme.textSecondary}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              keyboardType="phone-pad"
            />
          )}
        />
      </Field>

      <Field label="Vehicle number" error={errors.vehicleNumber?.message}>
        <Controller
          control={control}
          name="vehicleNumber"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              placeholder="MH04AB1234"
              placeholderTextColor={theme.textSecondary}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          )}
        />
      </Field>

      <Field label="Vehicle type" error={errors.vehicleType?.message}>
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
      </Field>

      <Pressable
        onPress={handleSubmit(onSubmit)}
        disabled={isSubmitting}
        style={[styles.submit, { backgroundColor: theme.backgroundSelected }]}
      >
        <ThemedText type="smallBold">Validate</ThemedText>
      </Pressable>

      {submitted ? (
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">Parsed output</ThemedText>
          <ThemedText type="code" themeColor="textSecondary">
            {JSON.stringify(submitted, null, 2)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Money helper sanity check: {formatInr(7050)} and {formatInr(150000)}
          </ThemedText>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      {children}
      {error ? (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: 999,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  submit: {
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  card: {
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  error: {
    color: '#d92d20',
  },
});
