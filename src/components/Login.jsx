import React, { useState } from "react";
import { supabase } from "../lib/supabase";

const C = { plum: "#2B1F3D", coral: "#FF6B4A", ink: "#1E1730", sub: "#7A7189", line: "#EAE5F2" };

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signIn");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    if (!email || !password) {
      setError("Vyplň e-mail a heslo.");
      return;
    }
    setLoading(true);
    const { error: authError } =
      mode === "signIn"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (authError) setError(authError.message);
    else if (mode === "signUp") setError("Účet vytvořen. Zkontroluj e-mail a pak se přihlas.");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.plum, fontFamily: "'Inter', sans-serif" }}>
      <div style={{ width: 340, background: "#fff", borderRadius: 24, padding: "28px 24px" }}>
        <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 26, color: C.ink, margin: "0 0 4px" }}>ShiftPay</p>
        <p style={{ fontSize: 13, color: C.sub, margin: "0 0 20px" }}>{mode === "signIn" ? "Přihlas se ke svému účtu." : "Vytvoř si nový účet."}</p>
        <input
          type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "10px 12px", fontSize: 13, marginBottom: 10 }}
        />
        <input
          type="password" placeholder="Heslo" value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "10px 12px", fontSize: 13, marginBottom: 14 }}
        />
        {error && <p style={{ fontSize: 12, color: "#D9614F", margin: "0 0 10px" }}>{error}</p>}
        <button
          onClick={submit} disabled={loading}
          style={{ width: "100%", background: C.coral, color: "#fff", border: "none", borderRadius: 14, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          {loading ? "Chvilku…" : mode === "signIn" ? "Přihlásit se" : "Vytvořit účet"}
        </button>
        <p
          onClick={() => { setMode(mode === "signIn" ? "signUp" : "signIn"); setError(""); }}
          style={{ fontSize: 12, color: C.sub, textAlign: "center", marginTop: 14, cursor: "pointer" }}
        >
          {mode === "signIn" ? "Nemáš účet? Zaregistruj se" : "Máš účet? Přihlas se"}
        </p>
      </div>
    </div>
  );
}
