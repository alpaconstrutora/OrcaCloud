/**
 * KITS DE INSERÇÃO (F2 do backlog de incêndio pós-roadmap, 01/10/2026) — o cadastro
 * da organização, na aba Incêndio.
 *
 * Um kit é "quando eu inserir ESTA peça, entram junto ESTAS outras": o projetista
 * monta o arranjo uma vez no desenho (o hidrante, o extintor ao lado), seleciona,
 * e salva. Dali em diante, inserir a peça principal traz as outras no mesmo lote
 * (um Ctrl+Z), giradas com ela — somadas ao kit padrão (placa, manômetros da VGA).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { BlueprintModel, DisciplinaDeRede, TipoDePontoEletrico, TipoDePontoHidraulico } from '../../utils/blueprintKernel';
import { ROTULO_DO_PONTO_HIDRAULICO } from '../../utils/blueprintHidraulica';
import { ROTULO_DA_DISCIPLINA, ROTULO_DO_PONTO_ELETRICO } from '../../utils/blueprintRede';
import { kitDaSelecao, type KitDeInsercao } from '../../utils/blueprintKitsDeInsercao';
import { apagarKit, listarKits, salvarKit, type KitDaOrganizacao } from '../../services/blueprintKitService';

const rotuloDoTipo = (tipo: string) =>
  ROTULO_DO_PONTO_HIDRAULICO[tipo as TipoDePontoHidraulico] ?? ROTULO_DO_PONTO_ELETRICO[tipo as TipoDePontoEletrico] ?? tipo;

export default function PainelKitsDeInsercao({
  organizationId,
  model,
  selecionados,
  onKits,
}: {
  organizationId: string;
  model: BlueprintModel;
  /** Na ordem da seleção: a PRIMEIRA peça selecionada é a principal. */
  selecionados: readonly string[];
  onKits: (kits: KitDeInsercao[]) => void;
}) {
  const [kits, setKits] = useState<KitDaOrganizacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  // Quem chama pode passar uma função nova a cada render: ela não pode disparar outra leitura.
  const entregar = useRef(onKits);
  entregar.current = onKits;

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await listarKits(organizationId);
      setKits(lista);
      entregar.current(lista);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falha ao carregar os kits');
    } finally {
      setCarregando(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const pecas = useMemo(() => {
    const porId = new Map((model.terminais ?? []).map((t) => [t.id, t]));
    return selecionados.map((id) => porId.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
  }, [model, selecionados]);
  const principal = pecas[0] ?? null;
  const kit = principal ? kitDaSelecao(model, principal.id, pecas.slice(1).map((t) => t.id), nome) : null;
  const repetido = kit && kits.some((k) => k.disciplina === kit.disciplina && k.tipo === kit.tipo && k.nome === kit.nome);
  const motivo = ocupado
    ? 'Aguarde a gravação anterior'
    : !principal
      ? 'Selecione no desenho a peça principal e, depois, as que entram junto com ela'
      : !kit
        ? 'Selecione também as peças que entram junto (no mesmo pavimento da principal)'
        : nome.trim() === ''
          ? 'Dê um nome ao kit'
          : repetido
            ? 'Já existe um kit com esse nome para essa peça'
            : undefined;

  async function salvar() {
    if (motivo || !kit) return;
    setOcupado(true);
    try {
      await salvarKit(organizationId, kit);
      setNome('');
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falha ao salvar o kit');
    } finally {
      setOcupado(false);
    }
  }

  async function remover(id: string) {
    setOcupado(true);
    try {
      await apagarKit(id, organizationId);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falha ao apagar o kit');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="kits-de-insercao">
      <p className="text-[11px] text-slate-500">
        Ao inserir a peça principal, as peças do kit entram junto, no mesmo lote (um Ctrl+Z), giradas com ela. A placa do equipamento e os manômetros da VGA
        continuam entrando sozinhos.
      </p>

      {carregando ? (
        <p className="text-xs text-slate-500">Carregando…</p>
      ) : kits.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhum kit cadastrado nesta organização.</p>
      ) : (
        <ul className="space-y-1.5">
          {kits.map((k) => (
            <li key={k.id} className="flex items-start gap-2 rounded border border-slate-200 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-700">{k.nome}</p>
                <p className="truncate text-[11px] text-slate-500">
                  Ao inserir {rotuloDoTipo(k.tipo)} ({ROTULO_DA_DISCIPLINA[k.disciplina as DisciplinaDeRede] ?? k.disciplina}): + {k.itens.map((i) => i.tipo).join(', ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void remover(k.id)}
                disabled={ocupado}
                title={ocupado ? 'Aguarde a gravação anterior' : undefined}
                aria-label={`Remover o kit ${k.nome}`}
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5 border-t border-slate-200 pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Salvar a seleção como kit</h3>
        <p className="text-[11px] text-slate-500">
          {principal
            ? `Peça principal: ${principal.tipo} (a primeira selecionada) · ${kit ? `${kit.itens.length} peça(s) entram junto` : 'nenhuma outra peça selecionada'}`
            : 'Monte o arranjo no desenho e selecione a peça principal primeiro.'}
        </p>
        <div className="flex gap-1.5">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do kit — ex.: Hidrante + extintor"
            aria-label="Nome do kit"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={!!motivo}
            title={motivo}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Salvar kit
          </button>
        </div>
        {motivo && !ocupado && <p className="text-[11px] text-slate-500">{motivo}.</p>}
        {erro && <p className="text-[11px] text-red-700">{erro}</p>}
      </div>
    </div>
  );
}
