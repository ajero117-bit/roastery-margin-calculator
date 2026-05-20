import React, { useMemo, useRef, useState } from "react";

const STORAGE_KEY = "roastery_simple_blends";
const LEGACY_STORAGE_KEYS = ["roastery_blends"];
const COLORS = ["#c8a96e", "#7eb8a0", "#e07878", "#78a8e0", "#d4a050"];

const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const money = (n) => `${Math.round(Number.isFinite(n) ? n : 0).toLocaleString()}원`;
const pct = (n) => `${Number.isFinite(n) ? n.toFixed(1) : "0.0"}%`;
const num = (v, fallback = 0) => {
  const next = Number(v);
  return Number.isFinite(next) ? next : fallback;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, num(value, min)));
const inputNumber = (value, min, max) => (value === "" ? "" : clamp(value, min, max));
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};

const defaultBean = (overrides = {}) => ({
  id: uid(),
  name: "새 생두",
  pricePerKg: 12000,
  ratio: 0,
  ...overrides,
});

const normalizeBean = (bean = {}) =>
  defaultBean({
    id: uid(),
    name: String(bean.name || "이름 없는 생두"),
    pricePerKg: clamp(bean.pricePerKg, 0, 9999999),
    ratio: clamp(bean.ratio, 0, 100),
  });

const normalizeSaved = (item = {}) => ({
  id: uid(),
  name: String(item.name || `블렌드 ${todayStr()}`),
  savedAt: String(item.savedAt || new Date().toLocaleString("ko-KR")),
  beans: Array.isArray(item.beans) && item.beans.length ? item.beans.map(normalizeBean) : [defaultBean()],
  roastLoss: clamp(item.roastLoss ?? item.lossRate ?? 18, 0, 80),
  targetMargin: clamp(item.targetMargin ?? 55, 0, 95),
  sellPriceInput: item.sellPriceInput ? String(item.sellPriceInput) : "",
  monthlyMode: item.monthlyMode === "revenue" ? "revenue" : "kg",
  monthlyKg: clamp(item.monthlyKg ?? 30, 0, 999999),
  monthlyRevenue: clamp(item.monthlyRevenue ?? 1500000, 0, 999999999),
  variablePerKg: clamp(item.variablePerKg ?? 800, 0, 9999999),
  salesFeeRate: clamp(item.salesFeeRate ?? 3.5, 0, 80),
  fixedCosts: {
    labor: clamp(item.fixedCosts?.labor, 0, 999999999),
    rent: clamp(item.fixedCosts?.rent, 0, 999999999),
    other: clamp(item.fixedCosts?.other, 0, 999999999),
  },
  memo: String(item.memo || ""),
  sellPrice: clamp(item.sellPrice, 0, 999999999),
  operatingProfit: clamp(item.operatingProfit, -999999999, 999999999),
});

const loadSaved = () => {
  try {
    const items = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS].flatMap((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    });
    return items.map(normalizeSaved);
  } catch {
    return [];
  }
};

const persistSaved = (list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
};

