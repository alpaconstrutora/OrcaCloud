/**
 * WEBHOOKS (20/09/2026, roadmap E9.3) — a tela in-flow: os webhooks da
 * organização (URL, eventos, segredo do HMAC, ativo), criar/editar/apagar,
 * "Testar" (enfileira um `teste.ping`), e o LOG das entregas (evento, status,
 * tentativas, HTTP, erro, próxima tentativa) com "Reenviar".
 *
 * O segredo fica visível para quem é membro: é ele que a pessoa cola no
 * receptor para conferir `X-Opura-Signature`. Nada aqui dispara nada
 * diretamente — quem entrega é o despachante no servidor.
 */
import React, { useState } from 'react';
import { Check, Copy, Pencil, Plus, RefreshCw, Send, Webhook as WebhookIcon } from 'lucide-react';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import type { EntregaDeWebhook, NovoWebhook, Webhook } from '../../services/blueprintWebhookService';
import { DESCRICAO_DO_EVENTO, EVENTOS_ASSINAVEIS, exemploDeReceptor, ROTULO_DO_EVENTO, validarWebhook, type EventoDeWebhook } from '../../supabase/functions/planta-webhooks/politica';

interface Props {
  webhooks: Webhook[];
  entregas: EntregaDeWebhook[];
  carregando: boolean;
  indisponivel: string | null;
  nomeDaOrg: (id: string) => string;
  mostrarOrg: boolean;
  onCriar: (w: NovoWebhook) => Promise<void>;
  onAtualizar: (id: string, w: Partial<NovoWebhook>) => Promise<void>;
  onApagar: (id: string) => Promise<void>;
  onTestar: (id: string) => Promise<void>;
  onReenviar: (entregaId: string) => Promise<void>;
  onRecarregarEntregas: () => void;
}

const COLUNAS: StandardTableColumn[] = [
  { key: 'nome', label: 'Nome', width: 200 },
  { key: 'url', label: 'URL', width: 320 },
  { key: 'org', label: 'Organização', width: 180 },
  { key: 'eventos', label: 'Eventos', width: 260 },
  { key: 'ultimo', label: 'Última entrega', width: 160 },
  { key: 'status', label: 'Status', width: 90 },
];
const COLUNAS_ENTREGAS: StandardTableColumn[] = [
  { key: 'quando', label: 'Quando', width: 140 },
  { key: 'webhook', label: 'Webhook', width: 180 },
  { key: 'evento', label: 'Evento', width: 170 },
  { key: 'estado', label: 'Estado', width: 110 },
  { key: 'tentativas', label: 'Tent.', width: 60, align: 'right' },
  { key: 'http', label: 'HTTP', width: 70, align: 'right' },
  { key: 'erro', label: 'Erro / próxima tentativa', width: 320 },
];

const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

interface Form {
  id: string | null;
  nome: string;
  url: string;
  eventos: EventoDeWebhook[];
}

