import { useCallback, useEffect, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import type { BlueprintProjetoExecutivoRow } from '../types/blueprint';
import { blueprintProjetoExecutivoService, type DadosDaEmissao } from '../services/blueprintProjetoExecutivoService';
import { baixarArtefatos } from '../services/blueprintExportService';
import { RESPONSAVEL_VAZIO, SONDAGEM_VAZIA, type ResponsavelTecnico, type Sondagem } from '../utils/blueprintTopografiaExecutivo';

/**
 * O projeto executivo com ART (fase 17): o rascunho do responsável e da
 * sondagem, editável e gravado com respiro; as emissões, imutáveis.
 *
 * Mesmo desenho de `useBlueprintTerraplenagem`: estado local que responde na
 * hora, gravação atrás, degradação sem a migration — só que EMITIR exige a
 * persistência: uma emissão que se perde ao recarregar não é emissão.
 */
export interface ProjetoExecutivo {
  responsavel: ResponsavelTecnico;
  setResponsavel: (patch: Partial<ResponsavelTecnico>) => void;
  sondagem: Sondagem;
  setSondagem: (patch: Partial<Sondagem>) => void;
  /** Emissões, da mais nova para a mais antiga. */
  emitidos: BlueprintProjetoExecutivoRow[];
  emitir: (dados: DadosDaEmissao) => Promise<BlueprintProjetoExecutivoRow | null>;
  emitindo: boolean;
  erro: string | null;
  /** O memorial de uma emissão, em PDF, para download. */
  baixarMemorial: (row: BlueprintProjetoExecutivoRow, nomeDoEstudo: string) => void;
  carregando: boolean;
  persistenciaIndisponivel: boolean;
}

/** O JSON parcial gravado, completado com o vazio (e sem chaves estranhas). */
export function responsavelDaColuna(raw: unknown): ResponsavelTecnico {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ResponsavelTecnico>;
  const s = (v: unknown, padrao: string) => (typeof v === 'string' ? v : padrao);
  return {
    nome: s(r.nome, ''),
    titulo: s(r.titulo, RESPONSAVEL_VAZIO.titulo),
    conselho: r.conselho === 'CAU' ? 'CAU' : 'CREA',
    registro: s(r.registro, ''),
    artNumero: s(r.artNumero, ''),
    artData: s(r.artData, ''),
  };
}

export function sondagemDaColuna(raw: unknown): Sondagem {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Sondagem>;
  const n = (v: unknown, padrao: number) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao);
  const na = (r.nivelDagua && typeof r.nivelDagua === 'object' ? r.nivelDagua : {}) as Partial<Sondagem['nivelDagua']>;
  const solos = ['ARGILA', 'SILTE', 'AREIA', 'ROCHA', 'ATERRO'];
  return {
    furos: n(r.furos, 0),
    nsptMedio: typeof r.nsptMedio === 'number' && Number.isFinite(r.nsptMedio) ? r.nsptMedio : null,
    tipoDeSolo: typeof r.tipoDeSolo === 'string' && solos.includes(r.tipoDeSolo) ? (r.tipoDeSolo as Sondagem['tipoDeSolo']) : null,
    nivelDagua: {
      informado: na.informado === true,
      encontrado: na.encontrado === true,
      profundidadeM: typeof na.profundidadeM === 'number' && Number.isFinite(na.profundidadeM) ? na.profundidadeM : null,
    },
    laudo: typeof r.laudo === 'string' ? r.laudo : '',
  };
}

/** Monta o PDF do memorial: título, seções (`## `) e itens, paginado. */
export function memorialEmPdf(linhas: string[]): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margem = 18;
  let y = margem;
  const pular = (h: number) => {
    if (y + h > H - margem) {
      doc.addPage();
      y = margem;
    }
  };
  for (const l of linhas) {
    if (l === '') {
      y += 3;
      continue;
    }
    const titulo = l.startsWith('# ');
    const secao = l.startsWith('## ');
    const texto = titulo ? l.slice(2) : secao ? l.slice(3) : l;
    doc.setFont('helvetica', titulo || secao ? 'bold' : 'normal');
    doc.setFontSize(titulo ? 13 : secao ? 11 : 9);
    const partes = doc.splitTextToSize(texto, W - 2 * margem) as string[];
    const alturaLinha = titulo ? 6 : secao ? 5.5 : 4.2;
    pular(partes.length * alturaLinha + (secao ? 2 : 0));
    if (secao) y += 2;
    for (const p of partes) {
      doc.text(p, margem, y);
      y += alturaLinha;
    }
  }
  return doc.output('blob');
}

