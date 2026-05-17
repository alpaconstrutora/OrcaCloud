
/**
 * AI Service tailored for the Client Portal (Home Buyers).
 * Focuses on emotional connection, technical explanations for laypeople, 
 * and lifestyle-oriented insights.
 */

export interface ClientAIInsight {
    title: string;
    message: string;
    actionable?: {
        label: string;
        target: string;
    };
    type: 'emotional' | 'technical' | 'alert' | 'lifestyle';
}

export const clientAiService = {
    /**
     * Analyzes project progress from the client's perspective.
     */
    analyzeHomeProgress: async (progress: number, phase: string): Promise<ClientAIInsight> => {
        // Simulated AI Processing
        await new Promise(resolve => setTimeout(resolve, 800));

        if (progress > 95) {
            return {
                title: "Quase lá, seu sonho está pronto!",
                message: "A obra atingiu a reta final. É hora de começar a planejar o seu enxoval e a mudança. O acabamento está impecável!",
                actionable: { label: "Ver Manual do Proprietário", target: "documentos" },
                type: 'emotional'
            };
        }

        if (phase.toLowerCase().includes('pintura') || phase.toLowerCase().includes('revestimento')) {
            return {
                title: "Sua personalidade ganhando cor",
                message: "Estamos na fase de acabamentos. É aqui que os ambientes ganham vida. Note como a iluminação natural valoriza os revestimentos escolhidos.",
                actionable: { label: "Conferir Kit de Personalização", target: "planejamento" },
                type: 'lifestyle'
            };
        }

        return {
            title: "Solidez e Segurança",
            message: `Sua casa está na fase de ${phase}. Pode parecer apenas concreto agora, mas a estrutura está sendo executada com precisão máxima para garantir décadas de conforto para sua família.`,
            actionable: { label: "Entender o que é esta fase", target: "planejamento" },
            type: 'technical'
        };
    },

    /**
     * Explains a technical term to a layperson.
     */
    explainConcept: (term: string): string => {
        const concepts: Record<string, string> = {
            'fundação': 'É a base da sua casa, como as raízes de uma árvore. Ela que dá toda a sustentação!',
            'alvenaria': 'É a construção das paredes. Agora os ambientes começam a ganhar forma real.',
            'drywall': 'É um sistema de paredes modernas, rápidas e com ótimo isolamento térmico e acústico.',
            'viga': 'Estruturas horizontais que seguram o peso da laje, garantindo a segurança do seu lar.'
        };
        return concepts[term.toLowerCase()] || "Essa é uma fase importante onde preparamos a estrutura para receber os próximos passos da sua moradia.";
    }
};
