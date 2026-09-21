/**
 * PLUGINS (21/09/2026, backlog P2) — a tela in-flow: os plugins da
 * organização (nome, URL https, permissões, ativo), criar/editar/apagar,
 * "Executar" (abre o plugin no executor com o desenho atual) e o guia do
 * protocolo com o plugin de exemplo embutido. Molde da tela de webhooks.
 */
import React, { useState } from 'react';
import { Play, Plus, Puzzle } from 'lucide-react';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { guiaDoProtocolo, PERMISSOES_DE_PLUGIN, PLUGIN_DE_EXEMPLO, ROTULO_DA_PERMISSAO, validarPlugin, type NovoPlugin, type PermissaoDePlugin, type PluginDaPlanta } from '../../utils/blueprintPlugins';

interface Props {
  plugins: PluginDaPlanta[];
  carregando: boolean;
  indisponivel: string | null;
  nomeDaOrg: (id: string) => string;
  mostrarOrg: boolean;
  onCriar: (p: NovoPlugin) => Promise<void>;
  onAtualizar: (id: string, p: Partial<NovoPlugin>) => Promise<void>;
  onApagar: (id: string) => Promise<void>;
  onExecutar: (p: PluginDaPlanta) => void;
}

const COLUNAS: StandardTableColumn[] = [
  { key: 'nome', label: 'Nome', width: 220 },
  { key: 'url', label: 'URL', width: 320 },
  { key: 'org', label: 'Organização', width: 180 },
  { key: 'permissoes', label: 'Permissões', width: 260 },
  { key: 'status', label: 'Status', width: 90 },
];

interface Form {
  id: string | null;
  nome: string;
  url: string;
  descricao: string;
  permissoes: PermissaoDePlugin[];
}

