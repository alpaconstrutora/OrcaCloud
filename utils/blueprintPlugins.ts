/**
 * PLUGINS DA PLANTA (21/09/2026, backlog P2 — "plugins").
 *
 * ─── O QUE É UM PLUGIN AQUI ─────────────────────────────────────────────────
 *
 * Uma PÁGINA de terceiros (https) que a Planta abre num iframe com sandbox
 * (`allow-scripts`, sem `allow-same-origin`) e com quem conversa por
 * `postMessage`. A Planta manda o desenho (o modelo do kernel, com os ids que
 * os comandos usam, e o hash canônico; se permitido, os quantitativos); o
 * plugin devolve COMANDOS do kernel. Nada do plugin roda na página da Planta, o plugin não recebe
 * credencial nenhuma, e comando nenhum entra no desenho sem a pessoa ver a
 * proposta e clicar Aplicar. É o modelo do Figma/Office add-ins, não o do
 * Revit (DLL dentro do processo).
 *
 * ─── PROTOCOLO (versão 1) ───────────────────────────────────────────────────
 *
 *   plugin → planta  { tipo: 'opura.planta.pronto' }                       handshake
 *   planta → plugin  { tipo: 'opura.planta.modelo', versao: 1, estudo, kernelVersion,
 *                      nivelAtivoId, selecao, modelo, quantitativos? }      a cada mudança
 *   plugin → planta  { tipo: 'opura.planta.comandos', comandos, descricao? } proposta
 *   plugin → planta  { tipo: 'opura.planta.selecionar', uids }              (permissão)
 *   plugin → planta  { tipo: 'opura.planta.aviso', texto }                  texto livre
 *
 * ─── SEGURANÇA ──────────────────────────────────────────────────────────────
 *
 * - `event.source` tem de ser a janela do iframe do plugin; para plugin por
 *   URL, `event.origin` tem de ser a origem da URL cadastrada.
 * - A proposta é validada por FORMA (tipos permitidos, tamanho) e por ENSAIO:
 *   os comandos são aplicados numa cópia; erro do kernel = proposta recusada
 *   com a mensagem. Só então vira "Aplicar".
 * - Permissões por plugin: `ler` (sempre), `quantitativos`, `escrever`,
 *   `selecionar`. Plugin sem `escrever` que manda comandos é recusado.
 */
import type { BlueprintModel, Command } from './blueprintKernel';
import { applyBatch, cloneModel, computeQuantities, KERNEL_VERSION, POLITICA_PADRAO, snapshotHash } from './blueprintKernel';

export const PERMISSOES_DE_PLUGIN = ['ler', 'quantitativos', 'escrever', 'selecionar'] as const;
export type PermissaoDePlugin = (typeof PERMISSOES_DE_PLUGIN)[number];
export const ROTULO_DA_PERMISSAO: Record<PermissaoDePlugin, string> = {
  ler: 'Ler o desenho (modelo e hash)',
  quantitativos: 'Receber os quantitativos',
  escrever: 'Propor comandos (você aprova antes)',
  selecionar: 'Selecionar peças no desenho',
};

export const VERSAO_DO_PROTOCOLO = 1;
export const MAX_COMANDOS_POR_PROPOSTA = 500;
export const MAX_NOME_DE_PLUGIN = 80;
export const MAX_DESCRICAO_DE_PLUGIN = 400;

/** Comandos que um plugin NUNCA pode propor — destroem pavimentos inteiros ou reescrevem o modelo. */
export const COMANDOS_VEDADOS_AO_PLUGIN: ReadonlySet<string> = new Set(['RemoveLevel', 'LoadModel', 'ReplaceModel']);

export interface PluginDaPlanta {
  id: string;
  organizationId: string;
  nome: string;
  url: string;
  descricao: string;
  permissoes: PermissaoDePlugin[];
  active: boolean;
  createdAt: string;
}

export interface NovoPlugin {
  nome: string;
  url: string;
  descricao?: string;
  permissoes: PermissaoDePlugin[];
  active?: boolean;
}

