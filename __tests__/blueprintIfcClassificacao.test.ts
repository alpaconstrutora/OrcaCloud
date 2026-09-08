/**
 * A CLASSIFICAÇÃO SINAPI no IFC (07/09/2026 — Etapa 4 do roadmap BIM).
 *
 * ─── POR QUE ISTO NÃO É O `ItemCode` DE NOVO ────────────────────────────────
 *
 * `Pset_OpuraPlanta.ItemCode` é etiqueta nossa: quem abre o arquivo lê
 * "ItemCode: 87879" e não sabe de que catálogo é. `IfcClassification` declara a
 * FONTE e `IfcClassificationReference`, o item — é o que faz um Solibri ou um
 * Navisworks agrupar, filtrar e cruzar com a planilha de quem recebe.
 *
 * ⚠️ E é o mesmo perigo do Pset vazio: classificação sem item parece
 * informação. Metade destes casos é sobre o que NÃO se emite.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type CamadaParede,
  type Command,
} from '../utils/blueprintKernel';
import { gerarIfc } from '../utils/blueprintIfc';
import { noIfc } from './apoio/textoNoIfc';

const H = 2800;
const OPC = {
  titulo: 'Casa',
  revisao: 1,
  hash: 'a'.repeat(64),
  data: new Date('2026-09-07T12:00:00Z'),
};

const CAMADAS = (...codigos: string[]): CamadaParede[] =>
  codigos.map((itemCode, i) => ({
    espessuraMm: 50 + i,
    itemCode,
    descricao: `Camada ${i}`,
    funcao: 'VEDACAO' as const,
  }));

function modeloComCamadas(camadasPorParede: (CamadaParede[] | undefined)[]) {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  }).model;
  const levelId = base.levels[0].id;
  const pontos: [number, number, number, number][] = [
    [0, 0, 4000, 0],
    [4000, 0, 4000, 3000],
    [4000, 3000, 0, 3000],
    [0, 3000, 0, 0],
  ];
  const comandos: Command[] = pontos.map(([ax, ay, bx, by], i) => ({
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: 150,
    heightMm: H,
    ...(camadasPorParede[i] ? { camadas: camadasPorParede[i] } : {}),
  }));
  return applyBatch(base, comandos).model;
}

const casa = (camadasPorParede: (CamadaParede[] | undefined)[], opcoes = {}): string =>
  gerarIfc(modeloComCamadas(camadasPorParede), { ...OPC, ...opcoes });

// ⚠️ A linha sai como `#168= IFCWALL(...)`, com ESPAÇO depois do `=`. Casar sem
// ele fez os oito casos deste arquivo falharem de uma vez — e o sintoma era
// "expected 0 to be 1", que parece defeito do produto e era do teste.
const contar = (ifc: string, entidade: string) =>
  (ifc.match(new RegExp(`= ?${entidade}\\(`, 'g')) ?? []).length;

const ASPA = String.fromCharCode(39);

/** Os argumentos de topo de uma entidade, respeitando parênteses aninhados. */
function atributos(linha: string): string[] {
  const dentro = linha.slice(linha.indexOf('(') + 1, linha.lastIndexOf(')'));
  const saida: string[] = [];
  let profundidade = 0;
  let atual = '';
  let emTexto = false;
  for (const c of dentro) {
    if (c === ASPA) emTexto = !emTexto;
    if (!emTexto && c === '(') profundidade++;
    if (!emTexto && c === ')') profundidade--;
    if (!emTexto && c === ',' && profundidade === 0) {
      saida.push(atual);
      atual = '';
    } else atual += c;
  }
  saida.push(atual);
  return saida;
}

const linhasDe = (ifc: string, entidade: string) =>
  ifc.split('\n').filter((l) => new RegExp(`= ?${entidade}\\(`).test(l));

const linhaDe = (ifc: string, entidade: string) => linhasDe(ifc, entidade)[0];

/** O `#N` de uma linha STEP. */
const refDe = (linha: string) => linha.slice(0, linha.indexOf('=')).trim();

/**
 * O texto como ele aparece no arquivo — entre aspas e com o acento ESCAPADO.
 *
 * ⚠️ Escapar aqui, e não afrouxar a asserção: desde 07/09/2026 a string de STEP
 * sai em ASCII (`Base Pr\X2\00F3\X0\pria`), porque UTF-8 cru fazia um receptor
 * truncar a string no primeiro byte não-ASCII, em silêncio.
 */
const texto = (v: string) => `${ASPA}${noIfc(v)}${ASPA}`;

