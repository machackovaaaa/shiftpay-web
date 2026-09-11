import React, { useState, useEffect, useCallback } from "react";
import { Sun, Sunset, Moon, Clock, Plus, Home, Calendar, Settings as SettingsIcon, Coins, Trash2, LogOut, X, Play, Square, ChevronRight, Briefcase, Megaphone, Martini, UtensilsCrossed, Coffee, ShoppingBag, Truck, Wrench, Copy, Pencil } from "lucide-react";
import { supabase } from "./lib/supabase";
import { computeHours, computePay, hoursForShift, payForShift, effectivePauseMin, isLiveShift, liveElapsedLabel, rawDurationLabel, fmtK, typeLabel } from "./lib/calc";
import Login from "./components/Login";

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif";
const C = {
  bg: "#F2F2F7", card: "#FFFFFF", ink: "#1C1C1E", sub: "#8E8E93", line: "#E5E5EA",
  blue: "#007AFF", green: "#34C759", orange: "#FF9500", purple: "#5E5CE6", red: "#FF3B30",
  black: "#000000",
};
const ICONS = { Sun, Sunset, Moon, Clock };
const ICON_COLORS = { Sun: C.orange, Sunset: C.blue, Moon: C.purple, Clock: "#8E8E93" };
const EMPLOYER_ICONS = { Briefcase, Megaphone, Martini, UtensilsCrossed, Coffee, ShoppingBag, Truck, Wrench, Coins };
const EMPLOYER_ICON_LABELS = { Briefcase: "Kancelář", Megaphone: "Marketing", Martini: "Barman", UtensilsCrossed: "Servírka", Coffee: "Barista", ShoppingBag: "Prodejna", Truck: "Rozvoz", Wrench: "Manuální", Coins: "Jiné" };
const EMPLOYER_COLORS = ["#007AFF", "#34C759", "#FF9500", "#5E5CE6", "#FF3B30", "#FF2D55", "#30B0C7", "#8E8E93"];
const DEFAULT_SHIFT_TYPES = [
  { name: "Ranní", start_time: "06:00", end_time: "14:00", pause_min: 30, surcharge_pct: 0, icon: "Sun" },
  { name: "Odpolední", start_time: "14:00", end_time: "22:00", pause_min: 30, surcharge_pct: 0, icon: "Sunset" },
  { name: "Noční", start_time: "22:00", end_time: "06:00", pause_min: 45, surcharge_pct: 15, icon: "Moon" },
];

const SHIFT_STATUSES = [
  { id: "planned", label: "Plánovaná", color: C.blue, bg: "#E8F1FF" },
  { id: "worked", label: "Odpracovaná", color: C.green, bg: "#E9F9ED" },
  { id: "cancelled", label: "Zrušená", color: C.red, bg: "#FFE9E7" },
];

function shiftStatusMeta(status) {
  return SHIFT_STATUSES.find((s) => s.id === status) || SHIFT_STATUSES[1];
}


function resolvedShiftType(shift, shiftType) {
  if (!shiftType) return null;
  if (!shift?.custom_start_time || !shift?.custom_end_time) return shiftType;
  return {
    ...shiftType,
    start_time: shift.custom_start_time,
    end_time: shift.custom_end_time,
    pause_min: shift.pause_override_min ?? shiftType.pause_min ?? 0,
    surcharge_pct: shift.custom_surcharge_pct ?? 0,
  };
}

function shiftTitle(shift, shiftType) {
  if (shift?.custom_start_time && shift?.custom_end_time) return "Vlastní";
  return shiftType?.name || "Směna";
}


const inputStyle = { width: "100%", boxSizing: "border-box", border: `0.5px solid ${C.line}`, borderRadius: 10, padding: "11px 12px", fontSize: 15, fontFamily: FONT, color: C.ink, background: C.card, outline: "none" };

function Field({ label, children }) {
  return <div style={{ marginBottom: 14 }}><label style={{ display: "block", fontSize: 13, fontWeight: 400, color: C.sub, marginBottom: 5 }}>{label}</label>{children}</div>;
}
function ErrorText({ children }) {
  if (!children) return null;
  return <p style={{ fontSize: 13, color: C.red, margin: "4px 0 0" }}>{children}</p>;
}
function PrimaryButton({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: "100%", background: disabled ? C.line : C.blue, color: disabled ? C.sub : "#fff", border: "none", borderRadius: 12, padding: "13px 0", fontSize: 16, fontWeight: 600, fontFamily: FONT, cursor: disabled ? "default" : "pointer", marginTop: 6 }}>
      {children}
    </button>
  );
}
function Sheet({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}>
      <div style={{ background: C.bg, width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto", borderRadius: "20px 20px 0 0", padding: "18px 20px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: 18, color: C.ink, margin: 0, letterSpacing: "-0.01em" }}>{title}</p>
          <button onClick={onClose} aria-label="Zavřít" style={{ background: C.line, border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={14} color={C.sub} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SectionHeader({ children }) {
  return <p style={{ fontSize: 13, fontWeight: 600, color: C.sub, letterSpacing: "0.04em", textTransform: "uppercase", margin: "24px 20px 6px" }}>{children}</p>;
}
function GroupedList({ children }) {
  return <div style={{ background: C.card, borderRadius: 12, margin: "0 16px", overflow: "hidden" }}>{children}</div>;
}
function IconBadge({ Icon, color, small }) {
  const size = small ? 28 : 34;
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.3, background: color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon size={size * 0.5} color="#fff" strokeWidth={2.2} />
    </div>
  );
}

function SpayBadge() {
  return (
    <div style={{ background: C.black, borderRadius: 8, padding: "5px 11px", display: "inline-flex", alignItems: "center" }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: FONT, letterSpacing: "-0.01em" }}>Spay</span>
    </div>
  );
}

function TopBrandBar() {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 5, background: "rgba(242,242,247,0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: `0.5px solid ${C.line}`, padding: "8px 0", display: "flex", justifyContent: "center" }}>
      <SpayBadge />
    </div>
  );
}