/** Problemas do cadastro em português; vazio = pode salvar. */
export function validarPlugin(p: { nome: string; url: string; descricao?: string; permissoes: readonly string[] }): string[] {
  const erros: string[] = [];
  if (!p.nome.trim()) erros.push('Dê um nome ao plugin.');
  if (p.nome.trim().length > MAX_NOME_DE_PLUGIN) erros.push(`Nome com mais de ${MAX_NOME_DE_PLUGIN} caracteres.`);
  if (!/^https:\/\/[^\s]+$/i.test(p.url.trim())) erros.push('A URL tem de começar com https://.');
  else {
    try {
      new URL(p.url.trim());
    } catch {
      erros.push('URL inválida.');
    }
  }
  if ((p.descricao ?? '').length > MAX_DESCRICAO_DE_PLUGIN) erros.push(`Descrição com mais de ${MAX_DESCRICAO_DE_PLUGIN} caracteres.`);
  if (!p.permissoes.includes('ler')) erros.push('Todo plugin lê o desenho: a permissão "ler" é obrigatória.');
  for (const x of p.permissoes) if (!(PERMISSOES_DE_PLUGIN as readonly string[]).includes(x)) erros.push(`Permissão desconhecida: ${x}.`);
  return erros;
}

/** A origem (scheme://host[:port]) que as mensagens do plugin têm de trazer. */
export function origemDoPlugin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

// ─── Mensagens ──────────────────────────────────────────────────────────────

export interface EstudoParaPlugin {
  id: string | null;
  titulo: string;
  revisao: number | null;
  hash: string;
}

export interface MensagemModelo {
  tipo: 'opura.planta.modelo';
  versao: typeof VERSAO_DO_PROTOCOLO;
  estudo: EstudoParaPlugin;
  kernelVersion: string;
  nivelAtivoId: string | null;
  selecao: string[];
  /** O modelo do kernel (cópia): ids, paredes, ambientes, etiquetas… — o que os comandos endereçam. */
  modelo: BlueprintModel;
  quantitativos?: ReturnType<typeof computeQuantities>;
}

export type MensagemDoPlugin =
  | { tipo: 'opura.planta.pronto' }
  | { tipo: 'opura.planta.comandos'; comandos: Command[]; descricao?: string }
  | { tipo: 'opura.planta.selecionar'; uids: string[] }
  | { tipo: 'opura.planta.aviso'; texto: string };

/** O que a Planta manda ao plugin. `quantitativos` só com a permissão. */
export function mensagemDoModelo(model: BlueprintModel, ctx: { estudo: EstudoParaPlugin; nivelAtivoId: string | null; selecao: string[]; permissoes: readonly PermissaoDePlugin[] }): MensagemModelo {
  return {
    tipo: 'opura.planta.modelo',
    versao: VERSAO_DO_PROTOCOLO,
    estudo: { ...ctx.estudo, hash: ctx.estudo.hash || snapshotHash(model) },
    kernelVersion: KERNEL_VERSION,
    nivelAtivoId: ctx.nivelAtivoId,
    selecao: ctx.selecao,
    modelo: cloneModel(model),
    ...(ctx.permissoes.includes('quantitativos') ? { quantitativos: computeQuantities(model, POLITICA_PADRAO, KERNEL_VERSION) } : {}),
  };
}

export type Recusa = { ok: false; motivo: string };
export type Aceite<T> = { ok: true; mensagem: T };

/**
 * Lê uma mensagem crua vinda do iframe. Verifica origem (quando há URL), forma
 * e permissões. NÃO ensaia os comandos — isso é `ensaiarProposta`, que precisa
 * do modelo.
 */
