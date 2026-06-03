import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

const CHUNK_RELOAD_KEY = 'chunk_reload_attempted';

function isChunkLoadError(error: Error): boolean {
    return (
        error.message?.includes('Failed to fetch dynamically imported module') ||
        error.message?.includes('Importing a module script failed') ||
        error.name === 'ChunkLoadError'
    );
}

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);

        if (isChunkLoadError(error)) {
            const alreadyRetried = sessionStorage.getItem(CHUNK_RELOAD_KEY);
            if (!alreadyRetried) {
                sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
                window.location.reload();
                return;
            }
        }

        this.setState({ error, errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            const isChunk = this.state.error ? isChunkLoadError(this.state.error) : false;

            return (
                <div className="bg-red-50 p-6 rounded-2xl border border-red-200 text-red-900 m-6 overflow-hidden">
                    <div className="flex items-center gap-2 font-bold mb-4">
                        <AlertCircle className="w-5 h-5 text-red-600" />
                        Um erro inesperado capturado:
                    </div>
                    {isChunk && (
                        <p className="text-sm mb-3 text-red-700">
                            Uma atualização do sistema foi detectada. Recarregue a página para continuar.
                        </p>
                    )}
                    <p className="font-mono text-sm bg-red-100 p-3 rounded mb-2 whitespace-pre-wrap">
                        {this.state.error?.toString()}
                    </p>
                    {this.state.errorInfo?.componentStack && (
                        <pre className="font-mono text-xs text-red-800 bg-red-100 p-3 rounded max-h-64 overflow-y-auto whitespace-pre-wrap">
                            {this.state.errorInfo.componentStack}
                        </pre>
                    )}
                    <button
                        onClick={() => {
                            sessionStorage.removeItem(CHUNK_RELOAD_KEY);
                            window.location.reload();
                        }}
                        className="mt-4 flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Recarregar página
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
