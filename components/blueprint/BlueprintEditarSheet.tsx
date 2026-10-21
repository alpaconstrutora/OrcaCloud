/**
 * Planta Inteligente › lista › Editar: nome da planta e empreendimento vinculado.
 *
 * Pedido de 21/10/2026: "O botao editar na tabela atualmente serve para entrar na
 * planta inteligente. Alterar para editar via drawer, nome da planta, empreendimento
 * para vincular uma planta a um empreendimento". Abrir a planta continua no clique
 * da linha. Plano: docs/planos/2026-10-21-planta-lista-editar-e-empreendimento.md.
 *
 * O vínculo é `empreendimentos.blueprint_study_id` — o mesmo que o formulário do
 * Empreendimento grava. Um estudo, um empreendimento: empreendimento já ligado a OUTRA
 * planta aparece desligado, com o motivo no próprio rótulo (o serviço também recusa).
 * Só entram empreendimentos da organização DA PLANTA — o registro tem dono (REGRA #5);
 * o seletor do topo não decide aqui.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import { renameStudy, vincularEmpreendimento } from '../../services/blueprintService';
import type { BlueprintStudy } from '../../types/blueprint';
import type { Empreendimento } from '../../types/empreendimento';

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO =
  'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:bg-gray-50 disabled:cursor-not-allowed';

type EmpreendimentoDaLista = Pick<Empreendimento, 'id' | 'name' | 'organization_id' | 'blueprint_study_id'>;

interface Props {
  /** O estudo em edição; `null` = drawer fechado. */
  study: BlueprintStudy | null;
  /** Empreendimentos que a lista já carregou (todas as orgs visíveis). `null` = ainda carregando. */
  empreendimentos: EmpreendimentoDaLista[] | null;
  /** Falha ao listar os empreendimentos — o campo fica desligado com este motivo. */
  erroEmpreendimentos: string | null;
  /** Nome de cada planta por id — para dizer A QUAL planta um empreendimento já pertence. */
  nomeDaPlanta: (studyId: string) => string | undefined;
  onClose: () => void;
  /**
   * Chamado a cada gravação que deu certo. `empreendimentoId` é `undefined` quando o
   * vínculo não mudou (só o nome), `null` quando foi desfeito.
   */
  onSalvo: (study: BlueprintStudy, empreendimentoId: string | null | undefined) => void;
}

export default function BlueprintEditarSheet({ study, empreendimentos, erroEmpreendimentos, nomeDaPlanta, onClose, onSalvo }: Props) {
  const confirm = useConfirm();
  const [nome, setNome] = useState('');
  const [empreendimentoId, setEmpreendimentoId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Os empreendimentos da organização da planta, e o que aponta para ela hoje.
  const daOrganizacao = useMemo(
    () =>
      study && empreendimentos
        ? empreendimentos.filter((e) => e.organization_id === study.organization_id).sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [study, empreendimentos],
  );
  const vinculadosHoje = useMemo(() => daOrganizacao.filter((e) => e.blueprint_study_id === study?.id), [daOrganizacao, study]);
  const vinculoAtual = vinculadosHoje[0]?.id ?? '';

  // Reabrir (ou trocar de planta) recomeça do que está gravado — nunca de um rascunho anterior.
  useEffect(() => {
    if (!study) return;
    setNome(study.name);
    setErro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [study?.id]);
  useEffect(() => {
    if (study) setEmpreendimentoId(vinculoAtual);
  }, [study?.id, vinculoAtual]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!study) return null;

  const nomeMudou = nome.trim() !== study.name;
  const vinculoMudou = empreendimentoId !== vinculoAtual;
  const dirty = nomeMudou || vinculoMudou;
  const carregando = empreendimentos === null;
  const motivoDesligado: string | null = salvando
    ? 'Salvando…'
    : !nome.trim()
      ? 'Informe o nome da planta.'
      : !dirty
        ? 'Nada foi alterado.'
        : null;
  const motivoCampoEmpreendimento = carregando ? 'Carregando os empreendimentos…' : erroEmpreendimentos;

  async function fechar() {
    if (dirty && !salvando) {
      const ok = await confirm({
        title: 'Sair sem salvar?',
        message: 'Há alterações não salvas. Se sair agora, elas serão perdidas.',
        variant: 'warning',
        confirmLabel: 'Sair e descartar',
        cancelLabel: 'Continuar editando',
      });
      if (!ok) return;
    }
    onClose();
  }

  async function salvar() {
    if (motivoDesligado || !study) return;
    setSalvando(true);
    setErro(null);
    let atual = study;
    try {
      if (nomeMudou) {
        atual = await renameStudy(study.id, nome);
        // O nome já está gravado: a lista recebe mesmo que o vínculo falhe a seguir.
        if (!vinculoMudou) onSalvo(atual, undefined);
      }
      if (vinculoMudou) {
        await vincularEmpreendimento(study.id, empreendimentoId || null);
        onSalvo(atual, empreendimentoId || null);
      }
      onClose();
    } catch (e) {
      if (atual !== study) onSalvo(atual, undefined);
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Sheet open onClose={onClose} size="md" dirty={dirty && !salvando}>
      <SheetHeader onClose={fechar}>
        <SheetTitle>Editar planta</SheetTitle>
        <SheetDescription>Nome da planta e o empreendimento a que ela pertence.</SheetDescription>
      </SheetHeader>

      <SheetPanel className="px-6 py-5 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="blueprint-editar-nome" className={ROTULO}>
            Nome da planta
          </label>
          <input
            id="blueprint-editar-nome"
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Residencial Garden — Torre A"
            className={CAMPO}
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="blueprint-editar-empreendimento" className={ROTULO}>
            Empreendimento
          </label>
          <select
            id="blueprint-editar-empreendimento"
            value={empreendimentoId}
            onChange={(e) => setEmpreendimentoId(e.target.value)}
            disabled={!!motivoCampoEmpreendimento}
            title={motivoCampoEmpreendimento ?? undefined}
            className={`${CAMPO} cursor-pointer`}
          >
            <option value="">— Sem vínculo —</option>
            {daOrganizacao.map((e) => {
              const deOutra = !!e.blueprint_study_id && e.blueprint_study_id !== study.id;
              return (
                <option key={e.id} value={e.id} disabled={deOutra}>
                  {deOutra ? `${e.name} — vinculado a «${nomeDaPlanta(e.blueprint_study_id!) ?? 'outra planta'}»` : e.name}
                </option>
              );
            })}
          </select>
          <p className="text-xs text-gray-500">
            {motivoCampoEmpreendimento ??
              (daOrganizacao.length === 0
                ? 'Nenhum empreendimento na organização desta planta.'
                : 'O empreendimento recebe as torres e unidades do estudo de massa e do loteamento desta planta (Central de Sincronização). Só aparecem os da organização da planta; um empreendimento vinculado a outra planta precisa ser desvinculado lá antes.')}
          </p>
          {vinculadosHoje.length > 1 && (
            <p className="text-xs text-amber-700">
              Hoje {vinculadosHoje.length} empreendimentos apontam para esta planta ({vinculadosHoje.map((e) => e.name).join(', ')}). Ao trocar
              o vínculo, fica só o escolhido.
            </p>
          )}
        </div>

        {erro && <p className="rounded-[10px] border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">{erro}</p>}
      </SheetPanel>

      <SheetFooter>
        <button
          type="button"
          onClick={fechar}
          disabled={salvando}
          className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={salvar}
          disabled={!!motivoDesligado}
          title={motivoDesligado ?? undefined}
          className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
          Salvar
        </button>
      </SheetFooter>
    </Sheet>
  );
}
