import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  declare state: ErrorBoundaryState;
  declare props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Произошла ошибка приложения',
    };
  }

  componentDidCatch(error: Error) {
    console.error('App ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      let friendly = 'Неожиданная ошибка интерфейса или доступа к серверу.';
      if (this.state.message.includes('Missing or insufficient permissions')) {
        friendly = 'Нет прав доступа к данным. Проверьте, что вы вошли в аккаунт.';
      } else if (this.state.message.includes('Quota exceeded')) {
        friendly = 'Дневной лимит базы данных исчерпан. Попробуйте позже.';
      }

      return (
        <div className="w-screen h-[100dvh] bg-[#141720] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#1f2432] border border-white/15 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold text-white">Ошибка загрузки</h2>
            <p className="text-xs text-slate-300 leading-relaxed">{friendly}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-vivaro px-5 py-2.5 text-xs uppercase tracking-wider cursor-pointer"
            >
              Перезагрузить
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
