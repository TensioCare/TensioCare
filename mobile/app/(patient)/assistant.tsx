import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState, type ElementRef } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Card, Notice } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { ApiError, insightsApi } from '@/lib/api';

type Message = {
  id: string;
  role: 'patient' | 'assistant';
  text: string;
};

const SUGGESTIONS = [
  'What is my latest reading?',
  'Am I meeting my targets?',
  'How do I measure correctly?',
  'What are warning signs?',
];

let messageCounter = 0;
function nextId(): string {
  messageCounter += 1;
  return `m-${messageCounter}`;
}

const WELCOME: Message = {
  id: nextId(),
  role: 'assistant',
  text: "Hi! Ask me anything about your blood pressure, your targets or your measurement routine. I only give general guidance — I don't replace your doctor.",
};

export default function AssistantScreen() {
  const router = useRouter();
  const scrollRef = useRef<ElementRef<typeof ScrollView>>(null);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [draft, setDraft] = useState('');

  const ask = useMutation({
    mutationFn: (question: string) => insightsApi.ask(question),
    onSuccess: (answer, question) => {
      setMessages((current) => [
        ...current,
        { id: nextId(), role: 'assistant', text: answer.answer },
      ]);
      setDraft('');
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
      void question;
    },
    onError: (error) => {
      setMessages((current) => [
        ...current,
        {
          id: nextId(),
          role: 'assistant',
          text:
            error instanceof ApiError
              ? error.message
              : 'I could not reach the health service. Check your connection and try again.',
        },
      ]);
    },
  });

  function send(text: string) {
    const question = text.trim();
    if (!question || ask.isPending) return;
    setMessages((current) => [
      ...current,
      { id: nextId(), role: 'patient', text: question },
    ]);
    setDraft('');
    ask.mutate(question);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText variant="title" style={{ fontSize: 24 }}>
            Assistant
          </AppText>
          <AppText variant="caption" tone="muted">
            General guidance — does not replace your doctor
          </AppText>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.brand} />
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.bubbleWrap,
                message.role === 'patient' ? styles.bubbleRight : styles.bubbleLeft,
              ]}
            >
              {message.role === 'assistant' ? (
                <Card
                  style={{
                    gap: 0,
                    padding: spacing.md,
                    backgroundColor: colors.card,
                  }}
                >
                  <AppText variant="body">{message.text}</AppText>
                </Card>
              ) : (
                <View style={styles.patientBubble}>
                  <AppText variant="body" style={{ color: colors.onBrand }}>
                    {message.text}
                  </AppText>
                </View>
              )}
            </View>
          ))}

          {ask.isPending ? (
            <View style={[styles.bubbleWrap, styles.bubbleLeft]}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md }}>
                <ActivityIndicator size="small" color={colors.brand} />
                <AppText variant="caption" tone="muted">
                  Thinking...
                </AppText>
              </Card>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.suggestions}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.suggestionRow}>
              {SUGGESTIONS.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  accessibilityRole="button"
                  disabled={ask.isPending}
                  onPress={() => send(suggestion)}
                  style={({ pressed }) => [styles.suggestion, pressed && { opacity: 0.7 }]}
                >
                  <AppText variant="tiny" style={{ color: colors.brandDark }}>
                    {suggestion}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={styles.inputBar}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask about your blood pressure..."
            placeholderTextColor={colors.mutedLight}
            style={styles.input}
            returnKeyType="send"
            onSubmitEditing={() => send(draft)}
            multiline
            maxLength={500}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send question"
            disabled={!draft.trim() || ask.isPending}
            onPress={() => send(draft)}
            style={({ pressed }) => [
              styles.send,
              (!draft.trim() || ask.isPending) && styles.sendDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="arrow-up" size={20} color={colors.onBrand} />
          </Pressable>
        </View>

        <View style={styles.disclaimer}>
          <AppText variant="tiny" tone="muted" style={{ textAlign: 'center' }}>
            In an emergency, call your local emergency number.
          </AppText>
        </View>
      </KeyboardAvoidingView>

      {ask.isError && !ask.isPending ? (
        <View style={styles.errorBar}>
          <Notice tone="danger" title="Answer failed" message="Please try again." />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  messages: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  bubbleWrap: { flexDirection: 'row' },
  bubbleLeft: { justifyContent: 'flex-start' },
  bubbleRight: { justifyContent: 'flex-end' },
  patientBubble: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
    borderBottomRightRadius: 6,
    maxWidth: '85%',
  },
  suggestions: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  suggestionRow: { flexDirection: 'row', gap: spacing.sm },
  suggestion: {
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: colors.brandMuted },
  disclaimer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  errorBar: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
});
