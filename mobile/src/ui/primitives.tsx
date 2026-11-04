// Themed UI primitives — the design tokens applied to RN components so
// every screen shares the web app's visual language (dark slate surfaces,
// #38bdf8 accent, uppercase micro labels).
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { font, palette, radius, space } from "../theme/tokens";

export function Screen({
  children,
  scroll = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
      ) : (
        <View style={styles.content}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type TxtVariant = "title" | "section" | "body" | "caption" | "micro" | "mono";

const TXT_STYLES: Record<TxtVariant, TextStyle> = {
  title: { fontSize: font.title, fontWeight: "800", color: palette.foreground },
  section: {
    fontSize: font.sectionTitle,
    fontWeight: "800",
    color: palette.foreground,
  },
  body: { fontSize: font.body, color: palette.body },
  caption: { fontSize: font.caption, color: palette.muted },
  micro: {
    fontSize: font.micro,
    fontWeight: "600",
    color: palette.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  mono: {
    fontSize: font.caption,
    fontFamily: "monospace",
    color: palette.body,
  },
};

export function Txt({
  variant = "body",
  children,
  style,
  color,
}: {
  variant?: TxtVariant;
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  color?: string;
}) {
  return <Text style={[TXT_STYLES[variant], color ? { color } : null, style]}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
}) {
  const palette_ =
    variant === "primary"
      ? { bg: palette.accent, fg: palette.onAccent }
      : variant === "danger"
        ? { bg: "transparent", fg: palette.danger }
        : { bg: "transparent", fg: palette.accent };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette_.bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant !== "primary" && { borderWidth: 1, borderColor: palette_.fg },
      ]}
    >
      <Text style={{ color: palette_.fg, fontWeight: "700", fontSize: font.body }}>{title}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={palette.muted}
      {...props}
      style={[styles.field, props.style]}
    />
  );
}

export function Pill({ label, color }: { label: string; color?: string }) {
  return (
    <View style={[styles.pill, { borderColor: (color ?? palette.violet) + "66" }]}>
      <Text
        style={{
          color: color ?? palette.violet,
          fontSize: font.micro,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function Spinner() {
  return <ActivityIndicator color={palette.accent} />;
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Card style={{ borderColor: palette.danger + "55" }}>
      <Txt variant="body" color={palette.danger}>
        {message}
      </Txt>
    </Card>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Txt variant="micro" style={{ marginTop: space[5], marginBottom: space[2] }}>
      {children}
    </Txt>
  );
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: space[2] }}>
      <Txt variant="micro">{label}</Txt>
      <Txt variant="body">{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: { padding: space[4], gap: space[3], paddingBottom: space[12] },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: space[4],
  },
  button: {
    borderRadius: radius.md,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    alignItems: "center",
  },
  field: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    color: palette.foreground,
    padding: space[3],
    fontSize: font.body,
  },
  pill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space[3],
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
});
