import React from 'react';

/**
 * 전역 에러 방어막 (Error Boundary)
 * 최상단 또는 특정 라우트에 감싸서 하위 컴포넌트 오류 발생 시 앱 렌더링이 죽는 현상을 방지합니다.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // 다음 렌더링에서 폴백 UI가 보이도록 상태를 업데이트 합니다.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // 에러 리포팅 서비스에 에러를 기록할 수 있습니다.
    console.error("🚨 [ErrorBoundary] 컴포넌트 에러 포착:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // 커스텀 폴백 UI를 렌더링합니다.
      return (
        <div style={{ 
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '50vh', padding: '20px', textAlign: 'center', background: '#fff', color: '#333' 
        }}>
          <span style={{ fontSize: '3rem', marginBottom: '15px' }}>🚨</span>
          <h2 style={{ color: '#D32F2F', marginBottom: '10px' }}>앗! 예기치 않은 오류가 발생했어요.</h2>
          <p style={{ color: '#666', lineHeight: '1.5', marginBottom: '20px' }}>
            화면의 일부를 불러오는 도중 문제가 생겼습니다.<br />
            앱의 다른 기능들은 정상적으로 작동하니 안심하세요!
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={() => window.location.reload()} 
              style={{
                padding: '10px 24px', background: '#1565C0', color: '#fff', 
                border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(21,101,192,0.2)'
              }}
            >
              🔄 화면 새로고침
            </button>
            <button 
              onClick={() => {
                // 루트로 이동하여 상태 강제 초기화
                window.location.href = '/';
              }} 
              style={{
                padding: '10px 24px', background: '#f5f5f5', color: '#333', 
                border: '1px solid #ddd', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer'
              }}
            >
              🏠 메인으로 가기
            </button>
          </div>
          <details style={{ marginTop: '30px', color: '#999', fontSize: '0.8rem', textAlign: 'left', maxWidth: '80%' }}>
            <summary>에러 상세 정보 (개발자용)</summary>
            <pre style={{ whiteSpace: 'pre-wrap', background: '#f8f8f8', padding: '10px', borderRadius: '4px', marginTop: '10px' }}>
              {this.state.error && this.state.error.toString()}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
