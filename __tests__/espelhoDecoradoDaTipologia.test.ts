/**
 * "VER DECORADO" POR TIPOLOGIA (Espelho de Vendas 3D, F8 — 10/11/2026): qual decorado a ficha da unidade mostra, em
 * que ordem, e o que falta para gravar um ambiente. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import { describe, expect, it } from 'vitest';
import {
  MAXIMO_DE_AMBIENTES,
  decoradoDaUnidade,
  decoradoDoCadastro,
  decoradoParaAFicha,
  decoradosPorChave,
  problemaDoAmbiente,
  rotuloDoSelo,
  type ImagemDoDecorado,
} from '../utils/espelhoDecoradoDaTipologia';

const img = (over: Partial<ImagemDoDecorado>): ImagemDoDecorado => ({
  empreendimento_id: 'E1',
  tipologia: 'Tipo 1',
  tipologia_chave: 'tipo 1',
  papel: 'AMBIENTE',
  legenda: 'Sala',
  ordem: 0,
  imagem_url: `https://x/${over.legenda ?? over.papel ?? 'img'}.jpg`,
  origem: 'ENVIADA',
  ...over,
});

describe('decoradoDaUnidade', () => {
  it('o corte vem primeiro, depois os ambientes na ordem cadastrada', () => {
    const porChave = decoradosPorChave([
      img({ legenda: 'Suíte', ordem: 1 }),
      img({ legenda: 'Sala', ordem: 0 }),
      img({ papel: 'CORTE', legenda: null, ordem: 0 }),
    ]);
    expect(decoradoDaUnidade(porChave, 'Tipo 1')!.imagens.map((i) => i.titulo)).toEqual(['Corte 3D mobiliado', 'Sala', 'Suíte']);
  });

  it('casa a tipologia sem acento, caixa nem espaço sobrando (a chave da F5)', () => {
    const porChave = decoradosPorChave([img({ tipologia: 'Cobertura Dúplex', tipologia_chave: 'cobertura duplex' })]);
    expect(decoradoDaUnidade(porChave, '  COBERTURA   duplex ')).not.toBeNull();
  });

  it('só ambientes, sem corte: a ficha mostra os ambientes', () => {
    const porChave = decoradosPorChave([img({ legenda: 'Varanda' })]);
    expect(decoradoDaUnidade(porChave, 'Tipo 1')!.imagens).toEqual([{ url: 'https://x/Varanda.jpg', titulo: 'Varanda', origem: 'ENVIADA' }]);
  });

  it('só o corte, gerado pela Planta: o título padrão e a origem PLANTA', () => {
    const porChave = decoradosPorChave([img({ papel: 'CORTE', legenda: null, origem: 'PLANTA' })]);
    expect(decoradoDaUnidade(porChave, 'Tipo 1')!.imagens).toEqual([{ url: 'https://x/CORTE.jpg', titulo: 'Corte 3D mobiliado', origem: 'PLANTA' }]);
  });

  it('tipologia sem decorado, ou unidade sem tipologia = null', () => {
    const porChave = decoradosPorChave([img({})]);
    expect(decoradoDaUnidade(porChave, 'Tipo 2')).toBeNull();
    expect(decoradoDaUnidade(porChave, null)).toBeNull();
    expect(decoradoDaUnidade(porChave, '')).toBeNull();
  });

  it('dois empreendimentos no mesmo prédio com a mesma tipologia: vale o primeiro, sem misturar os decorados', () => {
    const porChave = decoradosPorChave([img({ legenda: 'Sala A', empreendimento_id: 'E1' }), img({ legenda: 'Sala B', empreendimento_id: 'E2' })]);
    expect(decoradoDaUnidade(porChave, 'Tipo 1')!.imagens.map((i) => i.titulo)).toEqual(['Sala A']);
  });
});

describe('decoradoParaAFicha', () => {
  it('prédio sem decorado nenhum: a chave nem aparece (a ficha não fala em decorado)', () => {
    expect(decoradoParaAFicha(decoradosPorChave([]), 'Tipo 1')).toEqual({});
    expect('decorado' in decoradoParaAFicha(decoradosPorChave(null), 'Tipo 1')).toBe(false);
  });

  it('prédio com decorado, mas não desta tipologia: null (botão desligado com o motivo)', () => {
    expect(decoradoParaAFicha(decoradosPorChave([img({})]), 'Tipo 9')).toEqual({ decorado: null });
  });
});

describe('rotuloDoSelo', () => {
  it('imagem enviada é "Imagem ilustrativa"; o corte da Planta diz que o mobiliário é ilustrativo', () => {
    expect(rotuloDoSelo('ENVIADA')).toBe('Imagem ilustrativa');
    expect(rotuloDoSelo('PLANTA')).toBe('Gerado do projeto · mobiliário ilustrativo');
  });
});

describe('problemaDoAmbiente', () => {
  it('diz o que falta, na ordem em que se preenche', () => {
    expect(problemaDoAmbiente({ temArquivo: false, nome: '', ambientesJaGravados: 0 })).toBe('Escolha a imagem do ambiente.');
    expect(problemaDoAmbiente({ temArquivo: true, nome: '   ', ambientesJaGravados: 0 })).toBe('Dê o nome do ambiente (ex: Sala, Suíte).');
    expect(problemaDoAmbiente({ temArquivo: true, nome: 'x'.repeat(61), ambientesJaGravados: 0 })).toMatch(/passa de 60/);
    expect(problemaDoAmbiente({ temArquivo: true, nome: 'Suíte', ambientesJaGravados: 0 })).toBeNull();
  });

  it('com o máximo de ambientes, recusa antes de pedir a imagem', () => {
    expect(problemaDoAmbiente({ temArquivo: false, nome: '', ambientesJaGravados: MAXIMO_DE_AMBIENTES })).toMatch(/já tem 12 ambientes/);
  });
});

describe('decoradoDoCadastro', () => {
  it('separa o corte dos ambientes da tipologia escolhida, e ignora as outras', () => {
    const lista = [img({ papel: 'CORTE', legenda: null }), img({ legenda: 'Suíte', ordem: 1 }), img({ legenda: 'Sala', ordem: 0 }), img({ tipologia_chave: 'tipo 2', legenda: 'Outra' })];
    const d = decoradoDoCadastro(lista, 'tipo 1');
    expect(d.corte?.papel).toBe('CORTE');
    expect(d.ambientes.map((a) => a.legenda)).toEqual(['Sala', 'Suíte']);
    expect(decoradoDoCadastro(lista, 'tipo 3')).toEqual({ corte: null, ambientes: [] });
  });
});
