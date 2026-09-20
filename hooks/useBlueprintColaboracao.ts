/**
 * MULTIUSUÁRIO (20/09/2026, roadmap E10.1) — o canal Realtime do RAMO:
 * presença (quem está, em que pavimento, com o que selecionado) e difusão de
 * comandos (`broadcast`). Um canal por ramo: quem edita ramos diferentes do
 * mesmo estudo não se vê nem se atrapalha — as alternativas são modelos
 * independentes.
 *
 * A regra pura (agregar presença, travas, aplicar remoto) está em
 * `utils/blueprintColaboracao.ts`; aqui só mora o que precisa do Supabase.
 *
 * Nada aqui grava no banco: presença e broadcast são efêmeros. O que persiste
 * continua sendo o rascunho salvo por cada cliente (idêntico dos dois lados
 * quando os comandos convergem) e as versões publicadas.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { agregarPresenca, novaMensagem, travasDe, type EstadoDePresenca, type MensagemDeComando, type Participante } from '../utils/blueprintColaboracao';
import type { Command } from '../utils/blueprintKernel';

export interface UsoDaColaboracao {
  /** As outras pessoas no ramo (a própria não entra). */
  participantes: Participante[];
  /** id de elemento → quem o tem selecionado. */
  travas: Map<string, Participante>;
  conectado: boolean;
  /** Publica o que EU estou fazendo (pavimento e seleção). Barato: só manda se mudou. */
  atualizarPresenca: (estado: { levelId: string | null; selecionados: string[] }) => void;
  /** Difunde um lote aplicado localmente, com o hash resultante. */
  difundir: (comandos: Command[], hashDepois: string) => void;
  /** Últimas mensagens de conflito (comando remoto recusado ou divergência), da mais nova para a mais velha. */
  avisos: AvisoDeColaboracao[];
  dispensarAvisos: () => void;
}

export interface AvisoDeColaboracao {
  id: string;
  quando: string;
  autorNome: string;
  texto: string;
  /** Divergência de hash: os modelos não batem mais; a saída é recarregar. */
  divergiu: boolean;
}

interface Opcoes {
  branchId: string | null;
  userId: string | null;
  email: string | null;
  nome: string | null;
  /** Chamado para CADA mensagem remota; devolve o resultado da aplicação local. */
  aoReceber: (msg: MensagemDeComando) => { ok: boolean; erro: string | null; divergiu: boolean };
  /** Desliga tudo (testes, ou quando não há sessão). */
  habilitado?: boolean;
}

export function useBlueprintColaboracao({ branchId, userId, email, nome, aoReceber, habilitado = true }: Opcoes): UsoDaColaboracao {
  const [estados, setEstados] = useState<EstadoDePresenca[]>([]);
  const [conectado, setConectado] = useState(false);
  const [avisos, setAvisos] = useState<AvisoDeColaboracao[]>([]);
  const canalRef = useRef<RealtimeChannel | null>(null);
  const presencaRef = useRef<{ levelId: string | null; selecionados: string[] }>({ levelId: null, selecionados: [] });
  const aoReceberRef = useRef(aoReceber);
  aoReceberRef.current = aoReceber;
  const identidadeRef = useRef({ userId, email, nome });
  identidadeRef.current = { userId, email, nome };

  const meuEstado = useCallback((): EstadoDePresenca => {
    const { userId: u, email: e, nome: n } = identidadeRef.current;
    return { userId: u ?? '', email: e ?? '', nome: n ?? e ?? '', levelId: presencaRef.current.levelId, selecionados: presencaRef.current.selecionados };
  }, []);

  useEffect(() => {
    if (!habilitado || !branchId || !userId) {
      setEstados([]);
      setConectado(false);
      return;
    }
    const canal = supabase.channel(`blueprint:ramo:${branchId}`, { config: { presence: { key: userId }, broadcast: { self: false, ack: false } } });
    canalRef.current = canal;
    canal
      .on('presence', { event: 'sync' }, () => {
        const estado = canal.presenceState<EstadoDePresenca>();
        setEstados(Object.values(estado).flat());
      })
      .on('broadcast', { event: 'comando' }, ({ payload }: { payload: MensagemDeComando }) => {
        if (!payload || payload.autorId === identidadeRef.current.userId) return;
        const r = aoReceberRef.current(payload);
        if (!r.ok || r.divergiu) {
          setAvisos((lista) => [
            {
              id: payload.id,
              quando: new Date().toISOString(),
              autorNome: payload.autorNome,
              texto: !r.ok
                ? `Um comando de ${payload.autorNome} foi recusado aqui (${r.erro}). Os desenhos podem ter divergido: recarregue para ver o dele.`
                : `O desenho de ${payload.autorNome} e o seu divergiram depois de um comando dele. Recarregue para alinhar.`,
              divergiu: true,
            },
            ...lista.slice(0, 9),
          ]);
        }
      })
      .subscribe((status: string) => {
        const ok = status === 'SUBSCRIBED';
        setConectado(ok);
        if (ok) void canal.track(meuEstado());
      });
    return () => {
      canalRef.current = null;
      setConectado(false);
      void supabase.removeChannel(canal);
    };
  }, [habilitado, branchId, userId, meuEstado]);

  const atualizarPresenca = useCallback(
    (estado: { levelId: string | null; selecionados: string[] }) => {
      const anterior = presencaRef.current;
      const igual = anterior.levelId === estado.levelId && anterior.selecionados.length === estado.selecionados.length && anterior.selecionados.every((x, i) => x === estado.selecionados[i]);
      if (igual) return;
      presencaRef.current = { levelId: estado.levelId, selecionados: [...estado.selecionados] };
      const canal = canalRef.current;
      if (canal && conectado) void canal.track(meuEstado());
    },
    [conectado, meuEstado],
  );

  const difundir = useCallback((comandos: Command[], hashDepois: string) => {
    const canal = canalRef.current;
    const { userId: u, nome: n, email: e } = identidadeRef.current;
    if (!canal || !u || comandos.length === 0) return;
    const msg = novaMensagem(u, n || e || 'alguém', comandos, hashDepois);
    void canal.send({ type: 'broadcast', event: 'comando', payload: msg });
  }, []);

  const participantes = useMemo(() => agregarPresenca(estados, userId), [estados, userId]);
  const travas = useMemo(() => travasDe(participantes), [participantes]);

  return { participantes, travas, conectado, atualizarPresenca, difundir, avisos, dispensarAvisos: () => setAvisos([]) };
}
