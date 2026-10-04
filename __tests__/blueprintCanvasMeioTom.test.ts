/**
 * CAMADAS EM MEIO-TOM (04/10/2026) — o multiplicador do `globalAlpha` do
 * canvas 2D. O desenho existente escreve `ctx.globalAlpha = 0.35` (laje) e
 * `= 1` (de volta); com o fator instalado, essas mesmas linhas saem
 * multiplicadas pelo meio-tom, e quem LÊ o alfa continua vendo o valor lógico.
 */
import { describe, expect, it } from 'vitest';
import { instalarMeioTom } from '../components/blueprint/BlueprintCanvas';

/** Contexto falso com `globalAlpha` no PROTÓTIPO, como o do navegador; guarda o valor real. */
class ContextoFalso {
  real = 1;
  get globalAlpha() {
    return this.real;
  }
  set globalAlpha(v: number) {
    // O navegador ignora valor fora de [0, 1] — o falso também.
    if (v >= 0 && v <= 1) this.real = v;
  }
}

describe('instalarMeioTom', () => {
  it('fator 1 não muda nada; com fator, o alfa escrito sai multiplicado e a leitura devolve o lógico', () => {
    const ctx = new ContextoFalso() as unknown as CanvasRenderingContext2D & { real: number };
    const fator = instalarMeioTom(ctx);
    ctx.globalAlpha = 0.35;
    expect(ctx.real).toBeCloseTo(0.35);
    fator.base = 0.25;
    ctx.globalAlpha = 0.35;
    expect(ctx.real).toBeCloseTo(0.0875);
    expect(ctx.globalAlpha).toBeCloseTo(0.35);
    ctx.globalAlpha = 1;
    expect(ctx.real).toBeCloseTo(0.25);
  });

  it('instala UMA vez por contexto (o canvas é o mesmo a cada desenho)', () => {
    const ctx = new ContextoFalso() as unknown as CanvasRenderingContext2D;
    expect(instalarMeioTom(ctx)).toBe(instalarMeioTom(ctx));
  });

  it('trocar o fator preservando o lógico — o que `meioTom` faz entre uma peça e outra', () => {
    const ctx = new ContextoFalso() as unknown as CanvasRenderingContext2D & { real: number };
    const fator = instalarMeioTom(ctx);
    ctx.globalAlpha = 0.5;
    const logico = ctx.globalAlpha;
    fator.base = 0.25;
    ctx.globalAlpha = logico;
    expect(ctx.real).toBeCloseTo(0.125);
    const deVolta = ctx.globalAlpha;
    fator.base = 1;
    ctx.globalAlpha = deVolta;
    expect(ctx.real).toBeCloseTo(0.5);
  });
});