export function lerMensagemDoPlugin(dados: unknown, ctx: { origemRecebida: string; origemEsperada: string | null; permissoes: readonly PermissaoDePlugin[] }): Aceite<MensagemDoPlugin> | Recusa {
  if (ctx.origemEsperada !== null && ctx.origemRecebida !== ctx.origemEsperada) return { ok: false, motivo: `origem ${ctx.origemRecebida || '(vazia)'} não é a do plugin (${ctx.origemEsperada})` };
  if (!dados || typeof dados !== 'object') return { ok: false, motivo: 'mensagem não é um objeto' };
  const m = dados as Record<string, unknown>;
  switch (m.tipo) {
    case 'opura.planta.pronto':
      return { ok: true, mensagem: { tipo: 'opura.planta.pronto' } };
    case 'opura.planta.aviso':
      return typeof m.texto === 'string' ? { ok: true, mensagem: { tipo: 'opura.planta.aviso', texto: m.texto.slice(0, 500) } } : { ok: false, motivo: 'aviso sem texto' };
    case 'opura.planta.selecionar': {
      if (!ctx.permissoes.includes('selecionar')) return { ok: false, motivo: 'o plugin não tem permissão para selecionar' };
      if (!Array.isArray(m.uids) || !m.uids.every((u) => typeof u === 'string')) return { ok: false, motivo: 'seleção sem lista de uids' };
      return { ok: true, mensagem: { tipo: 'opura.planta.selecionar', uids: (m.uids as string[]).slice(0, 5000) } };
    }
    case 'opura.planta.comandos': {
      if (!ctx.permissoes.includes('escrever')) return { ok: false, motivo: 'o plugin não tem permissão para propor comandos' };
      if (!Array.isArray(m.comandos) || m.comandos.length === 0) return { ok: false, motivo: 'proposta sem comandos' };
      if (m.comandos.length > MAX_COMANDOS_POR_PROPOSTA) return { ok: false, motivo: `proposta com ${m.comandos.length} comandos (máximo ${MAX_COMANDOS_POR_PROPOSTA})` };
      for (const c of m.comandos as unknown[]) {
        if (!c || typeof c !== 'object' || typeof (c as { type?: unknown }).type !== 'string') return { ok: false, motivo: 'comando sem `type`' };
        if (COMANDOS_VEDADOS_AO_PLUGIN.has((c as { type: string }).type)) return { ok: false, motivo: `comando vedado a plugins: ${(c as { type: string }).type}` };
      }
      return { ok: true, mensagem: { tipo: 'opura.planta.comandos', comandos: m.comandos as Command[], ...(typeof m.descricao === 'string' ? { descricao: m.descricao.slice(0, 300) } : {}) } };
    }
    default:
      return { ok: false, motivo: `tipo desconhecido: ${String(m.tipo)}` };
  }
}

export interface PropostaEnsaiada {
  comandos: Command[];
  descricao: string | null;
  /** Resumo por tipo de comando: "AddWall ×3 · NameSpace ×2". */
  resumo: string;
  criados: number;
  atualizados: number;
  apagados: number;
}

