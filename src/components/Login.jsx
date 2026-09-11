import React, { useState } from "react";
import { supabase } from "../lib/supabase";

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif";
const C = {
  bg: "#F2F2F7",
  card: "#FFFFFF",
  ink: "#1C1C1E",
  sub: "#8E8E93",
  line: "#E5E5EA",
  blue: "#007AFF",
  red: "#FF3B30",
  green: "#34C759",
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState("signIn");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    setSuccess("");

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
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName.trim() } },
          });

    setLoading(false);

    if (authError) {
      const message = (authError.message || "").toLowerCase();

      if (mode === "signIn" && (message.includes("invalid login credentials") || message.includes("invalid credentials"))) {
        setError("Nesprávné heslo.");
      } else if (mode === "signIn" && message.includes("email not confirmed")) {
        setError("Nejdřív potvrď svůj e-mail.");
      } else if (mode === "signUp" && message.includes("already registered")) {
        setError("Účet s tímto e-mailem už existuje.");
      } else {
        setError("Něco se nepovedlo. Zkus to prosím znovu.");
      }
    } else if (mode === "signUp") {
      setSuccess("Účet vytvořen. Zkontroluj e-mail a pak se přihlas.");
    }
  };

  const sendPasswordReset = async () => {
    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Nejdřív napiš svůj e-mail.");
      return;
    }

    setLoading(true);

    const redirectTo = `${window.location.origin}/?reset-password=1`;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo }
    );

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setSuccess("Poslali jsme ti e-mail s odkazem pro nastavení nového hesla.");
    setMode("signIn");
  };

  if (mode === "forgot") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.bg,
          fontFamily: FONT,
          padding: 24,
        }}
      >
        <div style={{ width: "100%", maxWidth: 360 }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div
              style={{
                display: "inline-flex",
                background: "#000",
                color: "#fff",
                borderRadius: 9,
                padding: "6px 12px",
                fontWeight: 700,
                fontSize: 15,
                marginBottom: 20,
              }}
            >
              Spay
            </div>
            <p
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: C.ink,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              Obnovit heslo
            </p>
            <p style={{ fontSize: 14, color: C.sub, margin: "7px 0 0" }}>
              Napiš e-mail ke svému účtu a pošleme ti odkaz pro vytvoření nového hesla.
            </p>
          </div>

          <div style={{ background: C.card, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
            <input
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
                setSuccess("");
              }}
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "none",
                padding: "13px 14px",
                fontSize: 16,
                fontFamily: FONT,
                outline: "none",
                background: "transparent",
                color: C.ink,
              }}
            />
          </div>

          {error && (
            <p style={{ fontSize: 13, color: C.red, margin: "0 0 14px", textAlign: "center" }}>
              {error}
            </p>
          )}

          {success && (
            <p style={{ fontSize: 13, color: C.green, margin: "0 0 14px", textAlign: "center" }}>
              {success}
            </p>
          )}

          <button
            onClick={sendPasswordReset}
            disabled={loading}
            style={{
              width: "100%",
              background: C.blue,
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "13px 0",
              fontSize: 16,
              fontWeight: 600,
              fontFamily: FONT,
              cursor: "pointer",
            }}
          >
            {loading ? "Odesílám…" : "Poslat odkaz pro obnovu"}
          </button>

          <button
            onClick={() => {
              setMode("signIn");
              setError("");
              setSuccess("");
            }}
            style={{
              width: "100%",
              border: "none",
              background: "transparent",
              color: C.blue,
              fontSize: 14,
              fontFamily: FONT,
              marginTop: 16,
              cursor: "pointer",
            }}
          >
            Zpět na přihlášení
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: C.bg,
        fontFamily: FONT,
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              display: "inline-flex",
              background: "#000",
              color: "#fff",
              borderRadius: 9,
              padding: "6px 12px",
              fontWeight: 700,
              fontSize: 15,
              marginBottom: 20,
            }}
          >
            Spay
          </div>
          <p
            style={{
              fontSize: 30,
              fontWeight: 700,
              color: C.ink,
              margin: "0 0 4px",
              letterSpacing: "-0.02em",
            }}
          >
            {mode === "signIn" ? "Přihlášení" : "Registrace"}
          </p>
          <p style={{ fontSize: 15, color: C.sub, margin: 0 }}>
            {mode === "signIn" ? "Přihlas se ke svému účtu." : "Vytvoř si nový účet."}
          </p>
        </div>

        <div style={{ background: C.card, borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
          {mode === "signUp" && (
            <input
              type="text"
              placeholder="Jméno"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "none",
                borderBottom: `0.5px solid ${C.line}`,
                padding: "13px 14px",
                fontSize: 16,
                fontFamily: FONT,
                outline: "none",
                background: "transparent",
                color: C.ink,
              }}
            />
          )}

          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
              setSuccess("");
            }}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "none",
              borderBottom: `0.5px solid ${C.line}`,
              padding: "13px 14px",
              fontSize: 16,
              fontFamily: FONT,
              outline: "none",
              background: "transparent",
              color: C.ink,
            }}
          />

          <input
            type="password"
            placeholder="Heslo"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
              setSuccess("");
            }}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "none",
              padding: "13px 14px",
              fontSize: 16,
              fontFamily: FONT,
              outline: "none",
              background: "transparent",
              color: C.ink,
            }}
          />
        </div>

        {mode === "signIn" && (
          <button
            onClick={() => {
              setMode("forgot");
              setError("");
              setSuccess("");
            }}
            style={{
              display: "block",
              marginLeft: "auto",
              border: "none",
              background: "transparent",
              color: C.blue,
              fontSize: 13,
              fontFamily: FONT,
              padding: "2px 2px 14px",
              cursor: "pointer",
            }}
          >
            Zapomenuté heslo?
          </button>
        )}

        {error && (
          <p style={{ fontSize: 13, color: C.red, margin: "0 0 14px", textAlign: "center" }}>
            {error}
          </p>
        )}

        {success && (
          <p style={{ fontSize: 13, color: C.green, margin: "0 0 14px", textAlign: "center" }}>
            {success}
          </p>
        )}

        <button
          onClick={submit}
          disabled={loading}
          style={{
            width: "100%",
            background: C.blue,
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "13px 0",
            fontSize: 16,
            fontWeight: 600,
            fontFamily: FONT,
            cursor: "pointer",
          }}
        >
          {loading ? "Chvilku…" : mode === "signIn" ? "Přihlásit se" : "Vytvořit účet"}
        </button>

        <p
          onClick={() => {
            setMode(mode === "signIn" ? "signUp" : "signIn");
            setError("");
            setSuccess("");
          }}
          style={{
            fontSize: 14,
            color: C.blue,
            textAlign: "center",
            marginTop: 18,
            cursor: "pointer",
          }}
        >
          {mode === "signIn" ? "Nemáš účet? Zaregistruj se" : "Máš účet? Přihlas se"}
        </p>
      </div>
    </div>
  );
}
