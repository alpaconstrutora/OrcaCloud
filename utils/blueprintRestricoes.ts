/**
 * CONFERÊNCIA DAS RESTRIÇÕES (18/09/2026, E1.4b) — o que está violado, por
 * quanto, e o comando que corrige.
 *
 * ─── DERIVADO, E COM O REMÉDIO NA MÃO ───────────────────────────────────────
 *
 * `Restricao` (kernel) é a intenção; aqui é a leitura. Para cada restrição:
 * `atendida` com o desvio medido, ou a `correcao` — um único comando que
 * deixa a peça onde a restrição pede, MANTENDO JUNÇÕES (as vizinhas esticam
 * como no arraste). Quando não há correção determinística (paralelismo de uma
 * parede presa em dois cantos), `correcao` é `null` e a linha diz o que fazer
 * à mão. Nunca se corrige sozinho: quem clica "Ajustar" vê o que mudou e tem
 * o Ctrl+Z.
 *
 * Tolerâncias: 1 mm de posição/comprimento, 0,5° de ângulo — a régua do kernel.
 */
import type { BlueprintModel, Command, Eixo, Point, Restricao, Structural, Wall } from './blueprintKernel';
import { FORMA_ESTRUTURAL, pecaPorUid, rotuloCurto, wallLength } from './blueprintKernel';

export const TOL_POSICAO_MM = 1;
export const TOL_ANGULO_GRAUS = 0.5;

export const ROTULO_DA_RESTRICAO: Record<Restricao['tipo'], string> = {
  ALINHADO_A_EIXO: 'Sobre o eixo',
  DISTANCIA_AO_EIXO: 'Distância ao eixo',
  TRAVA_COMPRIMENTO: 'Comprimento travado',
  IGUAL_COMPRIMENTO: 'Mesmo comprimento que',
  PARALELO: 'Paralela a',
};

export interface Conferencia {
  restricao: Restricao;
  /** Nome legível do alvo e da referência ("Parede P-1A2B", "eixo B"). */
  alvo: string;
  referencia: string | null;
  atendida: boolean;
  /** Desvio medido: mm nas de posição/comprimento, graus na de paralelismo. */
  desvio: number;
  unidade: 'mm' | '°';
  descricao: string;
  /** O comando que corrige, ou `null` quando é ajuste à mão. */
  correcao: Command | null;
  /** Por que não há correção automática. */
  semCorrecaoPorque: string | null;
}

type Linear = { a: Point; b: Point };

function eixoDaPeca(p: Wall | Structural | Eixo): Linear | null {
  if ('thicknessMm' in p) return { a: p.a, b: p.b };
  if ('nome' in p) return { a: p.a, b: p.b };
  if (FORMA_ESTRUTURAL[p.kind] === 'LINHA' && p.pontos.length >= 2) return { a: p.pontos[0], b: p.pontos[1] };
  return null;
}
const centroDaPeca = (p: Wall | Structural | Eixo): Point => {
  const l = eixoDaPeca(p);
  if (l) return { x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 };
  return (p as Structural).pontos[0];
};
const comp = (l: Linear) => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
const anguloGraus = (l: Linear) => (Math.atan2(l.b.y - l.a.y, l.b.x - l.a.x) * 180) / Math.PI;
/** Diferença de direção entre duas retas, em [0, 90]. */
function desvioAngular(u: Linear, v: Linear): number {
  let d = Math.abs(anguloGraus(u) - anguloGraus(v)) % 180;
  if (d > 90) d = 180 - d;
  return d;
}
/** Distância COM SINAL de `p` à reta de `l` (positivo à esquerda de a→b). */
function distanciaAssinada(p: Point, l: Linear): number {
  const ux = l.b.x - l.a.x;
  const uy = l.b.y - l.a.y;
  const c = Math.hypot(ux, uy) || 1;
  return ((p.x - l.a.x) * uy - (p.y - l.a.y) * ux) / -c;
}
/** O deslocamento perpendicular à reta `l` que leva `p` a ficar a `alvo` mm dela (mesmo lado). */
function deslocamentoPerpendicular(p: Point, l: Linear, alvoMm: number): Point {
  const ux = l.b.x - l.a.x;
  const uy = l.b.y - l.a.y;
  const c = Math.hypot(ux, uy) || 1;
  const nx = -uy / c;
  const ny = ux / c;
  const atual = distanciaAssinada(p, l);
  const desejado = atual >= 0 ? alvoMm : -alvoMm;
  const d = desejado - atual;
  // `+ 0` mata o −0 do arredondamento: o payload e o teste comparam por igualdade estrita.
  return { x: Math.round(nx * d) + 0, y: Math.round(ny * d) + 0 };
}

