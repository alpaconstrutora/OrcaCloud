import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  MousePointer2,
  Minus,
  DoorOpen,
  Scissors,
  Combine,
  Redo2,
  Undo2,
  Upload,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useBlueprintEditor, type BlueprintTool } from '../../hooks/useBlueprintEditor';
import BlueprintCanvas, { rotuloPasso } from './BlueprintCanvas';
import type { BlueprintStudy } from '../../types/blueprint';
import { wallLength, type Point } from '../../utils/blueprintKernel';

/**
 * Tela do editor de plantas (épico E3).
 *
 * A camada FOCÁVEL do "híbrido" do Spike B mora aqui: o canvas é opaco para
 * leitor de tela, então a barra de ferramentas, a lista de ambientes e o estado
 * do salvamento são DOM de verdade — navegáveis por teclado e anunciáveis. O
 * canvas cuida da massa de geometria; o DOM cuida de tudo que precisa ter foco.
 */

const ESPESSURA_PADRAO_MM = 150;
const ALTURA_PADRAO_MM = 2800;

interface Props {
  study: BlueprintStudy;
  branchId: string;
  onBack: () => void;
}

export default function BlueprintEditor({ study, branchId, onBack }: Props) {
  const editor = useBlueprintEditor(branchId);
  const [espessura, setEspessura] = useState(ESPESSURA_PADRAO_MM);
  // `null` = automatico: o passo acompanha o zoom. Qualquer numero fixa o passo.
  const [passoGrade, setPassoGrade] = useState<number | null>(null);
  const [passoEmVigor, setPassoEmVigor] = useState(100);
  const [larguraAbertura, setLarguraAbertura] = useState(900);
  const [tipoAbertura, setTipoAbertura] = useState<'door' | 'window'>('door');

  const levelId = editor.model.levels[0]?.id ?? null;

  // Um nível precisa existir antes da primeira parede: parede sem nível não tem
  // onde morar e o kernel recusa. Criar sob demanda evita exigir isso do usuário.
  //
  // O ref não é preciosismo: em StrictMode o React monta o efeito duas vezes com
  // o MESMO estado, e sem ele o estudo nasceria com dois "Térreo".
  const nivelPedido = useRef(false);
  useEffect(() => {
    if (!editor.loading && editor.model.levels.length === 0 && !nivelPedido.current) {
      nivelPedido.current = true;
      editor.run({
        type: 'AddLevel',
        name: 'Térreo',
        elevationMm: 0,
        defaultHeightMm: ALTURA_PADRAO_MM,
      });
    }
  }, [editor.loading, editor.model.levels.length]);

  // Atalhos de desfazer/refazer. Ctrl+Z / Ctrl+Shift+Z, como todo editor.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [editor.undo, editor.redo]);

  const ambientes = useMemo(
    () =>
      editor.model.spaces
        .filter((s) => !levelId || s.levelId === levelId)
        .map((s, i) => ({
          id: s.id,
          rotulo: s.name ?? `Ambiente ${i + 1}`,
          areaM2: s.areaMm2 / 1_000_000,
          perimetroM: s.perimeterMm / 1000,
        })),
    [editor.model.spaces, levelId],
  );

  const areaTotal = ambientes.reduce((soma, a) => soma + a.areaM2, 0);

  function adicionarParede(a: Point, b: Point) {
    if (!levelId) return;
    editor.run({
      type: 'AddWall',
      levelId,
      a,
      b,
      thicknessMm: espessura,
      heightMm: ALTURA_PADRAO_MM,
    });
  }

  const paredeSel = editor.model.walls.find((w) => w.id === editor.selectedId) ?? null;
  const aberturaSel = editor.model.openings.find((o) => o.id === editor.selectedId) ?? null;

  function adicionarAbertura(wallId: string, offsetMm: number) {
    editor.run({
      type: 'AddOpening',
      wallId,
      kind: tipoAbertura,
      offsetMm,
      widthMm: larguraAbertura,
      heightMm: tipoAbertura === 'door' ? 2100 : 1200,
      sillMm: tipoAbertura === 'door' ? 0 : 900,
    });
  }

  function dividirSelecionada() {
    if (!paredeSel) return;
    // Divide no meio: e o unico ponto que sempre existe e nunca coincide com
    // ponta, entao nao depende de o usuario acertar um clique no eixo.
    editor.run({
      type: 'SplitWall',
      wallId: paredeSel.id,
      at: {
        x: Math.round((paredeSel.a.x + paredeSel.b.x) / 2),
        y: Math.round((paredeSel.a.y + paredeSel.b.y) / 2),
      },
    });
    editor.setSelectedId(null);
  }

  /** Une a selecionada com a vizinha colinear que compartilha uma ponta. */
  function unirSelecionada() {
    if (!paredeSel) return;
    const mesmaPonta = (p: Point, q: Point) => p.x === q.x && p.y === q.y;
    const vizinha = editor.model.walls.find((o) => {
      if (o.id === paredeSel.id || o.levelId !== paredeSel.levelId) return false;
      if (o.thicknessMm !== paredeSel.thicknessMm) return false;
      return (
        mesmaPonta(o.a, paredeSel.b) ||
        mesmaPonta(o.b, paredeSel.a) ||
        mesmaPonta(o.a, paredeSel.a) ||
        mesmaPonta(o.b, paredeSel.b)
      );
    });
    if (!vizinha) {
      editor.setSelectedId(paredeSel.id);
      return;
    }
    editor.run({ type: 'MergeWalls', firstId: paredeSel.id, secondId: vizinha.id });
    editor.setSelectedId(null);
  }

  /**
   * Vãos candidatos: pares de pontas de parede que não encontram nada e estão
   * perto o bastante para ser abertura.
   *
   * O sistema NÃO decide qual fechar — só apresenta. Cinco rodadas do Spike C
   * mostraram que essa decisão é justamente a que a máquina erra: fechar por
   * proximidade junta parede com guarda-corpo; fechar por colinearidade fecha a
   * borda de terraço, que devia ficar aberta. Porta, guarda-corpo e limite do
   * envelope têm geometria parecida demais.
   *
   * O que a máquina faz bem é ACHAR os candidatos e medir. Quem sabe se aquele
   * vão de 90 cm é porta ou passagem é quem conhece o projeto.
   */
  const vaosCandidatos = useMemo(() => {
    const grau = new Map<string, { p: Point; n: number }>();
    for (const w of editor.model.walls) {
      if (levelId && w.levelId !== levelId) continue;
      for (const extremo of [w.a, w.b]) {
        const k = `${extremo.x},${extremo.y}`;
        const atual = grau.get(k);
        if (atual) atual.n += 1;
        else grau.set(k, { p: extremo, n: 1 });
      }
    }
    const soltas = [...grau.values()].filter((v) => v.n === 1).map((v) => v.p);

    // Faixa de abertura de verdade: de 40 cm (passagem estreita) a 3 m (vão de
    // sala). Fora disso não é abertura — é parede faltando ou desenho separado.
    const MIN = 400;
    const MAX = 3000;
    const pares: { a: Point; b: Point; mm: number }[] = [];
    for (let i = 0; i < soltas.length; i++) {
      for (let j = i + 1; j < soltas.length; j++) {
        const mm = Math.round(Math.hypot(soltas[i].x - soltas[j].x, soltas[i].y - soltas[j].y));
        if (mm < MIN || mm > MAX) continue;
        pares.push({ a: soltas[i], b: soltas[j], mm });
      }
    }
    // Cada ponta entra num par só: o mais curto ganha.
    pares.sort((p, q) => p.mm - q.mm);
    const usada = new Set<string>();
    const escolhidos: { a: Point; b: Point; mm: number }[] = [];
    for (const par of pares) {
      const ka = `${par.a.x},${par.a.y}`;
      const kb = `${par.b.x},${par.b.y}`;
      if (usada.has(ka) || usada.has(kb)) continue;
      usada.add(ka);
      usada.add(kb);
      escolhidos.push(par);
    }
    return { soltas, vaos: escolhidos };
  }, [editor.model.walls, levelId]);

  /** Fecha o vão com parede cheia. Use quando a interrupção era só desenho. */
  function fecharComParede(vao: { a: Point; b: Point }) {
    if (!levelId) return;
    editor.run({
      type: 'AddWall',
      levelId,
      a: vao.a,
      b: vao.b,
      thicknessMm: espessura,
      heightMm: ALTURA_PADRAO_MM,
    });
  }

  /**
   * Fecha o vão e marca que ali existe uma porta.
   *
   * Duas operações porque são dois fatos: o contorno passa a fechar (e o
   * ambiente aparece com a área certa) E fica registrado que aquele trecho é
   * abertura, não alvenaria. Sem a segunda, o quantitativo contaria parede onde
   * há porta.
   */
  function fecharComPorta(vao: { a: Point; b: Point; mm: number }) {
    if (!levelId) return;
    const antes = editor.model.walls.length;
    editor.run({
      type: 'AddWall',
      levelId,
      a: vao.a,
      b: vao.b,
      thicknessMm: espessura,
      heightMm: ALTURA_PADRAO_MM,
    });
    // A parede recém-criada é a última; a abertura ocupa o vão inteiro.
    const criada = editor.model.walls[antes];
    if (criada) {
      editor.run({
        type: 'AddOpening',
        wallId: criada.id,
        kind: 'door',
        offsetMm: 0,
        widthMm: vao.mm,
        heightMm: 2100,
        sillMm: 0,
      });
    }
  }

  function removerSelecionada() {
    if (!editor.selectedId) return;
    // Abertura e parede sao objetos diferentes com a mesma tecla de atalho.
    if (aberturaSel) editor.run({ type: 'DeleteOpening', openingId: aberturaSel.id });
    else editor.run({ type: 'DeleteWall', wallId: editor.selectedId });
    editor.setSelectedId(null);
  }

  const rotuloSalvamento: Record<string, string> = {
    limpo: 'Sem alterações',
    pendente: 'Alterações não salvas',
    salvando: 'Salvando…',
    salvo: 'Rascunho salvo',
    erro: 'Falha ao salvar',
  };

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Cabeçalho */}
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <BotaoBarra icone={ArrowLeft} rotulo="Voltar para a lista" onClick={onBack} />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-slate-800">{study.name}</h1>
          <p className="text-xs text-slate-500">
            Revisão publicada {editor.baseRevision} · unidades em milímetros ·{' '}
            <span
              className={
                editor.saveState === 'erro'
                  ? 'text-red-600'
                  : editor.saveState === 'salvo'
                    ? 'text-emerald-600'
                    : 'text-slate-500'
              }
            >
              {rotuloSalvamento[editor.saveState]}
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => editor.publish()}
          disabled={editor.publishing || !editor.dirtySincePublish}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          title={
            editor.dirtySincePublish
              ? 'Publica uma versão imutável desta planta'
              : 'Nada mudou desde a última publicação'
          }
        >
          {editor.publishing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Publicar versão
        </button>
      </header>

      {/* Barra de ferramentas */}
      <div
        className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2"
        role="toolbar"
        aria-label="Ferramentas de desenho"
      >
        <Ferramenta
          atual={editor.tool}
          valor="selecionar"
          icone={MousePointer2}
          rotulo="Selecionar"
          onClick={editor.setTool}
        />
        <Ferramenta
          atual={editor.tool}
          valor="parede"
          icone={Minus}
          rotulo="Parede"
          onClick={editor.setTool}
        />

        <Ferramenta
          atual={editor.tool}
          valor="abertura"
          icone={DoorOpen}
          rotulo="Abertura"
          onClick={editor.setTool}
        />

        <span className="mx-2 h-5 w-px bg-slate-200" aria-hidden />

        {editor.tool === 'abertura' ? (
          <>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Tipo
              <select
                value={tipoAbertura}
                onChange={(e) => setTipoAbertura(e.target.value as 'door' | 'window')}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="door">Porta</option>
                <option value="window">Janela</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Largura
              <select
                value={larguraAbertura}
                onChange={(e) => setLarguraAbertura(Number(e.target.value))}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                {[600, 700, 800, 900, 1000, 1200, 1500, 2000].map((mm) => (
                  <option key={mm} value={mm}>
                    {mm} mm
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Espessura
          <select
            value={espessura}
            onChange={(e) => setEspessura(Number(e.target.value))}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            {[100, 150, 200, 250].map((mm) => (
              <option key={mm} value={mm}>
                {mm} mm
              </option>
            ))}
          </select>
        </label>
        )}

        <label className="flex items-center gap-2 text-xs text-slate-600">
          Grade
          <select
            value={passoGrade === null ? 'auto' : String(passoGrade)}
            onChange={(e) =>
              setPassoGrade(e.target.value === 'auto' ? null : Number(e.target.value))
            }
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            title="Passo de encaixe. Em automático, acompanha o zoom."
          >
            <option value="auto">Automática ({rotuloPasso(passoEmVigor)})</option>
            {[10, 50, 100, 250, 500, 1000].map((mm) => (
              <option key={mm} value={mm}>
                {rotuloPasso(mm)}
              </option>
            ))}
          </select>
        </label>

        <span className="mx-2 h-5 w-px bg-slate-200" aria-hidden />

        <BotaoBarra
          icone={Undo2}
          rotulo="Desfazer (Ctrl+Z)"
          onClick={editor.undo}
          disabled={!editor.canUndo}
        />
        <BotaoBarra
          icone={Redo2}
          rotulo="Refazer (Ctrl+Shift+Z)"
          onClick={editor.redo}
          disabled={!editor.canRedo}
        />
        {/* Excluir é ação de linha no vocabulário do ActionIconButton, então usa
            o componente padrão. Desfazer/refazer/voltar não estão na taxonomia
            dele (`ActionKind` não tem esses casos) — forçar um `kind` só para
            reaproveitar o estilo mentiria na semântica do componente. */}
        <ActionIconButton
          kind="delete"
          title="Excluir parede selecionada (Delete)"
          onClick={removerSelecionada}
          disabled={!editor.selectedId}
        />

        <div className="ml-auto text-xs text-slate-500">
          {editor.model.walls.length} parede(s) · {ambientes.length} ambiente(s)
        </div>
      </div>

      {editor.lastError && (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{editor.lastError}</span>
          {editor.hasConflict ? (
            <button
              type="button"
              onClick={editor.reload}
              className="shrink-0 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
              Recarregar do servidor
            </button>
          ) : (
            <button
              type="button"
              onClick={editor.clearError}
              className="text-xs font-medium underline"
            >
              dispensar
            </button>
          )}
        </div>
      )}

      {/* Corpo */}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {editor.loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando planta…
            </div>
          ) : (
            <BlueprintCanvas
              model={editor.model}
              tool={editor.tool}
              levelId={levelId}
              selectedId={editor.selectedId}
              onSelect={editor.setSelectedId}
              onAddWall={adicionarParede}
              onAddOpening={adicionarAbertura}
              larguraAberturaMm={larguraAbertura}
              onDelete={removerSelecionada}
              espessuraMm={espessura}
              passoGradeMm={passoGrade}
              onPassoEfetivo={setPassoEmVigor}
              vaos={vaosCandidatos.vaos}
              pontasSoltas={vaosCandidatos.soltas}
            />
          )}
        </div>

        {/* Painel de ambientes — é aqui que a planta vira navegável por teclado. */}
        <aside
          className="w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white"
          aria-label="Ambientes derivados"
        >
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Ambientes</h2>
            <p className="text-xs text-slate-500">
              Derivados da topologia — não são desenhados à mão.
            </p>
          </div>

          {(paredeSel || aberturaSel) && (
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {paredeSel ? 'Parede selecionada' : 'Abertura selecionada'}
              </h3>

              {paredeSel && (
                <>
                  <p className="mt-2 text-xs text-slate-600">
                    Comprimento{' '}
                    <span className="font-medium text-slate-800">
                      {(wallLength(paredeSel) / 1000).toFixed(2)} m
                    </span>
                  </p>
                  <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                    Espessura
                    <select
                      value={paredeSel.thicknessMm}
                      onChange={(e) =>
                        editor.run({
                          type: 'SetThickness',
                          wallId: paredeSel.id,
                          thicknessMm: Number(e.target.value),
                        })
                      }
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    >
                      {[100, 150, 200, 250].map((mm) => (
                        <option key={mm} value={mm}>
                          {mm} mm
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="mt-3 flex gap-2">
                    <BotaoTexto icone={Scissors} rotulo="Dividir" onClick={dividirSelecionada} />
                    <BotaoTexto icone={Combine} rotulo="Unir" onClick={unirSelecionada} />
                  </div>
                </>
              )}

              {aberturaSel && (
                <p className="mt-2 text-xs text-slate-600">
                  {aberturaSel.kind === 'door' ? 'Porta' : 'Janela'} de{' '}
                  <span className="font-medium text-slate-800">{aberturaSel.widthMm} mm</span>, a{' '}
                  {(aberturaSel.offsetMm / 1000).toFixed(2)} m do início da parede.
                </p>
              )}
            </div>
          )}

          {vaosCandidatos.soltas.length > 0 && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs text-amber-800">
                <strong>{vaosCandidatos.soltas.length} ponta(s) solta(s).</strong> Enquanto
                houver ponta sem encontro, o contorno não fecha e o ambiente não aparece.
              </p>

              {vaosCandidatos.vaos.length === 0 ? (
                <p className="mt-2 text-xs text-amber-700">
                  Nenhum par de pontas na faixa de abertura (40 cm a 3 m). Aproxime as
                  paredes ou desenhe o trecho que falta.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-xs text-amber-700">
                    {vaosCandidatos.vaos.length} vão(s) encontrado(s). O sistema não decide
                    qual fechar — porta, guarda-corpo e limite externo têm a mesma
                    geometria. Você decide:
                  </p>
                  <ul className="mt-2 space-y-2">
                    {vaosCandidatos.vaos.map((v, i) => (
                      <li
                        key={`${v.a.x},${v.a.y}-${v.b.x},${v.b.y}`}
                        className="rounded-md border border-amber-300 bg-white p-2"
                      >
                        <p className="text-xs font-medium text-slate-700">
                          Vão {i + 1} · {(v.mm / 1000).toFixed(2)} m
                        </p>
                        <div className="mt-1 flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => fecharComPorta(v)}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <DoorOpen className="h-3 w-3" /> É porta
                          </button>
                          <button
                            type="button"
                            onClick={() => fecharComParede(v)}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Minus className="h-3 w-3" /> É parede
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-amber-700">
                    Vão que é limite externo (varanda, terraço) deve ficar aberto — não
                    feche.
                  </p>
                </>
              )}
            </div>
          )}

          <div aria-live="polite" className="px-4 py-2 text-xs text-slate-600">
            {ambientes.length === 0
              ? 'Nenhum ambiente fechado ainda.'
              : `${ambientes.length} ambiente(s) · ${areaTotal.toFixed(2)} m² no total`}
          </div>

          <ul className="divide-y divide-slate-100">
            {ambientes.map((a) => (
              <li key={a.id}>
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-sm font-medium text-slate-700">{a.rotulo}</span>
                  </div>
                  <dl className="mt-1 flex gap-4 text-xs text-slate-500">
                    <div>
                      <dt className="inline">Área </dt>
                      <dd className="inline font-medium text-slate-700">
                        {a.areaM2.toFixed(2)} m²
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">Perímetro </dt>
                      <dd className="inline font-medium text-slate-700">
                        {a.perimetroM.toFixed(2)} m
                      </dd>
                    </div>
                  </dl>
                </div>
              </li>
            ))}
          </ul>

          {ambientes.length === 0 && !editor.loading && (
            <p className="px-4 py-3 text-xs text-slate-400">
              Feche um contorno de paredes para que um ambiente apareça. Pontas soltas
              não fecham área.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Controle de barra: voltar, desfazer, refazer. `title` + `aria-label` porque
 *  botão só com ícone não tem nome acessível nenhum sem isso. */
function BotaoBarra({
  icone: Icone,
  rotulo,
  onClick,
  disabled,
}: {
  icone: React.ElementType;
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={rotulo}
      aria-label={rotulo}
      className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
    >
      <Icone className="h-4 w-4" />
    </button>
  );
}

/** Botão pequeno com ícone e rótulo, para ações do painel. */
function BotaoTexto({
  icone: Icone,
  rotulo,
  onClick,
}: {
  icone: React.ElementType;
  rotulo: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
    >
      <Icone className="h-3.5 w-3.5" />
      {rotulo}
    </button>
  );
}

function Ferramenta({
  atual,
  valor,
  icone: Icone,
  rotulo,
  onClick,
}: {
  atual: BlueprintTool;
  valor: BlueprintTool;
  icone: React.ElementType;
  rotulo: string;
  onClick: (t: BlueprintTool) => void;
}) {
  const ativo = atual === valor;
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={() => onClick(valor)}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        ativo ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icone className="h-4 w-4" />
      {rotulo}
    </button>
  );
}
