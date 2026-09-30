import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useMemo } from 'react';
import { cn } from '@/lib/cn';

interface TexProps {
  /** expressão LaTeX */
  children: string;
  /** equação em bloco (centralizada, rola na horizontal em telas estreitas) */
  block?: boolean;
  className?: string;
  /** descrição falada da equação (senão o leitor de tela usa o MathML gerado) */
  label?: string;
}

/** Equação renderizada com KaTeX (HTML + MathML para leitores de tela), sem CDN. */
export function Tex({ children, block = false, className, label }: TexProps) {
  const html = useMemo(
    () => katex.renderToString(children, { displayMode: block, throwOnError: false, output: 'htmlAndMathml', strict: false, trust: false }),
    [children, block],
  );
  if (block)
    return (
      <div
        role="region"
        aria-label={label ?? 'Equação'}
        tabIndex={0}
        className={cn('overflow-x-auto py-1 outline-none focus-visible:ring-2 focus-visible:ring-focus', className)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  return <span className={className} role={label ? 'math' : undefined} aria-label={label} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Número em LaTeX com vírgula decimal (pt-BR). */
export function texNum(v: number, digits = 1) {
  return v.toFixed(digits).replace('.', '{,}');
}
