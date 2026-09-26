/**
 * MEMORIAL DO LOTEAMENTO (B4) — o texto que vai ao cartório.
 *
 * O que estes casos travam:
 *
 *  - o GIRO do memorial é frente → direita → fundo → esquerda, que é a ordem
 *    que o registrador espera; embaralhar não dá erro nenhum e o documento sai
 *    errado;
 *  - a ausência de coordenadas é DITA, não omitida: quem recebe um memorial sem
 *    azimute precisa saber que é por falta de georreferência;
 *  - no CSV de locação, NORTE é o Y e ESTE é o X. Trocar espelha o loteamento
 *    inteiro no campo sem nenhum sinal na tela.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel } from '../utils/blueprintKernel';
import {
  memorialDeLote,
  memoriaisDoLoteamento,
  memorialDeAreaPublica,
  memorialDoLoteamento,
  documentoDoLoteamento,
  tabelaDeLotes,
  tabelaDeQuadras,
  tabelaDeVias,
  pontosDeLocacao,
  csvDeLocacao,
  pendenciasDosMemoriais,
  numeroBr,
  AVISO_SEM_GEORREFERENCIA,
  type DadosDoLoteamento,
} from '../utils/blueprintMemorialLote';

const DADOS: DadosDoLoteamento = {
  nome: 'Loteamento Alvorada',
  municipio: 'Belo Horizonte',
  uf: 'MG',
  matricula: '12.345',
  cartorio: '2º Ofício de Registro de Imóveis',
  responsavelTecnico: 'Eng. Fulano de Tal',
  registroDoConselho: 'CREA-MG 123456',
};

function base(): BlueprintModel {
  return applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
}

/** Quadra 36 × 30 m com três lotes de 12 m e a rua ao sul. */
function loteamento(): BlueprintModel {
  const m = base();
  const levelId = m.levels[0].id;
  const comEstrutura = applyBatch(m, [
    { type: 'AddQuadra', levelId, nome: 'A', pontos: [{ x: 0, y: 0 }, { x: 36000, y: 0 }, { x: 36000, y: 30000 }, { x: 0, y: 30000 }] },
    { type: 'AddVia', levelId, nome: 'Rua das Acácias', eixo: [{ x: -20000, y: -6000 }, { x: 56000, y: -6000 }], larguraMm: 12000, calcadaMm: 2000 },
    { type: 'AddAreaPublica', levelId, tipo: 'VERDE', nome: 'Praça Central', pontos: [{ x: 40000, y: 0 }, { x: 55000, y: 0 }, { x: 55000, y: 20000 }, { x: 40000, y: 20000 }] },
  ]).model;
  const quadraId = comEstrutura.quadras[0].id;
  return applyBatch(
    comEstrutura,
    [0, 1, 2].map((i) => ({
      type: 'AddLote' as const,
      levelId,
      quadraId,
      numero: String(i + 1),
      pontos: [
        { x: i * 12000, y: 0 },
        { x: (i + 1) * 12000, y: 0 },
        { x: (i + 1) * 12000, y: 30000 },
        { x: i * 12000, y: 30000 },
      ],
    })),
  ).model;
}

