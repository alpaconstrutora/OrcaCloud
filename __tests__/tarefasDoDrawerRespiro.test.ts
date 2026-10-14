import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * TRAVA MECÂNICA — todo drawer de tarefa da Planta Inteligente tem padding lateral.
 *
 * O `SheetPanel` não tem padding: o editor dá `px-6 py-4` só às tarefas listadas em
 * `TAREFAS_COM_RESPIRO` (BlueprintEditor.tsx) e `p-0` às demais. Painel novo que entra
 * em `ROTULO_DA_TAREFA` e esquece a lista nasce encostado nas bordas — aconteceu com os
 * de incêndio/pluvial (01/10/2026) e com os seis da climatização (13/10/2026).
 *
 * Toda chave de `ROTULO_DA_TAREFA` tem de estar em `TAREFAS_COM_RESPIRO` OU na lista
 * abaixo, das que trazem o padding no próprio painel (e dizem o porquê).
 */
const TRAZEM_O_PROPRIO_PADDING: Record<string, string> = {
  'gerar-paredes': 'painel de importação com padding próprio',
  'importar-ifc': 'painel de importação com padding próprio',
  referencias: 'painel de importação com padding próprio',
  'importar-dxf': 'painel de importação com padding próprio',
  'importar-collada': 'painel de importação com padding próprio',
  'importar-bcf': 'painel de importação com padding próprio',
};

const fonte = readFileSync(path.resolve(__dirname, '../components/blueprint/BlueprintEditor.tsx'), 'utf8');

function bloco(inicio: string, fim: string): string {
  const i = fonte.indexOf(inicio);
  const f = fonte.indexOf(fim, i);
  if (i < 0 || f < 0) throw new Error(`trecho não encontrado no BlueprintEditor: "${inicio}" … "${fim}"`);
  return fonte.slice(i, f);
}

const chavesDoRotulo = [...bloco('const ROTULO_DA_TAREFA', 'type TarefaDoPainel').matchAll(/^\s+(?:'([\w-]+)'|(\w+)):\s*'/gm)].map((m) => m[1] ?? m[2]);
const comRespiro = new Set([...bloco('const TAREFAS_COM_RESPIRO', 'export default function BlueprintEditor').matchAll(/'([\w-]+)',/g)].map((m) => m[1]));

describe('drawers de tarefa da planta — padding lateral', () => {
  it('lê as duas listas do editor (o scanner não pode estar cego)', () => {
    expect(chavesDoRotulo.length).toBeGreaterThan(40);
    expect(comRespiro.size).toBeGreaterThan(30);
  });

  it('toda tarefa tem respiro ou declara que traz o próprio padding', () => {
    const sem = chavesDoRotulo.filter((k) => !comRespiro.has(k) && !(k in TRAZEM_O_PROPRIO_PADDING));
    expect(sem, `Tarefa(s) sem padding lateral: ${sem.join(', ')}. Acrescente a TAREFAS_COM_RESPIRO em BlueprintEditor.tsx.`).toEqual([]);
  });

  it('os seis painéis da Mecânica estão na lista', () => {
    for (const k of ['climatizacao', 'cargaTermica', 'selecaoSplit', 'linhaFrigorigena', 'vrf', 'redeDeAr']) {
      expect(comRespiro.has(k), k).toBe(true);
    }
  });

  it('a lista de exceções não envelhece: chave existe e não está também em TAREFAS_COM_RESPIRO', () => {
    for (const k of Object.keys(TRAZEM_O_PROPRIO_PADDING)) {
      expect(chavesDoRotulo, `${k} saiu de ROTULO_DA_TAREFA — tire da exceção`).toContain(k);
      expect(comRespiro.has(k), `${k} já está em TAREFAS_COM_RESPIRO — tire da exceção`).toBe(false);
    }
  });
});
