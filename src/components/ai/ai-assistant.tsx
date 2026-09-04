'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, X, Sparkles } from 'lucide-react';
import { useUI } from '@/lib/store';
import { cn } from '@/lib/utils';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'Why is this event risky?',
  'Which conjunction should I investigate first?',
  'What does TCA mean?',
  'Why is confidence low?',
  'Compare these maneuver scenarios.',
  'Summarize today\'s events.',
  'Should I execute this burn?',
];

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { selectedConjunctionId } = useUI();

  const ask = async (question: string) => {
    if (!question.trim() || loading) return;
    const userMsg: Msg = { role: 'user', content: question };
    setMessages(m => [...m, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-6)
        .map(m => ({ role: m.role, content: m.content }));
      const r = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          conjunctionId: selectedConjunctionId ?? undefined,
          history,
        }),
      });
      const j = await r.json();
      const answer: Msg = { role: 'assistant', content: j.answer };
      setMessages(m => [...m, answer]);
    } catch (e: any) {
      setMessages(m => [...m, { role: 'assistant', content: `(Error: ${e.message})` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
          aria-label="Open AI Assistant"
        >
          <Bot className="h-5 w-5" />
        </button>
      )}

      {/* Assistant panel */}
      {open && (
        <Card className="fixed bottom-4 right-4 z-40 w-[420px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-2rem)] flex flex-col p-0 overflow-hidden border-primary/30">
          <div className="px-3 py-2 border-b border-border bg-primary/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <div>
                <div className="font-mono text-xs font-bold">AI ASSISTANT</div>
                <div className="text-[9px] text-muted-foreground font-mono">Explains deterministic backend results only</div>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="h-6 w-6 p-0">
              <X className="h-3 w-3" />
            </Button>
          </div>
          <ScrollArea className="flex-1 p-3 scrollbar-thin">
            {messages.length === 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground font-mono mb-2">Suggested questions:</p>
                {SUGGESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => ask(q)}
                    className="block w-full text-left text-[11px] font-mono px-2 py-1.5 rounded border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((m, i) => (
                  <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-[90%] px-2.5 py-1.5 rounded text-[11px] font-mono whitespace-pre-wrap',
                      m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted border border-border'
                    )}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-muted border border-border px-2.5 py-1.5 rounded text-[11px] font-mono text-muted-foreground">
                      Thinking…
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
          <div className="p-2 border-t border-border flex gap-2 shrink-0">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') ask(input); }}
              placeholder="Ask about this event…"
              className="h-8 text-xs font-mono"
              disabled={loading}
            />
            <Button size="sm" onClick={() => ask(input)} disabled={loading || !input.trim()} className="h-8 w-8 p-0">
              <Send className="h-3 w-3" />
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
