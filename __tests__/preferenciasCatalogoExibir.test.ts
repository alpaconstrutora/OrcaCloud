import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ITENS_DE_EXIBICAO,
  chaveDeExibicao,
  linhasParaMigrar,
  valorDeExibicao,
} from '../utils/preferencias/catalogoExibir';
import type { LinhaDePreferencia } from '../utils/preferencias/resolver';
import { MODOS_DE_COR, ROTULO_DO_MODO_DE_COR } from '../utils/blueprintPaletas';
import {
  ESTILOS_3D,
  ESTILOS_DA_PLANTA,
  ROTULO_DO_ESTILO_3D,
  ROTULO_DO_ESTILO_DA_PLANTA,
} from '../utils/blueprintTemplatesDeVista';

const linha = (item: string, valor: unknown, escopo: LinhaDePreferencia['escopo'] = 'USUARIO'): LinhaDePreferencia => ({
  escopo,
  chave: chaveDeExibicao(item),
  valor,
});

describe('catálogo do que a planta exibe', () => {
  it('não repete item nem chave antiga', () => {
    const itens = ITENS_DE_EXIBICAO.map((i) => i.item);
    expect(new Set(itens).size).toBe(itens.length);
    const antigas = ITENS_DE_EXIBICAO.map((i) => i.chaveAntiga);
    expect(new Set(antigas).size).toBe(antigas.length);
  });

  it('toda chave antiga começa por blueprint: e o item é ela sem o prefixo e sem :v2', () => {
    for (const i of ITENS_DE_EXIBICAO) {
      expect(i.chaveAntiga.startsWith('blueprint:')).toBe(true);
      expect(i.item).toBe(i.chaveAntiga.replace(/^blueprint:/, '').replace(/:v2$/, ''));
    }
  });

  it('chaveDeExibicao monta planta.exibir.<item> e cabe em 100 caracteres', () => {
    expect(chaveDeExibicao('mostrarGrade')).toBe('planta.exibir.mostrarGrade');
    for (const i of ITENS_DE_EXIBICAO) {
      const chave = chaveDeExibicao(i.item);
      expect(chave.startsWith('planta.')).toBe(true);
      expect(chave.length).toBeLessThanOrEqual(100);
    }
  });

  it('todo item tem rótulo, grupo válido e padrão coerente com o tipo', () => {
    for (const i of ITENS_DE_EXIBICAO) {
      expect(i.rotulo.length).toBeGreaterThan(0);
      expect(['PLANTA', 'VISTAS', '3D', 'ESTILOS']).toContain(i.grupo);
      if (i.tipo === 'booleano') {
        expect(typeof i.padrao).toBe('boolean');
        expect(i.opcoes).toBeUndefined();
      } else if (i.tipo === 'opcao') {
        expect(i.opcoes && i.opcoes.length).toBeGreaterThan(1);
        expect(i.opcoes!.map((o) => o.valor)).toContain(i.padrao);
      } else {
        expect(i.padrao).toBeNull();
      }
    }
  });

  it('o padrão de cada item é o que o editor usa hoje (amostra por tipo)', () => {
    const p = (item: string) => ITENS_DE_EXIBICAO.find((i) => i.item === item)?.padrao;
    expect(p('mostrarGrade')).toBe(true);
    expect(p('mostrarMedidas')).toBe(false);
    expect(p('cotasSubRegioes')).toBe(false);
    expect(p('vista3dArmadura')).toBe(false);
    expect(p('vista3dPisosELajes')).toBe(true);
    expect(p('estiloPlanta')).toBe('TECNICA');
    expect(p('vista3dEstilo')).toBe('SOMBREADO');
    expect(p('modoDeCor')).toBe('NENHUM');
    expect(p('vista3dTerreno')).toBeNull();
  });

  it('o terreno 3D é automático e a chave de origem é a :v2', () => {
    const t = ITENS_DE_EXIBICAO.find((i) => i.item === 'vista3dTerreno');
    expect(t?.tipo).toBe('automatico');
    expect(t?.chaveAntiga).toBe('blueprint:vista3dTerreno:v2');
  });

  it('as opções dos estilos e do modo de cor são as que o código aceita hoje', () => {
    const op = (item: string) => ITENS_DE_EXIBICAO.find((i) => i.item === item)?.opcoes;
    expect(op('estiloPlanta')).toEqual(ESTILOS_DA_PLANTA.map((valor) => ({ valor, rotulo: ROTULO_DO_ESTILO_DA_PLANTA[valor] })));
    expect(op('vista3dEstilo')).toEqual(ESTILOS_3D.map((valor) => ({ valor, rotulo: ROTULO_DO_ESTILO_3D[valor] })));
    expect(op('modoDeCor')).toEqual(MODOS_DE_COR.map((valor) => ({ valor, rotulo: ROTULO_DO_MODO_DE_COR[valor] })));
  });

  it('o item modoDeCor leva o rótulo do menu Exibir', () => {
    expect(ITENS_DE_EXIBICAO.find((i) => i.item === 'modoDeCor')?.rotulo).toBe('Uma cor por ambiente');
  });

  it('"Camadas por disciplina" (seção do painel) não entra', () => {
    expect(ITENS_DE_EXIBICAO.some((i) => /camadas.*disciplina/i.test(i.rotulo))).toBe(false);
  });
});