describe('memorial de um lote', () => {
  it('identifica, mede e confronta, na ordem do registro', () => {
    const m = loteamento();
    const meio = m.lotes[1];
    const memorial = memorialDeLote(m, meio, DADOS);

    expect(memorial.texto).toContain('LOTE 2 DA QUADRA A');
    expect(memorial.texto).toContain('Loteamento Alvorada');
    expect(memorial.texto).toContain('Belo Horizonte - MG');
    expect(memorial.texto).toContain('360,00 m²');
    expect(memorial.texto).toContain('84,00 m'); // perímetro

    // O giro: frente primeiro, fundos por último antes da lateral esquerda.
    const iFrente = memorial.texto.indexOf('de frente');
    const iDireita = memorial.texto.indexOf('pelo lado direito');
    const iFundos = memorial.texto.indexOf('nos fundos');
    const iEsquerda = memorial.texto.indexOf('pelo lado esquerdo');
    expect(iFrente).toBeGreaterThan(-1);
    expect(iFrente).toBeLessThan(iDireita);
    expect(iDireita).toBeLessThan(iFundos);
    expect(iFundos).toBeLessThan(iEsquerda);

    // A frente dá para a rua; as laterais, para os vizinhos.
    expect(memorial.texto).toContain('mede 12,00 m de frente, confrontando com Rua das Acácias');
    expect(memorial.texto).toMatch(/pelo lado (direito|esquerdo), confrontando com Lote [13] da quadra A/);
  });

  it('traz a origem na matrícula e nomeia o responsável técnico', () => {
    const m = loteamento();
    const memorial = memorialDeLote(m, m.lotes[0], DADOS);
    expect(memorial.texto).toContain('matrícula nº 12.345');
    expect(memorial.texto).toContain('2º Ofício de Registro de Imóveis');
    expect(memorial.texto).toContain('Eng. Fulano de Tal');
    expect(memorial.texto).toContain('CREA-MG 123456');
  });

  it('DIZ que não tem coordenadas, em vez de omitir', () => {
    const m = loteamento();
    const memorial = memorialDeLote(m, m.lotes[0], DADOS);
    expect(memorial.avisos).toContain(AVISO_SEM_GEORREFERENCIA);
    expect(AVISO_SEM_GEORREFERENCIA).toMatch(/georreferenciamento/i);
  });

  it('acusa o lote encravado e o lado sem confrontante', () => {
    const m = base();
    const sozinho = applyBatch(m, [
      { type: 'AddLote', levelId: m.levels[0].id, numero: '9', pontos: [{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 30000 }, { x: 0, y: 30000 }] },
    ]).model;
    const memorial = memorialDeLote(sozinho, sozinho.lotes[0], DADOS);
    expect(memorial.avisos.some((a) => /encravado/i.test(a))).toBe(true);
    expect(memorial.avisos.some((a) => /sem confrontante/i.test(a))).toBe(true);
    expect(memorial.avisos.some((a) => /fora de qualquer quadra/i.test(a))).toBe(true);
  });

  it('os memoriais saem na ordem quadra → número, com numeração natural', () => {
    const m = loteamento();
    const levelId = m.levels[0].id;
    // O lote 10 tem de vir DEPOIS do 2, não entre o 1 e o 2 (ordem natural).
    const comDez = applyBatch(m, [
      { type: 'AddLote', levelId, quadraId: m.quadras[0].id, numero: '10', pontos: [{ x: 0, y: 30000 }, { x: 12000, y: 30000 }, { x: 12000, y: 40000 }, { x: 0, y: 40000 }] },
    ]).model;
    const ordem = memoriaisDoLoteamento(comDez, DADOS).map((x) => x.titulo);
    expect(ordem).toEqual([
      'Quadra A · Lote 1',
      'Quadra A · Lote 2',
      'Quadra A · Lote 3',
      'Quadra A · Lote 10',
    ]);
  });
});

describe('memorial da área pública e do loteamento', () => {
  it('a área pública cita a destinação e o art. 22 da Lei 6.766', () => {
    const m = loteamento();
    const texto = memorialDeAreaPublica(m.areasPublicas[0], DADOS);
    expect(texto).toContain('PRAÇA CENTRAL');
    expect(texto).toContain('300,00 m²'); // 15 × 20
    expect(texto).toContain('área verde e lazer');
    expect(texto).toContain('art. 22 da Lei 6.766/79');
  });

  it('o memorial do loteamento abre com o quadro de áreas e as quadras', () => {
    const m = loteamento();
    const texto = memorialDoLoteamento(m, 1080 * 1e6, DADOS);
    expect(texto).toContain('MEMORIAL DESCRITIVO — LOTEAMENTO ALVORADA');
    expect(texto).toContain('matrícula nº 12.345');
    expect(texto).toContain('1 quadra(s) e 3 lote(s)');
    expect(texto).toContain('Lotes: 3 un — 1080,00 m²');
    expect(texto).toContain('Quadra A: 3 lote(s)');
    expect(texto).toContain(AVISO_SEM_GEORREFERENCIA);
  });

  it('o documento completo tem abertura, os lotes e as áreas públicas', () => {
    const m = loteamento();
    const doc = documentoDoLoteamento(m, 1080 * 1e6, DADOS);
    expect(doc).toContain('MEMORIAL DESCRITIVO —');
    expect(doc).toContain('DESCRIÇÃO DOS LOTES');
    expect(doc).toContain('LOTE 1 DA QUADRA A');
    expect(doc).toContain('LOTE 3 DA QUADRA A');
    expect(doc).toContain('ÁREAS PÚBLICAS');
    expect(doc).toContain('PRAÇA CENTRAL');
  });
});

