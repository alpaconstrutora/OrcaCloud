import React, { useCallback, useEffect, useState } from 'react';
import { Plus, PencilRuler, Loader2, AlertCircle } from 'lucide-react';
import { useOrgContext, useOrgWriteTarget } from '../../hooks/useOrgContext';
import { createStudy, listBranches, listStudies } from '../../services/blueprintService';
import type { BlueprintStudy } from '../../types/blueprint';
import BlueprintEditor from './BlueprintEditor';

/**
 * Planta Inteligente — lista de estudos e entrada no editor (épico E3).
 *
 * Organização: o seletor do topo é a autoridade (ver hooks/useOrgContext.tsx).
 * Na LEITURA, `orgId === null` significa "Todas" e vai direto ao service sem
 * filtro, deixando a RLS recortar — nunca bloquear a tela por causa de null.
 * Na ESCRITA, `resolveWriteOrg` decide: com uma organização no topo usa ela sem
 * perguntar; em "Todas" abre o modal.
 */
export default function BlueprintModule() {
  const { orgId } = useOrgContext();
  const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();

  const [studies, setStudies] = useState<BlueprintStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [aberto, setAberto] = useState<{ study: BlueprintStudy; branchId: string } | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      setStudies(await listStudies(orgId));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function criar() {
    // Modo 'single': uma planta pertence a uma organização por natureza. Não faz
    // sentido replicar o mesmo desenho em várias, então o modal nem oferece
    // "Todas" — é o caso 4 da regra em hooks/useOrgContext.tsx.
    const alvo = await resolveWriteOrg('single');
    if (!alvo) return; // usuário cancelou o modal

    // 'single' só devolve `{ kind: 'org' }`; o ramo 'all' existe para satisfazer
    // o tipo da união. Sem checagem de falsidade depois disto — o guard do CI
    // proíbe a forma `if (!organizationId) return`, e com razão: é exatamente ela
    // que deixa a tela em branco quando o topo está em "Todas".
    const organizationId = alvo.kind === 'org' ? alvo.orgId : alvo.orgIds[0];

    setCriando(true);
    setErro(null);
    try {
      const { study, branch } = await createStudy({
        organizationId,
        name: `Planta ${new Date().toLocaleDateString('pt-BR')}`,
      });
      // §22 do guia: atualiza o array local, sem recarregar a lista inteira.
      setStudies((atual) => [study, ...atual]);
      setAberto({ study, branchId: branch.id });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCriando(false);
    }
  }

  async function abrir(study: BlueprintStudy) {
    setErro(null);
    try {
      const branches = await listBranches(study.id);
      const principal = branches.find((b) => b.name === 'principal') ?? branches[0];
      if (!principal) {
        setErro('Este estudo não tem ramo de trabalho. Crie um novo estudo.');
        return;
      }
      setAberto({ study, branchId: principal.id });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  if (aberto) {
    return (
      <BlueprintEditor
        study={aberto.study}
        branchId={aberto.branchId}
        onBack={() => {
          setAberto(null);
          carregar();
        }}
      />
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Planta Inteligente</h1>
          <p className="mt-1 text-sm text-slate-500">
            Desenhe paredes e o sistema deriva os ambientes, as áreas e os perímetros.
            Publicar cria uma versão imutável, endereçável por hash.
          </p>
        </div>
        <button
          type="button"
          onClick={criar}
          disabled={criando}
          className="inline-flex shrink-0 items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-slate-300"
        >
          {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Nova planta
        </button>
      </div>

      {erro && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando estudos…
        </div>
      ) : studies.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center">
          <PencilRuler className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">Nenhuma planta ainda</p>
          <p className="mt-1 text-sm text-slate-500">
            Crie a primeira para começar a desenhar.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {studies.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => abrir(s)}
                className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left transition-colors hover:border-blue-400 hover:bg-blue-50/40"
              >
                <div className="flex items-center gap-2">
                  <PencilRuler className="h-4 w-4 text-slate-400" />
                  <span className="truncate text-sm font-medium text-slate-800">{s.name}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {s.status === 'PUBLICADO' ? 'Publicada' : 'Rascunho'} · atualizada em{' '}
                  {new Date(s.updated_at).toLocaleDateString('pt-BR')}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {orgTargetModal}
    </div>
  );
}
