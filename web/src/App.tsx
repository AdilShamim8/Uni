import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Onboarding } from "./components/Onboarding";
import { Modal, Toasts } from "./components/ui";
import { post } from "./lib/api";
import { useApp } from "./lib/store";
import { Chat } from "./pages/Chat";
import { Connections } from "./pages/Connections";
import { HomePage } from "./pages/Home";
import { Library } from "./pages/Library";
import { MemoryPage } from "./pages/Memory";
import { Routines } from "./pages/Routines";
import { SettingsPage } from "./pages/Settings";
import { Skills } from "./pages/Skills";
import { Team } from "./pages/Team";

export function App() {
  const { overview } = useApp();
  const [onb, setOnb] = useState(false);
  const [auth, setAuth] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => { if (overview && !overview.onboarded) setOnb(true); }, [overview]);
  useEffect(() => {
    const h = () => setAuth(true);
    window.addEventListener("rewoo:auth", h);
    return () => window.removeEventListener("rewoo:auth", h);
  }, []);

  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat/:id" element={<Chat />} />
          <Route path="/team" element={<Team />} />
          <Route path="/routines" element={<Routines />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/library" element={<Library />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Layout>
      {onb && <Onboarding onDone={() => setOnb(false)} />}
      <Modal open={auth} onClose={() => {}} label="Sign in">
        <h2>This ReWoo is protected</h2>
        <p className="muted">Enter the access token set in <code>REWOO_ACCESS_TOKEN</code>.</p>
        <input className="field" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoFocus />
        <div className="modal-actions">
          <button className="btn primary" onClick={async () => { await post("/api/auth", { token }); location.reload(); }}>Unlock</button>
        </div>
      </Modal>
      <Toasts />
    </>
  );
}
