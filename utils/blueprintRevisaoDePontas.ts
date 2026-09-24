// utils/blueprintRevisaoDePontas.ts
//
// REVISÃO GUIADA DAS PONTAS SOLTAS (P2.52, 24/09/2026).
//
// ─── O QUE SOBRA DEPOIS DOS PASSES AUTOMÁTICOS ──────────────────────────────
//
// Medido na planta real, depois da P2.51: **58 pontas soltas**. Elas sobraram
// porque nenhum passe automático pode decidi-las sem adivinhar — a ponta está a
// 40 cm de outra (é vão de propósito ou parede faltando?), ou o conserto
// resolveria uma e soltaria duas. A lista âmbar diz quantas são; não diz ONDE
// nem O QUE FAZER com cada uma, e 58 bolinhas espalhadas numa planta de 195
// paredes são impossíveis de percorrer no olho.
//
// Este módulo responde, por ponta: **quais saídas existem aqui?** A UI leva a
// vista até ela, mostra as opções aplicáveis e deixa a decisão com quem desenha
// — que é o ponto: as que davam para automatizar já foram.
//
// ⚠️ NADA AQUI DECIDE. Cada opção vira comando só quando clicada. É a diferença
// entre este módulo e `blueprintJuntarParalelas`, que aplica em lote o que mede
// como seguro.

import {
  extensoesAteEncontrar,
  pontasSoltasDoNivel,
  wallLength,
  type BlueprintModel,
  type Command,
  type Level,
  type ObjectId,
  type Point,
} from './blueprintKernel';

/** Até onde procurar outra ponta solta para oferecer "juntar as duas". */
export const ALCANCE_DE_JUNTAR_MM = 600;

/**
 * Comprimento abaixo do qual a parede é um TOCO.
 *
 * 300 mm: menor que a menor passagem que o projeto reconhece (`vaoMinMm` do
 * DXF). Uma parede desse tamanho com as duas pontas livres quase sempre é
 * sujeira da importação — um traço que sobrou —, e excluir é a saída honesta.
 */
export const TOCO_MAXIMO_MM = 300;

export type TipoDeOpcao = 'JUNTAR' | 'ESTICAR' | 'EXCLUIR_TOCO';

export interface OpcaoDaPonta {
  tipo: TipoDeOpcao;
  /** Frase curta para o botão — quem lê decide sem abrir documentação. */
  rotulo: string;
  /** Quanto isso mexe no desenho, em mm. `0` para exclusão. */
  distanciaMm: number;
  comandos: Command[];
}

export interface PontaEmRevisao {
  wallId: ObjectId;
  end: 'a' | 'b';
  p: Point;
  /** Comprimento da parede desta ponta, para a tela dar contexto. */
  comprimentoMm: number;
  opcoes: OpcaoDaPonta[];
}

/** Chave estável de uma ponta, para lembrar o que já foi revisto. */
export function chaveDaPonta(wallId: ObjectId, end: 'a' | 'b'): string {
  return `${wallId}:${end}`;
}

/**
 * As pontas soltas do pavimento, cada uma com as saídas que existem para ela.
 *
 * `ignoradas` são as que o usuário marcou como intencionais (limite externo,
 * vão de propósito) — saem da lista sem sair do desenho.
 */
export function pontasParaRevisar(
  model: BlueprintModel,
  level: Level,
  ignoradas: ReadonlySet<string> = new Set(),
): PontaEmRevisao[] {
  const soltas = pontasSoltasDoNivel(model, level).filter((s) => !ignoradas.has(chaveDaPonta(s.wallId, s.end)));
  if (soltas.length === 0) return [];

  const paredes = model.walls.filter((w) => w.levelId === level.id);
  const porId = new Map(paredes.map((w) => [w.id, w]));
  const extensoes = extensoesAteEncontrar(model, level);

  return soltas.map((s) => {
    const parede = porId.get(s.wallId);
    const comprimentoMm = parede ? Math.round(wallLength(parede)) : 0;
    const opcoes: OpcaoDaPonta[] = [];

    // 1) JUNTAR com a ponta solta mais próxima — qualquer ângulo. É a saída da
    //    junta que os passes automáticos não fecharam por medo de adivinhar.
    let vizinha: { s: (typeof soltas)[number]; d: number } | null = null;
    for (const outra of soltas) {
      if (outra.wallId === s.wallId && outra.end === s.end) continue;
      const d = Math.hypot(outra.p.x - s.p.x, outra.p.y - s.p.y);
      if (d === 0 || d > ALCANCE_DE_JUNTAR_MM) continue;
      if (!vizinha || d < vizinha.d) vizinha = { s: outra, d };
    }
    if (vizinha) {
      // Anda ESTA ponta até a outra: quem está revisando está olhando para ela.
      // Mover a outra faria o desenho mexer fora do campo de visão.
      const outraParede = porId.get(vizinha.s.wallId);
      const oposta = parede ? (s.end === 'a' ? parede.b : parede.a) : null;
      const colapsaria = oposta ? oposta.x === vizinha.s.p.x && oposta.y === vizinha.s.p.y : true;
      if (outraParede && !colapsaria) {
        opcoes.push({
          tipo: 'JUNTAR',
          rotulo: `Juntar com a ponta a ${Math.round(vizinha.d)} mm`,
          distanciaMm: Math.round(vizinha.d),
          comandos: [{ type: 'MoveVertex', wallId: s.wallId, end: s.end, to: { x: vizinha.s.p.x, y: vizinha.s.p.y } as Point }],
        });
      }
    }

    // 2) ESTICAR na própria direção até a parede da frente — a P2.42, agora
    //    oferecida ponta a ponta em vez de só em lote.
    const ext = extensoes.find((e) => e.wallId === s.wallId && e.end === s.end);
    if (ext) {
      opcoes.push({
        tipo: 'ESTICAR',
        rotulo: `Esticar ${ext.distanciaMm} mm até encontrar`,
        distanciaMm: ext.distanciaMm,
        comandos: [{ type: 'MoveVertex', wallId: ext.wallId, end: ext.end, to: ext.to }],
      });
    }

    // 3) EXCLUIR o toco: parede curta com as DUAS pontas livres não fecha nada.
    if (parede && comprimentoMm > 0 && comprimentoMm <= TOCO_MAXIMO_MM) {
      const duasLivres = soltas.filter((o) => o.wallId === s.wallId).length >= 2;
      if (duasLivres) {
        opcoes.push({
          tipo: 'EXCLUIR_TOCO',
          rotulo: `Excluir este toco de ${comprimentoMm} mm`,
          distanciaMm: 0,
          comandos: [{ type: 'DeleteWall', wallId: s.wallId }],
        });
      }
    }

    return { wallId: s.wallId, end: s.end, p: s.p, comprimentoMm, opcoes };
  });
}
