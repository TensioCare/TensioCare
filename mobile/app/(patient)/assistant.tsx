import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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

import { AppText, Button } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { ApiError, insightsApi, type ChatMessage } from '@/lib/api';

type Message = ChatMessage & { id: string; error?: boolean };

const SUGGESTED_QUESTIONS = [
  'How was my blood pressure this week?',
  'Am I within my target range?',
  'How many measurements did I miss?',
  'What are my measurement times?',
  'What is my latest reading?',
];

const WELCOME =
  'Hi! I can explain your blood pressure readings, your target, your measurement schedule and your progress — all from the data saved in the app. What would you like to know?';

let messageCounter = 0;
function nextId(): string {
  messageCounter += 1;
  return `m-${messageCounter}`;
}

export default function PatientAssistantScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<Message[]>([
    { id: nextId(), role: 'assistant', content: WELCOME },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;

    const userTurn: Message = { id: nextId(), role: 'user', content: question };
    const nextMessages = [...messages, userTurn];
    setMessages(nextMessages);
    setDraft('');
    setBusy(true);

    // The welcome greeting is UI-only; history starts at the first question.
    const history: ChatMessage[] = nextMessages
      .filter((m) => m.id !== messages[0]?.id)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const answer = await insightsApi.askChat(history);
      setMessages((current) => [
        ...current,
        { id: nextId(), role: 'assistant', content: answer.answer },
      ]);
      // A new reading may have been discussed; refresh dashboard numbers.
      void queryClient.invalidateQueries({ queryKey: ['assessment'] });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : 'The assistant is unreachable right now. Please try again.';
      setMessages((current) => [
        ...current,
        { id: nextId(), role: 'assistant', content: message, error: true },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText variant="title" style={{ fontSize: 20 }}>
            Assistant
          </AppText>
          <AppText variant="caption" tone="muted">
            Answers from your saved data — does not replace your doctor
          </AppText>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          style={styles.messageContainer}
          contentContainerStyle={styles.messageContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.bubbleWrap,
                message.role === 'user' ? styles.bubbleRight : styles.bubbleLeft,
              ]}
            >
              {message.role === 'assistant' ? (
                <View
                  style={[
                    styles.assistantBubble,
                    message.error && styles.assistantError,
                  ]}
                >
                  <AppText
                    variant="caption"
                    style={[
                      { fontSize: 13, lineHeight: 18 },
                      message.error && { color: colors.danger },
                    ]}
                  >
                    {message.content}
                  </AppText>
                </View>
              ) : (
                <View style={styles.patientBubble}>
                  <AppText
                    variant="caption"
                    style={{ fontSize: 13, lineHeight: 18, color: colors.onBrand }}
                  >
                    {message.content}
                  </AppText>
                </View>
              )}
            </View>
          ))}

          {busy && (
            <View style={[styles.bubbleWrap, styles.bubbleLeft]}>
              <View style={styles.assistantBubble}>
                <ActivityIndicator size="small" color={colors.brand} />
              </View>
            </View>
          )}

          {messages.length <= 1 && !busy && (
            <View style={styles.promptSection}>
              <AppText variant="caption" tone="muted" style={styles.promptLabel}>
                Suggested questions
              </AppText>
              {SUGGESTED_QUESTIONS.map((question) => (
                <Pressable
                  key={question}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void send(question)}
                  style={({ pressed }) => [
                    styles.promptCard,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons name="chatbubble-outline" size={14} color={colors.brand} />
                  <AppText variant="caption" style={styles.promptText}>
                    {question}
                  </AppText>
                  <Ionicons name="chevron-forward" size={14} color={colors.mutedLight} />
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={styles.inputContainer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask about your blood pressure..."
            placeholderTextColor={colors.mutedLight}
            style={styles.input}
            returnKeyType="send"
            onSubmitEditing={() => void send(draft)}
            editable={!busy}
            multiline
            maxLength={500}
          />
          <Button
            title={busy ? '...' : 'Send'}
            onPress={() => void send(draft)}
            disabled={busy || !draft.trim()}
            style={styles.button}
          />
        </View>

        <View style={styles.disclaimer}>
          <AppText variant="tiny" tone="muted" style={{ textAlign: 'center' }}>
            In an emergency, call your local emergency number.
          </AppText>
        </View>
      </KeyboardAvoidingView>
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
  messageContainer: { flex: 1 },
  messageContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  bubbleWrap: { flexDirection: 'row' },
  bubbleLeft: { justifyContent: 'flex-start' },
  bubbleRight: { justifyContent: 'flex-end' },
  assistantBubble: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderBottomLeftRadius: 4,
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  assistantError: {
    borderColor: colors.danger,
    backgroundColor: colors.bg,
  },
  patientBubble: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderBottomRightRadius: 4,
    maxWidth: '85%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 100,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: 9,
    paddingBottom: 9,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  promptSection: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  promptLabel: {
    marginBottom: 4,
    marginLeft: 4,
  },
  promptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  promptText: {
    flex: 1,
    fontSize: 13,
    color: colors.brandDark,
  },
  disclaimer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
});
