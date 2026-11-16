/**
 * ÁREAS NBR 12721 — AS ETAPAS DO DOCUMENTO (15/11/2026, crítica `/impeccable` da tela,
 * `docs/planos/2026-11-15-areas-nbr12721-critica.md`).
 *
 * A tela calcula ao vivo, mas o documento da incorporação só existe depois de
 * publicar uma versão (o quadro congela nela), colher as aprovações técnica e
 * jurídica e levar as frações ao Empreendimento — tudo no painel Versões do editor.
 * A tela não dizia nada disso. Aqui a situação vira a fileira de etapas e a PRÓXIMA
 * ação, numa frase. Puro: a tela e o teste chamam igual.
 */

export type IdDaEtapa = 'rascunho' | 'versao' | 'tecnica' | 'juridica' | 'empreendimento';

export interface SituacaoDoDocumentoNbr {
  /** O cálculo do rascunho tem pendência bloqueante. */
  bloqueado: boolean;
  /** A versão que o memorial cita (`versaoDoMemorial`); `null` = nenhuma versão com quadro. */
  versao: { revisao: number; hash: string; tecnica: boolean; juridica: boolean } | null;
  /** Hash da saída do rascunho de agora (`congelamentoNbr12721`); `null` = sem quadro a congelar. */
  hashDoRascunho: string | null;
  /** O Empreendimento ligado ao estudo; `null` = estudo solto. */
  empreendimento: { nome: string; fracoesLevadas: boolean } | null;
}

export interface Etapa {
  id: IdDaEtapa;
  rotulo: string;
  estado: 'feita' | 'atual' | 'futura';
}

export interface ProximoPasso {
  texto: string;
  /** O que o botão da frase faz: ir às pendências, abrir o painel Versões, ou nada. */
  acao: 'pendencias' | 'versoes' | null;
  rotuloDaAcao?: string;
}

export function etapasDoDocumentoNbr12721(s: SituacaoDoDocumentoNbr): { etapas: Etapa[]; proximo: ProximoPasso; rascunhoMudou: boolean } {
  const v = s.versao;
  // O rascunho mudou desde a versão publicada: o documento aprovado não é o que a tela mostra.
  const rascunhoMudou = !!v && !!s.hashDoRascunho && s.hashDoRascunho !== v.hash;
  const feito: Record<IdDaEtapa, boolean> = {
    rascunho: !s.bloqueado,
    versao: !!v,
    tecnica: !!v?.tecnica,
    juridica: !!v?.juridica,
    empreendimento: !!s.empreendimento?.fracoesLevadas,
  };
  // Rascunho diferente da versão: o que vem depois de "publicar" vale para OUTRO documento —
  // a fileira volta para "publicar de novo" (o texto do próximo passo diz qual versão mudou).
  if (rascunhoMudou) feito.versao = feito.tecnica = feito.juridica = feito.empreendimento = false;
  const ordem: IdDaEtapa[] = ['rascunho', 'versao', 'tecnica', 'juridica', 'empreendimento'];
  const rotulo: Record<IdDaEtapa, string> = {
    // Marcos a ATINGIR (lidos como "etapa atual" sem soar como estado já feito). O nome do
    // Empreendimento não entra no rótulo: ele já está na trilha e quebrava a fileira em 2 linhas.
    rascunho: 'Cálculo fechado',
    versao: v ? `Versão ${v.revisao} publicada` : 'Versão publicada',
    tecnica: 'Aprovação técnica',
    juridica: 'Aprovação jurídica',
    empreendimento: 'Frações no Empreendimento',
  };
  // A etapa atual é a primeira não feita (sem Empreendimento ligado, a última não existe).
  const ids = s.empreendimento ? ordem : ordem.filter((id) => id !== 'empreendimento');
  const atual = ids.find((id) => !feito[id]) ?? null;
  const etapas = ids.map((id): Etapa => ({ id, rotulo: rotulo[id], estado: feito[id] ? 'feita' : id === atual ? 'atual' : 'futura' }));

  let proximo: ProximoPasso;
  if (s.bloqueado) {
    proximo = { texto: 'Resolva as pendências que bloqueiam o cálculo: sem isso os quadros não saem nem podem ser publicados.', acao: 'pendencias', rotuloDaAcao: 'Ver pendências' };
  } else if (!v) {
    proximo = { texto: 'Os quadros já saem. Publique uma versão no painel Versões: é ela que congela os quadros para aprovação.', acao: 'versoes', rotuloDaAcao: 'Abrir Versões' };
  } else if (rascunhoMudou) {
    proximo = { texto: `O rascunho mudou desde a versão ${v.revisao}. Publique uma versão nova para aprovar o que a tela mostra.`, acao: 'versoes', rotuloDaAcao: 'Abrir Versões' };
  } else if (!v.tecnica) {
    proximo = { texto: `Peça a aprovação técnica da versão ${v.revisao} no painel Versões.`, acao: 'versoes', rotuloDaAcao: 'Abrir Versões' };
  } else if (!v.juridica) {
    proximo = { texto: `Peça a aprovação jurídica da versão ${v.revisao} no painel Versões.`, acao: 'versoes', rotuloDaAcao: 'Abrir Versões' };
  } else if (!s.empreendimento) {
    proximo = { texto: `A versão ${v.revisao} está aprovada. O estudo não está ligado a um Empreendimento: ligue-o para levar as frações.`, acao: null };
  } else if (!s.empreendimento.fracoesLevadas) {
    proximo = { texto: `A versão ${v.revisao} está aprovada. Leve as frações a ${s.empreendimento.nome} pelo painel Versões.`, acao: 'versoes', rotuloDaAcao: 'Abrir Versões' };
  } else {
    proximo = { texto: `Pronto: a versão ${v.revisao} está aprovada e as frações estão em ${s.empreendimento.nome}.`, acao: null };
  }
  return { etapas, proximo, rascunhoMudou };
}
