import React from 'react';

export default class WidgetBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('[우리 반 스크린] 위젯 렌더링 오류', error);
  }

  render() {
    if (this.state.failed) {
      return <div className="class-board-widget-error">이 위젯만 불러오지 못했습니다.</div>;
    }
    return this.props.children;
  }
}