describe('valorDeExibicao', () => {
  it('devolve o booleano gravado', () => {
    expect(valorDeExibicao([linha('mostrarGrade', false)], 'mostrarGrade')).toBe(false);
    expect(valorDeExibicao([linha('mostrarGrade', true)], 'mostrarGrade')).toBe(true);
  });

  it('undefined sem linha, com valor de outro tipo ou de outro escopo', () => {
    expect(valorDeExibicao([], 'mostrarGrade')).toBeUndefined();
    expect(valorDeExibicao([linha('mostrarGrade', 'sim')], 'mostrarGrade')).toBeUndefined();
    expect(valorDeExibicao([linha('mostrarGrade', 1)], 'mostrarGrade')).toBeUndefined();
    expect(valorDeExibicao([linha('mostrarGrade', null)], 'mostrarGrade')).toBeUndefined();
    expect(valorDeExibicao([linha('mostrarGrade', false, 'ORGANIZACAO')], 'mostrarGrade')).toBeUndefined();
    expect(valorDeExibicao([linha('mostrarGrade', false)], 'itemQueNaoExiste')).toBeUndefined();
  });

  it('não lança com lista estranha', () => {
    expect(valorDeExibicao(undefined as unknown as LinhaDePreferencia[], 'mostrarGrade')).toBeUndefined();
  });

  it('opção: vale só o que está em opcoes', () => {
    expect(valorDeExibicao([linha('estiloPlanta', 'HUMANIZADA')], 'estiloPlanta')).toBe('HUMANIZADA');
    expect(valorDeExibicao([linha('estiloPlanta', 'INEXISTENTE')], 'estiloPlanta')).toBeUndefined();
    expect(valorDeExibicao([linha('estiloPlanta', true)], 'estiloPlanta')).toBeUndefined();
  });

  it('automático: booleano ou null gravado', () => {
    expect(valorDeExibicao([linha('vista3dTerreno', null)], 'vista3dTerreno')).toBeNull();
    expect(valorDeExibicao([linha('vista3dTerreno', true)], 'vista3dTerreno')).toBe(true);
    expect(valorDeExibicao([linha('vista3dTerreno', false)], 'vista3dTerreno')).toBe(false);
    expect(valorDeExibicao([linha('vista3dTerreno', 'auto')], 'vista3dTerreno')).toBeUndefined();
    expect(valorDeExibicao([], 'vista3dTerreno')).toBeUndefined();
  });

  it('havendo linha repetida válida, vale a última', () => {
    expect(valorDeExibicao([linha('mostrarGrade', true), linha('mostrarGrade', false)], 'mostrarGrade')).toBe(false);
  });
});