function nomeDe(p: Wall | Structural | Eixo, familia: 'wall' | 'structural' | 'eixo'): string {
  if (familia === 'eixo') return (p as Eixo).nome ? `eixo ${(p as Eixo).nome}` : `linha de referência ${rotuloCurto(p.uid, 'eixo')}`;
  if (familia === 'wall') return `parede ${rotuloCurto(p.uid, 'wall')}`;
  const s = p as Structural;
  return s.rotulo || rotuloCurto(s.uid, 'structural');
}

const mm = (v: number) => `${Math.round(v)} mm`;

function translacao(alvo: Wall | Structural, familia: 'wall' | 'structural', delta: Point): Command {
  return {
    type: 'TranslateEntities',
    wallIds: familia === 'wall' ? [alvo.id] : [],
    boundaryIds: [],
    structuralIds: familia === 'structural' ? [alvo.id] : [],
    delta,
    manterJuncoes: true,
  };
}

export function conferirRestricoes(model: BlueprintModel): Conferencia[] {
  const saida: Conferencia[] = [];
  for (const r of model.restricoes ?? []) {
    const alvoPeca = pecaPorUid(model, r.alvo.familia, r.alvo.uid) as Wall | Structural | null;
    if (!alvoPeca) continue;
    const refPeca = r.referencia ? pecaPorUid(model, r.referencia.familia, r.referencia.uid) : null;
    if (r.referencia && !refPeca) continue;
    const alvoNome = nomeDe(alvoPeca, r.alvo.familia);
    const refNome = r.referencia && refPeca ? nomeDe(refPeca, r.referencia.familia) : null;
    const base = { restricao: r, alvo: alvoNome, referencia: refNome };
    const linhaAlvo = eixoDaPeca(alvoPeca);

    switch (r.tipo) {
      case 'ALINHADO_A_EIXO':
      case 'DISTANCIA_AO_EIXO': {
        const linhaRef = eixoDaPeca(refPeca as Eixo)!;
        const alvoMm = r.tipo === 'ALINHADO_A_EIXO' ? 0 : (r.valorMm ?? 0);
        if (linhaAlvo) {
          const ang = desvioAngular(linhaAlvo, linhaRef);
          if (ang > TOL_ANGULO_GRAUS) {
            saida.push({
              ...base,
              atendida: false,
              desvio: ang,
              unidade: '°',
              descricao: `${alvoNome} não é paralela ao ${refNome} (${ang.toFixed(1)}°) — gire-a antes de alinhar`,
              correcao: null,
              semCorrecaoPorque: 'girar uma parede presa em cantos abre o desenho; use Rotacionar na seleção',
            });
            break;
          }
        }
        const centro = centroDaPeca(alvoPeca);
        const d = Math.abs(distanciaAssinada(centro, linhaRef));
        const desvio = Math.abs(d - alvoMm);
        const ok = desvio <= TOL_POSICAO_MM;
        const delta = ok ? { x: 0, y: 0 } : deslocamentoPerpendicular(centro, linhaRef, alvoMm);
        saida.push({
          ...base,
          atendida: ok,
          desvio,
          unidade: 'mm',
          descricao: ok
            ? `${alvoNome} ${alvoMm === 0 ? `sobre o ${refNome}` : `a ${mm(alvoMm)} do ${refNome}`}`
            : `${alvoNome} está a ${mm(d)} do ${refNome}; a restrição pede ${mm(alvoMm)} (desvio ${mm(desvio)})`,
          correcao: ok || (delta.x === 0 && delta.y === 0) ? null : translacao(alvoPeca, r.alvo.familia, delta),
          semCorrecaoPorque: null,
        });
        break;
      }
      case 'TRAVA_COMPRIMENTO':
      case 'IGUAL_COMPRIMENTO': {
        if (!linhaAlvo) {
          saida.push({ ...base, atendida: false, desvio: 0, unidade: 'mm', descricao: `${alvoNome} não tem comprimento (peça pontual)`, correcao: null, semCorrecaoPorque: 'restrição não se aplica a pilar' });
          break;
        }
        const alvoMm = r.tipo === 'TRAVA_COMPRIMENTO' ? (r.valorMm ?? 0) : Math.round(comp(eixoDaPeca(refPeca as Wall | Structural)!));
        const atual = 'thicknessMm' in alvoPeca ? wallLength(alvoPeca) : comp(linhaAlvo);
        const desvio = Math.abs(atual - alvoMm);
        const ok = desvio <= TOL_POSICAO_MM;
        let correcao: Command | null = null;
        if (!ok && alvoMm > 0) {
          // Estica/encolhe pela ponta B ao longo do eixo; as vizinhas presas acompanham.
          const ux = (linhaAlvo.b.x - linhaAlvo.a.x) / (atual || 1);
          const uy = (linhaAlvo.b.y - linhaAlvo.a.y) / (atual || 1);
          const to = { x: Math.round(linhaAlvo.a.x + ux * alvoMm), y: Math.round(linhaAlvo.a.y + uy * alvoMm) };
          correcao =
            'thicknessMm' in alvoPeca
              ? { type: 'MoveVertex', wallId: alvoPeca.id, end: 'b', to, manterJuncoes: true }
              : { type: 'MoveStructuralVertex', structuralId: alvoPeca.id, index: 1, to };
        }
        saida.push({
          ...base,
          atendida: ok,
          desvio,
          unidade: 'mm',
          descricao: ok
            ? `${alvoNome} com ${mm(atual)}${r.tipo === 'IGUAL_COMPRIMENTO' ? `, igual a ${refNome}` : ''}`
            : `${alvoNome} tem ${mm(atual)}; ${r.tipo === 'IGUAL_COMPRIMENTO' ? `${refNome} tem` : 'a trava pede'} ${mm(alvoMm)} (desvio ${mm(desvio)})`,
          correcao,
          semCorrecaoPorque: correcao || ok ? null : 'comprimento zero não é um alvo',
        });
        break;
      }
      case 'PARALELO': {
        const linhaRef = eixoDaPeca(refPeca as Wall | Structural | Eixo);
        if (!linhaAlvo || !linhaRef) {
          saida.push({ ...base, atendida: false, desvio: 0, unidade: '°', descricao: `${alvoNome} ou ${refNome} não tem direção`, correcao: null, semCorrecaoPorque: 'paralelismo pede duas peças lineares' });
          break;
        }
        const ang = desvioAngular(linhaAlvo, linhaRef);
        const ok = ang <= TOL_ANGULO_GRAUS;
        // Gira o alvo em torno do próprio centro pelo menor ângulo inteiro que o
        // deixa paralelo — graus inteiros são o que `RotateEntities` aceita.
        const bruto = anguloGraus(linhaRef) - anguloGraus(linhaAlvo);
        let giro = ((bruto % 180) + 270) % 180 - 90; // em (−90, 90]
        giro = Math.round(giro);
        const c = centroDaPeca(alvoPeca);
        const correcao: Command | null =
          ok || giro === 0
            ? null
            : {
                type: 'RotateEntities',
                wallIds: 'thicknessMm' in alvoPeca ? [alvoPeca.id] : [],
                boundaryIds: [],
                structuralIds: 'thicknessMm' in alvoPeca ? [] : [alvoPeca.id],
                anguloGraus: giro,
                centro: { x: Math.round(c.x), y: Math.round(c.y) },
              };
        saida.push({
          ...base,
          atendida: ok,
          desvio: ang,
          unidade: '°',
          descricao: ok ? `${alvoNome} paralela a ${refNome}` : `${alvoNome} desvia ${ang.toFixed(1)}° de ${refNome}`,
          correcao,
          semCorrecaoPorque: ok || correcao ? null : 'o desvio arredonda para 0° — abaixo do passo do giro',
        });
        break;
      }
    }
  }
  return saida;
}

/** Só as violadas, na ordem do modelo — o que o botão "Restrições" conta. */
export const violacoes = (c: Conferencia[]): Conferencia[] => c.filter((x) => !x.atendida);
