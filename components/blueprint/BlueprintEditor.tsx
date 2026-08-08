import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  MousePointer2,
  Minus,
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
import type { Point } from '../../utils/blueprintKernel';

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

  function removerSelecionada() {
    if (!editor.selectedId) return;
    editor.run({ type: 'DeleteWall', wallId: editor.selectedId });
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

        <span className="mx-2 h-5 w-px bg-slate-200" aria-hidden />

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
          <button
            type="button"
            onClick={editor.clearError}
            className="text-xs font-medium underline"
          >
            dispensar
          </button>
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
              onDelete={removerSelecionada}
              espessuraMm={espessura}
              passoGradeMm={passoGrade}
              onPassoEfetivo={setPassoEmVigor}
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