/** Aplica a proposta numa CÓPIA para saber se o kernel aceita e o que ela faz. */
export function ensaiarProposta(model: BlueprintModel, comandos: Command[], descricao?: string): Aceite<PropostaEnsaiada> | Recusa {
  try {
    const r = applyBatch(model, comandos);
    const porTipo = new Map<string, number>();
    for (const c of comandos) porTipo.set(c.type, (porTipo.get(c.type) ?? 0) + 1);
    return {
      ok: true,
      mensagem: {
        comandos,
        descricao: descricao ?? null,
        resumo: [...porTipo.entries()].map(([t, n]) => `${t} ×${n}`).join(' · '),
        criados: r.diff.created.length,
        atualizados: r.diff.updated.length,
        apagados: r.diff.deleted.length,
      },
    };
  } catch (e) {
    return { ok: false, motivo: `o kernel recusou a proposta: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Plugin de exemplo (embutido) ───────────────────────────────────────────

/**
 * Página mínima que mostra o protocolo: lê o modelo, lista os ambientes sem
 * nome e propõe `NameSpace` para cada um. Serve de exemplo para quem vai
 * escrever um plugin e de prova no app (roda por `srcdoc`, origem "null").
 */
export const PLUGIN_DE_EXEMPLO_HTML = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Exemplo de plugin</title>
<style>body{font:13px system-ui,sans-serif;margin:12px;color:#0f172a}button{padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer}button:disabled{opacity:.5}ul{padding-left:18px}</style></head>
<body>
<h3 style="margin:0 0 6px">Plugin de exemplo — nomear ambientes</h3>
<p id="estado">aguardando o desenho…</p>
<ul id="lista"></ul>
<button id="propor" disabled>Propor nomes</button>
<script>
var modelo=null;
function post(m){parent.postMessage(m,'*');}
window.addEventListener('message',function(ev){
  var d=ev.data; if(!d||d.tipo!=='opura.planta.modelo')return;
  modelo=d; var semNome=(d.modelo.spaces||[]).map(function(s,i){return {i:i,s:s};}).filter(function(x){return !x.s.name;});
  document.getElementById('estado').textContent=d.estudo.titulo+' · rev. '+(d.estudo.revisao==null?'rascunho':d.estudo.revisao)+' · '+(d.modelo.spaces||[]).length+' ambiente(s), '+semNome.length+' sem nome · kernel '+d.kernelVersion;
  var ul=document.getElementById('lista'); ul.innerHTML='';
  semNome.forEach(function(x){var li=document.createElement('li');li.textContent='Ambiente '+(x.i+1)+' → "Ambiente '+(x.i+1)+'"';ul.appendChild(li);});
  document.getElementById('propor').disabled=semNome.length===0;
});
document.getElementById('propor').onclick=function(){
  if(!modelo)return;
  var cmds=[]; (modelo.modelo.spaces||[]).forEach(function(s,i){ if(!s.name) cmds.push({type:'NameSpace',spaceId:s.id,name:'Ambiente '+(i+1)}); });
  post({tipo:'opura.planta.comandos',comandos:cmds,descricao:'Nomear '+cmds.length+' ambiente(s) sem nome'});
};
post({tipo:'opura.planta.pronto'});
</script></body></html>`;

export const PLUGIN_DE_EXEMPLO: PluginDaPlanta = {
  id: 'exemplo',
  organizationId: '',
  nome: 'Exemplo: nomear ambientes',
  url: '',
  descricao: 'Plugin embutido que mostra o protocolo: lê o desenho e propõe NameSpace para os ambientes sem nome.',
  permissoes: ['ler', 'escrever'],
  active: true,
  createdAt: '',
};

/** Guia curto do protocolo, para a tela e para quem vai escrever um plugin. */
export function guiaDoProtocolo(): string {
  return [
    `// Protocolo v${VERSAO_DO_PROTOCOLO} — a Planta abre sua página num iframe com sandbox e conversa por postMessage.`,
    `parent.postMessage({ tipo: 'opura.planta.pronto' }, '*');            // 1. avise que carregou`,
    `window.addEventListener('message', (ev) => {                          // 2. receba o desenho`,
    `  if (ev.data?.tipo !== 'opura.planta.modelo') return;`,
    `  const { estudo, modelo, quantitativos, selecao, kernelVersion } = ev.data;`,
    `  // modelo = o modelo do kernel (levels, walls, openings, spaces, labels, …, com ids); estudo.hash = hash canônico; quantitativos só com a permissão.`,
    `});`,
    `parent.postMessage({ tipo: 'opura.planta.comandos', descricao: 'o que faz',   // 3. proponha comandos do kernel`,
    `  comandos: [{ type: 'NameSpace', spaceId: 'spc_0001', name: 'Sala' }] }, '*'); //    (a pessoa aprova antes)`,
    `parent.postMessage({ tipo: 'opura.planta.selecionar', uids: ['…'] }, '*');    // opcional (permissão)`,
    `parent.postMessage({ tipo: 'opura.planta.aviso', texto: '…' }, '*');          // texto livre`,
  ].join('\n');
}
