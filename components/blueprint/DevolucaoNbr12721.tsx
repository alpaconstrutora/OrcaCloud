/**
 * FRAÇÕES DA VERSÃO APROVADA DE VOLTA AO EMPREENDIMENTO (14/10/2026, Fase 9 do
 * plano `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`).
 *
 * O drawer liga cada unidade do Empreendimento a uma unidade do prédio da
 * Planta e grava a fração. A ligação é PROPOSTA (`propostaDeVinculos`: a que
 * já existe, ou o mesmo número quando é único dos dois lados) e a pessoa
 * confere/troca na célula antes de gravar — nada é inferido calado.
 *
 * Quem grava é a RPC `devolver_nbr12721_ao_empreendimento`, numa transação:
 * ela confere membro, estudo ligado, aprovação técnica E jurídica e cada par,
 * e nunca toca fração de CONVENÇÃO. Esta tela só antecipa os motivos para o
 * botão desligado dizer por quê.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link2 } from 'lucide-react';
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetTitle } from '../ui/sheet';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { blueprintSnapshotNbr12721Service as servico, type RelatorioDaDevolucao } from '../../services/blueprintSnapshotNbr12721Service';
import { paresParaDevolver, propostaDeVinculos, type VinculoProposto } from '../../utils/nbr12721/vinculos';
import type { UnidadeCongelada } from '../../utils/blueprintNbr12721';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  snapshotId: string;
  empreendimento: { id: string; name: string; organizationId: string };
}

interface Linha extends VinculoProposto {
  torre: string;
  milesimos: number | null;
  /** O que a proposta trouxe — para dizer "Escolhida" quando a pessoa troca. */
  proposta: { chave: string | null; situacao: VinculoProposto['situacao'] };
}

// Soma ≤ ~620 px: o Sheet 2xl dá ~672 px de corpo menos o respiro — com 760 px a última coluna sumia à direita.
const COLUNAS: StandardTableColumn[] = [
  { key: 'torre', label: 'Torre', width: 100 },
  { key: 'nome', label: 'Unidade', width: 90 },
  { key: 'planta', label: 'Unidade da Planta', width: 130 },
  { key: 'situacao', label: 'Situação', width: 180 },
  { key: 'milesimos', label: 'Milésimos atuais', width: 120, align: 'right' },
];

const CAMPO_NA_CELULA = 'w-full rounded-[6px] border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-normal text-gray-700 hover:border-slate-200 focus:border-blue-400 focus:bg-white';

function situacao(l: Linha): { texto: string; cor: string } {
  const sufixo = l.convencao && l.chave ? ' · convenção (fração mantida)' : '';
  if (!l.chave) return { texto: `Sem par${l.convencao ? ' · convenção' : ''}`, cor: 'text-amber-600' };
  if (l.chave !== l.proposta.chave) return { texto: `Escolhida${sufixo}`, cor: 'text-blue-600' };
  if (l.proposta.situacao === 'GRAVADO') return { texto: `Já ligada${sufixo}`, cor: 'text-gray-600' };
  return { texto: `Proposta pelo número${sufixo}`, cor: 'text-blue-600' };
}

