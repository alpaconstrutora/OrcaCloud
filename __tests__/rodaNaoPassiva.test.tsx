// @vitest-environment jsdom
/**
 * A roda do mouse dá zoom SEM rolar a página (09/09/2026).
 *
 * ─── O DEFEITO, ACHADO NO USO ───────────────────────────────────────────────
 *
 * "bug ao usar o scroll do mouse para zoom in e zoom out, o zoom está
 * funcionando porém a tela também se movimenta para cima e para abaixo."
 *
 * Os dois tratadores de roda do módulo calculavam a escala e nunca chamavam
 * `preventDefault`: o evento seguia para o ancestral rolável e fazia o que a
 * roda faz numa página.
 *
 * ─── ⚠️ DOIS CASOS PARA A MESMA COISA, E O MOTIVO ───────────────────────────
 *
 * A correção que PARECE certa e não funciona é pôr `e.preventDefault()` dentro
 * do `onWheel` do React: desde o React 17 o `wheel` é registrado na raiz como
 * PASSIVO, e um listener passivo tem o `preventDefault` ignorado.
 *
 * Eu supunha que o jsdom não implementasse essa regra, e que só a asserção sobre
 * a OPÇÃO pegaria o caso. Medido em 09/09/2026, injetando `passive: true` no
 * hook: **o jsdom honra `passive`** e o `defaultPrevented` foi a falso. Os dois
 * caminhos pegam.
 *
 * Ambos ficam. O comportamental é o que importa para quem usa; o que afirma
 * `passive: false` diz POR QUE, e é o que sobrevive se o jsdom mudar de ideia
 * — a asserção que depende do ambiente é justamente a que não deve ficar
 * sozinha.
 */
import React, { useRef } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRodaNaoPassiva } from '../hooks/useRodaNaoPassiva';

/** Um alvo mínimo que usa o hook e registra o que o tratador recebeu. */
function Alvo({ aoRolar }: { aoRolar: (e: WheelEvent) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useRodaNaoPassiva(ref, aoRolar);
  return <div ref={ref} data-testid="alvo" />;
}

/**
 * Registros de `addEventListener` COM O ALVO.
 *
 * ⚠️ Espiar `HTMLDivElement.prototype` e pegar a primeira chamada de `wheel` não
 * serve: o próprio React registra `wheel` no contêiner raiz — passivo, que é
 * exatamente o defeito. Sem saber em QUE elemento cada registro caiu, o teste
 * mede o listener do React e reprova a correção certa.
 */
let registros: { alvo: EventTarget; tipo: string; opcoes: unknown }[] = [];
let removidos: { alvo: EventTarget; tipo: string }[] = [];

beforeEach(() => {
  registros = [];
  removidos = [];
  const addOriginal = EventTarget.prototype.addEventListener;
  const removeOriginal = EventTarget.prototype.removeEventListener;
  vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(function (
    this: EventTarget,
    tipo: string,
    ouvinte: EventListenerOrEventListenerObject | null,
    opcoes?: boolean | AddEventListenerOptions,
  ) {
    registros.push({ alvo: this, tipo, opcoes });
    return addOriginal.call(this, tipo, ouvinte, opcoes);
  });
  vi.spyOn(EventTarget.prototype, 'removeEventListener').mockImplementation(function (
    this: EventTarget,
    tipo: string,
    ouvinte: EventListenerOrEventListenerObject | null,
    opcoes?: boolean | EventListenerOptions,
  ) {
    removidos.push({ alvo: this, tipo });
    return removeOriginal.call(this, tipo, ouvinte, opcoes);
  });
});

afterEach(() => vi.restoreAllMocks());

/** Só os registros de `wheel` que caíram NESTE elemento. */
const rodaEm = (el: EventTarget) => registros.filter((r) => r.alvo === el && r.tipo === 'wheel');

function rolar(el: Element, deltaY = -120) {
  const e = new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true });
  el.dispatchEvent(e);
  return e;
}

describe('useRodaNaoPassiva', () => {
  it('⚠️ registra o listener no ELEMENTO com passive: false', () => {
    // O caso que separa a correção certa da que parece certa. Sem
    // `passive: false`, o navegador ignora o `preventDefault` e a página rola —
    // e nenhum outro caso deste arquivo perceberia.
    const { getByTestId } = render(<Alvo aoRolar={() => {}} />);
    const nossos = rodaEm(getByTestId('alvo'));

    expect(nossos, 'o listener de wheel tem de ser registrado NO ELEMENTO').toHaveLength(1);
    expect(nossos[0].opcoes).toEqual(expect.objectContaining({ passive: false }));

    // E, para o registro: o React registrou o dele — passivo — em outro alvo.
    // É esse que ignorava o `preventDefault`.
    expect(registros.some((r) => r.tipo === 'wheel' && r.alvo !== getByTestId('alvo'))).toBe(true);
  });

  it('cancela o evento — é isso que impede a página de rolar', () => {
    const { getByTestId } = render(<Alvo aoRolar={() => {}} />);
    expect(rolar(getByTestId('alvo')).defaultPrevented).toBe(true);
  });

  it('repassa o evento nativo, com o delta, para quem calcula o zoom', () => {
    const aoRolar = vi.fn();
    const { getByTestId } = render(<Alvo aoRolar={aoRolar} />);
    rolar(getByTestId('alvo'), -120);
    rolar(getByTestId('alvo'), 240);
    expect(aoRolar.mock.calls.map(([e]) => (e as WheelEvent).deltaY)).toEqual([-120, 240]);
  });

  it('⚠️ o tratador NOVO é chamado sem reassinar o listener', () => {
    // `aoRolar` fecha sobre a vista, que muda a CADA rolagem. Se o efeito
    // dependesse dele, o listener seria removido e recriado a cada zoom; ler o
    // tratador de uma ref é o que evita isso — e o preço seria chamar o
    // tratador VELHO, que aplicaria o zoom sobre a escala anterior.
    const primeiro = vi.fn();
    const segundo = vi.fn();
    const { getByTestId, rerender } = render(<Alvo aoRolar={primeiro} />);
    const alvo = getByTestId('alvo');
    expect(rodaEm(alvo)).toHaveLength(1);

    rerender(<Alvo aoRolar={segundo} />);
    rolar(alvo);

    expect(segundo).toHaveBeenCalledTimes(1);
    expect(primeiro).not.toHaveBeenCalled();
    // Continua UM só registro no nosso elemento: nada foi reassinado.
    expect(rodaEm(alvo)).toHaveLength(1);
  });

  it('solta o listener ao desmontar', () => {
    const tela = render(<Alvo aoRolar={() => {}} />);
    const alvo = tela.getByTestId('alvo');
    tela.unmount();
    expect(removidos.some((r) => r.alvo === alvo && r.tipo === 'wheel')).toBe(true);
  });
});
