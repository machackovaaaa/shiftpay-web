import React, { useState, useEffect, useCallback } from "react";
import { Sun, Sunset, Moon, Clock, Plus, Home, Calendar, Settings as SettingsIcon, Coins, Trash2, LogOut, X, Play, Square, ChevronRight, Briefcase, Megaphone, Martini, UtensilsCrossed, Coffee, ShoppingBag, Truck, Wrench, Copy, Pencil, CircleUserRound } from "lucide-react";
import { supabase } from "./lib/supabase";
import { computeHours, computePay, hoursForShift, payForShift, effectivePauseMin, isLiveShift, liveElapsedLabel, rawDurationLabel, fmtK, typeLabel } from "./lib/calc";
import Login from "./components/Login";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import ExcelJS from "exceljs";

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif";
const C = {
  bg: "var(--sp-bg)", card: "var(--sp-card)", ink: "var(--sp-ink)", sub: "var(--sp-sub)", line: "var(--sp-line)",
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
  { id: "planned", label: "Plánovaná", color: C.blue, bg: "var(--sp-blue-soft)" },
  { id: "worked", label: "Odpracovaná", color: C.green, bg: "var(--sp-green-soft)" },
  { id: "cancelled", label: "Zrušená", color: C.red, bg: "var(--sp-red-soft)" },
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


function consumptionDeduction(shift, employer) {
  const amount = Number(shift?.consumption_amount) || 0;
  const discount = Math.min(100, Math.max(0, Number(employer?.employee_discount_pct) || 0));
  return amount * (1 - discount / 100);
}


const inputStyle = { width: "100%", boxSizing: "border-box", border: `0.5px solid ${C.line}`, borderRadius: 10, padding: "11px 12px", fontSize: 15, fontFamily: FONT, color: C.ink, background: C.card, outline: "none" };
const selectStyle = {
  ...inputStyle,
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%238A8D98' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  backgroundSize: "12px 8px",
  paddingRight: 36,
};
const monthSelectStyle = {
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  background: "var(--sp-control)",
  border: "none",
  borderRadius: 18,
  padding: "8px 34px 8px 12px",
  fontSize: 12,
  fontWeight: 600,
  color: C.ink,
  textTransform: "capitalize",
  whiteSpace: "nowrap",
  outline: "none",
  fontFamily: FONT,
  maxWidth: 145,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%238A8D98' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  backgroundSize: "12px 8px",
};

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

function ProfileButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Otevřít nastavení účtu"
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        border: "none",
        background: "var(--sp-control)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <CircleUserRound size={20} color={C.ink} strokeWidth={1.9} />
    </button>
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
    <div style={{ position: "sticky", top: 0, zIndex: 5, background: "var(--sp-bar)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: `0.5px solid ${C.line}`, padding: "8px 0", display: "flex", justifyContent: "center" }}>
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

function AddShiftSheet({ userId, employers, shiftTypes, onClose, onSaved, initialDate }) {
  const today = new Date().toISOString().slice(0, 10);
  const fallbackShiftType = shiftTypes[0];
  const [date, setDate] = useState(initialDate || today);
  const [employerId, setEmployerId] = useState(employers[0]?.id || "");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [tip, setTip] = useState("");
  const [bonus, setBonus] = useState("");
  const [consumptionAmount, setConsumptionAmount] = useState("");
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
      bonus: Number(bonus) || 0,
      consumption_amount: Number(consumptionAmount) || 0,
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
        <select style={selectStyle} value={employerId} onChange={(e) => setEmployerId(e.target.value)}>
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

      {employer?.track_bonus !== false && (
        <Field label="Bonus (Kč, nepovinné)">
          <input type="number" min="0" style={inputStyle} value={bonus} onChange={(e) => setBonus(e.target.value)} />
        </Field>
      )}

      {employer?.track_consumption === true && (
        <Field label="Jídlo / pití (Kč, před slevou)">
          <input
            type="number"
            min="0"
            style={inputStyle}
            value={consumptionAmount}
            onChange={(e) => setConsumptionAmount(e.target.value)}
            placeholder="0"
          />
          {Number(consumptionAmount) > 0 && (
            <p style={{ fontSize: 11, color: C.sub, margin: "5px 0 0" }}>
              Sleva {Number(employer?.employee_discount_pct) || 0} % · z výplaty se odečte {fmtK(consumptionDeduction({ consumption_amount: consumptionAmount }, employer))} Kč
            </p>
          )}
        </Field>
      )}

      <Field label="Stav směny">
        <select style={selectStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
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
      shift_date: now.toISOString().slice(0, 10), tip: 0, bonus: 0, consumption_amount: 0,
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
        <select style={selectStyle} value={employerId} onChange={(e) => setEmployerId(e.target.value)}>
          {employers.map((e) => <option key={e.id} value={e.id}>{e.name} ({typeLabel(e.type)})</option>)}
        </select>
      </Field>
      <Field label="Typ směny">
        <select style={selectStyle} value={shiftTypeId} onChange={(e) => { setShiftTypeId(e.target.value); setPauseMin(null); }}>
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

function AddEmployerSheet({ userId, onClose, onSaved, employer = null }) {
  const editing = Boolean(employer);

  const [name, setName] = useState(employer?.name || "");
  const [type, setType] = useState(employer?.type || "DPP");
  const [rate, setRate] = useState(String(employer?.rate ?? ""));
  const [trackTips, setTrackTips] = useState(employer?.track_tips !== false);
  const [trackBonus, setTrackBonus] = useState(employer?.track_bonus !== false);
  const [trackConsumption, setTrackConsumption] = useState(employer?.track_consumption === true);
  const [employeeDiscountPct, setEmployeeDiscountPct] = useState(String(employer?.employee_discount_pct ?? 0));
  const [icon, setIcon] = useState(employer?.icon || "Briefcase");
  const [iconColor, setIconColor] = useState(employer?.icon_color || EMPLOYER_COLORS[0]);
  const [monthlyLimit, setMonthlyLimit] = useState(
    employer?.monthly_limit != null
      ? String(employer.monthly_limit)
      : (employer?.type || "DPP") === "DPP"
        ? "10000"
        : ""
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || !rate || Number(rate) <= 0) {
      setError("Vyplň název a hodinovou sazbu.");
      return;
    }

    setSaving(true);
    setError("");

    const payload = {
      name: name.trim(),
      type,
      rate: Number(rate),
      track_tips: trackTips,
      track_bonus: trackBonus,
      track_consumption: trackConsumption,
      employee_discount_pct: Math.min(100, Math.max(0, Number(employeeDiscountPct) || 0)),
      icon,
      icon_color: iconColor,
      monthly_limit: monthlyLimit === "" ? null : Number(monthlyLimit),
    };

    let result;

    if (editing) {
      result = await supabase
        .from("employers")
        .update(payload)
        .eq("id", employer.id);
    } else {
      result = await supabase
        .from("employers")
        .insert({
          user_id: userId,
          ...payload,
        });
    }

    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    await onSaved();
    onClose();
  };

  return (
    <Sheet title={editing ? "Upravit zaměstnavatele" : "Nový zaměstnavatel"} onClose={onClose}>
      <Field label="Název">
        <input
          style={inputStyle}
          placeholder="např. Kavárna Nuance"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Field label="Typ práce">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.keys(EMPLOYER_ICONS).map((name2) => {
            const Ic = EMPLOYER_ICONS[name2];
            const isSel = icon === name2;
            return (
              <button
                key={name2}
                onClick={() => setIcon(name2)}
                type="button"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  width: 62,
                  padding: "8px 4px",
                  borderRadius: 12,
                  cursor: "pointer",
                  border: isSel ? `1.5px solid ${iconColor}` : `0.5px solid ${C.line}`,
                  background: isSel ? "var(--sp-muted-card)" : C.card,
                }}
              >
                <Ic size={17} color={isSel ? iconColor : C.sub} />
                <span style={{ fontSize: 10, color: isSel ? iconColor : C.sub }}>{EMPLOYER_ICON_LABELS[name2]}</span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Barva">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
          {EMPLOYER_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setIconColor(c)}
              type="button"
              aria-label={c}
              style={{
                width: 31,
                height: 31,
                borderRadius: "50%",
                background: c,
                border: iconColor === c ? `2px solid ${C.ink}` : "2px solid transparent",
                cursor: "pointer",
                padding: 0,
              }}
            />
          ))}
        </div>
      </Field>

      <Field label="Typ smlouvy">
        <select
          style={selectStyle}
          value={type}
          onChange={(e) => {
            const nextType = e.target.value;
            setType(nextType);
            if (nextType !== "DPP" && monthlyLimit === "10000") setMonthlyLimit("");
            if (nextType === "DPP" && monthlyLimit === "") setMonthlyLimit("10000");
          }}
        >
          <option value="DPP">DPP</option>
          <option value="DPC">DPČ</option>
        </select>
      </Field>

      <Field label="Hodinová sazba (Kč)">
        <input
          type="number"
          min="0"
          style={inputStyle}
          placeholder="150"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
      </Field>

      <Field label="Měsíční limit (Kč, nepovinné)">
        <input
          type="number"
          min="0"
          style={inputStyle}
          placeholder="např. 10000"
          value={monthlyLimit}
          onChange={(e) => setMonthlyLimit(e.target.value)}
        />
      </Field>

      <Field label="Dýška">
        <button
          onClick={() => setTrackTips((v) => !v)}
          type="button"
          style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          <div style={{ width: 44, height: 26, borderRadius: 13, background: trackTips ? C.green : C.line, position: "relative", transition: "background 0.15s" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: trackTips ? 20 : 2, transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
          </div>
          <span style={{ fontSize: 13, color: C.sub }}>{trackTips ? "evidovat u směn" : "neevidovat"}</span>
        </button>
      </Field>

      <Field label="Bonus">
        <button
          onClick={() => setTrackBonus((v) => !v)}
          type="button"
          style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          <div style={{ width: 44, height: 26, borderRadius: 13, background: trackBonus ? C.green : C.line, position: "relative", transition: "background 0.15s" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: trackBonus ? 20 : 2, transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
          </div>
          <span style={{ fontSize: 13, color: C.sub }}>{trackBonus ? "evidovat u směn" : "neevidovat"}</span>
        </button>
      </Field>

      <Field label="Jídlo / pití strhávané z výplaty">
        <button
          onClick={() => setTrackConsumption((v) => !v)}
          type="button"
          style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          <div style={{ width: 44, height: 26, borderRadius: 13, background: trackConsumption ? C.green : C.line, position: "relative", transition: "background 0.15s" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: trackConsumption ? 20 : 2, transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
          </div>
          <span style={{ fontSize: 13, color: C.sub }}>{trackConsumption ? "evidovat u směn" : "neevidovat"}</span>
        </button>
      </Field>

      {trackConsumption && (
        <Field label="Zaměstnanecká sleva (%)">
          <input
            type="number"
            min="0"
            max="100"
            style={inputStyle}
            value={employeeDiscountPct}
            onChange={(e) => setEmployeeDiscountPct(e.target.value)}
            placeholder="např. 50"
          />
          <p style={{ fontSize: 11, color: C.sub, margin: "5px 0 0" }}>
            Např. při slevě 50 % a útratě 200 Kč se z výplaty odečte 100 Kč.
          </p>
        </Field>
      )}

      <ErrorText>{error}</ErrorText>
      <PrimaryButton onClick={submit} disabled={saving}>
        {saving ? "Ukládám…" : editing ? "Uložit změny" : "Uložit zaměstnavatele"}
      </PrimaryButton>
    </Sheet>
  );
}

function AddShiftTypeSheet({ userId, onClose, onSaved, shiftType = null }) {
  const editing = Boolean(shiftType);
  const [name, setName] = useState(shiftType?.name || "");
  const [start, setStart] = useState(shiftType?.start_time || "08:00");
  const [end, setEnd] = useState(shiftType?.end_time || "16:00");
  const [pauseMin, setPauseMin] = useState(String(shiftType?.pause_min ?? 30));
  const [surchargePct, setSurchargePct] = useState(String(shiftType?.surcharge_pct ?? 0));
  const [icon, setIcon] = useState(shiftType?.icon || "Sun");
  const [color, setColor] = useState(shiftType?.color || ICON_COLORS[shiftType?.icon] || EMPLOYER_COLORS[0]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      setError("Zadej název typu směny.");
      return;
    }

    setSaving(true);
    setError("");

    const payload = {
      name: name.trim(),
      start_time: start,
      end_time: end,
      pause_min: Number(pauseMin) || 0,
      surcharge_pct: Number(surchargePct) || 0,
      icon,
      color,
    };

    let result;
    if (editing) {
      result = await supabase
        .from("shift_types")
        .update(payload)
        .eq("id", shiftType.id);
    } else {
      result = await supabase
        .from("shift_types")
        .insert({
          user_id: userId,
          ...payload,
        });
    }

    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    await onSaved();
    onClose();
  };

  return (
    <Sheet title={editing ? "Upravit typ směny" : "Nový typ směny"} onClose={onClose}>
      <Field label="Název">
        <input
          style={inputStyle}
          placeholder="např. Víkendová"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Začátek">
            <input type="time" style={inputStyle} value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Konec">
            <input type="time" style={inputStyle} value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Pauza (min)">
            <input type="number" min="0" style={inputStyle} value={pauseMin} onChange={(e) => setPauseMin(e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Příplatek (%)">
            <input type="number" min="0" style={inputStyle} value={surchargePct} onChange={(e) => setSurchargePct(e.target.value)} />
          </Field>
        </div>
      </div>

      <Field label="Barva typu směny">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
          {EMPLOYER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              style={{
                width: 31,
                height: 31,
                borderRadius: "50%",
                background: c,
                border: color === c ? `2px solid ${C.ink}` : "2px solid transparent",
                cursor: "pointer",
                padding: 0,
              }}
            />
          ))}
        </div>
      </Field>

      <ErrorText>{error}</ErrorText>
      <PrimaryButton onClick={submit} disabled={saving}>
        {saving ? "Ukládám…" : editing ? "Uložit změny" : "Uložit typ směny"}
      </PrimaryButton>
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
  const [bonus, setBonus] = useState(String(shift.bonus ?? 0));
  const [consumptionAmount, setConsumptionAmount] = useState(String(shift.consumption_amount ?? 0));
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
        bonus: Number(bonus) || 0,
        consumption_amount: Number(consumptionAmount) || 0,
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
      bonus: Number(bonus) || 0,
      consumption_amount: Number(consumptionAmount) || 0,
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
        <select style={selectStyle} value={employerId} onChange={(e) => setEmployerId(e.target.value)}>
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

      {employer?.track_bonus !== false && (
        <Field label="Bonus (Kč)">
          <input type="number" min="0" style={inputStyle} value={bonus} onChange={(e) => setBonus(e.target.value)} />
        </Field>
      )}

      {employer?.track_consumption === true && (
        <Field label="Jídlo / pití (Kč, před slevou)">
          <input
            type="number"
            min="0"
            style={inputStyle}
            value={consumptionAmount}
            onChange={(e) => setConsumptionAmount(e.target.value)}
          />
          {Number(consumptionAmount) > 0 && (
            <p style={{ fontSize: 11, color: C.sub, margin: "5px 0 0" }}>
              Sleva {Number(employer?.employee_discount_pct) || 0} % · z výplaty se odečte {fmtK(consumptionDeduction({ consumption_amount: consumptionAmount }, employer))} Kč
            </p>
          )}
        </Field>
      )}

      <Field label="Stav směny">
        <select style={selectStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
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
          style={{ flex: 1, border: "none", borderRadius: 12, padding: "12px 0", background: "var(--sp-blue-soft)", color: C.blue, fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }}
        >
          <Copy size={15} /> Duplikovat
        </button>
        <button
          onClick={remove}
          disabled={saving}
          style={{ flex: 1, border: "none", borderRadius: 12, padding: "12px 0", background: "var(--sp-loss-soft)", color: C.red, fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }}
        >
          <Trash2 size={15} /> Smazat
        </button>
      </div>

      <PrimaryButton onClick={save} disabled={saving}>{saving ? "Ukládám…" : "Uložit změny"}</PrimaryButton>
    </Sheet>
  );
}

function OverviewScreen({ employers, shiftTypes, shifts, userName, onOpenSettings }) {
  const now = new Date();
  const currentMonthKey = now.toISOString().slice(0, 7);

  const availableMonths = Array.from(new Set([
    currentMonthKey,
    ...shifts.map((s) => (s.shift_date || "").slice(0, 7)).filter(Boolean),
  ])).sort((a, b) => b.localeCompare(a));

  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const [trendYear, setTrendYear] = useState(new Date().getFullYear());

  const monthDate = new Date(`${monthKey}-01T00:00:00`);
  const monthLabel = monthDate.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });

  useEffect(() => {
    setTrendYear(monthDate.getFullYear());
  }, [monthKey]);
  const monthShifts = shifts.filter((s) => s.shift_date.startsWith(monthKey) && !isLiveShift(s));
  const workedShifts = monthShifts.filter((s) => (s.status || "worked") === "worked");
  const plannedShifts = monthShifts.filter((s) => s.status === "planned");
  const cancelledShifts = monthShifts.filter((s) => s.status === "cancelled");

  const totalsForShifts = (items) => {
    let wage = 0, tips = 0, bonuses = 0, deductions = 0, hours = 0;
    items.forEach((s) => {
      const emp = employers.find((e) => e.id === s.employer_id);
      const st = shiftTypes.find((t) => t.id === s.shift_type_id);
      if (!emp || !st) return;
      const effectiveType = resolvedShiftType(s, st);
      wage += payForShift(s, emp, effectiveType);
      tips += Number(s.tip) || 0;
      bonuses += Number(s.bonus) || 0;
      deductions += consumptionDeduction(s, emp);
      hours += hoursForShift(s, effectiveType);
    });
    return { wage, tips, bonuses, deductions, hours, total: wage + tips + bonuses - deductions };
  };

  const workedTotals = totalsForShifts(workedShifts);
  const plannedTotals = totalsForShifts(plannedShifts);
  const estimatedTotal = workedTotals.total + plannedTotals.total;

  const cancelledLoss = cancelledShifts.reduce((sum, s) => {
    const emp = employers.find((e) => e.id === s.employer_id);
    const st = shiftTypes.find((t) => t.id === s.shift_type_id);
    if (!emp || !st) return sum;

    const effectiveType = resolvedShiftType(s, st);

    // U zrušené směny počítáme peníze, které by člověk za směnu získal.
    // Neodečítáme jídlo/pití, protože při zrušené směně k této útratě nedošlo.
    return (
      sum +
      payForShift(s, emp, effectiveType) +
      (Number(s.tip) || 0) +
      (Number(s.bonus) || 0)
    );
  }, 0);


  const wageTotal = workedTotals.wage;
  const tipsTotal = workedTotals.tips;
  const bonusesTotal = workedTotals.bonuses;
  const deductionsTotal = workedTotals.deductions;
  const monthTotal = workedTotals.total;
  const monthHours = workedTotals.hours;

  const monthTotalsForKey = (key) => {
    const items = shifts.filter((s) =>
      s.shift_date?.startsWith(key) &&
      !isLiveShift(s) &&
      (s.status || "worked") === "worked"
    );
    return totalsForShifts(items);
  };

  const previousMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1);
  const previousMonthKey = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const previousTotals = monthTotalsForKey(previousMonthKey);

  const earningsChange = previousTotals.total > 0
    ? ((workedTotals.total - previousTotals.total) / previousTotals.total) * 100
    : null;
  const hoursChange = previousTotals.hours > 0
    ? ((workedTotals.hours - previousTotals.hours) / previousTotals.hours) * 100
    : null;

  // Trendy zobrazují celý vybraný rok, takže jde porovnávat i mezi různými roky.
  const trendMonths = Array.from({ length: 12 }, (_, index) => {
    const d = new Date(trendYear, index, 1);
    const key = `${trendYear}-${String(index + 1).padStart(2, "0")}`;
    const totals = monthTotalsForKey(key);
    return {
      key,
      label: d.toLocaleDateString("cs-CZ", { month: "short" }).replace(".", ""),
      total: totals.total,
      hours: totals.hours,
    };
  });

  const trendMax = Math.max(1, ...trendMonths.map((m) => m.total));

  const lastYearKey = `${monthDate.getFullYear() - 1}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
  const lastYearTotals = monthTotalsForKey(lastYearKey);
  const yearEarningsChange = lastYearTotals.total > 0
    ? ((workedTotals.total - lastYearTotals.total) / lastYearTotals.total) * 100
    : null;
  const yearHoursChange = lastYearTotals.hours > 0
    ? ((workedTotals.hours - lastYearTotals.hours) / lastYearTotals.hours) * 100
    : null;

  const upcoming = [...plannedShifts]
    .sort((a, b) => a.shift_date.localeCompare(b.shift_date))
    .slice(0, 3);

  const tile = (label, value, bg, color = C.ink) => (
    <div style={{
      background: bg,
      borderRadius: 14,
      padding: "13px 12px",
      minHeight: 78,
      boxSizing: "border-box",
    }}>
      <p style={{ fontSize: 11, color: C.sub, margin: "0 0 5px" }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 700, color, margin: 0, letterSpacing: "-0.01em" }}>{value}</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, margin: "14px 18px 0" }}>
        <div>
          <p style={{ fontSize: 36, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: "-0.035em", lineHeight: 1.05 }}>Přehled</p>
          {userName && (
            <p style={{ fontSize: 14, color: C.ink, fontWeight: 600, margin: "7px 0 0" }}>
              Užij si další směnu, <span style={{ color: C.blue }}>{userName}</span> 👋
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
            style={monthSelectStyle}
            aria-label="Vybrat měsíc"
          >
            {availableMonths.map((key) => {
              const d = new Date(`${key}-01T00:00:00`);
              const label = d.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
              return <option key={key} value={key}>{label}</option>;
            })}
          </select>

          <ProfileButton onClick={onOpenSettings} />
        </div>
      </div>

      <div style={{
        margin: "22px 16px 0",
        background: "linear-gradient(135deg, var(--sp-purple-soft) 0%, var(--sp-blue-soft) 100%)",
        borderRadius: 18,
        padding: "18px 18px 16px",
        boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <p style={{ fontSize: 12, color: C.ink, fontWeight: 600, margin: "0 0 6px" }}>Odhad výplaty do konce měsíce</p>
            <p style={{ fontSize: 31, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: "-0.03em" }}>{fmtK(estimatedTotal)} Kč</p>
            <p style={{ fontSize: 11, color: C.sub, margin: "5px 0 0" }}>Na základě odpracovaných a plánovaných směn</p>
          </div>
          <div style={{ width: 40, height: 40, borderRadius: 14, background: "rgba(255,255,255,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Coins size={19} color={C.blue} />
          </div>
        </div>
        <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "14px 0 12px" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <p style={{ fontSize: 10, color: C.sub, margin: "0 0 2px" }}>Aktuálně vyděláno</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.green, margin: 0 }}>{fmtK(workedTotals.total)} Kč</p>
          </div>
          <div>
            <p style={{ fontSize: 10, color: C.sub, margin: "0 0 2px" }}>Ještě naplánováno</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.blue, margin: 0 }}>{fmtK(plannedTotals.total)} Kč</p>
          </div>
        </div>
      </div>

      <div style={{ margin: "14px 16px 0", background: C.card, borderRadius: 18, padding: "15px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Calendar size={17} color={C.blue} />
            <p style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: 0 }}>Souhrn měsíce</p>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {tile("Počet směn", String(workedShifts.length), "var(--sp-blue-soft)", C.blue)}
          {tile("Odpracováno", `${Math.round(monthHours * 10) / 10} h`, "var(--sp-teal-soft)", "var(--sp-teal-text)")}
          {tile("Mzda", `${fmtK(wageTotal)} Kč`, "var(--sp-wage-soft)", "var(--sp-wage-text)")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginTop: 8 }}>
          {tile("Dýška", `${fmtK(tipsTotal)} Kč`, "var(--sp-tip-soft)", "var(--sp-tip-text)")}
          {tile("Bonusy", `${fmtK(bonusesTotal)} Kč`, "var(--sp-bonus-soft)", "var(--sp-bonus-text)")}
          {tile("Jídlo / pití", `−${fmtK(deductionsTotal)} Kč`, "var(--sp-deduction-soft)", "var(--sp-deduction-text)")}
          {tile("Celkem", `${fmtK(monthTotal)} Kč`, "var(--sp-total-soft)", "var(--sp-total-text)")}
        </div>
      </div>

      <div style={{ margin: "14px 16px 0", background: C.card, borderRadius: 18, padding: "15px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: 0 }}>Trendy</p>
            <p style={{ fontSize: 11, color: C.sub, margin: "4px 0 0" }}>Porovnání měsíců a roků</p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={() => setTrendYear((year) => year - 1)}
              aria-label="Předchozí rok"
              style={{ width: 28, height: 28, borderRadius: 9, border: "none", background: "var(--sp-muted-card)", color: C.ink, cursor: "pointer", fontSize: 17 }}
            >
              ‹
            </button>
            <span style={{ minWidth: 42, textAlign: "center", fontSize: 12, fontWeight: 700, color: C.ink }}>{trendYear}</span>
            <button
              type="button"
              onClick={() => setTrendYear((year) => year + 1)}
              aria-label="Další rok"
              style={{ width: 28, height: 28, borderRadius: 9, border: "none", background: "var(--sp-muted-card)", color: C.ink, cursor: "pointer", fontSize: 17 }}
            >
              ›
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 13 }}>
          <div style={{ background: "var(--sp-muted-card)", borderRadius: 13, padding: "11px 12px" }}>
            <p style={{ fontSize: 10, color: C.sub, margin: 0 }}>Vybraný měsíc</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: C.ink, margin: "4px 0 0" }}>{fmtK(workedTotals.total)} Kč</p>
          </div>
          <div style={{ background: "var(--sp-muted-card)", borderRadius: 13, padding: "11px 12px" }}>
            <p style={{ fontSize: 10, color: C.sub, margin: 0 }}>Předchozí měsíc</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: C.ink, margin: "4px 0 0" }}>{fmtK(previousTotals.total)} Kč</p>
          </div>
          <div style={{ background: "var(--sp-muted-card)", borderRadius: 13, padding: "11px 12px" }}>
            <p style={{ fontSize: 10, color: C.sub, margin: 0 }}>Stejný měsíc loni</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: C.ink, margin: "4px 0 0" }}>{fmtK(lastYearTotals.total)} Kč</p>
          </div>
        </div>

        <div style={{ marginTop: 15 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", alignItems: "end", gap: 4, height: 96 }}>
            {trendMonths.map((m) => {
              const height = m.total <= 0 ? 5 : Math.max(10, Math.round((m.total / trendMax) * 78));
              const active = m.key === monthKey;
              return (
                <div key={m.key} style={{ minWidth: 0, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 5 }}>
                  <button
                    type="button"
                    onClick={() => setMonthKey(m.key)}
                    title={`${m.label}: ${fmtK(m.total)} Kč`}
                    aria-label={`Zobrazit ${m.label}, ${fmtK(m.total)} Kč`}
                    style={{
                      width: "72%",
                      maxWidth: 24,
                      height,
                      border: "none",
                      padding: 0,
                      borderRadius: "7px 7px 4px 4px",
                      background: active ? C.blue : "var(--sp-trend)",
                      cursor: "pointer",
                      transition: "transform 120ms ease, background 120ms ease",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setMonthKey(m.key)}
                    style={{
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      cursor: "pointer",
                      fontFamily: FONT,
                      fontSize: 9,
                      color: active ? C.blue : C.sub,
                      fontWeight: active ? 700 : 500,
                      textTransform: "capitalize",
                    }}
                  >
                    {m.label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ height: 1, background: C.line, margin: "13px 0 11px" }} />

        <div style={{ background: "var(--sp-muted-card)", borderRadius: 13, padding: "12px" }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: C.sub, margin: "0 0 9px" }}>
            Srovnání
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "7px 12px", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: C.ink }}>Výdělek</span>
            <span style={{ fontSize: 10, color: C.sub, textAlign: "right" }}>vs. měsíc</span>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: earningsChange == null ? C.sub : earningsChange >= 0 ? C.green : C.red,
              textAlign: "right",
              whiteSpace: "nowrap"
            }}>
              {earningsChange == null ? "—" : `${earningsChange >= 0 ? "+" : ""}${Math.round(earningsChange)} %`}
            </span>

            <span style={{ fontSize: 11, color: C.ink }}></span>
            <span style={{ fontSize: 10, color: C.sub, textAlign: "right" }}>vs. loni</span>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: yearEarningsChange == null ? C.sub : yearEarningsChange >= 0 ? C.green : C.red,
              textAlign: "right",
              whiteSpace: "nowrap"
            }}>
              {yearEarningsChange == null ? "—" : `${yearEarningsChange >= 0 ? "+" : ""}${Math.round(yearEarningsChange)} %`}
            </span>

            <div style={{ gridColumn: "1 / -1", height: 1, background: C.line, margin: "2px 0" }} />

            <span style={{ fontSize: 11, color: C.ink }}>Hodiny</span>
            <span style={{ fontSize: 10, color: C.sub, textAlign: "right" }}>vs. měsíc</span>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: hoursChange == null ? C.sub : hoursChange >= 0 ? C.green : C.red,
              textAlign: "right",
              whiteSpace: "nowrap"
            }}>
              {hoursChange == null ? "—" : `${hoursChange >= 0 ? "+" : ""}${Math.round(hoursChange)} %`}
            </span>

            <span style={{ fontSize: 11, color: C.ink }}></span>
            <span style={{ fontSize: 10, color: C.sub, textAlign: "right" }}>vs. loni</span>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: yearHoursChange == null ? C.sub : yearHoursChange >= 0 ? C.green : C.red,
              textAlign: "right",
              whiteSpace: "nowrap"
            }}>
              {yearHoursChange == null ? "—" : `${yearHoursChange >= 0 ? "+" : ""}${Math.round(yearHoursChange)} %`}
            </span>
          </div>
        </div>

        <div
          style={{
            marginTop: 8,
            background: "var(--sp-red-soft)",
            borderRadius: 13,
            padding: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <p style={{ fontSize: 10, color: C.sub, margin: 0 }}>Ztráta</p>
            <p style={{ fontSize: 11, color: C.sub, margin: "4px 0 0" }}>
              {cancelledShifts.length === 0
                ? "Žádné zrušené směny"
                : `${cancelledShifts.length} ${cancelledShifts.length === 1 ? "zrušená směna" : cancelledShifts.length < 5 ? "zrušené směny" : "zrušených směn"}`}
            </p>
          </div>

          <p
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: cancelledLoss > 0 ? "var(--sp-loss-text)" : C.sub,
              margin: 0,
              whiteSpace: "nowrap",
            }}
          >
            {cancelledLoss > 0 ? `−${fmtK(cancelledLoss)} Kč` : "0 Kč"}
          </p>
        </div>
      </div>


    </div>
  );
}
function SwipeableShiftRow({ children, onEdit, onDelete, isLast }) {
  const [offset, setOffset] = useState(0);
  const [startX, setStartX] = useState(null);
  const [dragging, setDragging] = useState(false);
  const deleteWidth = 86;

  const onTouchStart = (e) => {
    setStartX(e.touches[0].clientX);
    setDragging(false);
  };

  const onTouchMove = (e) => {
    if (startX == null) return;
    const dx = e.touches[0].clientX - startX;
    if (Math.abs(dx) > 6) setDragging(true);
    const next = Math.max(-deleteWidth, Math.min(0, dx + (offset < 0 ? -deleteWidth : 0)));
    setOffset(next);
  };

  const onTouchEnd = () => {
    if (offset < -42) setOffset(-deleteWidth);
    else setOffset(0);
    setStartX(null);
    setTimeout(() => setDragging(false), 0);
  };

  return (
    <div style={{ position: "relative", overflow: "hidden", borderBottom: isLast ? "none" : `0.5px solid ${C.line}` }}>
      <button
        onClick={async () => {
          await onDelete();
          setOffset(0);
        }}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: deleteWidth,
          border: "none",
          background: C.red,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
        aria-label="Smazat směnu"
      >
        <Trash2 size={20} />
      </button>

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => {
          if (dragging) return;
          if (offset < 0) {
            setOffset(0);
            return;
          }
          onEdit();
        }}
        style={{
          transform: `translateX(${offset}px)`,
          transition: startX == null ? "transform 180ms ease" : "none",
          background: C.card,
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ShiftsScreen({ employers, shiftTypes, shifts, onAdd, onStart, onEdit, refresh, onOpenSettings }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [employerFilter, setEmployerFilter] = useState("all");

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  const mondayOf = (date) => {
    const d = new Date(date);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const thisMonday = mondayOf(today);
  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(nextMonday.getDate() + 7);
  const afterNextMonday = new Date(thisMonday);
  afterNextMonday.setDate(afterNextMonday.getDate() + 14);

  const dateKey = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const allFinished = shifts.filter((s) => !isLiveShift(s));

  const matchesFilters = (s) => {
    const statusOk = statusFilter === "all" || (s.status || "worked") === statusFilter;
    const employerOk = employerFilter === "all" || s.employer_id === employerFilter;
    return statusOk && employerOk;
  };

  const filtered = allFinished.filter(matchesFilters);

  const thisWeek = filtered
    .filter((s) => s.shift_date >= dateKey(thisMonday) && s.shift_date < dateKey(nextMonday))
    .sort((a, b) => a.shift_date.localeCompare(b.shift_date));

  const nextWeek = filtered
    .filter((s) => s.shift_date >= dateKey(nextMonday) && s.shift_date < dateKey(afterNextMonday))
    .sort((a, b) => a.shift_date.localeCompare(b.shift_date));

  const older = filtered
    .filter((s) => s.shift_date < dateKey(thisMonday))
    .sort((a, b) => b.shift_date.localeCompare(a.shift_date));

  const future = filtered
    .filter((s) => s.shift_date >= todayKey && (s.status || "worked") === "planned")
    .sort((a, b) => a.shift_date.localeCompare(b.shift_date));

  const nextShift = future[0] || null;

  const statusCounts = {
    all: allFinished.length,
    planned: allFinished.filter((s) => s.status === "planned").length,
    worked: allFinished.filter((s) => (s.status || "worked") === "worked").length,
    cancelled: allFinished.filter((s) => s.status === "cancelled").length,
  };

  const sectionSummary = (items) => {
    let hours = 0;
    let total = 0;
    items.forEach((s) => {
      const emp = employers.find((e) => e.id === s.employer_id);
      const st = shiftTypes.find((t) => t.id === s.shift_type_id);
      if (!emp || !st) return;
      const effectiveType = resolvedShiftType(s, st);
      hours += hoursForShift(s, effectiveType);
      total += payForShift(s, emp, effectiveType) + (Number(s.tip) || 0) + (Number(s.bonus) || 0) - consumptionDeduction(s, emp);
    });
    return `${items.length} ${items.length === 1 ? "směna" : items.length >= 2 && items.length <= 4 ? "směny" : "směn"} · ${Math.round(hours * 10) / 10} h · ${fmtK(total)} Kč`;
  };

  const renderShift = (s, i, items) => {
    const emp = employers.find((e) => e.id === s.employer_id);
    const st = shiftTypes.find((t) => t.id === s.shift_type_id);
    if (!emp || !st) return null;

    const effectiveType = resolvedShiftType(s, st);
    const hours = hoursForShift(s, effectiveType);
    const pay = payForShift(s, emp, effectiveType);
    const statusMeta = shiftStatusMeta(s.status || "worked");
    const dateObj = new Date(s.shift_date + "T00:00:00");

    return (
      <SwipeableShiftRow
        key={s.id}
        isLast={i === items.length - 1}
        onEdit={() => onEdit(s)}
        onDelete={async () => {
          await supabase.from("shifts").delete().eq("id", s.id);
          await refresh();
        }}
      >
        <div
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            background: C.card,
            cursor: "pointer",
            fontFamily: FONT,
            boxSizing: "border-box",
          }}
        >
          <div style={{ width: 42, flexShrink: 0 }}>
            <p style={{ fontSize: 11, color: C.ink, margin: 0, fontWeight: 600, textTransform: "capitalize" }}>
              {dateObj.toLocaleDateString("cs-CZ", { weekday: "short" })}
            </p>
            <p style={{ fontSize: 11, color: C.sub, margin: "2px 0 0" }}>
              {dateObj.getDate()}. {dateObj.getMonth() + 1}.
            </p>
          </div>

          <div
            style={{
              width: 4,
              alignSelf: "stretch",
              minHeight: 44,
              borderRadius: 4,
              background: s.status === "cancelled" ? C.line : (emp.icon_color || C.blue),
              flexShrink: 0,
            }}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, margin: 0 }}>{emp.name}</p>
            <p style={{ fontSize: 11, color: C.sub, margin: "3px 0 0" }}>
              {effectiveType.start_time}–{effectiveType.end_time} · {typeLabel(emp.type)}
            </p>
            {s.note && (
              <p style={{ fontSize: 10, color: C.sub, margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.note}
              </p>
            )}
          </div>

          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: statusMeta.color,
              background: statusMeta.bg,
              borderRadius: 8,
              padding: "3px 7px",
              whiteSpace: "nowrap",
            }}
          >
            {statusMeta.label}
          </span>

          <div style={{ textAlign: "right", flexShrink: 0, minWidth: 62 }}>
            <p style={{ fontSize: 13, color: C.ink, margin: 0 }}>{fmtK(pay + (Number(s.tip) || 0) + (Number(s.bonus) || 0) - consumptionDeduction(s, emp))} Kč</p>
            <p style={{ fontSize: 11, color: C.sub, margin: "2px 0 0" }}>{Math.round(hours * 10) / 10} h</p>
          </div>

          <ChevronRight size={15} color={C.line} />
        </div>
      </SwipeableShiftRow>
    );
  };

  const renderSection = (title, items, summary, extraRight = null) => {
    if (items.length === 0) return null;
    return (
      <div style={{ margin: "18px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
          <p style={{ fontSize: 17, fontWeight: 700, color: C.ink, margin: 0 }}>{title}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {extraRight}
            {summary && <p style={{ fontSize: 11, color: C.sub, margin: 0 }}>{summary}</p>}
          </div>
        </div>
        <div style={{ background: C.card, borderRadius: 16, overflow: "hidden" }}>
          {items.map((s, i) => renderShift(s, i, items))}
        </div>
      </div>
    );
  };

  const filterChip = (id, label) => {
    const active = statusFilter === id;
    return (
      <button
        onClick={() => setStatusFilter(id)}
        style={{
          border: "none",
          borderRadius: 16,
          padding: "8px 11px",
          background: active ? "var(--sp-blue-soft)" : C.card,
          color: active ? C.blue : C.ink,
          fontSize: 11,
          fontWeight: active ? 700 : 500,
          cursor: "pointer",
          fontFamily: FONT,
          whiteSpace: "nowrap",
        }}
      >
        {label} ({statusCounts[id]})
      </button>
    );
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", margin: "12px 20px 0", gap: 12 }}>
        <div>
          <p style={{ fontSize: 34, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: "-0.025em" }}>Směny</p>
          <p style={{ fontSize: 12, color: C.sub, margin: "5px 0 0" }}>Spravuj své směny na jednom místě</p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={onStart}
            aria-label="Start směny"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              height: 34,
              borderRadius: 17,
              background: C.blue,
              border: "none",
              color: "#fff",
              cursor: "pointer",
              padding: "0 13px",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Play size={12} fill="#fff" /> Start
          </button>
          <button
            onClick={onAdd}
            style={{ width: 34, height: 34, borderRadius: 17, background: C.blue, border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            aria-label="Přidat směnu"
          >
            <Plus size={17} />
          </button>
          <ProfileButton onClick={onOpenSettings} />
        </div>
      </div>

      <div style={{ margin: "16px 16px 0", display: "flex", gap: 7, overflowX: "auto", paddingBottom: 2 }}>
        {filterChip("all", "Všechny")}
        {filterChip("planned", "Plánované")}
        {filterChip("worked", "Odpracované")}
        {filterChip("cancelled", "Zrušené")}
      </div>

      <div style={{ margin: "10px 16px 0" }}>
        <select
          value={employerFilter}
          onChange={(e) => setEmployerFilter(e.target.value)}
          style={{ ...selectStyle, background: C.card, borderRadius: 14, fontSize: 12 }}
        >
          <option value="all">Všichni zaměstnavatelé</option>
          {employers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      <button
        onClick={onAdd}
        style={{
          margin: "12px 16px 0",
          width: "calc(100% - 32px)",
          border: "none",
          background: C.card,
          borderRadius: 16,
          padding: "13px 14px",
          display: "flex",
          alignItems: "center",
          gap: 11,
          cursor: "pointer",
          textAlign: "left",
          fontFamily: FONT,
        }}
      >
        <div style={{ width: 34, height: 34, borderRadius: 12, background: "var(--sp-blue-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: C.blue }}>
          <Plus size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.ink, margin: 0 }}>Rychle přidat směnu</p>
          <p style={{ fontSize: 11, color: C.sub, margin: "3px 0 0" }}>Vyber datum a vytvoř novou směnu</p>
        </div>
        <ChevronRight size={16} color={C.sub} />
      </button>

      {nextShift && (() => {
        const emp = employers.find((e) => e.id === nextShift.employer_id);
        const st = shiftTypes.find((t) => t.id === nextShift.shift_type_id);
        if (!emp || !st) return null;
        const effectiveType = resolvedShiftType(nextShift, st);
        const hours = hoursForShift(nextShift, effectiveType);
        const pay = payForShift(nextShift, emp, effectiveType);
        const d = new Date(nextShift.shift_date + "T00:00:00");
        const diffDays = Math.max(0, Math.ceil((d - new Date(todayKey + "T00:00:00")) / 86400000));

        return (
          <button
            onClick={() => onEdit(nextShift)}
            style={{
              margin: "14px 16px 0",
              width: "calc(100% - 32px)",
              border: "1px solid #D9E8FF",
              background: "var(--sp-blue-panel)",
              borderRadius: 18,
              padding: "15px 16px",
              textAlign: "left",
              cursor: "pointer",
              fontFamily: FONT,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.blue, margin: 0 }}>Nejbližší směna</p>
              <p style={{ fontSize: 11, color: C.sub, margin: 0 }}>{diffDays === 0 ? "dnes" : diffDays === 1 ? "zítra" : `za ${diffDays} dny`}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <div style={{ width: 4, alignSelf: "stretch", minHeight: 46, borderRadius: 4, background: emp.icon_color || C.blue }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: 0 }}>{emp.name}</p>
                <p style={{ fontSize: 11, color: C.sub, margin: "4px 0 0" }}>
                  {d.toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", year: "numeric" })} · {effectiveType.start_time}–{effectiveType.end_time} · {typeLabel(emp.type)}
                </p>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.blue, background: "var(--sp-blue-soft)", borderRadius: 8, padding: "3px 7px" }}>Plánovaná</span>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{ fontSize: 13, color: C.ink, margin: 0 }}>{fmtK(pay + (Number(nextShift.tip) || 0))} Kč</p>
                <p style={{ fontSize: 11, color: C.sub, margin: "2px 0 0" }}>{Math.round(hours * 10) / 10} h</p>
              </div>
              <ChevronRight size={15} color={C.blue} />
            </div>
          </button>
        );
      })()}

      {renderSection("Tento týden", thisWeek, sectionSummary(thisWeek))}
      {renderSection("Příští týden", nextWeek, sectionSummary(nextWeek))}

      {older.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {renderSection("Starší směny", older, null)}
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ margin: "18px 16px 0", background: C.card, borderRadius: 16, padding: "22px 16px", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: C.sub, margin: 0 }}>Pro vybrané filtry tu zatím nejsou žádné směny.</p>
        </div>
      )}

      <p style={{ fontSize: 11, color: C.sub, margin: "16px 16px 0", textAlign: "center" }}>
        Pauza se odečítá automaticky podle nastavení směny
      </p>
    </div>
  );
}


function ImportShiftsSheet({ userId, employers, shiftTypes, shifts, initialMonthKey, onClose, onSaved }) {
  const [employerId, setEmployerId] = useState(employers[0]?.id || "");
  const [monthKey, setMonthKey] = useState(initialMonthKey || new Date().toISOString().slice(0, 7));
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [importing, setImporting] = useState(false);

  const fallbackShiftType = shiftTypes[0];

  const cellText = (cell) => {
    if (!cell) return "";
    const value = cell.value;
    if (value == null) return "";
    if (typeof value === "object") {
      if (Array.isArray(value.richText)) return value.richText.map((x) => x.text || "").join("");
      if ("result" in value && value.result != null) return String(value.result);
      if ("text" in value && value.text != null) return String(value.text);
    }
    return String(cell.text ?? value ?? "").trim();
  };

  const normalize = (value) =>
    String(value || "")
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const parseTimeCell = (cell) => {
    if (!cell) return "";
    const value = cell.value;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      const fraction = ((value % 1) + 1) % 1;
      const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
      const hh = Math.floor(totalMinutes / 60);
      const mm = totalMinutes % 60;
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }

    const text = cellText(cell).replace(".", ":");
    const match = text.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
    if (!match) return "";
    const hh = Math.min(23, Math.max(0, Number(match[1])));
    const mm = Math.min(59, Math.max(0, Number(match[2])));
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  const parseNumberCell = (cell) => {
    if (!cell) return 0;
    if (typeof cell.value === "number" && Number.isFinite(cell.value)) return cell.value;
    const raw = cellText(cell)
      .replace(/\s/g, "")
      .replace(/\u00a0/g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  };

  const parseDayCell = (cell) => {
    if (!cell) return null;
    const value = cell.value;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.getDate();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      if (value >= 1 && value <= 31) return Math.trunc(value);

      // Excel serial date fallback.
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const date = new Date(epoch.getTime() + Math.trunc(value) * 86400000);
      const day = date.getUTCDate();
      return day >= 1 && day <= 31 ? day : null;
    }

    const text = cellText(cell);
    const match = text.match(/\b([0-3]?\d)\b/);
    const day = match ? Number(match[1]) : NaN;
    return day >= 1 && day <= 31 ? day : null;
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    setError("");
    setInfo("");
    setRows([]);
    setFileName(file?.name || "");

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Nahraj prosím soubor .xlsx. V Google Sheets zvol Soubor → Stáhnout → Microsoft Excel (.xlsx).");
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const sheet = workbook.worksheets[0];
      if (!sheet) {
        setError("V souboru jsem nenašla žádný list.");
        return;
      }

      let headerRowNumber = null;
      let columns = null;

      for (let r = 1; r <= Math.min(sheet.rowCount, 25); r += 1) {
        const row = sheet.getRow(r);
        const found = {};

        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const label = normalize(cellText(cell));
          if (label === "OD") found.from = colNumber;
          if (label === "DO") found.to = colNumber;
          if (label === "BONUSY" || label === "BONUS") found.bonus = colNumber;
          if (label === "DATUM" || label === "DEN") found.day = colNumber;
        });

        if (found.from && found.to && found.day) {
          headerRowNumber = r;
          columns = found;
          break;
        }
      }

      if (!headerRowNumber || !columns) {
        setError("Nenašla jsem sloupce OD, DO a Datum. Tenhle import je nastavený na tabulku jako na tvém screenshotu.");
        return;
      }

      const parsed = [];

      for (let r = headerRowNumber + 1; r <= sheet.rowCount; r += 1) {
        const row = sheet.getRow(r);

        const firstTexts = [];
        row.eachCell({ includeEmpty: false }, (cell) => firstTexts.push(normalize(cellText(cell))));
        if (firstTexts.some((x) => x === "CELKEM")) break;

        const day = parseDayCell(row.getCell(columns.day));
        const start = parseTimeCell(row.getCell(columns.from));
        const end = parseTimeCell(row.getCell(columns.to));
        const bonus = columns.bonus ? parseNumberCell(row.getCell(columns.bonus)) : 0;

        if (!day || !start || !end) continue;

        parsed.push({
          sourceRow: r,
          day,
          start,
          end,
          bonus: Math.max(0, Math.round(bonus * 100) / 100),
        });
      }

      if (parsed.length === 0) {
        setError("V tabulce jsem nenašla žádné směny s vyplněnými časy OD a DO.");
        return;
      }

      setRows(parsed);
      setInfo(`Našla jsem ${parsed.length} směn. Zkontroluj měsíc a zaměstnavatele a pak je můžeš importovat.`);
    } catch (e) {
      console.error(e);
      setError("Soubor se nepodařilo přečíst. Zkus ho z Google Sheets stáhnout jako .xlsx.");
    }
  };

  const doImport = async () => {
    setError("");

    if (!employerId) {
      setError("Vyber zaměstnavatele.");
      return;
    }

    if (!monthKey) {
      setError("Vyber měsíc, do kterého směny patří.");
      return;
    }

    if (!fallbackShiftType?.id) {
      setError("V Nastavení musí existovat alespoň jeden typ směny.");
      return;
    }

    if (rows.length === 0) {
      setError("Nejdřív nahraj tabulku se směnami.");
      return;
    }

    const [year, month] = monthKey.split("-").map(Number);
    const maxDay = new Date(year, month, 0).getDate();

    const candidates = rows
      .filter((row) => row.day <= maxDay)
      .map((row) => ({
        ...row,
        shiftDate: `${monthKey}-${String(row.day).padStart(2, "0")}`,
      }));

    const existingKeys = new Set(
      shifts
        .filter((s) => s.employer_id === employerId)
        .map((s) => `${s.shift_date}|${s.custom_start_time || ""}|${s.custom_end_time || ""}`)
    );

    const unique = candidates.filter(
      (row) => !existingKeys.has(`${row.shiftDate}|${row.start}|${row.end}`)
    );

    const skipped = candidates.length - unique.length;

    if (unique.length === 0) {
      setError("Všechny nalezené směny už ve Spay vypadají jako importované.");
      return;
    }

    const payload = unique.map((row) => ({
      user_id: userId,
      employer_id: employerId,
      shift_type_id: fallbackShiftType.id,
      shift_date: row.shiftDate,
      tip: 0,
      bonus: row.bonus || 0,
      consumption_amount: 0,
      pause_override_min: 0,
      status: "worked",
      note: "Importováno z Google Sheets",
      custom_start_time: row.start,
      custom_end_time: row.end,
      custom_surcharge_pct: 0,
    }));

    setImporting(true);

    const { error: insertError } = await supabase.from("shifts").insert(payload);

    setImporting(false);

    if (insertError) {
      setError(insertError.message || "Směny se nepodařilo importovat.");
      return;
    }

    await onSaved();
    setInfo(
      skipped > 0
        ? `Importováno ${unique.length} směn. ${skipped} duplicitních směn jsem přeskočila.`
        : `Hotovo — importováno ${unique.length} směn včetně bonusů.`
    );

    setTimeout(() => onClose(), 650);
  };

  if (employers.length === 0) {
    return (
      <Sheet title="Import směn" onClose={onClose}>
        <p style={{ fontSize: 14, color: C.sub, margin: 0 }}>
          Nejdřív přidej zaměstnavatele v Nastavení.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet title="Import směn" onClose={onClose}>
      <div style={{ background: C.card, borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: C.ink, margin: 0 }}>
          Google Sheets → Spay
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.45, color: C.sub, margin: "5px 0 0" }}>
          V Google Sheets dej Soubor → Stáhnout → Microsoft Excel (.xlsx). Spay z tabulky načte sloupce OD, DO, BONUSY a Datum.
        </p>
      </div>

      <Field label="Zaměstnavatel">
        <select style={selectStyle} value={employerId} onChange={(e) => setEmployerId(e.target.value)}>
          {employers.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name} ({typeLabel(emp.type)})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Měsíc tabulky">
        <input
          type="month"
          style={inputStyle}
          value={monthKey}
          onChange={(e) => setMonthKey(e.target.value)}
        />
      </Field>

      <Field label="Soubor z Google Sheets">
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleFile}
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: C.card,
            color: C.ink,
            border: `0.5px solid ${C.line}`,
            borderRadius: 12,
            padding: "12px",
            fontFamily: FONT,
            fontSize: 13,
          }}
        />
        {fileName && (
          <p style={{ fontSize: 11, color: C.sub, margin: "6px 0 0" }}>{fileName}</p>
        )}
      </Field>

      {rows.length > 0 && (
        <div style={{ background: C.card, borderRadius: 14, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ padding: "11px 12px", borderBottom: `0.5px solid ${C.line}` }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.ink, margin: 0 }}>
              Náhled importu · {rows.length} směn
            </p>
          </div>

          {rows.slice(0, 6).map((row, index) => (
            <div
              key={`${row.sourceRow}-${index}`}
              style={{
                display: "grid",
                gridTemplateColumns: "42px 1fr auto",
                gap: 8,
                alignItems: "center",
                padding: "9px 12px",
                borderBottom: index < Math.min(rows.length, 6) - 1 ? `0.5px solid ${C.line}` : "none",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{row.day}.</span>
              <span style={{ fontSize: 12, color: C.ink }}>{row.start}–{row.end}</span>
              <span style={{ fontSize: 12, color: row.bonus ? C.green : C.sub }}>
                {row.bonus ? `${fmtK(row.bonus)} Kč bonus` : "bez bonusu"}
              </span>
            </div>
          ))}

          {rows.length > 6 && (
            <p style={{ fontSize: 11, color: C.sub, margin: 0, padding: "9px 12px" }}>
              + dalších {rows.length - 6} směn
            </p>
          )}
        </div>
      )}

      {info && <p style={{ fontSize: 12, color: C.green, lineHeight: 1.4, margin: "0 0 10px" }}>{info}</p>}
      <ErrorText>{error}</ErrorText>

      <PrimaryButton onClick={doImport} disabled={importing || rows.length === 0}>
        {importing ? "Importuji…" : `Importovat ${rows.length || ""} směn`}
      </PrimaryButton>

      <p style={{ fontSize: 11, color: C.sub, lineHeight: 1.45, margin: "12px 2px 0" }}>
        Importované směny se uloží jako odpracované, s pauzou 0 min. Bonus se převezme ze sloupce BONUSY. Dýška ani jídlo/pití se z této tabulky nedají poznat, takže zůstanou 0 Kč.
      </p>
    </Sheet>
  );
}

function CalendarScreen({ employers, shiftTypes, shifts, userName, onEdit, onAddShift, onImportShifts, onOpenSettings }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => today.toISOString().slice(0, 10));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthLabel = cursor.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mondayIndex = (firstDay.getDay() + 6) % 7;
  const cells = [];

  for (let i = 0; i < mondayIndex; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftsForDate = (dateKey) =>
    shifts
      .filter((s) => s.shift_date === dateKey && !isLiveShift(s))
      .sort((a, b) => {
        const aType = shiftTypes.find((t) => t.id === a.shift_type_id);
        const bType = shiftTypes.find((t) => t.id === b.shift_type_id);
        const aResolved = resolvedShiftType(a, aType);
        const bResolved = resolvedShiftType(b, bType);
        return (aResolved?.start_time || "").localeCompare(bResolved?.start_time || "");
      });

  const selectedShifts = shiftsForDate(selectedDate);
  const monthShifts = shifts
    .filter((s) => s.shift_date?.startsWith(monthKey) && !isLiveShift(s))
    .sort((a, b) => {
      const byDate = a.shift_date.localeCompare(b.shift_date);
      if (byDate !== 0) return byDate;
      const aType = shiftTypes.find((t) => t.id === a.shift_type_id);
      const bType = shiftTypes.find((t) => t.id === b.shift_type_id);
      const aResolved = resolvedShiftType(a, aType);
      const bResolved = resolvedShiftType(b, bType);
      return (aResolved?.start_time || "").localeCompare(bResolved?.start_time || "");
    });
  const [shareInfo, setShareInfo] = useState("");

  const createSchedulePdf = async () => {
    const exportRoot = document.createElement("div");
      exportRoot.style.position = "fixed";
      exportRoot.style.left = "-10000px";
      exportRoot.style.top = "0";
      exportRoot.style.width = "794px";
      exportRoot.style.boxSizing = "border-box";
      exportRoot.style.padding = "54px";
      exportRoot.style.background = "#F5F6FA";
      exportRoot.style.color = "#1C1C1E";
      exportRoot.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif";

      const worked = monthShifts.filter((s) => (s.status || "worked") === "worked");
      const planned = monthShifts.filter((s) => s.status === "planned");
      const cancelled = monthShifts.filter((s) => s.status === "cancelled");

      let totalHours = 0;
      let totalMoney = 0;

      monthShifts.forEach((s) => {
        if (s.status === "cancelled") return;
        const emp = employers.find((e) => e.id === s.employer_id);
        const st = shiftTypes.find((t) => t.id === s.shift_type_id);
        if (!emp || !st) return;
        const effectiveType = resolvedShiftType(s, st);
        totalHours += hoursForShift(s, effectiveType);
        totalMoney += payForShift(s, emp, effectiveType);
        totalMoney += Number(s.tip) || 0;
        totalMoney += Number(s.bonus) || 0;
        totalMoney -= consumptionDeduction(s, emp);
      });

      const statusStyle = (status) => {
        if (status === "planned") return { bg: "#EAF3FF", color: "#007AFF", label: "Plánovaná" };
        if (status === "cancelled") return { bg: "#FFE9EC", color: "#E23B50", label: "Zrušená" };
        return { bg: "#E9F8EE", color: "#20A84A", label: "Odpracovaná" };
      };

      const rows = monthShifts.map((s) => {
        const emp = employers.find((e) => e.id === s.employer_id);
        const st = shiftTypes.find((t) => t.id === s.shift_type_id);
        if (!emp || !st) return "";

        const effectiveType = resolvedShiftType(s, st);
        const status = statusStyle(s.status || "worked");
        const hours = hoursForShift(s, effectiveType);
        const pay = payForShift(s, emp, effectiveType)
          + (Number(s.tip) || 0)
          + (Number(s.bonus) || 0)
          - consumptionDeduction(s, emp);

        const d = new Date(`${s.shift_date}T00:00:00`);
        const dateLabel = d.toLocaleDateString("cs-CZ", {
          weekday: "short",
          day: "numeric",
          month: "numeric",
        });

        return `
          <div style="
            display:flex;
            align-items:center;
            gap:16px;
            padding:16px 0;
            border-bottom:1px solid #E5E5EA;
          ">
            <div style="width:78px;flex-shrink:0;">
              <div style="font-size:14px;font-weight:700;text-transform:capitalize;">${dateLabel}</div>
            </div>

            <div style="
              width:5px;
              align-self:stretch;
              min-height:52px;
              border-radius:4px;
              background:${emp.icon_color || "#007AFF"};
              flex-shrink:0;
            "></div>

            <div style="flex:1;min-width:0;">
              <div style="font-size:17px;font-weight:700;margin-bottom:4px;">${emp.name}</div>
              <div style="font-size:13px;color:#8E8E93;">
                ${effectiveType.start_time}–${effectiveType.end_time} · ${typeLabel(emp.type)} · ${Math.round(hours * 10) / 10} h
              </div>
              ${s.note ? `<div style="font-size:12px;color:#8E8E93;margin-top:4px;">${s.note}</div>` : ""}
            </div>

            <div style="
              font-size:11px;
              font-weight:700;
              color:${status.color};
              background:${status.bg};
              padding:5px 9px;
              border-radius:10px;
              white-space:nowrap;
            ">${status.label}</div>

            <div style="width:96px;text-align:right;flex-shrink:0;">
              <div style="font-size:16px;font-weight:700;">${fmtK(pay)} Kč</div>
            </div>
          </div>
        `;
      }).join("");

      exportRoot.innerHTML = `
        <div style="
          background:#FFFFFF;
          border-radius:28px;
          padding:34px;
          box-sizing:border-box;
        ">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;">
            <div>
              <div style="
                display:inline-block;
                background:#000;
                color:#fff;
                border-radius:10px;
                padding:7px 14px;
                font-size:18px;
                font-weight:800;
                margin-bottom:22px;
              ">Spay</div>
              <div style="font-size:34px;font-weight:800;letter-spacing:-1px;">Rozvrh směn</div>
              <div style="font-size:17px;color:#8E8E93;margin-top:6px;text-transform:capitalize;">${monthLabel}</div>
            </div>

            <div style="text-align:right;padding-top:10px;">
              <div style="font-size:12px;color:#8E8E93;">Celkem</div>
              <div style="font-size:28px;font-weight:800;margin-top:3px;">${fmtK(totalMoney)} Kč</div>
              <div style="font-size:13px;color:#8E8E93;margin-top:5px;">${Math.round(totalHours * 10) / 10} h</div>
            </div>
          </div>

          <div style="
            display:grid;
            grid-template-columns:repeat(3,1fr);
            gap:12px;
            margin-top:30px;
            margin-bottom:28px;
          ">
            <div style="background:#E9F8EE;border-radius:16px;padding:16px;">
              <div style="font-size:12px;color:#6D737A;">Odpracované</div>
              <div style="font-size:22px;font-weight:800;margin-top:6px;">${worked.length}</div>
            </div>
            <div style="background:#EAF3FF;border-radius:16px;padding:16px;">
              <div style="font-size:12px;color:#6D737A;">Plánované</div>
              <div style="font-size:22px;font-weight:800;margin-top:6px;">${planned.length}</div>
            </div>
            <div style="background:#FFE9EC;border-radius:16px;padding:16px;">
              <div style="font-size:12px;color:#6D737A;">Zrušené</div>
              <div style="font-size:22px;font-weight:800;margin-top:6px;">${cancelled.length}</div>
            </div>
          </div>

          <div style="font-size:18px;font-weight:800;margin-bottom:4px;">Směny</div>

          ${monthShifts.length > 0
            ? rows
            : `<div style="padding:30px 0;color:#8E8E93;font-size:15px;">V tomto měsíci zatím nemáš žádné směny.</div>`
          }

          <div style="
            margin-top:28px;
            padding-top:16px;
            border-top:1px solid #E5E5EA;
            color:#8E8E93;
            font-size:11px;
            display:flex;
            justify-content:space-between;
          ">
            <span>Vygenerováno v aplikaci Spay</span>
            <span>${new Date().toLocaleDateString("cs-CZ")}</span>
          </div>
        </div>
      `;

      document.body.appendChild(exportRoot);

      const canvas = await html2canvas(exportRoot, {
        scale: 2,
        backgroundColor: "#F5F6FA",
        useCORS: true,
      });

      exportRoot.remove();

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const imgData = canvas.toDataURL("image/jpeg", 0.96);

      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, "JPEG", margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;

      while (heightLeft > 0) {
        position = margin - (imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", margin, position, imgWidth, imgHeight);
        heightLeft -= pageHeight - margin * 2;
      }

      const blob = pdf.output("blob");
      const fileName = `spay-rozvrh-${monthKey}.pdf`;
      return {
        blob,
        file: new File([blob], fileName, { type: "application/pdf" }),
        fileName,
      };
  };

  const shareSchedule = async () => {
    setShareInfo("Připravuji rozvrh ke sdílení…");

    try {
      const { file, blob, fileName } = await createSchedulePdf();

      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          title: `Spay – Rozvrh na ${monthLabel}`,
          text: `Rozvrh směn na ${monthLabel}`,
          files: [file],
        });
        setShareInfo("PDF rozvrh nasdílen.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setShareInfo("Tvoje zařízení neumí sdílet PDF přímo, takže se PDF stáhlo.");
    } catch (error) {
      if (error?.name === "AbortError") {
        setShareInfo("");
        return;
      }
      console.error(error);
      setShareInfo("Sdílení PDF se nepodařilo. Zkus Export PDF.");
    }
  };

  const exportSchedule = async () => {
    setShareInfo("Připravuji PDF…");

    try {
      const { blob, fileName } = await createSchedulePdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setShareInfo("Hotovo — vytvořil se grafický PDF rozvrh.");
    } catch (error) {
      console.error(error);
      setShareInfo("PDF se nepodařilo vytvořit. Zkus to prosím znovu.");
    }
  };

  const exportWorkReport = async () => {
    setShareInfo("Připravuji pracovní výkaz…");

    try {
      const workedMonthShifts = monthShifts.filter((s) => (s.status || "worked") === "worked");
      const usedEmployers = employers.filter((emp) =>
        workedMonthShifts.some((s) => s.employer_id === emp.id)
      );

      if (usedEmployers.length === 0) {
        setShareInfo("V tomto měsíci nejsou žádné odpracované směny k exportu.");
        return;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Spay";
      workbook.created = new Date();

      const border = {
        top: { style: "thin", color: { argb: "FF111111" } },
        left: { style: "thin", color: { argb: "FF111111" } },
        bottom: { style: "thin", color: { argb: "FF111111" } },
        right: { style: "thin", color: { argb: "FF111111" } },
      };

      const monthName = cursor
        .toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })
        .toUpperCase();

      usedEmployers.forEach((emp, employerIndex) => {
        const safeSheetName = (emp.name || `Zaměstnavatel ${employerIndex + 1}`)
          .replace(/[\\/*?:[\]]/g, " ")
          .slice(0, 31);

        const ws = workbook.addWorksheet(safeSheetName || `Výkaz ${employerIndex + 1}`, {
          pageSetup: {
            paperSize: 9,
            orientation: "portrait",
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 1,
            margins: {
              left: 0.25,
              right: 0.25,
              top: 0.35,
              bottom: 0.35,
              header: 0.1,
              footer: 0.1,
            },
          },
        });

        ws.views = [{ showGridLines: false }];

        ws.columns = [
          { key: "from", width: 14 },
          { key: "to", width: 14 },
          { key: "hours", width: 15 },
          { key: "bonus", width: 16 },
          { key: "date", width: 11 },
        ];

        ws.mergeCells("A1:D1");
        ws.getCell("A1").value = (userName || "SPAY").toUpperCase();
        ws.getCell("E1").value = monthName;

        ["A1", "E1"].forEach((cellRef) => {
          const cell = ws.getCell(cellRef);
          cell.font = { name: "Georgia", size: 15, bold: true, color: { argb: "FF111111" } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.border = border;
        });

        ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF09A31" } };
        ws.getCell("E1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE7A3" } };
        ws.getRow(1).height = 27;

        const headers = ["OD", "DO", "HODINY", "BONUSY", "Datum"];
        headers.forEach((label, idx) => {
          const cell = ws.getCell(2, idx + 1);
          cell.value = label;
          cell.font = { name: "Georgia", size: 13, bold: true, color: { argb: "FF111111" } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.border = border;
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: idx === 4 ? "FFFFF0C9" : "FFFFE3C7" },
          };
        });
        ws.getRow(2).height = 52;

        const employerShifts = workedMonthShifts.filter((s) => s.employer_id === emp.id);
        const startRow = 3;

        for (let day = 1; day <= daysInMonth; day += 1) {
          const rowNumber = startRow + day - 1;
          const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
          const dayShifts = employerShifts.filter((s) => s.shift_date === dateKey);

          const starts = [];
          const ends = [];
          let dayHours = 0;
          let dayBonus = 0;

          dayShifts.forEach((s) => {
            const shiftType = shiftTypes.find((t) => t.id === s.shift_type_id);
            if (!shiftType) return;
            const effectiveType = resolvedShiftType(s, shiftType);

            if (effectiveType?.start_time) starts.push(effectiveType.start_time);
            if (effectiveType?.end_time) ends.push(effectiveType.end_time);

            dayHours += hoursForShift(s, effectiveType);
            dayBonus += Number(s.bonus) || 0;
          });

          const date = new Date(year, month, day);
          const weekDay = date.getDay();
          const isSaturday = weekDay === 6;
          const isSunday = weekDay === 0;

          ws.getCell(rowNumber, 1).value = starts.join("\n");
          ws.getCell(rowNumber, 2).value = ends.join("\n");
          ws.getCell(rowNumber, 3).value = dayHours / 24;
          ws.getCell(rowNumber, 4).value = dayBonus || null;
          ws.getCell(rowNumber, 5).value = day;

          ws.getCell(rowNumber, 3).numFmt = "[h]:mm";
          ws.getCell(rowNumber, 4).numFmt = '#,##0';

          for (let col = 1; col <= 5; col += 1) {
            const cell = ws.getCell(rowNumber, col);
            cell.border = border;
            cell.alignment = {
              horizontal: "center",
              vertical: "middle",
              wrapText: true,
            };
            cell.font = {
              name: "Arial",
              size: 11,
              bold: (col === 1 || col === 2) && dayShifts.length > 0,
              color: { argb: "FF111111" },
            };

            if (col <= 4) {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE4C9" } };
            } else if (isSunday) {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFD966" } };
            } else if (isSaturday) {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF0C9" } };
            } else {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
            }
          }

          ws.getRow(rowNumber).height = dayShifts.length > 1 ? 34 : 24;
        }

        const totalRow = startRow + daysInMonth;
        ws.getCell(totalRow, 2).value = "CELKEM";
        ws.getCell(totalRow, 3).value = {
          formula: `SUM(C${startRow}:C${totalRow - 1})`,
        };
        ws.getCell(totalRow, 4).value = {
          formula: `SUM(D${startRow}:D${totalRow - 1})`,
        };
        ws.getCell(totalRow, 3).numFmt = "[h]:mm";
        ws.getCell(totalRow, 4).numFmt = '#,##0';

        for (let col = 1; col <= 5; col += 1) {
          const cell = ws.getCell(totalRow, col);
          cell.border = border;
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FF111111" } };
          if (col >= 2 && col <= 4) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE4C9" } };
          }
        }

        ws.getRow(totalRow).height = 27;
        ws.autoFilter = {
          from: "A2",
          to: "E2",
        };
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob(
        [buffer],
        { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `spay-vykaz-${monthKey}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setShareInfo(
        usedEmployers.length === 1
          ? "Hotovo — pracovní výkaz byl stažen jako Excel."
          : `Hotovo — Excel obsahuje ${usedEmployers.length} listy, jeden pro každého zaměstnavatele.`
      );
    } catch (error) {
      console.error(error);
      setShareInfo("Excelový výkaz se nepodařilo vytvořit. Zkus to prosím znovu.");
    }
  };

  const goMonth = (delta) => {
    const next = new Date(year, month + delta, 1);
    setCursor(next);
    const nextKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
    setSelectedDate(nextKey);
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "18px 18px 0", gap: 10 }}>
        <button
          onClick={() => goMonth(-1)}
          style={{ border: "none", background: C.card, width: 34, height: 34, borderRadius: 12, cursor: "pointer", fontSize: 20, color: C.ink, flexShrink: 0 }}
          aria-label="Předchozí měsíc"
        >
          ‹
        </button>

        <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 28, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: "-0.03em" }}>Kalendář</p>
          <p style={{ fontSize: 12, color: C.sub, margin: "4px 0 0", textTransform: "capitalize" }}>{monthLabel}</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => goMonth(1)}
            style={{ border: "none", background: C.card, width: 34, height: 34, borderRadius: 12, cursor: "pointer", fontSize: 20, color: C.ink }}
            aria-label="Další měsíc"
          >
            ›
          </button>
          <ProfileButton onClick={onOpenSettings} />
        </div>
      </div>

      <div style={{ margin: "18px 16px 0", background: C.card, borderRadius: 18, padding: "14px 12px 12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
          {["Po", "Út", "St", "Čt", "Pá", "So", "Ne"].map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: C.sub, padding: "4px 0" }}>{d}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {cells.map((day, index) => {
            if (!day) return <div key={`empty-${index}`} style={{ aspectRatio: "1 / 1" }} />;

            const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
            const dayShifts = shiftsForDate(dateKey);
            const isSelected = selectedDate === dateKey;
            const isToday = dateKey === today.toISOString().slice(0, 10);

            return (
              <button
                key={dateKey}
                onClick={() => setSelectedDate(dateKey)}
                style={{
                  aspectRatio: "1 / 1",
                  border: "none",
                  borderRadius: 12,
                  background: isSelected ? "var(--sp-blue-soft)" : "transparent",
                  outline: isToday ? `1.5px solid ${C.blue}` : "none",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontFamily: FONT,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: isSelected || isToday ? 700 : 500, color: isSelected ? C.blue : C.ink }}>{day}</span>
                <div style={{ display: "flex", gap: 2, minHeight: 5, justifyContent: "center" }}>
                  {dayShifts.slice(0, 3).map((s) => {
                    const emp = employers.find((e) => e.id === s.employer_id);
                    return (
                      <span
                        key={s.id}
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: emp?.icon_color || C.blue,
                          opacity: s.status === "cancelled" ? 0.35 : 1,
                        }}
                      />
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ margin: "12px 16px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button
          type="button"
          onClick={shareSchedule}
          style={{
            border: "none",
            background: "var(--sp-blue-soft)",
            color: C.blue,
            borderRadius: 14,
            padding: "12px 12px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          Sdílet rozvrh
        </button>

        <button
          type="button"
          onClick={exportSchedule}
          style={{
            border: `0.5px solid ${C.line}`,
            background: C.card,
            color: C.ink,
            borderRadius: 14,
            padding: "12px 12px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          Export PDF
        </button>

        <button
          type="button"
          onClick={exportWorkReport}
          style={{
            gridColumn: "1 / -1",
            border: `0.5px solid ${C.line}`,
            background: C.card,
            color: C.ink,
            borderRadius: 14,
            padding: "12px 12px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          Export pracovního výkazu (.xlsx)
        </button>

        <button
          type="button"
          onClick={() => onImportShifts(monthKey)}
          style={{
            gridColumn: "1 / -1",
            border: "none",
            background: "var(--sp-green-soft)",
            color: C.green,
            borderRadius: 14,
            padding: "12px 12px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          Import směn z Google Sheets / Excelu
        </button>
      </div>

      {shareInfo && (
        <p style={{ margin: "10px 18px 0", fontSize: 12, color: C.sub }}>
          {shareInfo}
        </p>
      )}

      <div style={{ margin: "16px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.ink, margin: 0 }}>
            {new Date(`${selectedDate}T00:00:00`).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <button
            type="button"
            onClick={() => onAddShift(selectedDate)}
            style={{
              border: "none",
              background: "var(--sp-blue-soft)",
              color: C.blue,
              borderRadius: 10,
              padding: "7px 10px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: FONT,
              whiteSpace: "nowrap",
            }}
          >
            + Přidat směnu
          </button>
        </div>

        {selectedShifts.length === 0 ? (
          <div style={{ background: C.card, borderRadius: 16, padding: "18px 16px", textAlign: "center" }}>
            <Calendar size={22} color={C.sub} />
            <p style={{ fontSize: 13, color: C.sub, margin: "8px 0 0" }}>Na tento den nemáš žádnou směnu.</p>
          </div>
        ) : (
          <div style={{ background: C.card, borderRadius: 16, overflow: "hidden" }}>
            {selectedShifts.map((s, i) => {
              const emp = employers.find((e) => e.id === s.employer_id);
              const st = shiftTypes.find((t) => t.id === s.shift_type_id);
              if (!emp || !st) return null;
              const effectiveType = resolvedShiftType(s, st);
              const meta = shiftStatusMeta(s.status || "worked");
              const hours = hoursForShift(s, effectiveType);
              const pay = payForShift(s, emp, effectiveType);

              return (
                <button
                  key={s.id}
                  onClick={() => onEdit(s)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 14px",
                    border: "none",
                    borderBottom: i < selectedShifts.length - 1 ? `0.5px solid ${C.line}` : "none",
                    background: C.card,
                    textAlign: "left",
                    cursor: "pointer",
                    fontFamily: FONT,
                  }}
                >
                  <div style={{ width: 5, alignSelf: "stretch", borderRadius: 4, background: emp.icon_color || C.blue, opacity: s.status === "cancelled" ? 0.4 : 1 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: 0 }}>{emp.name}</p>
                      <span style={{ fontSize: 9, fontWeight: 700, color: meta.color, background: meta.bg, borderRadius: 7, padding: "2px 6px" }}>{meta.label}</span>
                    </div>
                    <p style={{ fontSize: 11, color: C.sub, margin: "3px 0 0" }}>
                      {effectiveType.start_time}–{effectiveType.end_time} · {Math.round(hours * 10) / 10} h
                    </p>
                    {s.note && <p style={{ fontSize: 10, color: C.sub, margin: "3px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.note}</p>}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.ink, margin: 0 }}>{fmtK(pay + (Number(s.tip) || 0) + (Number(s.bonus) || 0) - consumptionDeduction(s, emp))} Kč</p>
                    <ChevronRight size={15} color={C.line} style={{ marginTop: 4 }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsScreen({ employers, shiftTypes, onAddShiftType, onEditShiftType, onAddEmployer, onEditEmployer, onLogout, refresh, session, onProfileUpdated, darkMode, onToggleDarkMode }) {
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
            <input type="email" style={{ ...inputStyle, background: "var(--sp-muted-card)", color: C.sub }} value={session?.user?.email || ""} disabled />
          </Field>
          <ErrorText>{nameError}</ErrorText>
          {nameMessage && <p style={{ fontSize: 13, color: C.green, margin: "4px 0 0" }}>{nameMessage}</p>}
          <PrimaryButton onClick={saveName} disabled={savingName}>{savingName ? "Ukládám…" : "Uložit jméno"}</PrimaryButton>
        </div>
      </GroupedList>

      <SectionHeader>Vzhled</SectionHeader>
      <GroupedList>
        <button
          type="button"
          onClick={onToggleDarkMode}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "13px 14px",
            background: "none",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            fontFamily: FONT,
          }}
        >
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            background: darkMode ? "var(--sp-purple-soft)" : "var(--sp-orange-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            {darkMode ? <Moon size={17} color={C.purple} /> : <Sun size={17} color={C.orange} />}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 15, color: C.ink, margin: 0 }}>Tmavý režim</p>
            <p style={{ fontSize: 12, color: C.sub, margin: "2px 0 0" }}>{darkMode ? "Zapnuto" : "Vypnuto"}</p>
          </div>
          <div style={{
            width: 46,
            height: 26,
            padding: 3,
            borderRadius: 15,
            background: darkMode ? C.blue : C.line,
            boxSizing: "border-box",
            display: "flex",
            justifyContent: darkMode ? "flex-end" : "flex-start",
            transition: "all 180ms ease",
          }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.18)" }} />
          </div>
        </button>
      </GroupedList>

      <SectionHeader>Typy směn</SectionHeader>
      <GroupedList>
        {shiftTypes.map((t, i) => {
          return (
            <div
              key={t.id}
              onClick={() => onEditShiftType(t)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 14px",
                borderBottom: i < shiftTypes.length - 1 ? `0.5px solid ${C.line}` : "none",
                cursor: "pointer",
              }}
            >
              <div style={{ width: 4, minHeight: 42, alignSelf: "stretch", borderRadius: 4, background: t.color || ICON_COLORS[t.icon] || C.blue, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, color: C.ink, margin: 0 }}>{t.name}</p>
                <p style={{ fontSize: 12, color: C.sub, margin: "1px 0 0" }}>{t.start_time}–{t.end_time} · pauza {t.pause_min} min{t.surcharge_pct ? ` · +${t.surcharge_pct}%` : ""}</p>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEditShiftType(t);
                }}
                aria-label="Upravit typ směny"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 5 }}
              >
                <Pencil size={15} color={C.sub} />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeShiftType(t.id);
                }}
                aria-label="Smazat typ směny"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 5 }}
              >
                <Trash2 size={15} color={C.line} />
              </button>
            </div>
          );
        })}
      </GroupedList>
      <button onClick={onAddShiftType} style={{ width: "calc(100% - 32px)", margin: "10px 16px 24px", border: "none", background: C.card, color: C.blue, borderRadius: 12, padding: "13px 0", fontSize: 15, fontWeight: 500, cursor: "pointer" }}>+ Přidat vlastní typ směny</button>

      <SectionHeader>Zaměstnavatelé</SectionHeader>
      <GroupedList>
        {employers.map((e, i) => {
          return (
          <div
            key={e.id}
            onClick={() => onEditEmployer(e)}
            style={{
              padding: "11px 14px",
              borderBottom: i < employers.length - 1 ? `0.5px solid ${C.line}` : "none",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "stretch", gap: 10 }}>
              <div style={{ width: 4, minHeight: 42, borderRadius: 4, background: e.icon_color || C.blue, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                  <p style={{ fontSize: 15, color: C.ink, margin: 0, flex: 1 }}>{e.name}</p>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.blue, background: "var(--sp-blue-soft)", borderRadius: 6, padding: "2px 8px" }}>{typeLabel(e.type)}</span>

                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditEmployer(e);
                    }}
                    aria-label="Upravit zaměstnavatele"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 5 }}
                  >
                    <Pencil size={14} color={C.sub} />
                  </button>

                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      removeEmployer(e.id);
                    }}
                    aria-label="Smazat zaměstnavatele"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 5 }}
                  >
                    <Trash2 size={14} color={C.line} />
                  </button>
                </div>
                <p style={{ fontSize: 12, color: C.sub, margin: "0 0 2px" }}>{e.rate} Kč / h</p>
                <p style={{ fontSize: 12, color: C.sub, margin: "0 0 2px" }}>dýška: {e.track_tips ? "evidovat u každé směny" : "neevidovat"}</p>
                <p style={{ fontSize: 12, color: C.sub, margin: "0 0 2px" }}>bonus: {e.track_bonus !== false ? "evidovat u každé směny" : "neevidovat"}</p>
                <p style={{ fontSize: 12, color: C.sub, margin: "0 0 2px" }}>
                  jídlo / pití: {e.track_consumption === true ? `evidovat · sleva ${Number(e.employee_discount_pct) || 0} %` : "neevidovat"}
                </p>
                {e.monthly_limit != null && (
                  <p style={{ fontSize: 12, color: C.sub, margin: 0 }}>limit: {fmtK(e.monthly_limit)} Kč / měsíc</p>
                )}
              </div>
            </div>
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
    { id: "shifts", label: "Směny", Icon: Clock },
    { id: "calendar", label: "Kalendář", Icon: Calendar },
  ];
  return (
    <div style={{ position: "sticky", bottom: 0, display: "flex", borderTop: `0.5px solid ${C.line}`, background: "var(--sp-bar-strong)", backdropFilter: "blur(10px)", padding: "8px 0 calc(8px + env(safe-area-inset-bottom))" }}>
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



function OnboardingScreen({ session, userId, shiftTypes, refresh, onComplete }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(session?.user?.user_metadata?.full_name || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [employerName, setEmployerName] = useState("");
  const [employerType, setEmployerType] = useState("DPP");
  const [rate, setRate] = useState("");
  const [employerId, setEmployerId] = useState(null);

  const today = new Date().toISOString().slice(0, 10);
  const [shiftDate, setShiftDate] = useState(today);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [pauseMin, setPauseMin] = useState("30");

  const completeOnboarding = async () => {
    setSaving(true);
    setError("");

    const result = await supabase.auth.updateUser({
      data: {
        ...(session?.user?.user_metadata || {}),
        full_name: name.trim() || session?.user?.user_metadata?.full_name || "",
        onboarding_completed: true,
      },
    });

    setSaving(false);

    if (result.error || !result.data?.user) {
      setError("Onboarding se nepodařilo dokončit. Zkus to prosím znovu.");
      return;
    }

    onComplete(result.data.user);
  };

  const saveName = async () => {
    const cleanName = name.trim();

    if (!cleanName) {
      setError("Napiš prosím své jméno.");
      return;
    }

    setSaving(true);
    setError("");

    const result = await supabase.auth.updateUser({
      data: {
        ...(session?.user?.user_metadata || {}),
        full_name: cleanName,
        onboarding_completed: false,
      },
    });

    setSaving(false);

    if (result.error) {
      setError("Jméno se nepodařilo uložit. Zkus to prosím znovu.");
      return;
    }

    setStep(2);
  };

  const saveEmployer = async () => {
    if (!employerName.trim() || !rate || Number(rate) <= 0) {
      setError("Vyplň název zaměstnavatele a hodinovou sazbu.");
      return;
    }

    setSaving(true);
    setError("");

    const result = await supabase
      .from("employers")
      .insert({
        user_id: userId,
        name: employerName.trim(),
        type: employerType,
        rate: Number(rate),
        track_tips: true,
        track_bonus: true,
        track_consumption: false,
        employee_discount_pct: 0,
        icon: "Briefcase",
        icon_color: EMPLOYER_COLORS[0],
        monthly_limit: employerType === "DPP" ? 10000 : null,
      })
      .select()
      .single();

    setSaving(false);

    if (result.error || !result.data) {
      setError("Zaměstnavatele se nepodařilo uložit. Zkus to prosím znovu.");
      return;
    }

    setEmployerId(result.data.id);
    await refresh();
    setStep(3);
  };

  const saveFirstShift = async () => {
    const fallbackShiftType = shiftTypes[0];

    if (!fallbackShiftType?.id) {
      setError("Typy směn se ještě načítají. Zkus to za chvíli znovu.");
      return;
    }

    if (!employerId) {
      setError("Nejdřív je potřeba mít zaměstnavatele.");
      return;
    }

    setSaving(true);
    setError("");

    const result = await supabase.from("shifts").insert({
      user_id: userId,
      employer_id: employerId,
      shift_type_id: fallbackShiftType.id,
      shift_date: shiftDate,
      tip: 0,
      bonus: 0,
      consumption_amount: 0,
      pause_override_min: Number(pauseMin) || 0,
      status: "planned",
      note: null,
      custom_start_time: startTime,
      custom_end_time: endTime,
      custom_surcharge_pct: 0,
    });

    if (result.error) {
      setSaving(false);
      setError("První směnu se nepodařilo uložit. Zkus to prosím znovu.");
      return;
    }

    await refresh();
    await completeOnboarding();
  };

  const stepLabel = `${step} z 3`;
  const progressWidth = `${(step / 3) * 100}%`;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.ink,
        fontFamily: FONT,
        padding: "34px 20px 46px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "100%", maxWidth: 430, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <SpayBadge />
        </div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: C.sub }}>{stepLabel}</span>
            <span style={{ fontSize: 12, color: C.sub }}>Nastavení účtu</span>
          </div>

          <div style={{ height: 6, background: C.line, borderRadius: 999, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: progressWidth,
                background: C.blue,
                borderRadius: 999,
                transition: "width 180ms ease",
              }}
            />
          </div>
        </div>

        {step === 1 && (
          <>
            <p style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", margin: 0 }}>
              Jak ti máme říkat?
            </p>
            <p style={{ fontSize: 14, color: C.sub, margin: "8px 0 24px" }}>
              Tohle jméno se bude zobrazovat v pozdravu a v aplikaci.
            </p>

            <Field label="Tvoje jméno">
              <input
                autoFocus
                type="text"
                style={inputStyle}
                placeholder="Např. Kristina"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
              />
            </Field>

            <ErrorText>{error}</ErrorText>
            <PrimaryButton onClick={saveName} disabled={saving}>
              {saving ? "Ukládám…" : "Pokračovat"}
            </PrimaryButton>
          </>
        )}

        {step === 2 && (
          <>
            <p style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", margin: 0 }}>
              Přidej zaměstnavatele
            </p>
            <p style={{ fontSize: 14, color: C.sub, margin: "8px 0 24px" }}>
              Stačí základ. Dýška, bonusy, barvu nebo zaměstnaneckou slevu můžeš upravit později.
            </p>

            <Field label="Název">
              <input
                type="text"
                style={inputStyle}
                placeholder="Např. Stage Bar"
                value={employerName}
                onChange={(e) => {
                  setEmployerName(e.target.value);
                  setError("");
                }}
              />
            </Field>

            <Field label="Typ smlouvy">
              <select
                style={selectStyle}
                value={employerType}
                onChange={(e) => setEmployerType(e.target.value)}
              >
                <option value="DPP">DPP</option>
                <option value="DPC">DPČ</option>
              </select>
            </Field>

            <Field label="Hodinová sazba (Kč)">
              <input
                type="number"
                min="0"
                style={inputStyle}
                placeholder="Např. 180"
                value={rate}
                onChange={(e) => {
                  setRate(e.target.value);
                  setError("");
                }}
              />
            </Field>

            <ErrorText>{error}</ErrorText>

            <PrimaryButton onClick={saveEmployer} disabled={saving}>
              {saving ? "Ukládám…" : "Přidat zaměstnavatele"}
            </PrimaryButton>

            <button
              type="button"
              onClick={completeOnboarding}
              disabled={saving}
              style={{
                width: "100%",
                border: "none",
                background: "transparent",
                color: C.sub,
                fontSize: 13,
                fontFamily: FONT,
                marginTop: 14,
                cursor: "pointer",
              }}
            >
              Přeskočit a nastavit později
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <p style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", margin: 0 }}>
              Přidej první směnu
            </p>
            <p style={{ fontSize: 14, color: C.sub, margin: "8px 0 24px" }}>
              Směnu můžeš později kdykoliv upravit nebo smazat.
            </p>

            <Field label="Datum">
              <input
                type="date"
                style={inputStyle}
                value={shiftDate}
                onChange={(e) => setShiftDate(e.target.value)}
              />
            </Field>

            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <Field label="Začátek">
                  <input
                    type="time"
                    style={inputStyle}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </Field>
              </div>

              <div style={{ flex: 1 }}>
                <Field label="Konec">
                  <input
                    type="time"
                    style={inputStyle}
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <Field label="Pauza (min)">
              <input
                type="number"
                min="0"
                style={inputStyle}
                value={pauseMin}
                onChange={(e) => setPauseMin(e.target.value)}
              />
            </Field>

            <ErrorText>{error}</ErrorText>

            <PrimaryButton onClick={saveFirstShift} disabled={saving}>
              {saving ? "Ukládám…" : "Přidat směnu a dokončit"}
            </PrimaryButton>

            <button
              type="button"
              onClick={completeOnboarding}
              disabled={saving}
              style={{
                width: "100%",
                border: "none",
                background: "transparent",
                color: C.sub,
                fontSize: 13,
                fontFamily: FONT,
                marginTop: 14,
                cursor: "pointer",
              }}
            >
              Přeskočit první směnu
            </button>
          </>
        )}

        <p style={{ fontSize: 11, color: C.sub, textAlign: "center", margin: "30px 0 0" }}>
          Všechno můžeš později změnit v Nastavení.
        </p>
      </div>
    </div>
  );
}

function PasswordResetScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError("");

    if (password.length < 6) {
      setError("Heslo musí mít alespoň 6 znaků.");
      return;
    }

    if (password !== password2) {
      setError("Hesla se neshodují.");
      return;
    }

    setSaving(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    window.history.replaceState({}, document.title, window.location.pathname);
    onDone();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.ink,
        fontFamily: FONT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <SpayBadge />
          <p style={{ fontSize: 28, fontWeight: 700, margin: "20px 0 5px", letterSpacing: "-0.02em" }}>
            Nové heslo
          </p>
          <p style={{ fontSize: 14, color: C.sub, margin: 0 }}>
            Nastav si nové heslo ke svému účtu.
          </p>
        </div>

        <div style={{ background: C.card, borderRadius: 14, overflow: "hidden", marginBottom: 14 }}>
          <input
            type="password"
            placeholder="Nové heslo"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...inputStyle, border: "none", borderBottom: `0.5px solid ${C.line}`, borderRadius: 0 }}
          />
          <input
            type="password"
            placeholder="Zopakuj nové heslo"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            style={{ ...inputStyle, border: "none", borderRadius: 0 }}
          />
        </div>

        <ErrorText>{error}</ErrorText>
        <PrimaryButton onClick={save} disabled={saving}>
          {saving ? "Ukládám…" : "Nastavit nové heslo"}
        </PrimaryButton>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem("shiftpay-dark-mode");
      if (saved !== null) return saved === "true";
      return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches || false;
    } catch {
      return false;
    }
  });
  const [active, setActive] = useState("overview");
  const [passwordRecovery, setPasswordRecovery] = useState(() => new URLSearchParams(window.location.search).get("reset-password") === "1");
  const [sheet, setSheet] = useState(null);
  const [selectedShift, setSelectedShift] = useState(null);
  const [selectedShiftType, setSelectedShiftType] = useState(null);
  const [selectedEmployer, setSelectedEmployer] = useState(null);
  const [newShiftDate, setNewShiftDate] = useState(null);
  const [importMonthKey, setImportMonthKey] = useState(() => new Date().toISOString().slice(0, 7));

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("shiftpay-dark-mode", String(darkMode));
    } catch {}
    document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", darkMode ? "#111114" : "#F2F2F7");
  }, [darkMode]);

  const themeVars = darkMode ? {
    "--sp-bg": "#111114",
    "--sp-card": "#1C1C1E",
    "--sp-ink": "#F5F5F7",
    "--sp-sub": "#A1A1A7",
    "--sp-line": "#343438",
    "--sp-control": "#2A2A2E",
    "--sp-muted-card": "#242428",
    "--sp-bar": "rgba(17,17,20,0.88)",
    "--sp-bar-strong": "rgba(17,17,20,0.94)",
    "--sp-blue-soft": "#172A43",
    "--sp-green-soft": "#173523",
    "--sp-red-soft": "#3B2021",
    "--sp-purple-soft": "#29233F",
    "--sp-orange-soft": "#3A2B17",
    "--sp-teal-soft": "#123533",
    "--sp-teal-text": "#35C8BC",
    "--sp-wage-soft": "#3A2B17",
    "--sp-wage-text": "#F2A93B",
    "--sp-tip-soft": "#173523",
    "--sp-tip-text": "#43D267",
    "--sp-bonus-soft": "#29233F",
    "--sp-bonus-text": "#9A84F7",
    "--sp-deduction-soft": "#3C251C",
    "--sp-deduction-text": "#F08A55",
    "--sp-total-soft": "#252440",
    "--sp-total-text": "#8B82F6",
    "--sp-loss-soft": "#3B2021",
    "--sp-loss-text": "#FF6675",
    "--sp-trend": "#3A4351",
    "--sp-blue-panel": "#172335",
    "--sp-blue-border": "#29466D",
  } : {
    "--sp-bg": "#F2F2F7",
    "--sp-card": "#FFFFFF",
    "--sp-ink": "#1C1C1E",
    "--sp-sub": "#8E8E93",
    "--sp-line": "#E5E5EA",
    "--sp-control": "#ECECF0",
    "--sp-muted-card": "#F6F6F8",
    "--sp-bar": "rgba(242,242,247,0.85)",
    "--sp-bar-strong": "rgba(242,242,247,0.92)",
    "--sp-blue-soft": "#EAF3FF",
    "--sp-green-soft": "#E9F8EE",
    "--sp-red-soft": "#FFE9EC",
    "--sp-purple-soft": "#F0EAFF",
    "--sp-orange-soft": "#FFF3DD",
    "--sp-teal-soft": "#E7F8F6",
    "--sp-teal-text": "#00A89D",
    "--sp-wage-soft": "#FFF3D9",
    "--sp-wage-text": "#C77A00",
    "--sp-tip-soft": "#E7F8EC",
    "--sp-tip-text": "#28A745",
    "--sp-bonus-soft": "#F0EAFE",
    "--sp-bonus-text": "#6C48D7",
    "--sp-deduction-soft": "#FFF0E8",
    "--sp-deduction-text": "#E56B2F",
    "--sp-total-soft": "#ECE9FF",
    "--sp-total-text": "#5146D8",
    "--sp-loss-soft": "#FFE9EC",
    "--sp-loss-text": "#E23B50",
    "--sp-trend": "#DDE4EF",
    "--sp-blue-panel": "#EEF6FF",
    "--sp-blue-border": "#D9E8FF",
  };

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
  if (!session) {
    return (
      <div style={{ ...themeVars, minHeight: "100vh", background: "var(--sp-bg)", color: "var(--sp-ink)" }}>
        <Login />
      </div>
    );
  }

  if (passwordRecovery) {
    return (
      <div style={themeVars}>
        <PasswordResetScreen onDone={() => setPasswordRecovery(false)} />
      </div>
    );
  }

  const onboardingCompleted = session?.user?.user_metadata?.onboarding_completed === true;
  const freshAccountWithoutData = !loading && employers.length === 0 && shifts.length === 0;
  const needsOnboarding =
    !onboardingCompleted &&
    (
      session?.user?.user_metadata?.onboarding_completed === false ||
      freshAccountWithoutData
    );

  if (needsOnboarding) {
    return (
      <div style={themeVars}>
        <OnboardingScreen
          session={session}
          userId={userId}
          shiftTypes={shiftTypes}
          refresh={refresh}
          onComplete={(user) => {
            setSession((prev) => prev ? { ...prev, user } : prev);
            setActive("overview");
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ ...themeVars, minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <TopBrandBar />
      {liveShift && <LiveShiftBanner shift={liveShift} employer={liveEmployer} shiftType={liveShiftType} onStop={stopLiveShift} />}
      <div style={{ flex: 1 }}>
        {loading ? (
          <p style={{ textAlign: "center", color: C.sub, padding: 40 }}>Načítám data…</p>
        ) : (
          <>
            {active === "overview" && <OverviewScreen employers={employers} shiftTypes={shiftTypes} shifts={shifts} userName={userName} onOpenSettings={() => setActive("settings")} />}
            {active === "shifts" && <ShiftsScreen employers={employers} shiftTypes={shiftTypes} shifts={shifts} onAdd={() => { setNewShiftDate(null); setSheet("shift"); }} onStart={() => setSheet("start")} onEdit={(shift) => { setSelectedShift(shift); setSheet("editShift"); }} refresh={refresh} onOpenSettings={() => setActive("settings")} />}
            {active === "calendar" && <CalendarScreen employers={employers} shiftTypes={shiftTypes} shifts={shifts} userName={userName} onEdit={(shift) => { setSelectedShift(shift); setSheet("editShift"); }} onAddShift={(date) => { setNewShiftDate(date); setSheet("shift"); }} onImportShifts={(key) => { setImportMonthKey(key); setSheet("importShifts"); }} onOpenSettings={() => setActive("settings")} />}
            {active === "settings" && <SettingsScreen employers={employers} shiftTypes={shiftTypes} onAddShiftType={() => { setSelectedShiftType(null); setSheet("shiftType"); }} onEditShiftType={(shiftType) => { setSelectedShiftType(shiftType); setSheet("shiftType"); }} onAddEmployer={() => { setSelectedEmployer(null); setSheet("employer"); }} onEditEmployer={(employer) => { setSelectedEmployer(employer); setSheet("employer"); }} onLogout={() => supabase.auth.signOut()} refresh={refresh} session={session} onProfileUpdated={(user) => setSession((prev) => prev ? { ...prev, user } : prev)} darkMode={darkMode} onToggleDarkMode={() => setDarkMode((value) => !value)} />}
          </>
        )}
      </div>
      <TabBar active={active} setActive={setActive} />
      {sheet === "shift" && <AddShiftSheet userId={userId} employers={employers} shiftTypes={shiftTypes} initialDate={newShiftDate} onClose={() => { setSheet(null); setNewShiftDate(null); }} onSaved={refresh} />}
      {sheet === "editShift" && selectedShift && <EditShiftSheet shift={selectedShift} userId={userId} employers={employers} shiftTypes={shiftTypes} onClose={() => { setSheet(null); setSelectedShift(null); }} onSaved={refresh} />}
      {sheet === "start" && <StartShiftSheet userId={userId} employers={employers} shiftTypes={shiftTypes} onClose={() => setSheet(null)} onSaved={refresh} />}
      {sheet === "employer" && <AddEmployerSheet userId={userId} employer={selectedEmployer} onClose={() => { setSheet(null); setSelectedEmployer(null); }} onSaved={refresh} />}
      {sheet === "shiftType" && <AddShiftTypeSheet userId={userId} shiftType={selectedShiftType} onClose={() => { setSheet(null); setSelectedShiftType(null); }} onSaved={refresh} />}
      {sheet === "importShifts" && <ImportShiftsSheet userId={userId} employers={employers} shiftTypes={shiftTypes} shifts={shifts} initialMonthKey={importMonthKey} onClose={() => setSheet(null)} onSaved={refresh} />}
    </div>
  );
}
