import { FormEvent, useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { authFetch } from '@/lib/auth-session';

type ChatMessage = {
  id: string;
  role: 'user' | 'smokey';
  text: string;
};

const defaultSuggestions = [
  'How do I strengthen my CV summary?',
  'What should I quantify on my CV?',
  'How do I prep for interviews?',
];

const SMOKEY_CHAT_ENDPOINT = '/api/career/smokey/chat';
const SMOKEY_CONNECTION_MESSAGE = 'Smokey is having trouble reaching the server. Please try again in a moment.';

async function readSmokeyJson(response: Response): Promise<{ reply?: string; error?: string; suggestions?: string[] }> {
  const contentType = response.headers.get('content-type') || '';
  const responseText = await response.text();
  if (!response.ok || !/application\/json/i.test(contentType)) {
    console.error(`Smokey chat API returned ${response.status} (${contentType || 'no content type'}): ${responseText}`);
    throw new Error(SMOKEY_CONNECTION_MESSAGE);
  }

  try {
    return JSON.parse(responseText) as { reply?: string; error?: string; suggestions?: string[] };
  } catch (error) {
    console.error('Smokey chat API returned invalid JSON:', error);
    throw new Error(SMOKEY_CONNECTION_MESSAGE);
  }
}

export function SmokeyAgent() {
  const [location] = useLocation();
  const isCvBuilder = location.startsWith('/cv-builder');
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [suggestions, setSuggestions] = useState(defaultSuggestions);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'smokey',
      text: "Hey — I'm Smokey. Ask me about CV edits, keywords, interviews, or which roles fit your story.",
    },
  ]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const streamingRef = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || streamingRef.current) return;

    let role: string | undefined;
    let cvDocument: any;
    try {
      const stored = sessionStorage.getItem('careerbridge-report');
      if (stored) {
        const report = JSON.parse(stored) as { targetRole?: string };
        role = report.targetRole;
      }
      const cvStored = sessionStorage.getItem('careerbridge-generated-cv');
      if (cvStored) {
        const cv = JSON.parse(cvStored);
        cvDocument = cv?.document;
      }
    } catch {
      // ignore malformed session payload
    }

    const replyId = `s-${Date.now()}`;
    const history = messages
      .filter((item) => item.id !== 'welcome' && (item.role === 'user' || item.role === 'smokey'))
      .slice(-16)
      .map((item) => ({ role: item.role === 'user' ? 'user' : 'model', text: item.text }));
    streamingRef.current = true;
    setIsStreaming(true);
    setMessages((current) => [
      ...current,
      { id: `u-${Date.now()}`, role: 'user', text: message },
      { id: replyId, role: 'smokey', text: '' },
    ]);
    setInput('');

    const requestBody = JSON.stringify({ message, history, role, cvDocument });
    const requestJsonFallback = async () => {
      const fallbackResponse = await authFetch(SMOKEY_CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ message, history, role, cvDocument, stream: false }),
      });
      const payload = await readSmokeyJson(fallbackResponse);
      if (!fallbackResponse.ok || !payload.reply) {
        throw new Error(payload.error || SMOKEY_CONNECTION_MESSAGE);
      }
      setMessages((current) => current.map((item) => item.id === replyId ? { ...item, text: payload.reply! } : item));
      if (payload.suggestions?.length) setSuggestions(payload.suggestions.slice(0, 3));
    };

    const streamController = new AbortController();
    const streamTimeout = window.setTimeout(() => streamController.abort(), 45_000);
    try {
      let response: Response;
      try {
        response = await authFetch(SMOKEY_CHAT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: requestBody,
          signal: streamController.signal,
        });
      } catch {
        await requestJsonFallback();
        return;
      }
      const isEventStream = response.headers.get('content-type')?.toLowerCase().includes('text/event-stream') || false;
      if (!response.ok) {
        const responseText = await response.text();
        console.error(`Smokey stream API returned ${response.status} (${response.headers.get('content-type') || 'no content type'}): ${responseText}`);
        await requestJsonFallback();
      } else if (!response.body || !isEventStream) {
        await requestJsonFallback();
      } else {
        try {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let receivedText = false;
          const consumeEvents = (text: string) => {
            buffer += text;
            const events = buffer.split(/\r?\n\r?\n/);
            buffer = events.pop() || '';
            for (const event of events) {
              const data = event.split(/\r?\n/).find((line) => line.startsWith('data:'))?.slice(5).trim();
              if (!data || data === '[DONE]') continue;
              const payload = JSON.parse(data) as { text?: string; error?: string; suggestions?: string[] };
              if (payload.error) throw new Error(payload.error);
              if (payload.text) {
                receivedText = true;
                setMessages((current) => current.map((item) => item.id === replyId ? { ...item, text: item.text + payload.text } : item));
              }
              if (payload.suggestions?.length) setSuggestions(payload.suggestions.slice(0, 3));
            }
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            consumeEvents(decoder.decode(value, { stream: true }));
          }
          consumeEvents(decoder.decode());
          if (!receivedText) throw new Error("Smokey couldn't prepare a response. Please try again.");
        } catch {
          // Retry in JSON mode if the proxy or browser cannot complete SSE.
          // Replace any partial stream text with the complete fallback reply.
          setMessages((current) => current.map((item) => item.id === replyId ? { ...item, text: '' } : item));
          await requestJsonFallback();
        }
      }
    } catch (error) {
      const errorText = error instanceof Error && error.message === SMOKEY_CONNECTION_MESSAGE
        ? error.message
        : "Smokey is having trouble reaching the server. Please try again in a moment.";
      setMessages((current) => current.map((item) => item.id === replyId
        ? { ...item, text: item.text ? `${item.text}\n\n${errorText}` : errorText }
        : item));
    } finally {
      window.clearTimeout(streamTimeout);
      streamingRef.current = false;
      setIsStreaming(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send(input);
  };

  return (
    <div className={`fixed ${isCvBuilder ? 'bottom-[calc(5rem+var(--safe-bottom))]' : 'bottom-[max(1rem,var(--safe-bottom))]'} right-[max(1rem,var(--safe-right))] z-[60] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3 md:bottom-[max(1rem,var(--safe-bottom))]`}>
      {open && (
        <div className="flex h-[min(560px,72vh)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary-foreground/15">
                <Sparkles size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold">Smokey</p>
                <p className="text-[11px] text-primary-foreground/75">Career agent · online</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-primary-foreground/10"
              aria-label="Close Smokey"
              data-testid="button-close-smokey"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-background/70 px-4 py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-5 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-card text-foreground'
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}
            {isStreaming && !messages[messages.length - 1]?.text && (
              <div className="text-xs font-medium text-muted-foreground">Smokey is thinking…</div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-border bg-card p-3">
            <div className="mb-3 flex flex-wrap gap-2">
              {suggestions.slice(0, 3).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:border-primary/40 hover:text-primary"
                  data-testid="button-smokey-suggestion"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <form onSubmit={onSubmit} className="flex items-center gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask Smokey anything…"
                className="field-input flex-1 py-2.5"
                data-testid="input-smokey-message"
              />
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
                aria-label="Send message"
                data-testid="button-send-smokey"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg hover:brightness-105 sm:px-4"
        data-testid="button-ask-smokey"
        aria-label="Ask Smokey"
      >
        <MessageCircle size={18} />
        <span className="hidden sm:inline">Ask Smokey</span>
      </button>
    </div>
  );
}
