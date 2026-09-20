/**
 * API PÚBLICA — CHAVES (20/09/2026, roadmap E9.2): a tela in-flow onde a
 * organização cria e revoga os tokens da API de leitura da Planta Inteligente,
 * vê o último uso e encontra a documentação publicada (`/planta-api/docs`).
 *
 * O token completo aparece UMA vez, ao criar: nem o banco o guarda (só o
 * SHA-256). A lista mostra o prefixo para a pessoa reconhecer qual é qual.
 */
import React, { useState } from 'react';
import { Check, Copy, ExternalLink, KeyRound, Plus, ShieldOff } from 'lucide-react';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import type { TokenCriado, TokenDaApi } from '../../services/blueprintApiTokenService';
// A MESMA fonte da documentação publicada (`/openapi.json`): a tabela de rotas aqui é a página humana —
// a plataforma de Edge Functions rebaixa HTML a text/plain, então a "página bonita" é esta tela.
import { openapi } from '../../supabase/functions/planta-api/openapi';

interface Props {
  tokens: TokenDaApi[];
  carregando: boolean;
  indisponivel: string | null;
  /** Nome da organização por id — a coluna aparece quando o topo está em "Todas". */
  nomeDaOrg: (id: string) => string;
  mostrarOrg: boolean;
  urlBase: string;
  onCriar: (nome: string, expiresAt: string | null) => Promise<TokenCriado>;
  onRevogar: (id: string) => Promise<void>;
}

const COLUNAS: StandardTableColumn[] = [
  { key: 'nome', label: 'Nome', width: 220 },
  { key: 'prefixo', label: 'Token', width: 140 },
  { key: 'org', label: 'Organização', width: 200 },
  { key: 'criado', label: 'Criado em', width: 120 },
  { key: 'validade', label: 'Validade', width: 120 },
  { key: 'uso', label: 'Último uso', width: 150 },
  { key: 'usos', label: 'Chamadas', width: 90, align: 'right' },
  { key: 'status', label: 'Status', width: 100 },
];

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca');

export function validarNovoToken(nome: string, validade: string): string[] {
  const erros: string[] = [];
  const n = nome.trim();
  if (!n) erros.push('nome é obrigatório');
  if (n.length > 80) erros.push('nome maior que 80 caracteres');
  if (validade) {
    const d = new Date(`${validade}T23:59:59`);
    if (Number.isNaN(d.getTime())) erros.push('validade inválida');
    else if (d.getTime() <= Date.now()) erros.push('validade tem de estar no futuro');
  }
  return erros;
}

