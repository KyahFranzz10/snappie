import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home, Modes } from "./pages/Home";
import { Setup } from "./pages/Setup";
import { Capture } from "./pages/Capture";
import { Editor } from "./pages/Editor";
import { Kiosk, KioskSettings } from "./pages/Kiosk";
import { Together } from "./pages/Together";
import { Room } from "./pages/Room";
import { Help } from "./pages/Help";
import "./styles/index.css";
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error)
      return (
        <div className="empty-page">
          <h1>A little hiccup.</h1>
          <p>
            Something interrupted the booth. Your downloaded memories are safe.
          </p>
          <a className="button primary" href="/">
            Reopen Snappie
          </a>
        </div>
      );
    return this.props.children;
  }
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="modes" element={<Modes />} />
            <Route path="setup" element={<Setup />} />
            <Route path="capture" element={<Capture />} />
            <Route path="editor" element={<Editor />} />
            <Route path="result" element={<Editor result />} />
            <Route path="together" element={<Together />} />
            <Route path="join/:id" element={<Together join />} />
            <Route path="room/:id" element={<Room />} />
            <Route path="kiosk" element={<Kiosk />} />
            <Route path="kiosk/settings" element={<KioskSettings />} />
            <Route path="help" element={<Help />} />
            <Route
              path="*"
              element={
                <section className="empty-page">
                  <h1>A little off the beaten path.</h1>
                  <p>This booth doesn’t exist. Let’s find yours.</p>
                  <Link to="/" className="button primary">
                    Back home →
                  </Link>
                </section>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
