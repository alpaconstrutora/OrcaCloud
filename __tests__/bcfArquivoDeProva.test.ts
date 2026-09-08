/**
 * GERA O PAR DE PROVA — o `.bcfzip` e o IFC do MESMO desenho.
 *
 * ─── POR QUE O PAR, E NÃO SÓ O BCF ──────────────────────────────────────────
 *
 * O BCF aponta os elementos por `IfcGuid` e não os descreve. Sozinho, ele abre
 * num visualizador com a pendência na lista e NADA para selecionar — o que
 * pareceria defeito do nosso lado e não seria. Os dois arquivos são um teste
 * só.
 *
 * ─── E POR QUE ISTO É UM TESTE, E NÃO UM SCRIPT SOLTO ───────────────────────
 *
 * Ele AFIRMA o que os arquivos contêm. A tabela que vai junto é derivada destas
 * asserções, e não da minha memória: se o gerador mudar, o teste quebra antes
 * de alguém abrir o arquivo e conferir uma expectativa desatualizada. É a mesma
 * disciplina do arquivo de prova do IFC.
 *
 * Roda com `BCF_PROVA=1`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  conflitosDoModelo,
  emptyModel,
  point,
  rotuloCurto,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { gerarIfc } from '../utils/blueprintIfc';
import { topicosDeComentarios, topicosDeConflitos } from '../utils/blueprintBcf';
import { montarBcf } from '../services/blueprintExportService';
import { PAPEIS } from '../utils/blueprintExport';

const LIGADO = process.env.BCF_PROVA === '1';
const DESTINO = process.env.BCF_PROVA_DIR ?? 'C:/Users/altai/Desktop/prova-bcf';
const AGORA = new Date('2026-09-08T15:00:00Z');
const H = 2800;

/**
 * A casa de prova do BCF: uma sala, uma viga atravessando, e um eletroduto
 * cruzando a viga na altura dela.
 *
 * O conflito é DE PROPÓSITO fácil de reconhecer a olho: o cano corta a viga
 * pelo meio, perpendicular. Se o receptor selecionar as duas peças certas, o
 * guid funcionou.
 */
function casa(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId: t,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: 200,
    heightMm: H,
  });
  const m1 = applyBatch(base, [
    p(0, 0, 8000, 0),
    p(8000, 0, 8000, 5000),
    p(8000, 5000, 0, 5000),
    p(0, 5000, 0, 0),
  ]).model;

  const m2 = applyCommand(m1, {
    type: 'AddStructural',
    levelId: t,
    kind: 'VIGA',
    pontos: [point(0, 2500), point(8000, 2500)],
    larguraMm: 200,
    alturaMm: 400,
    baseMm: 2400,
  }).model;

  const m3 = applyCommand(m2, {
    type: 'AddTerminal',
    levelId: t,
    disciplina: 'ELETRICA',
    tipo: 'Tomada baixa',
    at: point(4000, 200),
    cotaMm: 300,
  }).model;

  // O ELETRODUTO que atravessa a viga — o conflito.
  return applyCommand(m3, {
    type: 'AddTrecho',
    levelId: t,
    disciplina: 'ELETRICA',
    a: point(4000, 200),
    b: point(4000, 4800),
    cotaAMm: 2600,
    cotaBMm: 2600,
    bitolaMm: 25,
    rotulo: 'E1',
  }).model;
}