export default function TelaChavesDeApi({ tokens, carregando, indisponivel, nomeDaOrg, mostrarOrg, urlBase, onCriar, onRevogar }: Props) {
  const confirmar = useConfirm();
  const [form, setForm] = useState<{ nome: string; validade: string } | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [criado, setCriado] = useState<TokenCriado | null>(null);
  const [copiado, setCopiado] = useState(false);
  const colunas = mostrarOrg ? COLUNAS : COLUNAS.filter((c) => c.key !== 'org');

  async function salvar() {
    if (!form) return;
    const e = validarNovoToken(form.nome, form.validade);
    setErros(e);
    if (e.length) return;
    setOcupado(true);
    try {
      const t = await onCriar(form.nome.trim(), form.validade ? new Date(`${form.validade}T23:59:59`).toISOString() : null);
      setCriado(t);
      setCopiado(false);
      setForm(null);
    } catch (err) {
      setErros([err instanceof Error ? err.message : String(err)]);
    } finally {
      setOcupado(false);
    }
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  const campo = 'h-9 rounded-[6px] border border-slate-300 bg-white px-2 text-sm text-slate-800';

  return (
    <div className="space-y-4" data-testid="tela-chaves-de-api">
      <div className="rounded-[10px] border border-slate-200 bg-white p-4 text-sm text-slate-700" data-testid="como-usar-a-api">
        <p className="font-semibold text-slate-800">Como usar</p>
        <p className="mt-1">
          A API é <strong>somente leitura</strong> e devolve o que foi <strong>publicado</strong>: estudos, versões (payload canônico + hash), quantitativos, planilha CSV, IFC e unidades/áreas. O token vale para a organização em que foi criado e para nada além dela.
        </p>
        <pre className="mt-2 overflow-auto rounded-[6px] bg-slate-50 p-2 font-mono text-xs text-slate-700">{`curl -H "Authorization: Bearer opk_…" ${urlBase}/v1/estudos`}</pre>
        <p className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          <a href={`${urlBase}/docs`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline" data-testid="link-docs-da-api">
            <ExternalLink className="h-3.5 w-3.5" /> Documentação publicada
          </a>
          <a href={`${urlBase}/openapi.json`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> openapi.json
          </a>
        </p>
      </div>

      <details className="rounded-[10px] border border-slate-200 bg-white p-4 text-sm text-slate-700" data-testid="rotas-da-api">
        <summary className="cursor-pointer font-semibold text-slate-800">Rotas ({Object.keys(openapi(urlBase).paths).length}) — o que cada uma devolve</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-3 font-medium">Caminho</th>
                <th className="py-1 font-medium">Devolve</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(openapi(urlBase).paths).map(([caminho, ops]) => {
                const op = (ops as Record<string, { summary: string; description?: string }>).get;
                return (
                  <tr key={caminho} className="border-t border-slate-100 align-top">
                    <td className="py-1.5 pr-3 text-slate-700"><code className="text-[11px]">GET {caminho}</code></td>
                    <td className="py-1.5 text-slate-700">
                      {op.summary}
                      {op.description && <div className="text-[11px] text-slate-500">{op.description}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate-500">Cada versão traz o hash do payload canônico e o kernel que a publicou; quantitativos, planilha, IFC e unidades são recalculados pelo kernel atual sobre o payload publicado. 401 = token inválido/revogado/vencido; 404 = estudo ou revisão inexistente para este token.</p>
        </div>
      </details>

      {indisponivel && <p className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Tokens indisponíveis: {indisponivel}</p>}

      {criado && (
        <div className="rounded-[10px] border border-emerald-300 bg-emerald-50 p-4" data-testid="token-criado">
          <p className="text-sm font-semibold text-emerald-900">Token criado. Copie agora — ele não será mostrado de novo.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-auto rounded-[6px] border border-emerald-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-800" data-testid="token-em-texto">{criado.token}</code>
            <button type="button" onClick={() => void copiar(criado.token)} className="inline-flex h-8 items-center gap-1 rounded-[6px] border border-emerald-300 bg-white px-2 text-xs text-emerald-900 hover:bg-emerald-100" data-testid="copiar-token">
              {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copiado ? 'Copiado' : 'Copiar'}
            </button>
            <button type="button" onClick={() => setCriado(null)} className="h-8 rounded-[6px] px-2 text-xs text-slate-600 hover:bg-white">Já guardei</button>
          </div>
        </div>
      )}

      {form && (
        <div className="rounded-[10px] border border-slate-200 bg-white p-4" data-testid="form-token">
          <p className="text-sm font-semibold text-slate-800">Novo token</p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Nome (para que serve)
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Power BI da diretoria" aria-label="Nome do token" className={`${campo} w-72`} autoFocus />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Validade (opcional)
              <input type="date" value={form.validade} onChange={(e) => setForm({ ...form, validade: e.target.value })} aria-label="Validade do token" className={campo} />
            </label>
            <button type="button" disabled={ocupado} onClick={() => void salvar()} className="h-9 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300" data-testid="salvar-token">Criar token</button>
            <button type="button" onClick={() => { setForm(null); setErros([]); }} className="h-9 rounded-[6px] px-3 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          </div>
          {erros.length > 0 && <p className="mt-2 text-xs text-red-700" data-testid="erros-do-token">{erros.join(' · ')}</p>}
        </div>
      )}

      <StandardTable<TokenDaApi>
        columns={colunas}
        storageKey="blueprint:chaves-de-api"
        rows={tokens}
        rowKey={(t) => t.id}
        loading={carregando}
        toolbarRight={
          <button type="button" onClick={() => { setForm({ nome: '', validade: '' }); setErros([]); }} className="inline-flex h-9 items-center gap-1 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700" data-testid="novo-token">
            <Plus className="h-4 w-4" /> Novo token
          </button>
        }
        renderCell={(key, t) => {
          switch (key) {
            case 'nome':
              return <span className="flex items-center gap-2 text-sm font-medium text-gray-800"><KeyRound className="h-3.5 w-3.5 text-slate-400" />{t.nome}</span>;
            case 'prefixo':
              return <span className="font-mono text-xs text-slate-700">{t.prefixo}…</span>;
            case 'org':
              return <span className="text-xs text-gray-600">{nomeDaOrg(t.organizationId)}</span>;
            case 'criado':
              return <span className="text-sm text-gray-700">{data(t.createdAt)}</span>;
            case 'validade':
              return <span className={`text-sm ${t.expiresAt && new Date(t.expiresAt).getTime() < Date.now() ? 'text-red-700' : 'text-gray-700'}`}>{t.expiresAt ? data(t.expiresAt) : 'sem prazo'}</span>;
            case 'uso':
              return <span className="text-sm text-gray-700">{dataHora(t.lastUsedAt)}</span>;
            case 'usos':
              return <span className="block text-right text-sm tabular-nums text-gray-900">{t.usos.toLocaleString('pt-BR')}</span>;
            case 'status':
              return t.active ? <span className="text-xs font-medium text-emerald-700">ativo</span> : <span className="text-xs text-slate-500">revogado {data(t.revokedAt)}</span>;
            default:
              return null;
          }
        }}
        actions={{
          label: 'Ações',
          width: 70,
          render: (t) =>
            t.active ? (
              <ActionIconButton
                kind="delete"
                icon={<ShieldOff className="h-4 w-4" />}
                title={`Revogar token ${t.nome}`}
                aria-label={`Revogar token ${t.nome}`}
                onClick={async () => {
                  const ok = await confirmar({ title: 'Revogar token', message: `As integrações que usam "${t.nome}" (${t.prefixo}…) param na hora. Não há como reativar; crie outro se precisar.`, confirmLabel: 'Revogar', variant: 'danger' });
                  if (ok) await onRevogar(t.id);
                }}
              />
            ) : null,
        }}
        empty={{ title: 'Nenhum token', subtitle: 'Crie um para ligar um BI, um ERP ou uma planilha à Planta Inteligente.' }}
      />
    </div>
  );
}