export default function DevolucaoNbr12721({ aberto, onFechar, snapshotId, empreendimento }: Props) {
  const [planta, setPlanta] = useState<UnidadeCongelada[] | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioDaDevolucao | null>(null);

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setCarregando(true);
    setErro(null);
    setRelatorio(null);
    void (async () => {
      try {
        const [p, us] = await Promise.all([servico.unidadesDaVersao(snapshotId), servico.unidadesDoEmpreendimento(empreendimento.id)]);
        if (!vivo) return;
        const { vinculos } = propostaDeVinculos(us, p);
        const extra = new Map(us.map((u) => [u.id, u] as const));
        setPlanta(p);
        setLinhas(vinculos.map((v) => ({ ...v, torre: extra.get(v.unitId)?.torre ?? '', milesimos: extra.get(v.unitId)?.milesimos ?? null, proposta: { chave: v.chave, situacao: v.situacao } })));
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message.replace(/^blueprintSnapshotNbr12721\/\w+: /, '') : String(e));
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [aberto, snapshotId, empreendimento.id]);

  const numeroPorChave = useMemo(() => new Map((planta ?? []).map((u) => [u.chave, u.numero] as const)), [planta]);
  const usadas = useMemo(() => new Set(linhas.map((l) => l.chave).filter(Boolean) as string[]), [linhas]);
  const ligadas = linhas.filter((l) => l.chave);
  const aGravar = ligadas.filter((l) => !l.convencao).length;
  const plantaSemPar = (planta ?? []).filter((u) => !usadas.has(u.chave));

  const motivo =
    carregando ? 'Carregando as unidades'
    : planta && planta.length === 0 ? 'Esta versão foi publicada antes da devolução existir e não guardou as unidades — publique uma versão nova e aprove'
    : linhas.length === 0 ? 'O Empreendimento não tem unidades cadastradas'
    : ligadas.length === 0 ? 'Ligue ao menos uma unidade do Empreendimento a uma unidade da Planta'
    : null;

  const trocar = (unitId: string, chave: string | null) => setLinhas((ls) => ls.map((l) => (l.unitId === unitId ? { ...l, chave } : l)));

  const gravar = async () => {
    if (motivo) return;
    setGravando(true);
    setErro(null);
    try {
      setRelatorio(await servico.devolverAoEmpreendimento(snapshotId, empreendimento, paresParaDevolver(linhas)));
    } catch (e) {
      setErro(e instanceof Error ? e.message.replace(/^blueprintSnapshotNbr12721\/\w+: /, '') : String(e));
    } finally {
      setGravando(false);
    }
  };

  return (
    <Sheet open={aberto} onClose={onFechar} size="2xl">
      <SheetHeader onClose={onFechar}>
        <SheetTitle>Levar frações ao Empreendimento</SheetTitle>
        <SheetDescription>
          {empreendimento.name}: confira a qual unidade da Planta cada unidade corresponde. A fração (milésimos fechados em 1000) e a área real total vão para o cadastro; fração de convenção não muda.
        </SheetDescription>
      </SheetHeader>
      <SheetPanel className="px-6 py-5 space-y-5">
        {relatorio ? (
          <div className="space-y-2 text-sm text-gray-700" data-testid="relatorio-devolucao">
            <p className="font-semibold text-gray-900">
              Versão {relatorio.revisao}: {relatorio.gravadas} fração(ões) gravada(s) no Empreendimento; {relatorio.vinculos} unidade(s) ligada(s).
            </p>
            {relatorio.convencao.length > 0 && <p>Fração de convenção mantida: {relatorio.convencao.join(', ')}.</p>}
            {relatorio.semFracao.length > 0 && <p>Ligadas a unidade sem fração (não autônoma): {relatorio.semFracao.join(', ')}.</p>}
            {linhas.length - ligadas.length > 0 && <p>Sem par, não tocadas: {linhas.filter((l) => !l.chave).map((l) => l.nome).join(', ')}.</p>}
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600">
              {ligadas.length} de {linhas.length} unidade(s) ligada(s) · {aGravar} fração(ões) a gravar
              {plantaSemPar.length > 0 && <> · da Planta sem par: {plantaSemPar.map((u) => u.numero).join(', ')}</>}
            </p>
            <StandardTable<Linha>
              storageKey="blueprint:nbr12721:devolucao"
              columns={COLUNAS}
              rows={linhas}
              rowKey={(l) => l.unitId}
              dense
              bare
              loading={carregando}
              searchText={(l) => `${l.torre} ${l.nome} ${l.chave ? numeroPorChave.get(l.chave) ?? '' : ''}`}
              searchPlaceholder="Buscar unidade"
              sortValue={(k, l) => (k === 'milesimos' ? l.milesimos : k === 'planta' ? (l.chave ? numeroPorChave.get(l.chave) : '') : k === 'situacao' ? situacao(l).texto : k === 'torre' ? l.torre : l.nome)}
              renderCell={(k, l) => {
                if (k === 'planta')
                  return (
                    <select
                      aria-label={`Unidade da Planta para ${l.nome}`}
                      className={CAMPO_NA_CELULA}
                      value={l.chave ?? ''}
                      onChange={(e) => trocar(l.unitId, e.target.value || null)}
                    >
                      <option value="">Sem par</option>
                      {(planta ?? []).map((u) => (
                        <option key={u.chave} value={u.chave} disabled={usadas.has(u.chave) && u.chave !== l.chave}>
                          {u.numero}
                        </option>
                      ))}
                    </select>
                  );
                if (k === 'situacao') {
                  const s = situacao(l);
                  return <span className={`text-sm font-normal ${s.cor}`}>{s.texto}</span>;
                }
                if (k === 'milesimos')
                  return <span className="text-sm font-normal text-gray-600">{l.milesimos == null ? '—' : l.milesimos.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>;
                return <span className="text-sm font-normal text-gray-700">{k === 'torre' ? l.torre : l.nome}</span>;
              }}
              empty={{ icon: <Link2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhuma unidade no Empreendimento', subtitle: 'Cadastre as torres e unidades no Empreendimento para ligar às da Planta.' }}
            />
          </>
        )}
        {erro && (
          <p className="text-sm text-red-700" role="alert">
            {erro}
          </p>
        )}
      </SheetPanel>
      <SheetFooter>
        {relatorio ? (
          <button type="button" onClick={onFechar} className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
            Concluir
          </button>
        ) : (
          <>
            <button type="button" onClick={onFechar} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void gravar()}
              disabled={motivo !== null || gravando}
              title={motivo ?? (gravando ? 'Gravando' : `Grava os vínculos e leva ${aGravar} fração(ões) ao Empreendimento`)}
              className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:bg-slate-300"
            >
              {gravando ? 'Gravando…' : `Gravar e levar ${aGravar} fração(ões)`}
            </button>
          </>
        )}
      </SheetFooter>
    </Sheet>
  );
}
