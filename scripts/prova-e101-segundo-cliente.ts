/**
 * PROVA E10.1 — o "segundo cliente": entra no canal Realtime do ramo com chave
 * de presença própria (como se fosse outra pessoa), publica presença com um
 * ambiente selecionado (= travado para o navegador da prova), e depois difunde
 * dois comandos: um válido (renomear outro ambiente, com o hash calculado pelo
 * kernel sobre o rascunho do banco) e um inválido (spaceId inexistente), para o
 * navegador acusar o conflito.
 *
 * Só LÊ o banco (o rascunho do ramo) e fala pelo canal — não grava nada.
 * Rodar: `npx vite-node scripts/prova-e101-segundo-cliente.ts <branchId> <spaceTravado> <spaceRenomear> <novoNome>`
 * Credenciais do `.env.local` (BLUEPRINT_EMAIL/BLUEPRINT_PASSWORD), nunca impressas.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { ModelHistory, modelFromCanonicalPayload, parseCanonicalPayload } from '../utils/blueprintKernel';
import { novaMensagem } from '../utils/blueprintColaboracao';

const env = Object.fromEntries(
  [...readFileSync('.env', 'utf8').split('\n'), ...readFileSync('.env.local', 'utf8').split('\n')]
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '').replace(/\r$/, '')]),
);
const [branchId, spaceTravado, spaceRenomear, novoNome] = process.argv.slice(2);
if (!branchId || !spaceTravado || !spaceRenomear || !novoNome) throw new Error('uso: <branchId> <spaceTravado> <spaceRenomear> <novoNome>');

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: auth, error: eAuth } = await sb.auth.signInWithPassword({ email: env.BLUEPRINT_EMAIL, password: env.BLUEPRINT_PASSWORD });
if (eAuth || !auth.user) throw new Error('login falhou');
console.log('login ok (segundo cliente)');

const { data: ramo, error: eRamo } = await sb.from('blueprint_branches').select('draft_payload, draft_hash').eq('id', branchId).single();
if (eRamo || !ramo) throw new Error(`ramo: ${eRamo?.message}`);
const historia = new ModelHistory(modelFromCanonicalPayload(parseCanonicalPayload(JSON.stringify(ramo.draft_payload))));
console.log('rascunho lido: hash', historia.hash.slice(0, 12), '· bate com o banco?', historia.hash === ramo.draft_hash, '· ambientes', historia.current.spaces.map((s) => `${s.id}:${s.name ?? '-'}`).slice(0, 6).join(' '));

const canal = sb.channel(`blueprint:ramo:${branchId}`, { config: { presence: { key: 'prova-zeca' }, broadcast: { self: false } } });
await new Promise<void>((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('sem SUBSCRIBED em 15 s')), 15000);
  canal.subscribe(async (status) => {
    console.log('canal:', status);
    if (status === 'SUBSCRIBED') {
      clearTimeout(t);
      await canal.track({ userId: 'prova-zeca', email: 'zeca.prova@exemplo.com', nome: 'Zeca da Prova', levelId: historia.current.levels[0]?.id ?? null, selecionados: [spaceTravado] });
      console.log('presença publicada: selecionado', spaceTravado);
      resolve();
    }
  });
});

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
await espera(12000);
// Comando válido.
const cmd = { type: 'NameSpace', spaceId: spaceRenomear, name: novoNome } as const;
const r = historia.apply(cmd);
const msg = novaMensagem('prova-zeca', 'Zeca da Prova', [cmd], r.hash);
await canal.send({ type: 'broadcast', event: 'comando', payload: msg });
console.log('comando difundido:', JSON.stringify(cmd), 'hashDepois', r.hash.slice(0, 12));
await espera(6000);
// Comando inválido: spaceId inexistente → o navegador acusa conflito com o autor.
await canal.send({ type: 'broadcast', event: 'comando', payload: novaMensagem('prova-zeca', 'Zeca da Prova', [{ type: 'NameSpace', spaceId: 'spc_nao_existe', name: 'X' }], 'hash-falso') });
console.log('comando inválido difundido');
await espera(8000);
await canal.untrack();
await sb.removeChannel(canal);
console.log('segundo cliente saiu');
process.exit(0);
