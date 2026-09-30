import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Tex } from '@/components/Tex';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { Block, Question } from './types';

/** Texto com $LaTeX$, **negrito** e `código` embutidos. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\$[^$]+\$|\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i): ReactNode => {
        if (p.startsWith('$') && p.endsWith('$') && p.length > 2) return <Tex key={i}>{p.slice(1, -1)}</Tex>;
        if (p.startsWith('**') && p.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold text-fg">
              <Rich text={p.slice(2, -2)} />
            </strong>
          );
        }
        if (p.startsWith('`') && p.endsWith('`'))
          return (
            <code key={i} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]">
              {p.slice(1, -1)}
            </code>
          );
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export function BlockView({ block }: { block: Block }) {
  if (typeof block === 'string')
    return (
      <p className="leading-relaxed">
        <Rich text={block} />
      </p>
    );
  if ('eq' in block) return <Tex block label={block.label} className="rounded-lg bg-surface-2 px-3 py-2 text-center">{block.eq}</Tex>;
  if ('list' in block)
    return (
      <ul className="list-disc space-y-1 pl-5 leading-relaxed marker:text-brand">
        {block.list.map((item, i) => (
          <li key={i}>
            <Rich text={item} />
          </li>
        ))}
      </ul>
    );
  if ('note' in block)
    return (
      <p className="flex gap-2 rounded-lg border border-info/40 bg-info-soft px-3 py-2 text-sm">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
        <span>
          <Rich text={block.note} />
        </span>
      </p>
    );
  const { head, rows, caption } = block.table;
  return (
    <div className="overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-2">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border align-top">
              {r.map((c, k) =>
                k === 0 ? (
                  <th key={k} scope="row" className="px-3 py-2 font-medium">
                    <Rich text={c} />
                  </th>
                ) : (
                  <td key={k} className="px-3 py-2">
                    <Rich text={c} />
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Quiz({ q, answer, onAnswer }: { q: Question; answer: number | undefined; onAnswer: (i: number) => void }) {
  const id = useId();
  const [choice, setChoice] = useState<number | undefined>(answer);
  const answered = answer !== undefined;
  const right = answer === q.correct;
  return (
    <fieldset className="rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-semibold">{q.q}</legend>
      <div className="mt-1 space-y-1.5">
        {q.options.map((o, i) => (
          <label key={i} className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="radio" name={id} value={i} checked={choice === i} onChange={() => setChoice(i)} className="size-4 accent-[var(--c-brand)]" />
            {o}
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" disabled={choice === undefined} onClick={() => choice !== undefined && onAnswer(choice)}>
          Conferir
        </Button>
        <p role="status" className={cn('text-sm', !answered && 'sr-only')}>
          {answered && (
            <span className={cn('inline-flex items-start gap-1.5 font-medium', right ? 'text-brand-text' : 'text-danger')}>
              {right ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" /> : <XCircle aria-hidden className="mt-0.5 size-4 shrink-0" />}
              <span>
                {right ? 'Isso! ' : 'Ainda não. '}
                <span className="font-normal text-fg">{q.explain}</span>
              </span>
            </span>
          )}
        </p>
      </div>
    </fieldset>
  );
}