function displayName(session) {
  const meta = session?.user?.user_metadata;
  if (meta?.full_name) return meta.full_name.trim().split(" ")[0];
  const email = session?.user?.email || "";
  const local = email.split("@")[0] || "";
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "";
}

function useShiftPayData(userId) {
  const [employers, setEmployers] = useState([]);
  const [shiftTypes, setShiftTypes] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [emp, st, sh] = await Promise.all([
      supabase.from("employers").select("*").order("created_at"),
      supabase.from("shift_types").select("*").order("created_at"),
      supabase.from("shifts").select("*").order("shift_date", { ascending: false }),
    ]);
    if (emp.data) setEmployers(emp.data);
    if (sh.data) setShifts(sh.data);
    if (st.data) {
      if (st.data.length === 0) {
        const inserts = DEFAULT_SHIFT_TYPES.map((t) => ({ ...t, user_id: userId }));
        const created = await supabase.from("shift_types").insert(inserts).select();
        setShiftTypes(created.data || []);
      } else {
        setShiftTypes(st.data);
      }
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { employers, shiftTypes, shifts, loading, refresh };
}

function AddShiftSheet({ userId, employers, shiftTypes, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const fallbackShiftType = shiftTypes[0];
  const [date, setDate] = useState(today);
  const [employerId, setEmployerId] = useState(employers[0]?.id || "");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [tip, setTip] = useState("");
  const [pauseMin, setPauseMin] = useState(30);
  const [status, setStatus] = useState("worked");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const employer = employers.find((e) => e.id === employerId);

  const previewType = fallbackShiftType ? {
    ...fallbackShiftType,
    start_time: startTime,
    end_time: endTime,
    pause_min: Number(pauseMin) || 0,
    surcharge_pct: 0,
  } : null;
  const previewShift = { pause_override_min: Number(pauseMin) || 0 };
  const previewHours = previewType ? hoursForShift(previewShift, previewType) : 0;
  const previewPay = employer && previewType ? payForShift(previewShift, employer, previewType) : 0;

  const submit = async () => {
    if (!date || !employerId || !startTime || !endTime) {
      setError("Vyplň datum, zaměstnavatele a čas směny.");
      return;
    }
    if (!fallbackShiftType?.id) {
      setError("Nejdřív je potřeba mít v Nastavení alespoň jeden typ směny.");
      return;
    }

    const { error: err } = await supabase.from("shifts").insert({
      user_id: userId,
      employer_id: employerId,
      shift_type_id: fallbackShiftType.id,
      shift_date: date,
      tip: Number(tip) || 0,
      pause_override_min: Number(pauseMin) || 0,
      status,
      note: note.trim() || null,
      custom_start_time: startTime,
      custom_end_time: endTime,
      custom_surcharge_pct: 0,
    });

    if (err) {
      setError(err.message);
      return;
    }
    onSaved();
    onClose();
  };

  if (employers.length === 0) {
    return (
      <Sheet title="Přidat směnu" onClose={onClose}>
        <p style={{ fontSize: 15, color: C.sub }}>
          Nejdřív přidej alespoň jednoho zaměstnavatele v Nastavení.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet title="Přidat směnu" onClose={onClose}>
      <Field label="Zaměstnavatel">
        <select style={inputStyle} value={employerId} onChange={(e) => setEmployerId(e.target.value)}>
          {employers.map((e) => (
            <option key={e.id} value={e.id}>{e.name} ({typeLabel(e.type)})</option>
          ))}
        </select>
      </Field>

      <Field label="Datum">
        <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Začátek">
            <input type="time" style={inputStyle} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Konec">
            <input type="time" style={inputStyle} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>
      </div>

      <Field label="Pauza (min)">
        <input type="number" min="0" style={inputStyle} value={pauseMin} onChange={(e) => setPauseMin(e.target.value)} />
      </Field>

      {employer?.track_tips !== false && (
        <Field label="Dýška (Kč, nepovinné)">
          <input type="number" min="0" style={inputStyle} value={tip} onChange={(e) => setTip(e.target.value)} />
        </Field>
      )}

      <Field label="Stav směny">
        <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
          {SHIFT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </Field>

      <Field label="Poznámka (nepovinné)">
        <textarea
          style={{ ...inputStyle, minHeight: 82, resize: "vertical" }}
          placeholder="Např. záskok za Kiku"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      {previewType && employer && (
        <div style={{ background: C.card, borderRadius: 10, padding: "10px 14px", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: C.sub }}>{previewHours} h po odečtení pauzy</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{fmtK(previewPay)} Kč</span>
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      <PrimaryButton onClick={submit}>Uložit směnu</PrimaryButton>
    </Sheet>
  );
}

function StartShiftSheet({ userId, employers, shiftTypes, onClose, onSaved }) {
  const [employerId, setEmployerId] = useState(employers[0]?.id || "");
  const [shiftTypeId, setShiftTypeId] = useState(shiftTypes[0]?.id || "");
  const [pauseMin, setPauseMin] = useState(null);
  const [status, setStatus] = useState("worked");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const shiftType = shiftTypes.find((s) => s.id === shiftTypeId);
  const effectivePause = pauseMin !== null ? pauseMin : (shiftType?.pause_min || 0);

  const submit = async () => {
    if (!employerId || !shiftTypeId) { setError("Vyber zaměstnavatele a typ směny."); return; }
    const now = new Date();
    const { error: err } = await supabase.from("shifts").insert({
      user_id: userId, employer_id: employerId, shift_type_id: shiftTypeId,
      shift_date: now.toISOString().slice(0, 10), tip: 0,
      started_at: now.toISOString(), ended_at: null, pause_override_min: effectivePause,
    });
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  };

  if (employers.length === 0) {
    return <Sheet title="Spustit směnu" onClose={onClose}><p style={{ fontSize: 15, color: C.sub }}>Nejdřív přidej alespoň jednoho zaměstnavatele v Nastavení.</p></Sheet>;
  }

  return (
    <Sheet title="Spustit směnu" onClose={onClose}>
      <Field label="Zaměstnavatel">
        <select style={inputStyle} value={employerId} onChange={(e) => setEmployerId(e.target.value)}>
          {employers.map((e) => <option key={e.id} value={e.id}>{e.name} ({typeLabel(e.type)})</option>)}
        </select>
      </Field>
      <Field label="Typ směny">
        <select style={inputStyle} value={shiftTypeId} onChange={(e) => { setShiftTypeId(e.target.value); setPauseMin(null); }}>
          {shiftTypes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Pauza dnes (min)">
        <input type="number" min="0" style={inputStyle} value={effectivePause} onChange={(e) => setPauseMin(Number(e.target.value) || 0)} />
      </Field>
      <div style={{ display: "flex", gap: 8, marginTop: -8, marginBottom: 14 }}>
        <button onClick={() => setPauseMin(0)} style={{ fontSize: 12, color: effectivePause === 0 ? "#fff" : C.blue, background: effectivePause === 0 ? C.blue : "none", border: `1px solid ${C.blue}`, borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>bez pauzy dnes</button>
        {shiftType && (
          <button onClick={() => setPauseMin(shiftType.pause_min || 0)} style={{ fontSize: 12, color: effectivePause === (shiftType.pause_min || 0) ? "#fff" : C.blue, background: effectivePause === (shiftType.pause_min || 0) ? C.blue : "none", border: `1px solid ${C.blue}`, borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>výchozí {shiftType.pause_min || 0} min</button>
        )}
      </div>
      <p style={{ fontSize: 13, color: C.sub, margin: "0 0 6px" }}>Hodiny se počítají podle skutečného odpracovaného času, mínus pauza nastavená výše.</p>
      <ErrorText>{error}</ErrorText>
      <PrimaryButton onClick={submit}>Start směny teď</PrimaryButton>
    </Sheet>
  );
}

function LiveShiftBanner({ shift, employer, shiftType, onStop }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!shift) return null;
  const Icon = ICONS[shiftType?.icon] || Sun;
  return (
    <div style={{ background: C.black, borderRadius: 16, padding: "14px 16px", margin: "16px 16px 0", display: "flex", alignItems: "center", gap: 14, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={16} color="#fff" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, color: "#9C9CA0", margin: "0 0 2px" }}>{employer?.name} · {shiftType?.name} běží</p>
        <p style={{ fontFamily: FONT, fontSize: 19, fontWeight: 600, color: "#fff", margin: 0, fontVariantNumeric: "tabular-nums" }}>{liveElapsedLabel(shift.started_at)}</p>
      </div>
      <button onClick={onStop} style={{ display: "flex", alignItems: "center", gap: 6, background: C.blue, color: "#fff", border: "none", borderRadius: 10, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        <Square size={12} fill="#fff" /> Stop
      </button>
    </div>
  );
}

function AddEmployerSheet({ userId, onClose, onSaved }) {
  const [name, setName] = useState(""); const [type, setType] = useState("DPP");
  const [rate, setRate] = useState(""); const [trackTips, setTrackTips] = useState(true);
  const [icon, setIcon] = useState("Briefcase");
  const [iconColor, setIconColor] = useState(EMPLOYER_COLORS[0]);
  const [error, setError] = useState("");
  const submit = async () => {
    if (!name.trim() || !rate || Number(rate) <= 0) { setError("Vyplň jméno a hodinovou sazbu."); return; }
    const { error: err } = await supabase.from("employers").insert({
      user_id: userId, name: name.trim(), type, rate: Number(rate), track_tips: trackTips, icon, icon_color: iconColor,
      monthly_limit: type === "DPP" ? 10000 : null,
    });
    if (err) { setError(err.message); return; }
    onSaved(); onClose();
  };
  return (
    <Sheet title="Nový zaměstnavatel" onClose={onClose}>
      <Field label="Název"><input style={inputStyle} placeholder="např. Kavárna Nuance" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Typ práce">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.keys(EMPLOYER_ICONS).map((name2) => {
            const Ic = EMPLOYER_ICONS[name2]; const isSel = icon === name2;
            return (
              <button key={name2} onClick={() => setIcon(name2)} type="button"
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: 62, padding: "8px 4px", borderRadius: 12, cursor: "pointer", border: isSel ? `1.5px solid ${iconColor}` : `0.5px solid ${C.line}`, background: isSel ? "#F2F2F7" : C.card }}>
                <Ic size={17} color={isSel ? iconColor : C.sub} />
                <span style={{ fontSize: 10, color: isSel ? iconColor : C.sub }}>{EMPLOYER_ICON_LABELS[name2]}</span>
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Barva ikonky">
        <div style={{ display: "flex", gap: 8 }}>
          {EMPLOYER_COLORS.map((c) => (
            <button key={c} onClick={() => setIconColor(c)} type="button" aria-label={c}
              style={{ width: 30, height: 30, borderRadius: "50%", background: c, border: iconColor === c ? `2px solid ${C.ink}` : "2px solid transparent", cursor: "pointer", padding: 0 }} />
          ))}
        </div>
      </Field>
      <Field label="Typ smlouvy"><select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}><option value="DPP">DPP</option><option value="DPC">DPČ</option></select></Field>
      <Field label="Hodinová sazba (Kč)"><input type="number" min="0" style={inputStyle} placeholder="150" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
      <Field label="Dýška">
        <button onClick={() => setTrackTips((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          <div style={{ width: 44, height: 26, borderRadius: 13, background: trackTips ? C.green : C.line, position: "relative", transition: "background 0.15s" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: trackTips ? 20 : 2, transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
          </div>
          <span style={{ fontSize: 13, color: C.sub }}>{trackTips ? "evidovat u směn" : "neevidovat"}</span>
        </button>
      </Field>
      <ErrorText>{error}</ErrorText>
      <PrimaryButton onClick={submit}>Uložit zaměstnavatele</PrimaryButton>
    </Sheet>
  );
}

function AddShiftTypeSheet({ userId, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("16:00");
  const [pauseMin, setPauseMin] = useState("30");
  const [surchargePct, setSurchargePct] = useState("0");
  const [icon, setIcon] = useState("Sun");
  const [error, setError] = useState("");
  const submit = async () => {
    if (!name.trim()) { setError("Zadej název typu směny."); return; }
    const { error: err } = await supabase.from("shift_types").insert({
      user_id: userId, name: name.trim(), start_time: start, end_time: end,
      pause_min: Number(pauseMin) || 0, surcharge_pct: Number(surchargePct) || 0, icon,
    });
    if (err) { setError(err.message); return; }
    onSaved(); onClose();
  };
  return (
    <Sheet title="Nový typ směny" onClose={onClose}>
      <Field label="Název"><input style={inputStyle} placeholder="např. Víkendová" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Začátek"><input type="time" style={inputStyle} value={start} onChange={(e) => setStart(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Konec"><input type="time" style={inputStyle} value={end} onChange={(e) => setEnd(e.target.value)} /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Pauza (min)"><input type="number" min="0" style={inputStyle} value={pauseMin} onChange={(e) => setPauseMin(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Příplatek (%)"><input type="number" min="0" style={inputStyle} value={surchargePct} onChange={(e) => setSurchargePct(e.target.value)} /></Field></div>
      </div>
      <Field label="Ikona">
        <div style={{ display: "flex", gap: 8 }}>
          {Object.keys(ICONS).map((name2) => {
            const Ic = ICONS[name2]; const isSel = icon === name2;
            return (
              <button key={name2} onClick={() => setIcon(name2)} aria-label={name2}
                style={{ width: 40, height: 40, borderRadius: 12, cursor: "pointer", border: isSel ? `1.5px solid ${C.blue}` : `0.5px solid ${C.line}`, background: isSel ? "#E8F1FF" : C.card }}>
                <Ic size={17} color={isSel ? C.blue : C.sub} />
              </button>
            );
          })}
        </div>
      </Field>
      <ErrorText>{error}</ErrorText>
      <PrimaryButton onClick={submit}>Uložit typ směny</PrimaryButton>
    </Sheet>
  );
}


function EditShiftSheet({ shift, userId, employers, shiftTypes, onClose, onSaved }) {
  const [date, setDate] = useState(shift.shift_date || "");
  const [employerId, setEmployerId] = useState(shift.employer_id || employers[0]?.id || "");
  const [shiftTypeId, setShiftTypeId] = useState(shift.shift_type_id || shiftTypes[0]?.id || "");
  const initialShiftType = shiftTypes.find((s) => s.id === (shift.shift_type_id || shiftTypes[0]?.id));
  const [startTime, setStartTime] = useState(shift.custom_start_time || initialShiftType?.start_time || "08:00");
  const [endTime, setEndTime] = useState(shift.custom_end_time || initialShiftType?.end_time || "16:00");
  const [tip, setTip] = useState(String(shift.tip ?? 0));
  const [pauseMin, setPauseMin] = useState(shift.pause_override_min ?? "");
  const [status, setStatus] = useState(shift.status || "worked");
  const [note, setNote] = useState(shift.note || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const employer = employers.find((e) => e.id === employerId);
  const shiftType = shiftTypes.find((s) => s.id === shiftTypeId);
  const effectivePause = pauseMin === "" ? (shiftType?.pause_min || 0) : Number(pauseMin);

  const save = async () => {
    if (!date || !employerId || !shiftTypeId) {
      setError("Vyplň datum, zaměstnavatele a typ směny.");
      return;
    }
    setSaving(true);
    setError("");
    const { error: err } = await supabase
      .from("shifts")
      .update({
        employer_id: employerId,
        shift_type_id: shiftTypeId,
        shift_date: date,
        tip: Number(tip) || 0,
        pause_override_min: effectivePause,
        status,
        note: note.trim() || null,
        custom_start_time: startTime,
        custom_end_time: endTime,
        custom_surcharge_pct: shift.custom_surcharge_pct ?? initialShiftType?.surcharge_pct ?? 0,
      })
      .eq("id", shift.id);

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    await onSaved();
    onClose();
  };

  const duplicate = async () => {
    setSaving(true);
    setError("");

    const d = new Date((shift.shift_date || date) + "T00:00:00");
    d.setDate(d.getDate() + 1);
    const nextDate = d.toISOString().slice(0, 10);

    const { error: err } = await supabase.from("shifts").insert({
      user_id: userId,
      employer_id: employerId,
      shift_type_id: shiftTypeId,
      shift_date: nextDate,
      tip: Number(tip) || 0,
      pause_override_min: effectivePause,
      status: "planned",
      note: note.trim() || null,
      custom_start_time: startTime,
      custom_end_time: endTime,
      custom_surcharge_pct: shift.custom_surcharge_pct ?? initialShiftType?.surcharge_pct ?? 0,
    });

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    await onSaved();
    onClose();
  };

  const remove = async () => {
    if (!window.confirm("Opravdu chceš tuto směnu smazat?")) return;
    setSaving(true);
    const { error: err } = await supabase.from("shifts").delete().eq("id", shift.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    await onSaved();
    onClose();
  };

  return (
    <Sheet title="Upravit směnu" onClose={onClose}>
      <Field label="Datum">
        <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <Field label="Zaměstnavatel">
        <select style={inputStyle} value={employerId} onChange={(e) => setEmployerId(e.target.value)}>
          {employers.map((e) => <option key={e.id} value={e.id}>{e.name} ({typeLabel(e.type)})</option>)}
        </select>
      </Field>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Začátek">
            <input type="time" style={inputStyle} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Konec">
            <input type="time" style={inputStyle} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>
      </div>

      <Field label="Pauza (min)">
        <input type="number" min="0" style={inputStyle} value={effectivePause} onChange={(e) => setPauseMin(e.target.value)} />
      </Field>

      {employer?.track_tips !== false && (
        <Field label="Dýška (Kč)">
          <input type="number" min="0" style={inputStyle} value={tip} onChange={(e) => setTip(e.target.value)} />
        </Field>
      )}

      <Field label="Stav směny">
        <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
          {SHIFT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </Field>

      <Field label="Poznámka (nepovinné)">
        <textarea
          style={{ ...inputStyle, minHeight: 88, resize: "vertical" }}
          placeholder="Např. záskok za Kiku"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      <ErrorText>{error}</ErrorText>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={duplicate}
          disabled={saving}
          style={{ flex: 1, border: "none", borderRadius: 12, padding: "12px 0", background: "#E8F1FF", color: C.blue, fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }}
        >
          <Copy size={15} /> Duplikovat
        </button>
        <button
          onClick={remove}
          disabled={saving}
          style={{ flex: 1, border: "none", borderRadius: 12, padding: "12px 0", background: "#FFE9E7", color: C.red, fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }}
        >
          <Trash2 size={15} /> Smazat
        </button>
      </div>

      <PrimaryButton onClick={save} disabled={saving}>{saving ? "Ukládám…" : "Uložit změny"}</PrimaryButton>
    </Sheet>
  );
}

function OverviewScreen({ employers, shiftTypes, shifts, userName }) {
  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  const monthLabel = now.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
  const monthShifts = shifts.filter((s) => s.shift_date.startsWith(monthKey) && !isLiveShift(s));
  const workedShifts = monthShifts.filter((s) => (s.status || "worked") === "worked");
  const plannedShifts = monthShifts.filter((s) => s.status === "planned");

  const totalsForShifts = (items) => {
    let wage = 0, tips = 0, hours = 0;
    items.forEach((s) => {
      const emp = employers.find((e) => e.id === s.employer_id);
      const st = shiftTypes.find((t) => t.id === s.shift_type_id);
      if (!emp || !st) return;
      const effectiveType = resolvedShiftType(s, st);
      wage += payForShift(s, emp, effectiveType);
      tips += Number(s.tip) || 0;
      hours += hoursForShift(s, effectiveType);
    });
    return { wage, tips, hours, total: wage + tips };
  };

  const workedTotals = totalsForShifts(workedShifts);
  const plannedTotals = totalsForShifts(plannedShifts);
  const estimatedTotal = workedTotals.total + plannedTotals.total;

  const perEmployer = employers.map((emp) => {
    const empShifts = workedShifts.filter((s) => s.employer_id === emp.id);
    let wage = 0, tips = 0, hours = 0;
    empShifts.forEach((s) => {
      const st = shiftTypes.find((t) => t.id === s.shift_type_id);
      if (!st) return;
      const effectiveType = resolvedShiftType(s, st);
      wage += payForShift(s, emp, effectiveType);
      tips += Number(s.tip) || 0;
      hours += hoursForShift(s, effectiveType);
    });
    return { ...emp, wage, tips, hours };
  });
  const wageTotal = perEmployer.reduce((a, e) => a + e.wage, 0);
  const tipsTotal = perEmployer.reduce((a, e) => a + e.tips, 0);
  const monthTotal = wageTotal + tipsTotal;
  const monthHours = perEmployer.reduce((a, e) => a + e.hours, 0);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", paddingBottom: 40 }}>
      <p style={{ fontSize: 34, fontWeight: 700, color: C.ink, margin: "12px 20px 0", letterSpacing: "-0.02em" }}>Přehled</p>
      <p style={{ fontSize: 15, color: C.sub, margin: "2px 20px 18px", textTransform: "capitalize" }}>{monthLabel}</p>

      <div style={{ margin: "0 16px", background: C.card, borderRadius: 16, padding: "20px 20px 22px" }}>
        <p style={{ fontSize: 13, color: C.sub, margin: "0 0 4px" }}>Celkem tento měsíc</p>
        <p style={{ fontSize: 40, fontWeight: 700, color: C.ink, margin: "0 0 16px", letterSpacing: "-0.02em" }}>{fmtK(monthTotal)} Kč</p>
        <div style={{ display: "flex", gap: 24 }}>
          <div>
            <p style={{ fontSize: 12, color: C.sub, margin: "0 0 2px" }}>Mzda</p>
            <p style={{ fontSize: 16, fontWeight: 600, color: C.ink, margin: 0 }}>{fmtK(wageTotal)} Kč</p>
          </div>
          <div>
            <p style={{ fontSize: 12, color: C.sub, margin: "0 0 2px" }}>Dýška</p>
            <p style={{ fontSize: 16, fontWeight: 600, color: C.green, margin: 0 }}>{fmtK(tipsTotal)} Kč</p>
          </div>
          <div>
            <p style={{ fontSize: 12, color: C.sub, margin: "0 0 2px" }}>Hodiny</p>
            <p style={{ fontSize: 16, fontWeight: 600, color: C.ink, margin: 0 }}>{Math.round(monthHours * 10) / 10} h</p>
          </div>
        </div>
      </div>

      <div style={{
        margin: "12px 16px 0",
        background: "#EAF3FF",
        borderRadius: 16,
        padding: "16px 18px",
      }}>
        <p style={{ fontSize: 12, color: C.sub, margin: "0 0 4px" }}>Odhad výplaty do konce měsíce</p>
        <p style={{ fontSize: 28, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: "-0.02em" }}>
          {fmtK(estimatedTotal)} Kč
        </p>
        <p style={{ fontSize: 12, color: C.sub, margin: "4px 0 12px" }}>
          Na základě odpracovaných a plánovaných směn
        </p>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <div>
            <p style={{ fontSize: 11, color: C.sub, margin: "0 0 2px" }}>Aktuálně vyděláno</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, margin: 0 }}>{fmtK(workedTotals.total)} Kč</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: C.sub, margin: "0 0 2px" }}>Ještě plánováno</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.blue, margin: 0 }}>{fmtK(plannedTotals.total)} Kč</p>
          </div>
        </div>
      </div>

      {userName && (
        <p style={{ fontSize: 15, color: C.ink, fontWeight: 600, margin: "20px 20px 0" }}>
          Užij si směnu, <span style={{ color: C.blue }}>{userName}</span> 👋
        </p>
      )}
      <SectionHeader>Zaměstnavatelé</SectionHeader>
      {perEmployer.length === 0 ? (
        <p style={{ fontSize: 14, color: C.sub, margin: "0 16px", padding: "16px", textAlign: "center", background: C.card, borderRadius: 12 }}>Zatím žádný zaměstnavatel ani směna.</p>
      ) : (
        <GroupedList>
          {perEmployer.map((e, i) => {
            const EmpIcon = EMPLOYER_ICONS[e.icon] || Coins;
            return (
            <div key={e.id} style={{ padding: "12px 14px", borderBottom: i < perEmployer.length - 1 ? `0.5px solid ${C.line}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <IconBadge Icon={EmpIcon} color={e.icon_color || C.blue} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, color: C.ink, margin: 0 }}>{e.name}</p>
                  <p style={{ fontSize: 12, color: C.sub, margin: "1px 0 0" }}>{typeLabel(e.type)} · {Math.round(e.hours * 10) / 10} h</p>
                </div>
                <span style={{ fontSize: 15, color: C.ink }}>{fmtK(e.wage)} Kč</span>
              </div>
              {e.tips > 0 && <p style={{ fontSize: 12, color: C.green, margin: "6px 0 0 46px" }}>+ {fmtK(e.tips)} Kč dýška</p>}
              {e.monthly_limit && (
                <div style={{ margin: "8px 0 0 46px" }}>
                  <div style={{ height: 5, background: C.line, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (e.wage / e.monthly_limit) * 100)}%`, background: e.wage / e.monthly_limit > 0.85 ? C.red : C.green, borderRadius: 3 }} />
                  </div>
                  <p style={{ fontSize: 11, color: C.sub, margin: "4px 0 0" }}>{fmtK(e.wage)} / {fmtK(e.monthly_limit)} Kč limit DPP</p>
                </div>
              )}
            </div>
            );
          })}
        </GroupedList>
      )}
    </div>
  );
}

function ShiftsScreen({ employers, shiftTypes, shifts, onAdd, onStart, onEdit }) {
  const finished = shifts.filter((s) => !isLiveShift(s));
  const sorted = [...finished].sort((a, b) => (a.shift_date < b.shift_date ? 1 : -1));
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", margin: "12px 20px 18px" }}>
        <p style={{ fontSize: 34, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: "-0.02em" }}>Směny</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onStart} aria-label="Start směny" style={{ display: "flex", alignItems: "center", gap: 5, height: 32, borderRadius: 16, background: C.blue, border: "none", color: "#fff", cursor: "pointer", padding: "0 12px", fontSize: 13, fontWeight: 600 }}>
            <Play size={12} fill="#fff" /> Start
          </button>
          <button onClick={onAdd} style={{ width: 32, height: 32, borderRadius: 16, background: C.blue, border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Přidat směnu ručně"><Plus size={17} /></button>
        </div>
      </div>
      <SectionHeader>Historie</SectionHeader>
      {sorted.length === 0 ? (
        <p style={{ fontSize: 14, color: C.sub, margin: "0 16px", padding: "16px", textAlign: "center", background: C.card, borderRadius: 12 }}>Zatím žádné směny. Spusť Start při příchodu do práce, nebo přidej ručně přes +.</p>
      ) : (
        <GroupedList>
          {sorted.map((s, i) => {
            const emp = employers.find((e) => e.id === s.employer_id);
            const st = shiftTypes.find((t) => t.id === s.shift_type_id);
            if (!emp || !st) return null;
            const effectiveType = resolvedShiftType(s, st);
            const Icon = ICONS[st.icon] || Clock;
            const hours = hoursForShift(s, effectiveType);
            const pay = payForShift(s, emp, effectiveType);
            const dateObj = new Date(s.shift_date + "T00:00:00");
            const statusMeta = shiftStatusMeta(s.status || "worked");

            return (
              <button
                key={s.id}
                onClick={() => onEdit(s)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 14px",
                  border: "none",
                  borderBottom: i < sorted.length - 1 ? `0.5px solid ${C.line}` : "none",
                  background: C.card,
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: FONT,
                }}
              >
                <IconBadge Icon={Icon} color={ICON_COLORS[st.icon] || C.blue} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <p style={{ fontSize: 15, color: C.ink, margin: 0 }}>
                      {shiftTitle(s, st)}
                      {s.custom_start_time && s.custom_end_time ? ` · ${s.custom_start_time}–${s.custom_end_time}` : ""}
                      {s.started_at ? " · živě" : ""}
                    </p>
                    <span style={{ fontSize: 10, fontWeight: 600, color: statusMeta.color, background: statusMeta.bg, borderRadius: 6, padding: "2px 6px" }}>
                      {statusMeta.label}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: C.sub, margin: "1px 0 0" }}>
                    {emp.name} · {typeLabel(emp.type)} · {dateObj.toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" })}
                  </p>
                  {s.note && (
                    <p style={{ fontSize: 11, color: C.sub, margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.note}
                    </p>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontSize: 15, color: C.ink, margin: 0 }}>{fmtK(pay)} Kč</p>
                  <p style={{ fontSize: 12, color: s.tip > 0 ? C.green : C.sub, margin: "1px 0 0" }}>
                    {hours} h{s.tip > 0 ? ` · +${s.tip}` : ""}
                  </p>
                </div>
                <ChevronRight size={16} color={C.line} />
              </button>
            );
          })}
        </GroupedList>
      )}
      <p style={{ fontSize: 12, color: C.sub, margin: "10px 16px 0", textAlign: "center" }}>pauza se odečítá automaticky podle nastavení směny</p>
    </div>
  );
}

function SettingsScreen({ employers, shiftTypes, onAddShiftType, onAddEmployer, onLogout, refresh, session, onProfileUpdated }) {
  const [name, setName] = useState(session?.user?.user_metadata?.full_name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState("");
  const [nameError, setNameError] = useState("");

  useEffect(() => {
    setName(session?.user?.user_metadata?.full_name || "");
  }, [session?.user?.user_metadata?.full_name]);

  const saveName = async () => {
    const cleanName = name.trim();
    if (!cleanName) {
      setNameError("Napiš jméno, které se má zobrazovat v pozdravu.");
      setNameMessage("");
      return;
    }

    setSavingName(true);
    setNameError("");
    setNameMessage("");

    // Uložení jména přímo do Supabase Auth metadata.
    // Když je lokální přihlášení chvíli staré, jednou obnovíme session a zkusíme zápis znovu.
    const writeName = () => supabase.auth.updateUser({
      data: { full_name: cleanName },
    });

    let result = await writeName();

    if (result.error) {
      const refreshed = await supabase.auth.refreshSession();
      if (!refreshed.error && refreshed.data?.session) {
        result = await writeName();
      }
    }

    setSavingName(false);

    if (result.error || !result.data?.user) {
      setNameError("Jméno se teď nepodařilo uložit. Zkus to ještě jednou.");
      return;
    }

    const savedName = result.data.user.user_metadata?.full_name || cleanName;
    setName(savedName);
    onProfileUpdated?.(result.data.user);
    setNameMessage("Uloženo ✓");
  };

  const removeShiftType = async (id) => { await supabase.from("shift_types").delete().eq("id", id); refresh(); };
  const removeEmployer = async (id) => { await supabase.from("employers").delete().eq("id", id); refresh(); };
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", paddingBottom: 40 }}>
      <p style={{ fontSize: 34, fontWeight: 700, color: C.ink, margin: "12px 20px 18px", letterSpacing: "-0.02em" }}>Nastavení</p>

      <SectionHeader>Osobní údaje</SectionHeader>
      <GroupedList>
        <div style={{ padding: "14px" }}>
          <Field label="Tvoje jméno">
            <input
              type="text"
              style={inputStyle}
              value={name}
              placeholder="Např. Kristina"
              onChange={(e) => { setName(e.target.value); setNameMessage(""); setNameError(""); }}
            />
          </Field>
          <p style={{ fontSize: 12, color: C.sub, margin: "-7px 0 12px" }}>Tohle jméno se bude zobrazovat v aplikaci, například v pozdravu.</p>
          <Field label="E-mail">
            <input type="email" style={{ ...inputStyle, background: "#F2F2F7", color: C.sub }} value={session?.user?.email || ""} disabled />
          </Field>
          <ErrorText>{nameError}</ErrorText>
          {nameMessage && <p style={{ fontSize: 13, color: C.green, margin: "4px 0 0" }}>{nameMessage}</p>}
          <PrimaryButton onClick={saveName} disabled={savingName}>{savingName ? "Ukládám…" : "Uložit jméno"}</PrimaryButton>
        </div>
      </GroupedList>

      <SectionHeader>Typy směn</SectionHeader>
      <GroupedList>
        {shiftTypes.map((t, i) => {
          const Icon = ICONS[t.icon] || Sun;
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderBottom: i < shiftTypes.length - 1 ? `0.5px solid ${C.line}` : "none" }}>
              <IconBadge Icon={Icon} color={ICON_COLORS[t.icon] || C.blue} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, color: C.ink, margin: 0 }}>{t.name}</p>
                <p style={{ fontSize: 12, color: C.sub, margin: "1px 0 0" }}>{t.start_time}–{t.end_time} · pauza {t.pause_min} min{t.surcharge_pct ? ` · +${t.surcharge_pct}%` : ""}</p>
              </div>
              <button onClick={() => removeShiftType(t.id)} aria-label="Smazat typ směny" style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={15} color={C.line} /></button>
            </div>
          );
        })}
      </GroupedList>
      <button onClick={onAddShiftType} style={{ width: "calc(100% - 32px)", margin: "10px 16px 24px", border: "none", background: C.card, color: C.blue, borderRadius: 12, padding: "13px 0", fontSize: 15, fontWeight: 500, cursor: "pointer" }}>+ Přidat vlastní typ směny</button>

      <SectionHeader>Zaměstnavatelé</SectionHeader>
      <GroupedList>
        {employers.map((e, i) => {
          const EmpIcon = EMPLOYER_ICONS[e.icon] || Coins;
          return (
          <div key={e.id} style={{ padding: "11px 14px", borderBottom: i < employers.length - 1 ? `0.5px solid ${C.line}` : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
              <IconBadge Icon={EmpIcon} color={e.icon_color || C.blue} small />
              <p style={{ fontSize: 15, color: C.ink, margin: 0, flex: 1 }}>{e.name}</p>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.blue, background: "#E8F1FF", borderRadius: 6, padding: "2px 8px" }}>{typeLabel(e.type)}</span>
              <button onClick={() => removeEmployer(e.id)} aria-label="Smazat zaměstnavatele" style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={14} color={C.line} /></button>
            </div>
            <p style={{ fontSize: 12, color: C.sub, margin: "0 0 2px 40px" }}>{e.rate} Kč / h</p>
            <p style={{ fontSize: 12, color: C.sub, margin: "0 0 0 40px" }}>dýška: {e.track_tips ? "evidovat u každé směny" : "neevidovat"}</p>
          </div>
          );
        })}
      </GroupedList>
      <button onClick={onAddEmployer} style={{ width: "calc(100% - 32px)", margin: "10px 16px 24px", border: "none", background: C.card, color: C.blue, borderRadius: 12, padding: "13px 0", fontSize: 15, fontWeight: 500, cursor: "pointer" }}>+ Přidat zaměstnavatele</button>

      <SectionHeader>Účet</SectionHeader>
      <GroupedList>
        <button onClick={onLogout} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
          <LogOut size={17} color={C.red} />
          <span style={{ fontSize: 15, color: C.red }}>Odhlásit se</span>
        </button>
      </GroupedList>
    </div>
  );
}

function TabBar({ active, setActive }) {
  const tabs = [
    { id: "overview", label: "Přehled", Icon: Home },
    { id: "shifts", label: "Směny", Icon: Calendar },
    { id: "settings", label: "Nastavení", Icon: SettingsIcon },
  ];
  return (
    <div style={{ position: "sticky", bottom: 0, display: "flex", borderTop: `0.5px solid ${C.line}`, background: "rgba(242,242,247,0.92)", backdropFilter: "blur(10px)", padding: "8px 0 calc(8px + env(safe-area-inset-bottom))" }}>
      {tabs.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <button key={id} onClick={() => setActive(id)} style={{ flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer" }}>
            <Icon size={23} strokeWidth={isActive ? 2.3 : 1.8} color={isActive ? C.blue : C.sub} />
            <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400, color: isActive ? C.blue : C.sub }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [active, setActive] = useState("overview");
  const [sheet, setSheet] = useState(null);
  const [selectedShift, setSelectedShift] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  const userName = displayName(session);
  const { employers, shiftTypes, shifts, loading, refresh } = useShiftPayData(userId);
  const liveShift = shifts.find((s) => isLiveShift(s));
  const liveEmployer = liveShift ? employers.find((e) => e.id === liveShift.employer_id) : null;
  const liveShiftType = liveShift ? shiftTypes.find((t) => t.id === liveShift.shift_type_id) : null;

  const stopLiveShift = async () => {
    if (!liveShift) return;
    await supabase.from("shifts").update({ ended_at: new Date().toISOString() }).eq("id", liveShift.id);
    refresh();
  };

  if (session === undefined) return null;
  if (!session) return <Login />;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <TopBrandBar />
      {liveShift && <LiveShiftBanner shift={liveShift} employer={liveEmployer} shiftType={liveShiftType} onStop={stopLiveShift} />}
      <div style={{ flex: 1 }}>
        {loading ? (
          <p style={{ textAlign: "center", color: C.sub, padding: 40 }}>Načítám data…</p>
        ) : (
          <>
            {active === "overview" && <OverviewScreen employers={employers} shiftTypes={shiftTypes} shifts={shifts} userName={userName} />}
            {active === "shifts" && <ShiftsScreen employers={employers} shiftTypes={shiftTypes} shifts={shifts} onAdd={() => setSheet("shift")} onStart={() => setSheet("start")} onEdit={(shift) => { setSelectedShift(shift); setSheet("editShift"); }} />}
            {active === "settings" && <SettingsScreen employers={employers} shiftTypes={shiftTypes} onAddShiftType={() => setSheet("shiftType")} onAddEmployer={() => setSheet("employer")} onLogout={() => supabase.auth.signOut()} refresh={refresh} session={session} onProfileUpdated={(user) => setSession((prev) => prev ? { ...prev, user } : prev)} />}
          </>
        )}
      </div>
      <TabBar active={active} setActive={setActive} />
      {sheet === "shift" && <AddShiftSheet userId={userId} employers={employers} shiftTypes={shiftTypes} onClose={() => setSheet(null)} onSaved={refresh} />}
      {sheet === "editShift" && selectedShift && <EditShiftSheet shift={selectedShift} userId={userId} employers={employers} shiftTypes={shiftTypes} onClose={() => { setSheet(null); setSelectedShift(null); }} onSaved={refresh} />}
      {sheet === "start" && <StartShiftSheet userId={userId} employers={employers} shiftTypes={shiftTypes} onClose={() => setSheet(null)} onSaved={refresh} />}
      {sheet === "employer" && <AddEmployerSheet userId={userId} onClose={() => setSheet(null)} onSaved={refresh} />}
      {sheet === "shiftType" && <AddShiftTypeSheet userId={userId} onClose={() => setSheet(null)} onSaved={refresh} />}
    </div>
  );
}
