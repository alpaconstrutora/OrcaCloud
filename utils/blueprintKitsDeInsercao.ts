/**
 * F2 (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — OS KITS DE INSERÇÃO DA ORGANIZAÇÃO.
 *
 * Um kit é "quando eu inserir ESTA peça, entram junto ESTAS outras": a peça principal
 * (disciplina + tipo classificado) e N peças com deslocamento (`dx`/`dy` em mm a partir
 * dela, com a rotação dela em 0°). Ao inserir a principal, as peças entram no MESMO
 * lote — um Ctrl+Z desfaz tudo —, giradas com ela.
 *
 * O kit padrão do sistema (placa do equipamento; manômetros e registro da VGA —
 * `blueprintKitsIncendio.ts`) continua valendo; o da organização SOMA a ele.
 *
 * A tabela é `blueprint_kits_de_insercao` (`services/blueprintKitService.ts`). O banco
 * não é confiável para o kernel: o item que não vira um `AddTerminal` válido fica de
 * fora (`itensDoKit`), e só passam as propriedades da lista `PROPS_DO_ITEM` — nada de
 * id de outra peça (alvo da placa, central, circuito), que não existe no lote novo.
 */
import type { BlueprintModel, Command, DisciplinaDeRede, Terminal } from './blueprintKernel';
import { DISCIPLINAS } from './blueprintKernel';

export interface ItemDoKit {
  disciplina: DisciplinaDeRede;
  /** O `tipo` do terminal (o nome da peça); a classificação vai em `props`. */
  tipo: string;
  /** mm a partir da peça principal, com a rotação dela em 0°. */
  dx: number;
  dy: number;
  cotaMm: number;
  props: Record<string, unknown>;
}

export interface KitDeInsercao {
  id?: string;
  nome: string;
  /** A peça principal que dispara o kit: disciplina + tipo classificado (`chaveDaPeca`). */
  disciplina: string;
  tipo: string;
  itens: ItemDoKit[];
}

/** O que o item do kit pode levar do `AddTerminal` — classificação e medidas, nunca id de outra peça. */
export const PROPS_DO_ITEM = [
  'tipoHidraulico',
  'tipoEletrico',
  'itemCode',
  'rotulo',
  'potenciaW',
  'interruptor',
  'volumeL',
  'fatorK',
  'posicaoSprinkler',
  'agenteExtintor',
  'cargaExtintorKg',
  'capacidadeExtintora',
  'codigoPlaca',
  'autonomiaMin',
  'larguraMm',
  'alturaMm',
  'profundidadeMm',
  'rotacaoGraus',
] as const;

/** A chave que casa a peça com o kit: o tipo CLASSIFICADO (hidráulico/elétrico), senão o nome. */
export function chaveDaPeca(t: Pick<Terminal, 'disciplina' | 'tipo' | 'tipoHidraulico' | 'tipoEletrico'>): { disciplina: string; tipo: string } {
  return { disciplina: t.disciplina, tipo: t.tipoHidraulico ?? t.tipoEletrico ?? t.tipo };
}

const inteiro = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Os itens da coluna JSONB que viram um `AddTerminal` (o resto fica de fora, em silêncio). */
export function itensDoKit(raw: unknown): ItemDoKit[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => x as Record<string, unknown>)
    .filter(
      (x) =>
        !!x &&
        (DISCIPLINAS as readonly string[]).includes(x.disciplina as string) &&
        typeof x.tipo === 'string' &&
        x.tipo.trim() !== '' &&
        inteiro(x.dx) &&
        inteiro(x.dy) &&
        inteiro(x.cotaMm),
    )
    .map((x) => {
      const bruto = (x.props && typeof x.props === 'object' ? x.props : {}) as Record<string, unknown>;
      const props: Record<string, unknown> = {};
      for (const k of PROPS_DO_ITEM) if (bruto[k] !== undefined && bruto[k] !== null) props[k] = bruto[k];
      return { disciplina: x.disciplina as DisciplinaDeRede, tipo: (x.tipo as string).trim(), dx: Math.round(x.dx as number), dy: Math.round(x.dy as number), cotaMm: Math.round(x.cotaMm as number), props };
    });
}

const normalizarGraus = (g: number) => ((Math.round(g) % 360) + 360) % 360;

/** Gira (dx, dy) de `graus` no sentido anti-horário do modelo (Y para cima), ao mm. */
function girar(dx: number, dy: number, graus: number): { x: number; y: number } {
  const r = (graus * Math.PI) / 180;
  const [c, s] = [Math.cos(r), Math.sin(r)];
  return { x: Math.round(dx * c - dy * s), y: Math.round(dx * s + dy * c) };
}

/** Os comandos das peças do kit em volta da peça principal `p` (já no modelo), giradas com ela. */
export function comandosDoKit(p: Terminal, kit: KitDeInsercao): Command[] {
  const giro = p.rotacaoGraus ?? 0;
  return kit.itens.map((i) => {
    const d = girar(i.dx, i.dy, giro);
    const props = { ...i.props };
    if (giro) {
      const g = normalizarGraus((inteiro(props.rotacaoGraus) ? props.rotacaoGraus : 0) + giro);
      if (g) props.rotacaoGraus = g;
      else delete props.rotacaoGraus;
    }
    return { ...props, type: 'AddTerminal', levelId: p.levelId, disciplina: i.disciplina, tipo: i.tipo, at: { x: p.at.x + d.x, y: p.at.y + d.y }, cotaMm: i.cotaMm } as Command;
  });
}

/** Os kits que a peça `p` dispara. */
export function kitsDaPeca(p: Terminal, kits: readonly KitDeInsercao[]): KitDeInsercao[] {
  const k = chaveDaPeca(p);
  return kits.filter((x) => x.disciplina === k.disciplina && x.tipo === k.tipo && x.itens.length > 0);
}

/**
 * "Salvar a seleção como kit": a peça principal e as outras selecionadas viram itens, com o
 * deslocamento medido a partir dela e DESGIRADO pela rotação dela (o kit é gravado em 0°).
 * As peças de outro pavimento ficam de fora.
 */
export function kitDaSelecao(model: BlueprintModel, principalId: string, outrosIds: readonly string[], nome: string): KitDeInsercao | null {
  const ts = model.terminais ?? [];
  const p = ts.find((t) => t.id === principalId);
  if (!p) return null;
  const giro = p.rotacaoGraus ?? 0;
  const itens: ItemDoKit[] = ts
    .filter((t) => t.id !== p.id && outrosIds.includes(t.id) && t.levelId === p.levelId)
    .map((t) => {
      const d = girar(t.at.x - p.at.x, t.at.y - p.at.y, -giro);
      const fonte = t as unknown as Record<string, unknown>;
      const props: Record<string, unknown> = {};
      for (const k of PROPS_DO_ITEM) if (fonte[k] !== undefined && fonte[k] !== null) props[k] = fonte[k];
      if (inteiro(props.rotacaoGraus) || giro) {
        const g = normalizarGraus((inteiro(props.rotacaoGraus) ? props.rotacaoGraus : 0) - giro);
        if (g) props.rotacaoGraus = g;
        else delete props.rotacaoGraus;
      }
      return { disciplina: t.disciplina, tipo: t.tipo, dx: d.x, dy: d.y, cotaMm: t.cotaMm, props };
    });
  if (!itens.length) return null;
  return { nome: nome.trim(), ...chaveDaPeca(p), itens };
}