describe('classificação · o que sai', () => {
  it('UMA classificação por arquivo, nomeando o catálogo', () => {
    // Sem a fonte declarada, quem recebe procura o código na tabela errada.
    const ifc = casa([CAMADAS('87879'), undefined, undefined, undefined]);
    expect(contar(ifc, 'IFCCLASSIFICATION')).toBe(1);
    expect(linhaDe(ifc, 'IFCCLASSIFICATION')).toContain(texto('SINAPI'));
  });

  it('a fonte pode ser outra, e aí é ELA que sai', () => {
    const ifc = casa([CAMADAS('X1'), undefined, undefined, undefined], {
      fonteDaClassificacao: 'Base Própria',
    });
    expect(linhaDe(ifc, 'IFCCLASSIFICATION')).toContain(texto('Base Própria'));
  });

  it('UMA referência por código DISTINTO, e não por elemento', () => {
    // Três paredes com o mesmo código dão uma referência só. Num prédio com 800
    // paredes do mesmo bloco isso é uma linha em vez de 800.
    const ifc = casa([CAMADAS('87879'), CAMADAS('87879'), CAMADAS('87879'), CAMADAS('99999')]);
    expect(contar(ifc, 'IFCCLASSIFICATIONREFERENCE')).toBe(2);
    expect(contar(ifc, 'IFCRELASSOCIATESCLASSIFICATION')).toBe(2);
  });

  it('a parede com VÁRIAS camadas entra em TODAS as referências', () => {
    // Eleger uma camada "principal" exigiria um critério que ninguém informou.
    const ifc = casa([CAMADAS('A', 'B', 'C'), undefined, undefined, undefined]);
    expect(contar(ifc, 'IFCCLASSIFICATIONREFERENCE')).toBe(3);
    const paredes = linhasDe(ifc, 'IFCWALL');
    expect(paredes.length).toBeGreaterThan(0);
    const idDaParede = refDe(paredes[0]);
    const relacoes = linhasDe(ifc, 'IFCRELASSOCIATESCLASSIFICATION');
    expect(relacoes).toHaveLength(3);
    for (const l of relacoes) expect(l).toContain(`(${idDaParede})`);
  });

  it('a relação aponta para o PRODUTO, e a referência para a classificação', () => {
    const ifc = casa([CAMADAS('87879'), undefined, undefined, undefined]);
    const classificacao = refDe(linhaDe(ifc, 'IFCCLASSIFICATION'));
    expect(atributos(linhaDe(ifc, 'IFCCLASSIFICATIONREFERENCE'))[3]).toBe(classificacao);
    const referencia = refDe(linhaDe(ifc, 'IFCCLASSIFICATIONREFERENCE'));
    expect(atributos(linhaDe(ifc, 'IFCRELASSOCIATESCLASSIFICATION'))[5]).toBe(referencia);
  });
});

describe('classificação · o que NÃO sai', () => {
  it('desenho SEM código não gera classificação nenhuma', () => {
    // Classificação vazia é pior que ausência: parece informação.
    const ifc = casa([undefined, undefined, undefined, undefined]);
    expect(contar(ifc, 'IFCCLASSIFICATION')).toBe(0);
    expect(contar(ifc, 'IFCCLASSIFICATIONREFERENCE')).toBe(0);
    expect(contar(ifc, 'IFCRELASSOCIATESCLASSIFICATION')).toBe(0);
  });

  it('camada com código VAZIO ou só espaço não vira referência', () => {
    // `itemCode` vazio é legítimo no kernel: a camada existe e ainda não foi
    // vinculada ao catálogo. Emitir uma referência em branco seria afirmar.
    const ifc = casa([CAMADAS('', '   ', '87879'), undefined, undefined, undefined]);
    expect(contar(ifc, 'IFCCLASSIFICATIONREFERENCE')).toBe(1);
    expect(linhaDe(ifc, 'IFCCLASSIFICATIONREFERENCE')).toContain(texto('87879'));
  });
});

describe('classificação · o schema IFC4', () => {
  it('as três entidades têm a contagem de atributos do schema', () => {
    // Errar isto abre num leitor e falha noutro — o defeito que só aparece na
    // máquina de quem recebeu o arquivo.
    const ifc = casa([CAMADAS('87879'), undefined, undefined, undefined]);
    expect(atributos(linhaDe(ifc, 'IFCCLASSIFICATION'))).toHaveLength(7);
    expect(atributos(linhaDe(ifc, 'IFCCLASSIFICATIONREFERENCE'))).toHaveLength(6);
    expect(atributos(linhaDe(ifc, 'IFCRELASSOCIATESCLASSIFICATION'))).toHaveLength(6);
  });

  it('a ordem das referências é a ALFABÉTICA do código, não a de inserção', () => {
    // Duas exportações do MESMO modelo têm de dar o mesmo arquivo — comparar
    // versões é metade do motivo de exportar IFC. As camadas entram na ordem
    // ZZ, AA, MM e saem AA, MM, ZZ.
    //
    // ⚠️ Comparar `casa(x)` com `casa(x)` NÃO serve: `casa` constrói o modelo de
    // novo, e o `uid` nasce aleatório — dois modelos diferentes, não duas
    // exportações. Meu primeiro teste fazia isso e falhava por motivo errado.
    const modelo = modeloComCamadas([CAMADAS('ZZ', 'AA'), CAMADAS('MM'), undefined, undefined]);
    expect(gerarIfc(modelo, OPC)).toBe(gerarIfc(modelo, OPC));

    const codigos = linhasDe(gerarIfc(modelo, OPC), 'IFCCLASSIFICATIONREFERENCE').map(
      (l) => atributos(l)[1],
    );
    expect(codigos).toEqual([texto('AA'), texto('MM'), texto('ZZ')]);
  });
});
