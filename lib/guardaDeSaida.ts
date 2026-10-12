// lib/guardaDeSaida.ts
//
// Registro GLOBAL de telas com edição não salva, consultado por quem troca de
// módulo: menu lateral / paleta / menu de perfil (App → Layout.onChangeView),
// voltar/avançar do navegador (useTabRouter) e fechar/recarregar a aba
// (beforeunload).
//
// Por que existe: o useUnsavedChanges (§25) só protege a PRÓPRIA tela — a
// troca de módulo pelo menu desmontava o formulário sem perguntar (achado na
// Fase 5 do plano docs/planos/2026-10-12-imovib-viabilidade-correcoes.md).
//
// É por ADESÃO (`useUnsavedChanges({ guardarNavegacao: true })`), não automático:
// há formulários que ficam montados escondidos com dirty=true (drawer fechado)
// e passariam a perguntar sem motivo em toda navegação.

const pendencias = new Set<string>();

export function registrarPendencia(id: string, pendente: boolean): void {
    if (pendente) pendencias.add(id);
    else pendencias.delete(id);
}

export function haPendenciaDeSaida(): boolean {
    return pendencias.size > 0;
}

/** Depois que o usuário confirmou descartar: a tela vai desmontar e limpar a sua entrada de qualquer jeito. */
export function limparPendencias(): void {
    pendencias.clear();
}

/** Texto único da confirmação, para menu, voltar do navegador e telas falarem igual. */
export const CONFIRMAR_SAIDA = {
    title: 'Sair sem salvar?',
    message: 'Há alterações não salvas nesta tela. Se sair agora, elas serão perdidas.',
    variant: 'warning' as const,
    confirmLabel: 'Sair e descartar',
    cancelLabel: 'Continuar editando',
};

// Fechar/recarregar a aba: o navegador mostra o aviso padrão dele (o texto não
// é customizável) só quando há pendência registrada.
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', (e) => {
        if (pendencias.size === 0) return;
        e.preventDefault();
        e.returnValue = '';
    });
}
