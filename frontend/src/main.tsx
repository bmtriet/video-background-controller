import React, { Component } from 'react';
import { createRoot } from 'react-dom/client';
import { Controller } from './Controller';
import { Player } from './Player';
import { PresentationStage, PresentationTest } from './PresentationTest';
import { PresentationCaptureTest } from './PresentationCaptureTest';
import { SlideSetup } from './SlideSetup';
import './style.css';
document.title = location.pathname === '/player'
  ? 'PLAYER · Màn chiếu | KHKT XI'
  : location.pathname === '/slide-setup'
    ? 'SETUP · Thuyết trình | KHKT XI'
    : location.pathname === '/presentation-capture'
      ? 'TEST · Capture PowerPoint | KHKT XI'
      : 'CONTROLLER · Điều khiển | KHKT XI';
class ErrorBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? location.pathname === '/player' ? <div style={{ position: 'fixed', inset: 0, background: '#000' }}/> : <div className="fatal"><h1>Unable to display the controller</h1><p>Playback continues on the server. Reload to reconnect.</p><button onClick={() => location.reload()}>Reload controller</button></div> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary>{location.pathname === '/slide-setup' ? <SlideSetup/> : location.pathname === '/presentation-capture' ? <PresentationCaptureTest/> : location.pathname === '/presentation-test' ? <PresentationTest/> : location.pathname === '/presentation-stage' ? <PresentationStage/> : location.pathname === '/player' ? <Player/> : <Controller/>}</ErrorBoundary>);
