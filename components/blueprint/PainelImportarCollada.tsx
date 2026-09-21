/**
 * IMPORTAR DO SKETCHUP (COLLADA .dae) (21/09/2026, backlog P2): escolhe o
 * arquivo, mostra o que o leitor RECONHECEU como parede (e o que recusou, com
 * o motivo), deixa casar cada grupo de cota com um pavimento do desenho e
 * escolher onde cai; importa num lote só. Molde dos painéis de DXF e IFC.
 *
 * O `.skp` não entra aqui: é binário fechado. No SketchUp, Arquivo › Exportar
 * › Modelo 3D › COLLADA (.dae) — o texto do painel diz isso.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Check, FileUp, Loader2 } from 'lucide-react';
import type { BlueprintModel, Command } from '../../utils/blueprintKernel';
import { caixaDePontos, caixaDoDesenho, deslocamentoDaImportacao, type AncoragemIfc } from '../../utils/ancoragemImportacao';
import { encostarNasFaces } from '../../utils/ifcEncostarParedes';
import { OPCOES_PADRAO, prepararCollada, type ColladaPreparado, type OpcoesDeReconhecimento } from '../../utils/colladaParaKernel';

interface Props {
  model: BlueprintModel;
  levelIdAtivo: string | null;
  onImportar: (comandos: Command[]) => void;
}

const m2 = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');

export default function PainelImportarCollada({ model, levelIdAtivo, onImportar }: Props) {
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState<{ nome: string; xml: string } | null>(null);
  const [opcoes, setOpcoes] = useState<OpcoesDeReconhecimento>(OPCOES_PADRAO);
  const [ancoragem, setAncoragem] = useState<AncoragemIfc>('ARQUIVO');
  /** Pavimento do desenho escolhido para cada grupo de cota lido (índice → levelId). */
  const [parPavimento, setParPavimento] = useState<Record<number, string>>({});

  const preparar = useCallback(async (arquivo: File) => {
    setLendo(true);
    setErro(null);
    setTexto(null);
    setParPavimento({});
    try {
      if (/\.skp$/i.test(arquivo.name)) throw new Error('O .skp é o formato binário fechado do SketchUp e não pode ser lido aqui. No SketchUp: Arquivo › Exportar › Modelo 3D › COLLADA (.dae), e importe o .dae.');
      setTexto({ nome: arquivo.name, xml: await arquivo.text() });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLendo(false);
    }
  }, []);

  const preparado = useMemo<{ r: ColladaPreparado | null; erro: string | null }>(() => {
    if (!texto) return { r: null, erro: null };
    try {
      return { r: prepararCollada(texto.xml, opcoes), erro: null };
    } catch (e) {
      return { r: null, erro: e instanceof Error ? e.message : String(e) };
    }
  }, [texto, opcoes]);
  const r = preparado.r;

  const encostado = useMemo(() => (r ? encostarNasFaces(r.paredes.map((p) => ({ ...p }))) : null), [r]);
  const paredes = encostado?.paredes ?? [];
  const pegada = caixaDePontos(paredes.flatMap((p) => [p.a, p.b]));
  const { dx, dy } = deslocamentoDaImportacao(ancoragem, pegada, caixaDoDesenho(model));
  const longe = !!pegada && Math.max(Math.abs(pegada.minX), Math.abs(pegada.maxX), Math.abs(pegada.minY), Math.abs(pegada.maxY)) > 900_000;

  /** O pavimento do desenho mais próximo da cota lida (a sugestão); quem confirma é a pessoa. */
  const sugestaoDePavimento = (elevationMm: number): string | null => {
    if (model.levels.length === 0) return null;
    return [...model.levels].sort((a, b) => Math.abs(a.elevationMm - elevationMm) - Math.abs(b.elevationMm - elevationMm))[0].id;
  };
  const pavimentoDe = (i: number, elevationMm: number) => parPavimento[i] ?? sugestaoDePavimento(elevationMm) ?? levelIdAtivo;

  function importar() {
    if (!r || paredes.length === 0) return;
    const comandos: Command[] = [];
    r.pavimentos.forEach((pav, i) => {
      const levelId = pavimentoDe(i, pav.elevationMm);
      if (!levelId) return;
      for (const p of pav.paredes) {
        // A parede depois de encostar (mesma ordem de `r.paredes`).
        const k = r.paredes.indexOf(p);
        const q = k >= 0 ? paredes[k] : p;
        comandos.push({
          type: 'AddWall',
          levelId,
          a: { x: Math.round(q.a.x + dx), y: Math.round(q.a.y + dy) },
          b: { x: Math.round(q.b.x + dx), y: Math.round(q.b.y + dy) },
          thicknessMm: Math.max(1, Math.round(q.espessuraMm)),
          heightMm: Math.max(1, Math.round(q.alturaMm)),
        });
      }
    });
    onImportar(comandos);
    setTexto(null);
  }

  const campo = 'w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-xs text-slate-800';

  return (
    <div className="px-4 py-3" data-testid="painel-importar-collada">
      {!texto && (
        <>
          <p className="text-xs text-slate-500">
            Traz as paredes de um modelo do SketchUp exportado como <strong>COLLADA (.dae)</strong>: Arquivo › Exportar › Modelo 3D › COLLADA. O arquivo só tem faces; o leitor reconhece parede onde há duas faces verticais paralelas a uma distância de parede, com a altura que elas têm. Piso, laje, telhado, mobiliário, vidro e painéis finos ficam de fora, e o que foi recusado aparece com o motivo.
          </p>
          <p className="mt-1 text-[11px] text-slate-400" data-testid="aviso-skp">
            O .skp (binário fechado) não pode ser lido diretamente — só via .dae. Aberturas não são reconhecidas nesta versão: o vão numa malha é só ausência de faces.
          </p>
          <label htmlFor="importar-collada-arquivo" className="mt-2 flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border border-dashed border-slate-300 px-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-800">
            {lendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
            {lendo ? 'Lendo…' : 'Escolher arquivo COLLADA (.dae)'}
          </label>
          <input
            id="importar-collada-arquivo"
            type="file"
            accept=".dae,.skp"
            className="hidden"
            data-testid="arquivo-collada"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void preparar(f);
              e.target.value = '';
            }}
          />
        </>
      )}

      {(erro || preparado.erro) && <p className="mt-2 text-[11px] text-red-700" data-testid="erro-collada">{erro ?? preparado.erro}</p>}

      {texto && r && (
        <>
          <h4 className="truncate text-xs font-semibold text-slate-700" title={texto.nome}>
            {texto.nome}
          </h4>
          <p className="text-[11px] text-slate-500" data-testid="resumo-collada">
            {r.resumo.geometrias} geometria(s) · {r.resumo.instancias} instância(s) · {r.resumo.triangulos} triângulos ({r.resumo.verticais} verticais em {r.resumo.planos} planos) · unidade {r.resumo.unidadeM} m · eixo {r.resumo.upAxis}
          </p>

          {/* ── Hipóteses do reconhecimento ─────────────────────────────── */}
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600">
            <label className="flex items-center justify-between gap-2">
              Espessura mín.
              <span className="flex items-center gap-1"><input type="number" value={opcoes.espessuraMinMm} min={1} aria-label="Espessura mínima de parede (mm)" onChange={(e) => setOpcoes({ ...opcoes, espessuraMinMm: Math.max(1, Number(e.target.value) || 0) })} className={campo} /><span className="w-6 text-slate-400">mm</span></span>
            </label>
            <label className="flex items-center justify-between gap-2">
              Espessura máx.
              <span className="flex items-center gap-1"><input type="number" value={opcoes.espessuraMaxMm} min={1} aria-label="Espessura máxima de parede (mm)" onChange={(e) => setOpcoes({ ...opcoes, espessuraMaxMm: Math.max(1, Number(e.target.value) || 0) })} className={campo} /><span className="w-6 text-slate-400">mm</span></span>
            </label>
            <label className="flex items-center justify-between gap-2">
              Comprimento mín.
              <span className="flex items-center gap-1"><input type="number" value={opcoes.comprimentoMinMm} min={1} aria-label="Comprimento mínimo de parede (mm)" onChange={(e) => setOpcoes({ ...opcoes, comprimentoMinMm: Math.max(1, Number(e.target.value) || 0) })} className={campo} /><span className="w-6 text-slate-400">mm</span></span>
            </label>
            <label className="flex items-center justify-between gap-2">
              Altura mín.
              <span className="flex items-center gap-1"><input type="number" value={opcoes.alturaMinMm} min={1} aria-label="Altura mínima de parede (mm)" onChange={(e) => setOpcoes({ ...opcoes, alturaMinMm: Math.max(1, Number(e.target.value) || 0) })} className={campo} /><span className="w-6 text-slate-400">mm</span></span>
            </label>
          </div>

          {/* ── Pavimentos ──────────────────────────────────────────────── */}
          {r.pavimentos.length > 0 && (
            <div className="mt-2 space-y-1" data-testid="pavimentos-collada">
              <p className="text-[11px] font-semibold text-slate-600">Cota lida → pavimento do desenho</p>
              {r.pavimentos.map((pav, i) => (
                <label key={i} className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                  <span>
                    base {m2(pav.elevationMm)} m · {pav.paredes.length} parede(s) · h {m2(pav.alturaMm)} m
                  </span>
                  <select value={pavimentoDe(i, pav.elevationMm) ?? ''} onChange={(e) => setParPavimento({ ...parPavimento, [i]: e.target.value })} aria-label={`Pavimento para a cota ${m2(pav.elevationMm)} m`} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800">
                    {model.levels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({m2(l.elevationMm)} m)
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}

          {/* ── Onde cai ────────────────────────────────────────────────── */}
          <label className="mt-2 block text-[11px] font-semibold text-slate-600">
            Posição
            <select value={ancoragem} onChange={(e) => setAncoragem(e.target.value as AncoragemIfc)} aria-label="Onde ancorar o modelo importado" className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800">
              <option value="ARQUIVO">Manter as coordenadas do arquivo</option>
              <option value="ORIGEM">Encostar na origem</option>
              <option value="DESENHO">Centralizar no desenho</option>
            </select>
          </label>
          {ancoragem === 'ARQUIVO' && longe && <p className="mt-0.5 text-[10px] text-amber-700">O modelo está a mais de 900 m da origem do arquivo: acima de 1.000 m o desenho recusa a importação. Escolha outra posição.</p>}

          {/* ── O que vai entrar ────────────────────────────────────────── */}
          <p className="mt-2 text-[11px] text-slate-500" data-testid="paredes-collada">
            {paredes.length === 0
              ? 'Nenhuma parede reconhecida.'
              : `${paredes.length} parede(s) · ${m2(paredes.reduce((s, p) => s + p.comprimentoMm, 0))} m no total · espessuras ${[...new Set(paredes.map((p) => p.espessuraMm))].sort((a, b) => a - b).join(', ')} mm`}
            {encostado && encostado.encostadas > 0 ? ` · ${encostado.encostadas} ponta(s) encostada(s) no eixo vizinho` : ''}
            {encostado && encostado.soltas > 0 ? ` · ${encostado.soltas} ponta(s) solta(s)` : ''}
          </p>
          {(r.resumo.paresRecusados.baixos > 0 || r.resumo.paresRecusados.curtos > 0 || r.resumo.planosSemPar > 0) && (
            <div className="mt-2 rounded-md bg-amber-50 px-2 py-1.5" data-testid="recusas-collada">
              <p className="flex items-center gap-1 text-[11px] font-medium text-amber-800">
                <AlertTriangle className="h-3 w-3" />
                Fora da importação
              </p>
              <ul className="mt-0.5 space-y-0.5 text-[10px] text-amber-700">
                {r.resumo.paresRecusados.baixos > 0 && <li>{r.resumo.paresRecusados.baixos} par(es) de faces mais baixo(s) que {opcoes.alturaMinMm} mm (viga, borda de laje, mureta)</li>}
                {r.resumo.paresRecusados.curtos > 0 && <li>{r.resumo.paresRecusados.curtos} par(es) mais curto(s) que {opcoes.comprimentoMinMm} mm ou que 2× a espessura (pilar, testa de parede)</li>}
                {r.resumo.planosSemPar > 0 && <li>{r.resumo.planosSemPar} plano(s) vertical(is) sem face oposta (painel, mobiliário, vidro, borda de laje)</li>}
              </ul>
            </div>
          )}
          {r.avisos.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-[10px] text-slate-500" data-testid="avisos-collada">
              {r.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex gap-1.5">
            <button type="button" onClick={importar} disabled={paredes.length === 0 || model.levels.length === 0 || (ancoragem === 'ARQUIVO' && longe)} className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[6px] bg-blue-600 px-2.5 text-[13px] font-medium text-white transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-40" data-testid="importar-collada">
              <Check className="h-3.5 w-3.5" />
              Importar {paredes.length}
            </button>
            <button type="button" onClick={() => setTexto(null)} className="h-8 rounded-[6px] px-2.5 text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-700">
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