describe('tabelas', () => {
  it('a tabela de lotes traz área, testada e o confrontante da frente', () => {
    const linhas = tabelaDeLotes(loteamento());
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toMatchObject({ quadra: 'A', lote: '1', areaM2: 360, testadaM: 12, perimetroM: 84 });
    expect(linhas[0].confrontanteDaFrente).toBe('Rua das Acácias');
  });

  it('a tabela de quadras resume contagem, área e os extremos', () => {
    const q = tabelaDeQuadras(loteamento());
    expect(q).toEqual([{ quadra: 'A', lotes: 3, areaM2: 1080, menorLoteM2: 360, maiorLoteM2: 360 }]);
  });

  it('a via entra pela FAIXA, não pelo comprimento do eixo', () => {
    const vias = tabelaDeVias(loteamento());
    expect(vias[0].nome).toBe('Rua das Acácias');
    expect(vias[0].comprimentoM).toBe(76);
    expect(vias[0].larguraM).toBe(12);
    expect(vias[0].areaM2).toBeCloseTo(912, 1); // 76 × 12
  });

  it('as pendências separam o aviso de georreferência do defeito de desenho', () => {
    // ⚠️ Os três lotes TÊM pendência, e está certo: numa fileira só, o fundo de
    // cada um não confronta com nada desenhado. Num loteamento real o fundo dá
    // para a quadra vizinha ou para a divisa da gleba — a ausência aqui é
    // informação verdadeira, e é isso que o memorial precisa dizer antes de ir
    // ao cartório com um lado em branco.
    expect(pendenciasDosMemoriais(loteamento())).toEqual({ lotes: 3, comAviso: 3 });

    // Com a segunda fileira de costas, o fundo passa a confrontar e o aviso
    // muda de natureza: sobra só o das laterais das pontas.
    const m0 = loteamento();
    const comFundo = applyBatch(
      m0,
      [0, 1, 2].map((i) => ({
        type: 'AddLote' as const,
        levelId: m0.levels[0].id,
        quadraId: m0.quadras[0].id,
        numero: String(i + 4),
        pontos: [
          { x: i * 12000, y: 30000 },
          { x: (i + 1) * 12000, y: 30000 },
          { x: (i + 1) * 12000, y: 60000 },
          { x: i * 12000, y: 60000 },
        ],
      })),
    ).model;
    const memorialDoMeio = memoriaisDoLoteamento(comFundo).find((x) => x.titulo === 'Quadra A · Lote 2');
    const fundo = memorialDoMeio?.lados.find((l) => l.papel === 'FUNDO');
    expect(fundo?.confrontante).toContain('Lote 5');

    const m = base();
    const encravado = applyBatch(m, [
      { type: 'AddLote', levelId: m.levels[0].id, numero: '1', pontos: [{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 30000 }, { x: 0, y: 30000 }] },
    ]).model;
    expect(pendenciasDosMemoriais(encravado)).toEqual({ lotes: 1, comAviso: 1 });
  });
});

describe('pontos de locação', () => {
  it('nomeia cada vértice por quadra e lote', () => {
    const pontos = pontosDeLocacao(loteamento());
    expect(pontos).toHaveLength(12); // 3 lotes × 4 vértices
    expect(pontos[0].nome).toBe('QAL1-1');
    expect(pontos[3].nome).toBe('QAL1-4');
    expect(pontos[0].descricao).toContain('quadra A');
  });

  it('no CSV, NORTE é o Y e ESTE é o X — trocar espelha o campo inteiro', () => {
    const csv = csvDeLocacao(loteamento());
    const linhas = csv.split('\n');
    expect(linhas[0]).toBe('ponto;norte;este;cota;descricao');

    // O vértice QAL1-2 está em x = 12000 mm, y = 0: norte 0,000 e este 12,000.
    const segundo = linhas.find((l) => l.startsWith('QAL1-2;'));
    expect(segundo).toBeDefined();
    const [, norte, este] = (segundo as string).split(';');
    expect(norte).toBe('0,000');
    expect(este).toBe('12,000');
  });

  it('o número sai no formato brasileiro', () => {
    expect(numeroBr(1234.5)).toBe('1234,50');
    expect(numeroBr(12.3456, 3)).toBe('12,346');
  });
});
