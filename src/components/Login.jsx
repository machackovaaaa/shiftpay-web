import React, { useState } from "react";
import { supabase } from "../lib/supabase";

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif";
const C = { bg: "#F2F2F7", card: "#FFFFFF", ink: "#1C1C1E", sub: "#8E8E93", line: "#E5E5EA", blue: "#007AFF", red: "#FF3B30" };

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState("signIn");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    if (!email || !password) {
      setError("Vyplň e-mail a heslo.");
      return;
    }
    if (mode === "signUp" && !fullName.trim()) {
      setError("Vyplň i své jméno.");
      return;
    }
    setLoading(true);
    const { error: authError } =
      mode === "signIn"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName.trim() } } });
    setLoading(false);
    if (authError) setError(authError.message);
    else if (mode === "signUp") setError("Účet vytvořen. Zkontroluj e-mail a pak se přihlas.");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: FONT, padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <p style={{ fontSize: 30, fontWeight: 700, color: C.ink, margin: "0 0 4px", letterSpacing: "-0.02em", textAlign: "center" }}>ShiftPay</p>
        <p style={{ fontSize: 15, color: C.sub, margin: "0 0 28px", textAlign: "center" }}>{mode === "signIn" ? "Přihlas se ke svému účtu." : "Vytvoř si nový účet."}</p>

        <div style={{ background: C.card, borderRadius: 12, overflow: "hidden", marginBottom: 18 }}>
          {mode === "signUp" && (
            <input
              type="text" placeholder="Jméno" value={fullName} onChange={(e) => setFullName(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `0.5px solid ${C.line}`, padding: "13px 14px", fontSize: 16, fontFamily: FONT, outline: "none", background: "transparent" }}
            />
          )}
          <input
            type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `0.5px solid ${C.line}`, padding: "13px 14px", fontSize: 16, fontFamily: FONT, outline: "none", background: "transparent" }}
          />
          <input
            type="password" placeholder="Heslo" value={password} onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", border: "none", padding: "13px 14px", fontSize: 16, fontFamily: FONT, outline: "none", background: "transparent" }}
          />
        </div>

        {error && <p style={{ fontSize: 13, color: C.red, margin: "0 0 14px", textAlign: "center" }}>{error}</p>}

        <button
          onClick={submit} disabled={loading}
          style={{ width: "100%", background: C.blue, color: "#fff", border: "none", borderRadius: 12, padding: "13px 0", fontSize: 16, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
        >
          {loading ? "Chvilku…" : mode === "signIn" ? "Přihlásit se" : "Vytvořit účet"}
        </button>
        <p
          onClick={() => { setMode(mode === "signIn" ? "signUp" : "signIn"); setError(""); }}
          style={{ fontSize: 14, color: C.blue, textAlign: "center", marginTop: 18, cursor: "pointer" }}
        >
          {mode === "signIn" ? "Nemáš účet? Zaregistruj se" : "Máš účet? Přihlas se"}
        </p>
      </div>
    </div>
  );
}