export default function TelaPlugins({ plugins, carregando, indisponivel, nomeDaOrg, mostrarOrg, onCriar, onAtualizar, onApagar, onExecutar }: Props) {
  const confirmar = useConfirm();
  const [form, setForm] = useState<Form | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const colunas = mostrarOrg ? COLUNAS : COLUNAS.filter((c) => c.key !== 'org');

  async function salvar() {
    if (!form) return;
    const e = validarPlugin(form);
    setErros(e);
    if (e.length) return;
    setOcupado(true);
    try {
      const dados = { nome: form.nome, url: form.url, descricao: form.descricao, permissoes: form.permissoes };
      if (form.id) await onAtualizar(form.id, dados);
      else await onCriar(dados);
      setForm(null);
      setAviso(form.id ? 'Plugin atualizado.' : 'Plugin cadastrado. Use Executar para abri-lo com o desenho atual.');
    } catch (err) {
      setErros([err instanceof Error ? err.message : String(err)]);
    } finally {
      setOcupado(false);
    }
  }

  const campo = 'h-9 rounded-[6px] border border-slate-300 bg-white px-2 text-sm text-slate-800';

  return (
    <div className="space-y-4" data-testid="tela-plugins">
      <div className="rounded-[10px] border border-slate-200 bg-white p-4 text-sm text-slate-700" data-testid="como-funciona-plugin">
        <p className="font-semibold text-slate-800">Como funciona</p>
        <p className="mt-1">
          Um plugin é uma <strong>página https sua</strong>. A Planta a abre num quadro isolado (sandbox, sem acesso a esta página nem às suas credenciais) e manda o desenho por <code>postMessage</code>: o modelo do kernel com os ids, o hash da versão e — se você permitir — os quantitativos. O plugin responde com <strong>comandos do kernel</strong>; você vê a proposta (o que cria, muda e apaga), o kernel a ensaia numa cópia, e só entra no desenho quando você clica <strong>Aplicar</strong> — um passo de desfazer.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onExecutar(PLUGIN_DE_EXEMPLO)} className="inline-flex h-8 items-center gap-1 rounded-[6px] border border-blue-600 bg-white px-3 text-xs font-medium text-blue-700 hover:bg-blue-50" data-testid="executar-exemplo">
            <Play className="h-3.5 w-3.5" /> Executar o plugin de exemplo
          </button>
          <span className="text-xs text-slate-500">{PLUGIN_DE_EXEMPLO.descricao}</span>
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-blue-700">Protocolo (para quem vai escrever um plugin)</summary>
          <pre className="mt-1 overflow-auto rounded-[6px] bg-slate-50 p-2 text-xs text-slate-700">{guiaDoProtocolo()}</pre>
        </details>
      </div>

      {indisponivel && <p className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Plugins indisponíveis: {indisponivel}</p>}
      {aviso && <p className="rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800" data-testid="aviso-plugin">{aviso}</p>}

      {form && (
        <div className="rounded-[10px] border border-slate-200 bg-white p-4" data-testid="form-plugin">
          <p className="text-sm font-semibold text-slate-800">{form.id ? 'Editar plugin' : 'Novo plugin'}</p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Nome
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} aria-label="Nome do plugin" className={campo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              URL (https)
              <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} aria-label="URL do plugin" placeholder="https://..." className={campo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 md:col-span-2">
              Descrição
              <input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} aria-label="Descrição do plugin" className={campo} />
            </label>
            <fieldset className="md:col-span-2">
              <legend className="text-xs font-medium text-slate-600">Permissões</legend>
              <div className="mt-1 flex flex-wrap gap-3">
                {PERMISSOES_DE_PLUGIN.map((p) => (
                  <label key={p} className="flex items-center gap-1.5 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.permissoes.includes(p)}
                      disabled={p === 'ler'}
                      onChange={(e) => setForm({ ...form, permissoes: e.target.checked ? [...form.permissoes, p] : form.permissoes.filter((x) => x !== p) })}
                      aria-label={ROTULO_DA_PERMISSAO[p]}
                    />
                    {ROTULO_DA_PERMISSAO[p]}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          {erros.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-red-700" data-testid="erros-plugin">
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void salvar()} disabled={ocupado} className="h-9 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50" data-testid="salvar-plugin">
              {form.id ? 'Salvar' : 'Cadastrar'}
            </button>
            <button type="button" onClick={() => setForm(null)} className="h-9 rounded-[6px] border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <StandardTable<PluginDaPlanta>
        columns={colunas}
        storageKey="blueprint:plugins"
        rows={plugins}
        rowKey={(p) => p.id}
        loading={carregando}
        toolbarRight={
          <button type="button" onClick={() => { setForm({ id: null, nome: '', url: '', descricao: '', permissoes: ['ler'] }); setErros([]); setAviso(null); }} className="inline-flex h-9 items-center gap-1 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700" data-testid="novo-plugin">
            <Plus className="h-4 w-4" /> Novo plugin
          </button>
        }
        renderCell={(key, p) => {
          switch (key) {
            case 'nome':
              return (
                <span className="flex flex-col">
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-800"><Puzzle className="h-3.5 w-3.5 text-slate-400" />{p.nome}</span>
                  {p.descricao && <span className="text-[11px] text-slate-500">{p.descricao}</span>}
                </span>
              );
            case 'url':
              return <span className="truncate text-xs text-slate-700" title={p.url}>{p.url}</span>;
            case 'org':
              return <span className="text-xs text-gray-600">{nomeDaOrg(p.organizationId)}</span>;
            case 'permissoes':
              return <span className="text-xs text-slate-700">{p.permissoes.map((x) => ROTULO_DA_PERMISSAO[x].split(' (')[0]).join(' · ')}</span>;
            case 'status':
              return (
                <button
                  type="button"
                  onClick={() => void onAtualizar(p.id, { active: !p.active })}
                  className={`rounded-[6px] px-2 py-0.5 text-xs font-medium ${p.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                  aria-label={`${p.active ? 'Desativar' : 'Ativar'} plugin ${p.nome}`}
                >
                  {p.active ? 'ativo' : 'pausado'}
                </button>
              );
            default:
              return null;
          }
        }}
        actions={{
          label: 'Ações',
          width: 130,
          render: (p) => (
            <span className="flex items-center gap-1">
              <ActionIconButton kind="edit" icon={<Play className="h-4 w-4" />} title={`Executar plugin ${p.nome}`} aria-label={`Executar plugin ${p.nome}`} onClick={() => onExecutar(p)} disabled={!p.active} />
              <ActionIconButton kind="edit" title={`Editar plugin ${p.nome}`} aria-label={`Editar plugin ${p.nome}`} onClick={() => { setForm({ id: p.id, nome: p.nome, url: p.url, descricao: p.descricao, permissoes: [...p.permissoes] }); setErros([]); setAviso(null); }} />
              <ActionIconButton
                kind="delete"
                title={`Apagar plugin ${p.nome}`}
                aria-label={`Apagar plugin ${p.nome}`}
                onClick={async () => {
                  const ok = await confirmar({ title: 'Apagar plugin', message: `"${p.nome}" some do cadastro da organização. Para só pausar, use o status.`, confirmLabel: 'Apagar', variant: 'danger' });
                  if (ok) await onApagar(p.id);
                }}
              />
            </span>
          ),
        }}
        empty={{ title: 'Nenhum plugin cadastrado', subtitle: 'Experimente o plugin de exemplo acima, ou cadastre a URL da sua página.' }}
      />
    </div>
  );
}