export function useBlueprintProjetoExecutivo(studyId: string, organizationId: string): ProjetoExecutivo {
  const [responsavel, setResponsavelLocal] = useState<ResponsavelTecnico>(RESPONSAVEL_VAZIO);
  const [sondagem, setSondagemLocal] = useState<Sondagem>(SONDAGEM_VAZIA);
  const [rascunhoId, setRascunhoId] = useState<string | null>(null);
  const [emitidos, setEmitidos] = useState<BlueprintProjetoExecutivoRow[]>([]);
  const [emitindo, setEmitindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [persistenciaIndisponivel, setPersistencia] = useState(false);
  const gravacao = useRef<ReturnType<typeof setTimeout> | null>(null);
  const criando = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const lista = await blueprintProjetoExecutivoService.listar(studyId);
        if (!vivo) return;
        const rascunho = lista.find((r) => r.status === 'RASCUNHO') ?? null;
        setEmitidos(lista.filter((r) => r.status === 'EMITIDO'));
        setRascunhoId(rascunho?.id ?? null);
        if (rascunho) {
          setResponsavelLocal(responsavelDaColuna(rascunho.responsavel));
          setSondagemLocal(sondagemDaColuna(rascunho.sondagem));
        } else {
          // Sem rascunho: o responsável da última emissão vem como ponto de partida.
          const ultima = lista.find((r) => r.status === 'EMITIDO');
          if (ultima) {
            setResponsavelLocal({ ...responsavelDaColuna(ultima.responsavel), artNumero: '', artData: '' });
            setSondagemLocal(sondagemDaColuna(ultima.sondagem));
          }
        }
      } catch (e) {
        if (!vivo) return;
        setPersistencia(true);
        console.warn('[projeto executivo] persistência indisponível:', e);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [studyId]);

  const responsavelRef = useRef(responsavel);
  responsavelRef.current = responsavel;
  const sondagemRef = useRef(sondagem);
  sondagemRef.current = sondagem;
  const rascunhoRef = useRef(rascunhoId);
  rascunhoRef.current = rascunhoId;

  /** Garante um rascunho no banco e devolve o id (uma criação por vez). */
  const garantirRascunho = useCallback(async (): Promise<string | null> => {
    if (persistenciaIndisponivel) return null;
    if (rascunhoRef.current) return rascunhoRef.current;
    if (!criando.current) {
      criando.current = blueprintProjetoExecutivoService
        .criarRascunho(studyId, organizationId, responsavelRef.current, sondagemRef.current)
        .then((row) => {
          rascunhoRef.current = row.id;
          setRascunhoId(row.id);
          return row.id;
        })
        .catch((e) => {
          console.warn('[projeto executivo] não criou o rascunho:', e);
          return null;
        })
        .finally(() => {
          criando.current = null;
        });
    }
    return criando.current;
  }, [studyId, organizationId, persistenciaIndisponivel]);

  // Grava com um respiro: nome e números são digitados letra a letra.
  const persistir = useCallback(() => {
    if (persistenciaIndisponivel) return;
    if (gravacao.current) clearTimeout(gravacao.current);
    gravacao.current = setTimeout(async () => {
      const id = await garantirRascunho();
      if (!id) return;
      blueprintProjetoExecutivoService
        .atualizarRascunho(id, { responsavel: responsavelRef.current, sondagem: sondagemRef.current })
        .catch((e) => console.warn('[projeto executivo] não gravou:', e));
    }, 500);
  }, [persistenciaIndisponivel, garantirRascunho]);

  const setResponsavel = useCallback(
    (patch: Partial<ResponsavelTecnico>) => {
      const proximo = { ...responsavelRef.current, ...patch };
      responsavelRef.current = proximo;
      setResponsavelLocal(proximo);
      persistir();
    },
    [persistir],
  );

  const setSondagem = useCallback(
    (patch: Partial<Sondagem>) => {
      const proximo = { ...sondagemRef.current, ...patch, nivelDagua: { ...sondagemRef.current.nivelDagua, ...(patch.nivelDagua ?? {}) } };
      sondagemRef.current = proximo;
      setSondagemLocal(proximo);
      persistir();
    },
    [persistir],
  );

  const emitir = useCallback(
    async (dados: DadosDaEmissao): Promise<BlueprintProjetoExecutivoRow | null> => {
      setErro(null);
      if (persistenciaIndisponivel) {
        setErro('Sem a tabela do projeto executivo no banco não há como registrar a emissão.');
        return null;
      }
      setEmitindo(true);
      try {
        if (gravacao.current) clearTimeout(gravacao.current);
        const id = await garantirRascunho();
        if (!id) throw new Error('Não foi possível criar o registro do projeto executivo.');
        // O rascunho leva o responsável e a sondagem como estão na tela antes de virar emissão.
        await blueprintProjetoExecutivoService.atualizarRascunho(id, { responsavel: responsavelRef.current, sondagem: sondagemRef.current });
        const row = await blueprintProjetoExecutivoService.emitir(id, dados);
        setEmitidos((es) => [row, ...es]);
        // A emissão consumiu o rascunho; o próximo começa do responsável, sem a ART.
        rascunhoRef.current = null;
        setRascunhoId(null);
        setResponsavelLocal((r) => ({ ...r, artNumero: '', artData: '' }));
        responsavelRef.current = { ...responsavelRef.current, artNumero: '', artData: '' };
        return row;
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setEmitindo(false);
      }
    },
    [persistenciaIndisponivel, garantirRascunho],
  );

  const baixarMemorial = useCallback((row: BlueprintProjetoExecutivoRow, nomeDoEstudo: string) => {
    const linhas = (row.memorial ?? '').split('\n');
    const base = nomeDoEstudo.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'estudo';
    const art = responsavelDaColuna(row.responsavel).artNumero.replace(/\D/g, '') || 'sem-art';
    baixarArtefatos([{ blob: memorialEmPdf(linhas), nome: `${base} - memorial executivo ART ${art}.pdf`, tipo: 'pdf' }]);
  }, []);

  return {
    responsavel,
    setResponsavel,
    sondagem,
    setSondagem,
    emitidos,
    emitir,
    emitindo,
    erro,
    baixarMemorial,
    carregando,
    persistenciaIndisponivel,
  };
}