export default function TelaWebhooks({ webhooks, entregas, carregando, indisponivel, nomeDaOrg, mostrarOrg, onCriar, onAtualizar, onApagar, onTestar, onReenviar, onRecarregarEntregas }: Props) {
  const confirmar = useConfirm();
  const [form, setForm] = useState<Form | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [filtroWebhook, setFiltroWebhook] = useState<string>('');
  const colunas = mostrarOrg ? COLUNAS : COLUNAS.filter((c) => c.key !== 'org');
  const nomeDoWebhook = new Map(webhooks.map((w) => [w.id, w.nome]));
  const entregasVisiveis = filtroWebhook ? entregas.filter((e) => e.webhookId === filtroWebhook) : entregas;

  async function salvar() {
    if (!form) return;
    const e = validarWebhook(form);
    setErros(e);
    if (e.length) return;
    setOcupado(true);
    try {
      if (form.id) await onAtualizar(form.id, { nome: form.nome, url: form.url, eventos: form.eventos });
      else await onCriar({ nome: form.nome, url: form.url, eventos: form.eventos });
      setForm(null);
      setAviso(form.id ? 'Webhook atualizado.' : 'Webhook criado. Copie o segredo e configure o receptor; depois use Testar.');
    } catch (err) {
      setErros([err instanceof Error ? err.message : String(err)]);
    } finally {
      setOcupado(false);
    }
  }

  async function copiar(id: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
    } catch {
      setCopiado(null);
    }
  }

  const campo = 'h-9 rounded-[6px] border border-slate-300 bg-white px-2 text-sm text-slate-800';

  return (
    <div className="space-y-4" data-testid="tela-webhooks">
      <div className="rounded-[10px] border border-slate-200 bg-white p-4 text-sm text-slate-700" data-testid="como-funciona-webhook">
        <p className="font-semibold text-slate-800">Como funciona</p>
        <p className="mt-1">
          Quando um evento acontece, o banco enfileira uma entrega por webhook assinante e o servidor faz um <code>POST</code> na sua URL com o corpo em JSON e a assinatura <code>X-Opura-Signature: sha256=HMAC(segredo, corpo)</code>. Responda <strong>2xx</strong>. Sem 2xx, tentamos de novo em 1 min, 5 min, 30 min, 2 h e 12 h; depois marcamos como falha e você reenvia daqui.
        </p>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-blue-700">Exemplo de receptor (Node)</summary>
          <pre className="mt-1 overflow-auto rounded-[6px] bg-slate-50 p-2 text-xs text-slate-700">{exemploDeReceptor()}</pre>
        </details>
      </div>

      {indisponivel && <p className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Webhooks indisponíveis: {indisponivel}</p>}
      {aviso && <p className="rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800" data-testid="aviso-webhook">{aviso}</p>}

      {form && (
        <div className="rounded-[10px] border border-slate-200 bg-white p-4" data-testid="form-webhook">
          <p className="text-sm font-semibold text-slate-800">{form.id ? 'Editar webhook' : 'Novo webhook'}</p>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Nome
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: ERP — publicar versão" aria-label="Nome do webhook" className={campo} autoFocus />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              URL (https)
              <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" aria-label="URL do webhook" className={campo} />
            </label>
          </div>
          <fieldset className="mt-3">
            <legend className="text-xs font-medium text-slate-600">Eventos</legend>
            <div className="mt-1 grid grid-cols-1 gap-1 md:grid-cols-2">
              {EVENTOS_ASSINAVEIS.map((ev) => (
                <label key={ev} className="flex items-start gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.eventos.includes(ev)}
                    onChange={(e) => setForm({ ...form, eventos: e.target.checked ? [...form.eventos, ev] : form.eventos.filter((x) => x !== ev) })}
                    aria-label={ROTULO_DO_EVENTO[ev]}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300"
                  />
                  <span>
                    <span className="font-medium">{ROTULO_DO_EVENTO[ev]}</span> <code className="text-[10px] text-slate-500">{ev}</code>
                    <span className="block text-[11px] text-slate-500">{DESCRICAO_DO_EVENTO[ev]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" disabled={ocupado} onClick={() => void salvar()} className="h-9 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300" data-testid="salvar-webhook">{form.id ? 'Salvar' : 'Criar webhook'}</button>
            <button type="button" onClick={() => { setForm(null); setErros([]); }} className="h-9 rounded-[6px] px-3 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          </div>
          {erros.length > 0 && <p className="mt-2 text-xs text-red-700" data-testid="erros-do-webhook">{erros.join(' · ')}</p>}
        </div>
      )}

      <StandardTable<Webhook>
        columns={colunas}
        storageKey="blueprint:webhooks"
        rows={webhooks}
        rowKey={(w) => w.id}
        loading={carregando}
        toolbarRight={
          <button type="button" onClick={() => { setForm({ id: null, nome: '', url: '', eventos: ['versao.publicada'] }); setErros([]); setAviso(null); }} className="inline-flex h-9 items-center gap-1 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700" data-testid="novo-webhook">
            <Plus className="h-4 w-4" /> Novo webhook
          </button>
        }
        renderCell={(key, w) => {
          switch (key) {
            case 'nome':
              return <span className="flex items-center gap-2 text-sm font-medium text-gray-800"><WebhookIcon className="h-3.5 w-3.5 text-slate-400" />{w.nome}</span>;
            case 'url':
              return (
                <span className="flex flex-col gap-0.5">
                  <span className="truncate text-xs text-slate-700" title={w.url}>{w.url}</span>
                  <span className="flex items-center gap-1 text-[11px] text-slate-500">
                    segredo <code className="text-[10px]">{w.segredo.slice(0, 8)}…</code>
                    <button type="button" onClick={() => void copiar(w.id, w.segredo)} className="inline-flex items-center gap-0.5 text-blue-700 hover:underline" aria-label={`Copiar segredo de ${w.nome}`}>
                      {copiado === w.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copiado === w.id ? 'copiado' : 'copiar'}
                    </button>
                  </span>
                </span>
              );
            case 'org':
              return <span className="text-xs text-gray-600">{nomeDaOrg(w.organizationId)}</span>;
            case 'eventos':
              return <span className="text-xs text-slate-700">{w.eventos.map((e) => ROTULO_DO_EVENTO[e] ?? e).join(' · ')}</span>;
            case 'ultimo':
              return <span className="text-xs text-slate-700">{w.ultimaEntregaAt ? `${dataHora(w.ultimaEntregaAt)} · HTTP ${w.ultimoStatus ?? '—'}` : 'nunca'}</span>;
            case 'status':
              return (
                <button
                  type="button"
                  onClick={() => void onAtualizar(w.id, { active: !w.active })}
                  className={`rounded-[6px] px-2 py-0.5 text-xs font-medium ${w.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                  aria-label={`${w.active ? 'Desativar' : 'Ativar'} webhook ${w.nome}`}
                  title={w.active ? 'Ativo — clique para pausar' : 'Pausado — clique para ativar'}
                >
                  {w.active ? 'ativo' : 'pausado'}
                </button>
              );
            default:
              return null;
          }
        }}
        actions={{
          label: 'Ações',
          width: 130,
          render: (w) => (
            <span className="flex items-center gap-1">
              <ActionIconButton kind="edit" title={`Editar webhook ${w.nome}`} aria-label={`Editar webhook ${w.nome}`} onClick={() => { setForm({ id: w.id, nome: w.nome, url: w.url, eventos: [...w.eventos] }); setErros([]); setAviso(null); }} />
              <ActionIconButton
                kind="edit"
                icon={<Send className="h-4 w-4" />}
                title={`Testar webhook ${w.nome}`}
                aria-label={`Testar webhook ${w.nome}`}
                onClick={async () => {
                  setAviso(null);
                  try {
                    await onTestar(w.id);
                    setAviso(`Teste enfileirado para "${w.nome}". O resultado aparece no log em instantes.`);
                  } catch (e) {
                    setAviso(`Falha ao testar: ${e instanceof Error ? e.message : String(e)}`);
                  }
                }}
              />
              <ActionIconButton
                kind="delete"
                title={`Apagar webhook ${w.nome}`}
                aria-label={`Apagar webhook ${w.nome}`}
                onClick={async () => {
                  const ok = await confirmar({ title: 'Apagar webhook', message: `"${w.nome}" deixa de receber eventos e o log dele some. Para só pausar, use o status.`, confirmLabel: 'Apagar', variant: 'danger' });
                  if (ok) await onApagar(w.id);
                }}
              />
            </span>
          ),
        }}
        empty={{ title: 'Nenhum webhook', subtitle: 'Crie um para avisar seu ERP, BI ou canal quando uma versão for publicada ou aprovada.' }}
      />

      <div className="rounded-[10px] border border-slate-200 bg-white p-4" data-testid="log-de-entregas">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-slate-800">Entregas (últimas {entregas.length})</p>
          <select value={filtroWebhook} onChange={(e) => setFiltroWebhook(e.target.value)} aria-label="Filtrar entregas por webhook" className="h-8 rounded-[6px] border border-slate-300 bg-white px-1.5 text-xs text-slate-700">
            <option value="">todos os webhooks</option>
            {webhooks.map((w) => (
              <option key={w.id} value={w.id}>{w.nome}</option>
            ))}
          </select>
          <button type="button" onClick={onRecarregarEntregas} className="ml-auto inline-flex h-8 items-center gap-1 rounded-[6px] border border-slate-300 bg-white px-2 text-xs text-slate-700 hover:bg-slate-50" data-testid="recarregar-entregas">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        </div>
        <StandardTable<EntregaDeWebhook>
          columns={COLUNAS_ENTREGAS}
          storageKey="blueprint:webhook-entregas"
          rows={entregasVisiveis}
          rowKey={(e) => e.id}
          loading={carregando}
          renderCell={(key, e) => {
            switch (key) {
              case 'quando':
                return <span className="text-xs text-slate-700">{dataHora(e.createdAt)}</span>;
              case 'webhook':
                return <span className="text-xs text-slate-700">{nomeDoWebhook.get(e.webhookId) ?? '—'}</span>;
              case 'evento':
                return <span className="text-xs text-slate-700" title={JSON.stringify(e.payload)}>{ROTULO_DO_EVENTO[e.evento] ?? e.evento}</span>;
              case 'estado':
                return e.status === 'ENTREGUE' ? <span className="text-xs font-medium text-emerald-700">entregue</span> : e.status === 'FALHOU' ? <span className="text-xs font-medium text-red-700">falhou</span> : <span className="text-xs text-amber-700">pendente</span>;
              case 'tentativas':
                return <span className="block text-right text-xs tabular-nums text-slate-700">{e.tentativas}</span>;
              case 'http':
                return <span className="block text-right text-xs tabular-nums text-slate-700">{e.httpStatus ?? '—'}</span>;
              case 'erro':
                return (
                  <span className="text-xs text-slate-600">
                    {e.erro ?? (e.status === 'ENTREGUE' ? `entregue ${dataHora(e.entregueAt)}` : '')}
                    {e.status === 'PENDENTE' && e.tentativas > 0 ? ` · próxima ${dataHora(e.proximaTentativaAt)}` : ''}
                  </span>
                );
              default:
                return null;
            }
          }}
          actions={{
            label: 'Ações',
            width: 70,
            render: (e) =>
              e.status !== 'PENDENTE' ? (
                <ActionIconButton kind="edit" icon={<RefreshCw className="h-4 w-4" />} title="Reenviar esta entrega" aria-label={`Reenviar entrega ${e.id}`} onClick={() => void onReenviar(e.id)} />
              ) : null,
          }}
          empty={{ title: 'Nenhuma entrega ainda', subtitle: 'Publique uma versão ou use Testar num webhook.' }}
        />
      </div>
    </div>
  );
}
