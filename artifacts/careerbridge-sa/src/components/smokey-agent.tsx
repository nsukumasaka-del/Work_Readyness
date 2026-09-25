import { FormEvent, useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { useAskSmokey } from '@workspace/api-client-react';
import { useLocation } from 'wouter';

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

export function SmokeyAgent() {
  const ask = useAskSmokey();
  const [location] = useLocation();
  const isCvBuilder = location.startsWith('/cv-builder');
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState(defaultSuggestions);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'smokey',
      text: "Hey — I'm Smokey. Ask me about CV edits, keywords, interviews, or which roles fit your story.",
    },
  ]);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = (raw: string) => {
    const message = raw.trim();
    if (!message || ask.isPending) return;

    let role: string | undefined;
    let fileName: string | undefined;
    let cvDocument: any;
    try {
      const stored = sessionStorage.getItem('careerbridge-report');
      if (stored) {
        const report = JSON.parse(stored) as { targetRole?: string; fileName?: string };
        role = report.targetRole;
        fileName = report.fileName;
      }
      const cvStored = sessionStorage.getItem('careerbridge-generated-cv');
      if (cvStored) {
        const cv = JSON.parse(cvStored);
        cvDocument = cv?.document;
      }
    } catch {
      // ignore malformed session payload
    }

    setMessages((current) => [
      ...current,
      { id: `u-${Date.now()}`, role: 'user', text: message },
    ]);
    setInput('');

    ask.mutate(
      { data: { message, role, fileName, cvDocument } },
      {
        onSuccess: (reply) => {
          setMessages((current) => [
            ...current,
            { id: `s-${Date.now()}`, role: 'smokey', text: reply.reply },
          ]);
          if (reply.suggestions?.length) setSuggestions(reply.suggestions);
        },
        onError: () => {
          setMessages((current) => [
            ...current,
            {
              id: `e-${Date.now()}`,
              role: 'smokey',
              text: "I couldn't reply just now. Try again in a moment — I'm still here.",
            },
          ]);
        },
      },
    );
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
            {ask.isPending && (
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
                disabled={!input.trim() || ask.isPending}
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
