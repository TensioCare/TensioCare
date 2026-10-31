import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
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

import { AppText, Button } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { ApiError, caregiversApi, type ChatMessage } from '@/lib/api';

type Message = ChatMessage & { id: string; error?: boolean };

const SUGGESTED_QUESTIONS = [
  'How is the blood pressure trend this week?',
  'What are the target BP values?',
  'How was adherence in the last 7 days?',
  'What measurements are due today?',
  'Are there any unacknowledged alerts?',
];

const WELCOME =
  'Hello! I can explain adherence, targets, measurement times, missed or upcoming windows and recent alerts — using the data recorded in the app. What would you like to know?';

let messageCounter = 0;
function nextId(): string {
  messageCounter += 1;
  return `m-${messageCounter}`;
}

export default function CaregiverChatScreen() {
  const [messages, setMessages] = useState<Message[]>([
    { id: nextId(), role: 'assistant', content: WELCOME },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const patients = useQuery({
    queryKey: ['caregiver', 'patients'],
    queryFn: caregiversApi.patients,
  });
  const patientId = patients.data?.[0]?.patient_id;

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;

    const userTurn: Message = { id: nextId(), role: 'user', content: question };
    const nextMessages = [...messages, userTurn];
    setMessages(nextMessages);
    setDraft('');
    setBusy(true);

    // Full history (excluding the welcome greeting) drives the RAG context.
    const history: ChatMessage[] = nextMessages
      .filter((m) => m.id !== messages[0]?.id)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      if (patientId === undefined) {
        throw new ApiError(0, 'No linked patient found.');
      }
      const answer = await caregiversApi.askChat(patientId, history);
      setMessages((current) => [
        ...current,
        { id: nextId(), role: 'assistant', content: answer.answer },
      ]);
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <View style={styles.header}>
        <AppText variant="title" style={{ fontSize: 20 }}>
          Assistant
        </AppText>
        <AppText variant="caption" tone="muted">
          Answers from the recorded data — does not replace your doctor
        </AppText>
      </View>

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
              <View style={styles.caregiverBubble}>
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
                style={({ pressed }) => [styles.promptCard, pressed && { opacity: 0.7 }]}
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
          placeholder="Type your question..."
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  messageContainer: {
    flex: 1,
  },
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
  caregiverBubble: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderBottomRightRadius: 4,
    maxWidth: '85%',
  },
  emptyState: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    textAlign: 'center',
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
});