const downloadFile = (contents, filename, type) => {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export default function App() {
  const [beans, setBeans] = useState([
    defaultBean({ id: "bean-1", name: "에티오피아 예가체프", pricePerKg: 18000, ratio: 50 }),
    defaultBean({ id: "bean-2", name: "브라질 세하도", pricePerKg: 10000, ratio: 50 }),
  ]);
  const [roastLoss, setRoastLoss] = useState(18);
  const [targetMargin, setTargetMargin] = useState(55);
  const [sellPriceInput, setSellPriceInput] = useState("");
  const [monthlyMode, setMonthlyMode] = useState("kg");
  const [monthlyKg, setMonthlyKg] = useState(30);
  const [monthlyRevenue, setMonthlyRevenue] = useState(1500000);
  const [variablePerKg, setVariablePerKg] = useState(800);
  const [salesFeeRate, setSalesFeeRate] = useState(3.5);
  const [fixedCosts, setFixedCosts] = useState({ labor: 0, rent: 0, other: 0 });
  const [blendName, setBlendName] = useState("");
  const [memo, setMemo] = useState("");
  const [saved, setSaved] = useState(loadSaved);
  const [page, setPage] = useState("calc");
  const [toast, setToast] = useState(null);
  const [sideOpen, setSideOpen] = useState(true);
  const fileRef = useRef();

  const totalRatio = beans.reduce((sum, b) => sum + (Number(b.ratio) || 0), 0);
  const ratioOk = Math.abs(totalRatio - 100) < 0.01;
  const canAutoFill = beans.length >= 2 && beans.slice(0, -1).reduce((sum, b) => sum + (Number(b.ratio) || 0), 0) <= 100;

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2000);
  };

  const updateBean = (id, patch) => setBeans((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const addBean = () => setBeans((list) => [...list, defaultBean()]);
  const removeBean = (id) => setBeans((list) => (list.length > 1 ? list.filter((b) => b.id !== id) : list));
  const updateFixedCost = (key, value) => setFixedCosts((prev) => ({ ...prev, [key]: inputNumber(value, 0, 999999999) }));
  const autoFill = () => {
    if (!canAutoFill) return showToast("마지막 생두를 제외한 합계가 100%를 넘었습니다.", "err");
    const rest = beans.slice(0, -1);
    const restTotal = rest.reduce((sum, b) => sum + (Number(b.ratio) || 0), 0);
    setBeans([...rest, { ...beans[beans.length - 1], ratio: Math.round((100 - restTotal) * 10) / 10 }]);
  };

  const sim = useMemo(() => {
    if (!ratioOk || totalRatio === 0) return null;

    const lossRate = num(roastLoss);
    const marginRate = num(targetMargin);
    const monthlySalesKg = num(monthlyKg);
    const monthlySalesRevenue = num(monthlyRevenue);
    const variableCostPerKg = num(variablePerKg);
    const feeRate = num(salesFeeRate);
    const fixedTotal = num(fixedCosts.labor) + num(fixedCosts.rent) + num(fixedCosts.other);
    const greenCostPerKg = beans.reduce((sum, b) => sum + num(b.pricePerKg) * ((Number(b.ratio) || 0) / totalRatio), 0);
    const roastedCostPerKg = greenCostPerKg / Math.max(0.05, 1 - lossRate / 100);
    const recommendedPrice = marginRate < 95 ? roastedCostPerKg / (1 - marginRate / 100) : 0;
    const sellPricePerKg = Number(sellPriceInput) > 0 ? Number(sellPriceInput) : recommendedPrice;
    const grossProfitPerKg = sellPricePerKg - roastedCostPerKg;
    const grossMargin = sellPricePerKg > 0 ? (grossProfitPerKg / sellPricePerKg) * 100 : 0;

    const soldKg = monthlyMode === "kg" ? monthlySalesKg : sellPricePerKg > 0 ? monthlySalesRevenue / sellPricePerKg : 0;
    const revenue = monthlyMode === "kg" ? soldKg * sellPricePerKg : monthlySalesRevenue;
    const beanCostTotal = roastedCostPerKg * soldKg;
    const grossProfit = revenue - beanCostTotal;
    const variableCost = variableCostPerKg * soldKg + revenue * (feeRate / 100);
    const contributionProfit = grossProfit - variableCost;
    const operatingProfit = contributionProfit - fixedTotal;
    const operatingMargin = revenue > 0 ? (operatingProfit / revenue) * 100 : 0;
    const contributionPerKg = sellPricePerKg - roastedCostPerKg - variableCostPerKg - sellPricePerKg * (feeRate / 100);
    const breakEvenKg = contributionPerKg > 0 ? fixedTotal / contributionPerKg : 0;
    const breakEvenRevenue = breakEvenKg * sellPricePerKg;

    return {
      greenCostPerKg,
      roastedCostPerKg,
      recommendedPrice,
      sellPricePerKg,
      grossProfitPerKg,
      grossMargin,
      fixedTotal,
      soldKg,
      revenue,
      beanCostTotal,
      grossProfit,
      variableCost,
      contributionProfit,
      operatingProfit,
      operatingMargin,
      contributionPerKg,
      breakEvenKg,
      breakEvenRevenue,
    };
  }, [beans, fixedCosts, monthlyKg, monthlyMode, monthlyRevenue, ratioOk, roastLoss, salesFeeRate, sellPriceInput, targetMargin, totalRatio, variablePerKg]);

  const makeEntry = (name) => ({
    id: uid(),
    name,
    savedAt: new Date().toLocaleString("ko-KR"),
    beans: beans.map((b) => ({ ...b })),
    roastLoss,
    targetMargin,
    sellPriceInput,
    monthlyMode,
    monthlyKg,
    monthlyRevenue,
    variablePerKg,
    salesFeeRate,
    fixedCosts,
    memo,
    sellPrice: sim?.sellPricePerKg || 0,
    operatingProfit: sim?.operatingProfit || 0,
  });

  const saveBlend = () => {
    if (!ratioOk || !sim) return showToast("배합비 합계를 100%로 맞춰주세요.", "err");
    const name = blendName.trim() || `블렌드 ${todayStr()}`;
    const next = [makeEntry(name), ...saved];
    setSaved(next);
    persistSaved(next);
    setBlendName("");
    showToast(`"${name}" 저장 완료`);
  };

  const loadBlend = (entry) => {
    const item = normalizeSaved(entry);
    setBeans(item.beans.map(normalizeBean));
    setRoastLoss(item.roastLoss);
    setTargetMargin(item.targetMargin);
    setSellPriceInput(item.sellPriceInput);
    setMonthlyMode(item.monthlyMode);
    setMonthlyKg(item.monthlyKg);
    setMonthlyRevenue(item.monthlyRevenue);
    setVariablePerKg(item.variablePerKg);
    setSalesFeeRate(item.salesFeeRate);
    setFixedCosts(item.fixedCosts);
    setMemo(item.memo);
    setBlendName(item.name);
    setPage("calc");
    showToast(`"${item.name}" 불러왔습니다.`);
  };

  const duplicateBlend = (entry) => {
    const item = normalizeSaved(entry);
    const next = [{ ...item, id: uid(), name: `${item.name} 복사본`, savedAt: new Date().toLocaleString("ko-KR") }, ...saved];
    setSaved(next);
    persistSaved(next);
    showToast("복제했습니다.");
  };

  const deleteBlend = (id) => {
    const next = saved.filter((s) => s.id !== id);
    setSaved(next);
    persistSaved(next);
    showToast("삭제했습니다.", "err");
  };

  const exportJSON = () => downloadFile(JSON.stringify(saved, null, 2), `roastery_simple_${todayStr()}.json`, "application/json");
  const importJSON = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!Array.isArray(parsed)) throw new Error();
        const normalized = parsed.map(normalizeSaved);
        const next = [...normalized, ...saved];
        setSaved(next);
        persistSaved(next);
        showToast(`${normalized.length}개 가져왔습니다.`);
      } catch {
        showToast("올바른 JSON 파일이 아닙니다.", "err");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="app-shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=IBM+Plex+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #0e0e0e; }
        input[type=number], input[type=text], textarea {
          width: 100%; background: #181818; color: #ede6d8; border: 1px solid #2c2c2c;
          border-radius: 7px; padding: 8px 11px; outline: none; font-family: 'IBM Plex Mono', monospace;
          font-size: 13px; transition: border-color 0.2s;
        }
        input:focus, textarea:focus { border-color: #c8a96e; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
        textarea { min-height: 72px; resize: vertical; line-height: 1.5; }
        .app-shell { display: flex; min-height: 100vh; background: #0e0e0e; color: #ede6d8; font-family: 'IBM Plex Mono', 'Courier New', monospace; }
        .sidebar { flex-shrink: 0; background: #111; border-right: 1px solid #1e1e1e; display: flex; flex-direction: column; overflow: hidden; position: sticky; top: 0; height: 100vh; transition: width 0.2s; }
        .content-wrap { flex: 1; display: flex; justify-content: center; overflow-y: auto; }
        .main { width: min(100%, 900px); padding: 34px 28px; }
        .lbl { font-size: 9px; letter-spacing: 2.4px; text-transform: uppercase; color: #5a5040; margin-bottom: 5px; }
        .step-lbl { font-size: 9px; letter-spacing: 2.5px; color: #c8a96e; margin: 22px 0 10px; }
        .card { background: #161616; border: 1px solid #222; border-radius: 8px; padding: 16px; }
        .metric { background: #141414; border: 1px solid #222; border-radius: 8px; padding: 14px; }
        .metric .value { font-family: 'DM Serif Display', serif; font-size: 22px; line-height: 1.05; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .btn { background: #1c1c1c; border: 1px solid #2e2e2e; color: #c8a96e; padding: 7px 13px; border-radius: 7px; cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.7px; }
        .btn:hover { background: #242424; }
        .btn-primary { background: #c8a96e; border: 1px solid #c8a96e; color: #0e0e0e; padding: 7px 16px; border-radius: 7px; cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 700; }
        .btn-del { color: #e07878; border: none; background: transparent; padding: 5px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }
        .btn-del:hover { background: #1a0f0f; }
        .seg { display: flex; background: #111; border: 1px solid #2a2a2a; border-radius: 8px; overflow: hidden; }
        .seg-btn { flex: 1; border: none; padding: 8px; cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
        .seg-btn.on { background: #c8a96e; color: #0e0e0e; font-weight: 700; }
        .seg-btn.off { background: transparent; color: #5a5040; }
        .ratio-bar { display: flex; height: 7px; border-radius: 99px; overflow: hidden; background: #1a1a1a; }
        .row { display: flex; justify-content: space-between; gap: 14px; padding: 9px 0; border-bottom: 1px solid #1c1c1c; font-size: 12px; }
        .row:last-child { border-bottom: none; }
        .nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 9px; cursor: pointer; font-size: 12px; margin-bottom: 4px; border: none; width: 100%; text-align: left; font-family: 'IBM Plex Mono', monospace; }
        .nav-item.active { background: #1e1608; color: #c8a96e; }
        .nav-item.inactive { background: transparent; color: #5a5040; }
        .muted { color: #5a5040; }
        .gold { color: #c8a96e; }
        .green { color: #7ec87e; }
        .red { color: #e07878; }
        .tiny { font-size: 10px; color: #3a3020; line-height: 1.5; }
        @media (max-width: 760px) {
          .app-shell { display: block; }
          .sidebar { position: relative; width: 100% !important; height: auto; border-right: none; border-bottom: 1px solid #1e1e1e; }
          .content-wrap { display: block; overflow: visible; }
          .main { width: 100%; padding: 24px 16px; }
          .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
          .row { flex-direction: column; gap: 4px; }
        }
      `}</style>

      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 99,
            padding: "10px 18px",
            borderRadius: 10,
            fontSize: 12,
            background: toast.type === "err" ? "#1a0808" : "#081408",
            border: `1px solid ${toast.type === "err" ? "#4a1a1a" : "#1a4a1a"}`,
            color: toast.type === "err" ? "#e07878" : "#7ec87e",
          }}
        >
          {toast.msg}
        </div>
      )}

      <aside className="sidebar" style={{ width: sideOpen ? 250 : 56 }}>
        <div style={{ padding: "20px 14px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1a1a1a" }}>
          {sideOpen && (
            <div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 16, color: "#c8a96e", lineHeight: 1.1 }}>Roastery</div>
              <div style={{ fontSize: 9, color: "#3a3020", letterSpacing: 2, marginTop: 2 }}>SIMPLE MARGIN</div>
            </div>
          )}
          <button onClick={() => setSideOpen((v) => !v)} style={{ background: "transparent", border: "none", color: "#5a5040", cursor: "pointer", fontSize: 16, padding: 4 }}>
            {sideOpen ? "◀" : "▶"}
          </button>
        </div>

        <div style={{ padding: "14px 10px", flex: 1, overflowY: "auto" }}>
          {[
            { key: "calc", icon: "⚗", label: "계산기" },
            { key: "list", icon: "📋", label: `저장 (${saved.length})` },
          ].map((item) => (
            <button key={item.key} className={`nav-item ${page === item.key ? "active" : "inactive"}`} onClick={() => setPage(item.key)}>
              <span>{item.icon}</span>
              {sideOpen && <span>{item.label}</span>}
            </button>
          ))}

          {sideOpen && saved.length > 0 && (
            <>
              <div className="lbl" style={{ margin: "18px 4px 8px" }}>최근 저장</div>
              {saved.slice(0, 5).map((item) => (
                <div key={item.id} onClick={() => loadBlend(item)} style={{ padding: "8px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 4, background: "#161616", border: "1px solid #1e1e1e" }}>
                  <div style={{ fontSize: 11, color: "#7a6a50", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                  <div style={{ fontSize: 10, color: "#c8a96e", marginTop: 2 }}>{money(item.sellPrice)} / kg</div>
                </div>
              ))}
            </>
          )}
        </div>

        {sideOpen && (
          <div style={{ padding: "12px 10px", borderTop: "1px solid #1a1a1a", display: "grid", gap: 6 }}>
            <button className="btn" onClick={exportJSON}>JSON 내보내기</button>
            <button className="btn" onClick={() => fileRef.current.click()}>JSON 가져오기</button>
            <input ref={fileRef} type="file" accept=".json" onChange={importJSON} style={{ display: "none" }} />
          </div>
        )}
      </aside>

      <div className="content-wrap">
        <main className="main">
          {page === "calc" && (
            <>
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 9, letterSpacing: 3, color: "#3a3020", marginBottom: 8 }}>ROASTERY · SIMPLE PROFIT CALCULATOR</div>
                <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 33, margin: 0, fontWeight: 400 }}>
                  원두 <span className="gold">원가 & 월손익</span> 계산기
                </h1>
              </div>

              <div className="step-lbl">STEP 01 · 원두 1kg 원가</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {beans.map((bean, i) => {
                  const color = COLORS[i % COLORS.length];
                  const share = totalRatio > 0 ? ((Number(bean.ratio) || 0) / totalRatio) * 100 : 0;
                  return (
                    <div key={bean.id} className="card" style={{ borderLeft: `3px solid ${color}` }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                        <input type="text" value={bean.name} onChange={(e) => updateBean(bean.id, { name: e.target.value })} placeholder="생두 이름" />
                        <button className="btn-del" onClick={() => removeBean(bean.id)}>✕</button>
                      </div>
                      <div className="grid-2">
                        <div>
                          <div className="lbl">매입가 (원/kg)</div>
                          <input type="number" value={bean.pricePerKg} min={0} step={500} onChange={(e) => updateBean(bean.id, { pricePerKg: inputNumber(e.target.value, 0, 9999999) })} />
                        </div>
                        <div>
                          <div className="lbl">배합 비율 <span style={{ color }}>{share.toFixed(1)}%</span></div>
                          <input type="number" value={bean.ratio} min={0} max={100} step={1} onChange={(e) => updateBean(bean.id, { ratio: inputNumber(e.target.value, 0, 100) })} style={{ borderColor: ratioOk ? "#2c2c2c" : color }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="card" style={{ padding: "12px 16px", marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 700, color: ratioOk ? "#7ec87e" : "#e07878" }}>{totalRatio.toFixed(1)}%</span>
                    <span style={{ marginLeft: 8, fontSize: 10, color: ratioOk ? "#7ec87e" : "#e07878" }}>
                      {ratioOk ? "합계 100%" : totalRatio < 100 ? `${(100 - totalRatio).toFixed(1)} 부족` : `${(totalRatio - 100).toFixed(1)} 초과`}
                    </span>
                  </div>
                  {!ratioOk && <button className="btn" onClick={autoFill} disabled={!canAutoFill} style={{ opacity: canAutoFill ? 1 : 0.45 }}>자동 맞추기</button>}
                </div>
                <div className="ratio-bar">
                  {beans.map((bean, i) => (
                    <div key={bean.id} style={{ width: `${totalRatio > 0 ? ((Number(bean.ratio) || 0) / totalRatio) * 100 : 0}%`, background: COLORS[i % COLORS.length] }} />
                  ))}
                </div>
              </div>

              {beans.length < 6 && <button className="btn" onClick={addBean} style={{ marginTop: 10 }}>+ 생두 추가</button>}

              <div className="step-lbl">STEP 02 · kg당 마진</div>
              <div className="card">
                <div className="grid-3">
                  <div>
                    <div className="lbl">로스팅 손실률</div>
                    <input type="number" value={roastLoss} min={0} max={80} step={1} onChange={(e) => setRoastLoss(inputNumber(e.target.value, 0, 80))} />
                  </div>
                  <div>
                    <div className="lbl">목표 마진율</div>
                    <input type="number" value={targetMargin} min={0} max={95} step={1} onChange={(e) => setTargetMargin(inputNumber(e.target.value, 0, 95))} />
                  </div>
                  <div>
                    <div className="lbl">실제 판매가 / kg</div>
                    <input type="number" value={sellPriceInput} min={0} step={100} onChange={(e) => setSellPriceInput(e.target.value)} placeholder="비우면 추천가 사용" />
                  </div>
                </div>
              </div>

              {sim && (
                <>
                  <div className="grid-4" style={{ marginTop: 10 }}>
                    <div className="metric">
                      <div className="lbl">생두 원가 / kg</div>
                      <div className="value muted">{money(sim.greenCostPerKg)}</div>
                    </div>
                    <div className="metric">
                      <div className="lbl">로스팅 후 원가 / kg</div>
                      <div className="value">{money(sim.roastedCostPerKg)}</div>
                    </div>
                    <div className="metric">
                      <div className="lbl">추천 판매가 / kg</div>
                      <div className="value gold">{money(sim.recommendedPrice)}</div>
                    </div>
                    <div className="metric">
                      <div className="lbl">kg당 이익 / 마진</div>
                      <div className={`value ${sim.grossProfitPerKg >= 0 ? "green" : "red"}`}>{money(sim.grossProfitPerKg)}</div>
                      <div className="tiny">{pct(sim.grossMargin)}</div>
                    </div>
                  </div>

                  <div className="step-lbl">STEP 03 · 월 판매 시뮬레이션</div>
                  <div className="card">
                    <div className="grid-3">
                      <div>
                        <div className="lbl">계산 기준</div>
                        <div className="seg">
                          <button className={`seg-btn ${monthlyMode === "kg" ? "on" : "off"}`} onClick={() => setMonthlyMode("kg")}>판매 kg</button>
                          <button className={`seg-btn ${monthlyMode === "revenue" ? "on" : "off"}`} onClick={() => setMonthlyMode("revenue")}>매출</button>
                        </div>
                      </div>
                      {monthlyMode === "kg" ? (
                        <div>
                          <div className="lbl">월 판매량 kg</div>
                          <input type="number" value={monthlyKg} min={0} step={1} onChange={(e) => setMonthlyKg(inputNumber(e.target.value, 0, 999999))} />
                        </div>
                      ) : (
                        <div>
                          <div className="lbl">월 매출</div>
                          <input type="number" value={monthlyRevenue} min={0} step={10000} onChange={(e) => setMonthlyRevenue(inputNumber(e.target.value, 0, 999999999))} />
                        </div>
                      )}
                      <div>
                        <div className="lbl">카드/플랫폼 수수료율</div>
                        <input type="number" value={salesFeeRate} min={0} max={80} step={0.1} onChange={(e) => setSalesFeeRate(inputNumber(e.target.value, 0, 80))} />
                      </div>
                    </div>

                    <div className="grid-2" style={{ marginTop: 10 }}>
                      <div>
                        <div className="lbl">변동비 / kg</div>
                        <input type="number" value={variablePerKg} min={0} step={100} onChange={(e) => setVariablePerKg(inputNumber(e.target.value, 0, 9999999))} />
                        <div className="tiny" style={{ marginTop: 4 }}>포장재, 택배 보조, 소모품처럼 판매량에 따라 늘어나는 비용</div>
                      </div>
                      <div>
                        <div className="lbl">메모</div>
                        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="가격 기준, 거래처, 로스팅 메모" />
                      </div>
                    </div>

                    <div className="grid-3" style={{ marginTop: 10 }}>
                      <div>
                        <div className="lbl">인건비 / 월</div>
                        <input type="number" value={fixedCosts.labor} min={0} step={10000} onChange={(e) => updateFixedCost("labor", e.target.value)} />
                      </div>
                      <div>
                        <div className="lbl">임대료 / 월</div>
                        <input type="number" value={fixedCosts.rent} min={0} step={10000} onChange={(e) => updateFixedCost("rent", e.target.value)} />
                      </div>
                      <div>
                        <div className="lbl">기타 고정비 / 월</div>
                        <input type="number" value={fixedCosts.other} min={0} step={10000} onChange={(e) => updateFixedCost("other", e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div style={{ background: "linear-gradient(135deg,#16100a,#1c140e)", border: "1px solid #2e200c", borderRadius: 8, padding: 22, marginTop: 10 }}>
                    <div className="grid-4">
                      <div>
                        <div className="lbl">월 매출</div>
                        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: "#c8a96e" }}>{money(sim.revenue)}</div>
                        <div className="tiny">{sim.soldKg.toFixed(1)}kg 판매 기준</div>
                      </div>
                      <div>
                        <div className="lbl">매출총이익</div>
                        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28 }}>{money(sim.grossProfit)}</div>
                        <div className="tiny">매출 - 원두 원가</div>
                      </div>
                      <div>
                        <div className="lbl">공헌이익</div>
                        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28 }}>{money(sim.contributionProfit)}</div>
                        <div className="tiny">매출총이익 - 변동비</div>
                      </div>
                      <div>
                        <div className="lbl">영업이익</div>
                        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28 }} className={sim.operatingProfit >= 0 ? "green" : "red"}>{money(sim.operatingProfit)}</div>
                        <div className="tiny">영업이익률 {pct(sim.operatingMargin)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="card" style={{ marginTop: 10 }}>
                    <div className="lbl">계산 흐름</div>
                    {[
                      ["판매 원두 원가", money(sim.beanCostTotal)],
                      ["변동비", money(sim.variableCost)],
                      ["고정비", money(sim.fixedTotal)],
                      ["손익분기 판매량", `${sim.breakEvenKg.toFixed(1)}kg`],
                      ["손익분기 매출", money(sim.breakEvenRevenue)],
                    ].map(([label, value]) => (
                      <div className="row" key={label}>
                        <span className="muted">{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="card" style={{ marginTop: 10, borderColor: "#2e200c", background: "#131008" }}>
                    <div className="lbl" style={{ color: "#6a5030" }}>저장</div>
                    <div className="grid-2">
                      <input type="text" value={blendName} onChange={(e) => setBlendName(e.target.value)} placeholder="블렌드 이름" onKeyDown={(e) => e.key === "Enter" && saveBlend()} />
                      <button className="btn-primary" onClick={saveBlend}>저장</button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {page === "list" && (
            <>
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 9, letterSpacing: 3, color: "#3a3020", marginBottom: 8 }}>SAVED</div>
                <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 33, margin: 0, fontWeight: 400 }}>
                  저장된 <span className="gold">계산</span>
                </h1>
              </div>
              {saved.length === 0 ? (
                <div style={{ textAlign: "center", color: "#3a3020", fontSize: 13, padding: "60px 0" }}>저장된 계산이 없습니다.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {saved.map((item, index) => (
                    <div key={item.id} className="card" style={{ borderLeft: `3px solid ${COLORS[index % COLORS.length]}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 19 }}>{item.name}</div>
                          <div className="tiny" style={{ marginBottom: 10 }}>{item.savedAt}</div>
                          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                            <div>
                              <div className="lbl">판매가 / kg</div>
                              <div className="gold" style={{ fontFamily: "'DM Serif Display',serif", fontSize: 19 }}>{money(item.sellPrice)}</div>
                            </div>
                            <div>
                              <div className="lbl">월 영업이익</div>
                              <div className={item.operatingProfit >= 0 ? "green" : "red"} style={{ fontFamily: "'DM Serif Display',serif", fontSize: 19 }}>{money(item.operatingProfit)}</div>
                            </div>
                          </div>
                          {item.memo && <div className="tiny" style={{ marginTop: 10, color: "#6a5a40" }}>{item.memo}</div>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <button className="btn-primary" onClick={() => loadBlend(item)}>불러오기</button>
                          <button className="btn" onClick={() => duplicateBlend(item)}>복제</button>
                          <button className="btn-del" onClick={() => deleteBlend(item.id)}>삭제</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <p style={{ fontSize: 10, color: "#2a2018", textAlign: "center", marginTop: 40 }}>계산 결과는 기준값에 따라 달라질 수 있습니다.</p>
        </main>
      </div>
    </div>
  );
}
