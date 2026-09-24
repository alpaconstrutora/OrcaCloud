/**
 * COBERTURA DO ORÇAMENTO (24/09/2026, P2.55).
 *
 * ⚠️ O silêncio que isto quebra: o painel de orçamento mostra as linhas que
 * saem e as divergências que impedem cada uma — mas **não** o que a planta mede
 * e não vira linha nenhuma, porque ninguém mapeou aquela medida. Isso não é
 * divergência (divergência é mapeamento que falhou; aqui nem há mapeamento), e
 * o total sai parecendo completo: a planta mede 1.240 m² de alvenaria, e se só
 * o piso está mapeado o orçamento sai com o piso, calado.
 *
 * ⚠️ E cobertura se conta em MEDIDA, nunca em dinheiro: "80% do orçamento
 * coberto" seria mentira, porque não se sabe o preço justamente do que falta.
 */
import { describe, expect, it } from 'vitest';
import { coberturaDoOrcamento, ROTULO_DO_ESTADO, type ItemDoCatalogo } from '../utils/blueprintCoberturaOrcamento';
import type { MapeamentoOrcamento } from '../utils/blueprintBudget';

function mapa(medida: string, item_code: string, active = true): MapeamentoOrcamento {
  return {
    id: `map_${medida}`,
    study_id: 'std_1',
    organization_id: 'org_1',
    medida,
    item_code,
    filtro: [],
    active,
    created_at: '',
    updated_at: '',
  } as MapeamentoOrcamento;
}

const CATALOGO = new Map<string, ItemDoCatalogo>([
  ['87879', { code: '87879', unit: 'M2', price: 50 }],
  ['00UN', { code: '00UN', unit: 'UN', price: 300 }],
  ['SEM_PRECO', { code: 'SEM_PRECO', unit: 'M2', price: null }],
]);

describe('cobertura do orçamento', () => {
  it('a medida mapeada com item e unidade certa vira valor; a sem mapeamento entra em FALTANDO', () => {
    const c = coberturaDoOrcamento(
      [
        { medidaId: 'AREA_PISO', quantidade: 100 },
        { medidaId: 'AREA_PAREDE_DUAS_FACES', quantidade: 1240 },
      ],
      [mapa('AREA_PISO', '87879')],
      CATALOGO,
    );
    expect(c.medidasComQuantidade).toBe(2);
    expect(c.comPreco).toBe(1);
    expect(c.totalEstimado).toBe(5000);
    // ⚠️ O que a planta mede e o orçamento ignora — com a quantidade ao lado.
    expect(c.faltando).toHaveLength(1);
    expect(c.faltando[0]).toMatchObject({ medidaId: 'AREA_PAREDE_DUAS_FACES', quantidade: 1240, estado: 'SEM_MAPEAMENTO' });
  });

  it('⚠️ unidade incompatível não vira valor — é o erro que o gerador também recusa', () => {
    // Item em UN para uma medida em m².
    const c = coberturaDoOrcamento([{ medidaId: 'AREA_PISO', quantidade: 100 }], [mapa('AREA_PISO', '00UN')], CATALOGO);
    expect(c.comPreco).toBe(0);
    expect(c.linhas[0].estado).toBe('UNIDADE_INCOMPATIVEL');
    expect(c.linhas[0].valor).toBeNull();
  });

  it('item fora do catálogo e de-para desligado são estados distintos', () => {
    const c = coberturaDoOrcamento(
      [
        { medidaId: 'AREA_PISO', quantidade: 10 },
        { medidaId: 'AREA_PAREDE_DUAS_FACES', quantidade: 20 },
      ],
      [mapa('AREA_PISO', 'NAO_EXISTE'), mapa('AREA_PAREDE_DUAS_FACES', '87879', false)],
      CATALOGO,
    );
    expect(c.linhas.map((l) => l.estado)).toEqual(['ITEM_AUSENTE', 'DESLIGADO']);
    expect(c.faltando).toHaveLength(2);
    expect(ROTULO_DO_ESTADO.ITEM_AUSENTE).toBe('item fora do catálogo');
  });

  it('entre dois mapeamentos da mesma medida, o ATIVO manda', () => {
    const c = coberturaDoOrcamento(
      [{ medidaId: 'AREA_PISO', quantidade: 10 }],
      [mapa('AREA_PISO', '87879', false), { ...mapa('AREA_PISO', '87879'), id: 'map_2' }],
      CATALOGO,
    );
    expect(c.linhas[0].estado).toBe('COM_PRECO');
  });

  it('medida que a planta NÃO tem fica fora da conta, mas continua na lista', () => {
    const c = coberturaDoOrcamento(
      [
        { medidaId: 'AREA_PISO', quantidade: 0 },
        { medidaId: 'AREA_PAREDE_DUAS_FACES', quantidade: 5 },
      ],
      [],
      CATALOGO,
    );
    // A tela precisa distinguir "não tem no desenho" de "tem e está fora".
    expect(c.linhas).toHaveLength(2);
    expect(c.medidasComQuantidade).toBe(1);
    expect(c.faltando.map((l) => l.medidaId)).toEqual(['AREA_PAREDE_DUAS_FACES']);
  });

  it('item sem preço no catálogo não inventa valor', () => {
    const c = coberturaDoOrcamento([{ medidaId: 'AREA_PISO', quantidade: 10 }], [mapa('AREA_PISO', 'SEM_PRECO')], CATALOGO);
    expect(c.linhas[0].estado).toBe('COM_PRECO');
    expect(c.linhas[0].valor).toBeNull();
    expect(c.totalEstimado).toBe(0);
  });

  it('a lista do que falta vem da maior quantidade para a menor — é o que prioriza', () => {
    const c = coberturaDoOrcamento(
      [
        { medidaId: 'AREA_PISO', quantidade: 3 },
        { medidaId: 'AREA_PAREDE_DUAS_FACES', quantidade: 1240 },
        { medidaId: 'COMPRIMENTO_RODAPE', quantidade: 90 },
      ],
      [],
      CATALOGO,
    );
    expect(c.faltando.map((l) => l.quantidade)).toEqual([1240, 90, 3]);
  });
});