describe('linhasParaMigrar', () => {
  const navegador = (mapa: Record<string, unknown>) => (chave: string) => mapa[chave];

  it('devolve só o que não tem linha no banco e tem valor válido no navegador', () => {
    const r = linhasParaMigrar(
      [linha('mostrarGrade', true)],
      navegador({
        'blueprint:mostrarGrade': false, // já no banco → não migra
        'blueprint:mostrarEixos': false, // migra
        'blueprint:estiloPlanta': 'HUMANIZADA', // migra
        'blueprint:vista3dTerreno:v2': true, // 'automatico' → fora da migração
      }),
    );
    expect(r).toEqual(
      expect.arrayContaining([
        { chave: 'planta.exibir.mostrarEixos', valor: false },
        { chave: 'planta.exibir.estiloPlanta', valor: 'HUMANIZADA' },
      ]),
    );
    expect(r).toHaveLength(2);
  });

  it('⚠️ item "automatico" (terreno 3D) fica FORA da migração, com true ou false no navegador', () => {
    expect(linhasParaMigrar([], navegador({ 'blueprint:vista3dTerreno:v2': true }))).toEqual([]);
    expect(linhasParaMigrar([], navegador({ 'blueprint:vista3dTerreno:v2': false }))).toEqual([]);
  });

  it('não migra o que é IGUAL ao padrão (o usePersistedState grava o padrão ao montar; migrar congelaria o padrão)', () => {
    const r = linhasParaMigrar(
      [],
      navegador({
        'blueprint:mostrarGrade': true, // padrão true → não migra
        'blueprint:mostrarMedidas': false, // padrão false → não migra
        'blueprint:estiloPlanta': 'TECNICA', // padrão → não migra
        'blueprint:modoDeCor': 'AMBIENTE', // difere → migra
        'blueprint:mostrarEixos': false, // difere → migra
      }),
    );
    expect(r).toEqual([
      { chave: 'planta.exibir.mostrarEixos', valor: false },
      { chave: 'planta.exibir.modoDeCor', valor: 'AMBIENTE' },
    ]);
  });

  it('ignora valor inválido, ausente ou de outro tipo no navegador', () => {
    const r = linhasParaMigrar(
      [],
      navegador({
        'blueprint:mostrarGrade': 'sim',
        'blueprint:mostrarEixos': undefined,
        'blueprint:estiloPlanta': 'NAO_EXISTE',
        'blueprint:vista3dEstilo': 42,
        'blueprint:vista3dTerreno:v2': null,
      }),
    );
    expect(r).toEqual([]);
  });

  it('não devolve nada quando tudo já está no banco', () => {
    const linhas = ITENS_DE_EXIBICAO.map((i) => linha(i.item, i.padrao));
    const r = linhasParaMigrar(linhas, () => false);
    expect(r).toEqual([]);
  });

  it('linha só de outro escopo no banco não conta: o navegador ainda migra', () => {
    const r = linhasParaMigrar([linha('mostrarGrade', true, 'ORGANIZACAO')], navegador({ 'blueprint:mostrarGrade': false }));
    expect(r).toEqual([{ chave: 'planta.exibir.mostrarGrade', valor: false }]);
  });

  it('não lança se a leitura do navegador lançar', () => {
    expect(() =>
      linhasParaMigrar([], () => {
        throw new Error('storage bloqueado');
      }),
    ).not.toThrow();
  });
});

describe('teste-trava: o editor não guarda mais estas escolhas só no navegador', () => {
  // ativado na tarefa 3 (quando o editor trocar usePersistedState por usePreferenciaDaPlanta)
  it.skip('nenhuma chaveAntiga do catálogo aparece num usePersistedState( do editor', () => {
    const fonte = readFileSync(resolve(__dirname, '../components/blueprint/BlueprintEditor.tsx'), 'utf8');
    const ainda = ITENS_DE_EXIBICAO.filter((i) => {
      const re = new RegExp(`usePersistedState(<[^(]*>)?\\(\\s*['"\`]${i.chaveAntiga.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`);
      return re.test(fonte);
    }).map((i) => i.chaveAntiga);
    expect(ainda).toEqual([]);
  });
});
