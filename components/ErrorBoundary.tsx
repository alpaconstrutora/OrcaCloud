import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

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
        this.setState({
            error,
            errorInfo
        });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="bg-red-50 p-6 rounded-2xl border border-red-200 text-red-900 m-6 overflow-hidden">
                    <div className="flex items-center gap-2 font-bold mb-4">
                        <AlertCircle className="w-5 h-5 text-red-600" />
                        Um erro inesperado capturado:
                    </div>
                    <p className="font-mono text-sm bg-red-100 p-3 rounded mb-2 whitespace-pre-wrap">
                        {this.state.error?.toString()}
                    </p>
                    {this.state.errorInfo?.componentStack && (
                        <pre className="font-mono text-xs text-red-800 bg-red-100 p-3 rounded max-h-64 overflow-y-auto whitespace-pre-wrap">
                            {this.state.errorInfo.componentStack}
                        </pre>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