describe.skipIf(!LIGADO)('par de prova BCF + IFC', () => {
  it('escreve os dois, e AFIRMA o que eles contêm', async () => {
    mkdirSync(DESTINO, { recursive: true });
    const model = casa();

    // ── O conflito ────────────────────────────────────────────────────────
    const conflitos = conflitosDoModelo(model);
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0].classe).toBe('ESTRUTURA');
    // A viga tem 200 mm e o cano a cruza de lado a lado.
    expect(conflitos[0].comprimentoDentroMm).toBeCloseTo(200, 3);

    // ── Dois comentários, um aberto e um resolvido ───────────────────────
    const parede = model.walls.find((w) => w.a.y === 0 && w.b.y === 0)!;
    const comentarios = topicosDeComentarios([
      {
        id: 'prova-1',
        elementUid: parede.uid,
        texto: 'Esta fachada leva revestimento cerâmico até 2,10 m — conferir a espessura.',
        autorEmail: 'coordenacao@alpaconstrutora.com.br',
        criadoEm: '2026-09-05T10:00:00Z',
        resolvidoEm: null,
        ponto: { x: 4000, y: 0, z: 1200 },
      },
      {
        id: 'prova-2',
        elementUid: model.structures[0].uid,
        texto: 'Altura da viga confirmada com o calculista.\nMantida em 40 cm.',
        autorEmail: 'coordenacao@alpaconstrutora.com.br',
        criadoEm: '2026-09-04T10:00:00Z',
        resolvidoEm: '2026-09-06T10:00:00Z',
        ponto: { x: 4000, y: 2500, z: 2600 },
      },
    ]);

    const topicos = [
      ...topicosDeConflitos(model, conflitos, 'coordenacao@alpaconstrutora.com.br', AGORA),
      ...comentarios,
    ];
    expect(topicos).toHaveLength(3);
    expect(topicos.filter((t) => t.tipo === 'Clash')).toHaveLength(1);
    expect(topicos.filter((t) => t.status === 'Closed')).toHaveLength(1);

    // ── Os dois arquivos ─────────────────────────────────────────────────
    const opcoes = {
      denominador: 50,
      papel: PAPEIS.find((p) => p.id === 'A3')!,
      titulo: 'PROVA BCF',
      revisao: 1,
      hash: 'b'.repeat(64),
      data: AGORA,
    };
    const [bcf] = await montarBcf(topicos, opcoes);
    writeFileSync(`${DESTINO}/prova.bcfzip`, Buffer.from(await bcf.blob.arrayBuffer()));

    const ifc = gerarIfc(model, {
      titulo: 'PROVA BCF',
      revisao: 1,
      hash: 'b'.repeat(64),
      data: AGORA,
    });
    writeFileSync(`${DESTINO}/prova.ifc`, ifc, 'utf8');

    // ⚠️ A PROVA QUE IMPORTA: os guids dos tópicos estão DENTRO do IFC.
    for (const t of topicos) {
      for (const guid of t.componentes) {
        expect(ifc).toContain(`'${guid}'`);
      }
    }

    const rotuloTrecho = rotuloCurto(model.trechos[0].uid, 'trecho');
    const rotuloViga = rotuloCurto(model.structures[0].uid, 'structural');

    writeFileSync(
      `${DESTINO}/COMO-CONFERIR.md`,
      `# Conferir o BCF num receptor de verdade

Gerado em ${AGORA.toISOString()} pela suíte (\`BCF_PROVA=1\`). **Os dois arquivos
são um teste só**: o BCF aponta os elementos por identificador e não os
descreve. Aberto sozinho, ele mostra a pendência e não tem o que selecionar — e
isso pareceria defeito nosso sem ser.

## Como abrir

1. Abra **\`prova.ifc\`** no visualizador (BIMcollab ZOOM, Solibri Anywhere ou
   BIMvision — os três leem IFC e BCF).
2. Importe **\`prova.bcfzip\`** por cima.

## O que tem de acontecer

| # | tópico | tipo | o que conferir |
|---|---|---|---|
| 1 | ${topicos[0].titulo} | Clash | clicar nele **seleciona duas peças**: o eletroduto ${rotuloTrecho} e a viga ${rotuloViga} |
| 2 | comentário da fachada | Issue, **aberto** | seleciona a parede de baixo (y = 0) |
| 3 | comentário da viga | Issue, **fechado** | seleciona a viga, e aparece como resolvido |

## ⚠️ O que decide

**Clicar no tópico tem de SELECIONAR a peça.** É a única coisa que importa: o
BCF aponta por \`IfcGuid\`, e se o guid não bater o receptor abre a pendência e
não destaca nada — o arquivo parece funcionar e ninguém percebe que a
coordenação não chegou.

Se a lista aparecer mas a seleção não acontecer, é isso que eu preciso saber.

## O que NÃO esperar

- **Câmera 3D bonita.** Nosso editor é 2D e não tem estado de navegação para
  capturar; a câmera é ortogonal, de cima, centrada na pendência. Foi decisão,
  não esquecimento.
- **Imagem (snapshot) no tópico.** Não geramos ainda.
- **Responder e devolver.** Importar BCF é a próxima fatia; hoje o caminho é só
  de ida.
`,
      'utf8',
    );

    console.log(`prova em ${DESTINO}: prova.ifc · prova.bcfzip · COMO-CONFERIR.md`);
  });
});
