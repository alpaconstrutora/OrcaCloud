import { describe, expect, it } from 'vitest';
import {
  PALETA_AMBIENTE,
  chaveDeCor,
  corDoAmbiente,
} from '../utils/blueprintCoresAmbiente';

const anel = (x: number, y: number) => [
  { x, y },
  { x: x + 3000, y },
  { x: x + 3000, y: y + 3000 },
  { x, y: y + 3000 },
];

describe('cor por ambiente', () => {
  it('sempre devolve uma cor da paleta', () => {
    for (let i = 0; i < 200; i++) {
      expect(PALETA_AMBIENTE).toContain(corDoAmbiente({ ring: anel(i * 100, i * 37) }));
    }
  });

  it('é determinística: o mesmo ambiente dá a mesma cor', () => {
    const a = { ring: anel(0, 0) };
    expect(corDoAmbiente(a)).toBe(corDoAmbiente({ ring: anel(0, 0) }));
  });

  /**
   * O ponto do desenho todo: o `id` do ambiente é `spc_<nível>_<ordinal>` e o
   * ordinal vem da ordem canônica dos anéis. Acrescentar uma parede no miolo
   * insere um anel no meio dessa ordem — se a cor viesse do id, a planta inteira
   * se repintaria por causa de um gesto que não tocou nesses cômodos.
   */
  it('não muda quando um ambiente novo aparece antes dele na lista', () => {
    const cozinha = { ring: anel(10_000, 0) };
    const antes = corDoAmbiente(cozinha);
    // Um cômodo novo à esquerda: em ordem canônica ele vem primeiro e empurra o
    // ordinal da cozinha. A cor dela não pode se mexer.
    void corDoAmbiente({ ring: anel(0, 0) });
    expect(corDoAmbiente(cozinha)).toBe(antes);
  });

  it('o nome manda quando existe — o cômodo pode mudar de forma sem trocar de cor', () => {
    const pequena = { name: 'Cozinha', ring: anel(0, 0) };
    const ampliada = { name: 'Cozinha', ring: anel(500, 200) };
    expect(corDoAmbiente(ampliada)).toBe(corDoAmbiente(pequena));
  });

  it('o nome é normalizado: espaço e caixa não geram cor diferente', () => {
    expect(chaveDeCor({ name: '  Suíte  ', ring: anel(0, 0) })).toBe(
      chaveDeCor({ name: 'suíte', ring: anel(9000, 9000) }),
    );
  });

  it('sem nome, a chave é o primeiro vértice — cômodos distintos se separam', () => {
    const cores = new Set(
      [anel(0, 0), anel(4000, 0), anel(0, 4000), anel(4000, 4000)].map((ring) =>
        corDoAmbiente({ ring }),
      ),
    );
    // Não exigimos 4 cores (8 baldes colidem), mas 4 cômodos não podem cair
    // todos no mesmo balde — seria a paleta não fazendo nada.
    expect(cores.size).toBeGreaterThan(1);
  });

  it('anel vazio não quebra', () => {
    expect(PALETA_AMBIENTE).toContain(corDoAmbiente({ ring: [] }));
  });

  it('a paleta espalha: 500 ambientes usam todos os oito tons', () => {
    const usados = new Set<string>();
    for (let i = 0; i < 500; i++) usados.add(corDoAmbiente({ ring: anel(i * 250, 0) }));
    expect(usados.size).toBe(PALETA_AMBIENTE.length);
  });
});
