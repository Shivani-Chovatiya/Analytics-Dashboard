import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Area,
  AreaChart,
  Legend,
} from "recharts";
import {
  Search,
  Upload,
  Filter,
  Gauge,
  Car,
  Battery,
  Database,
  RefreshCcw,
} from "lucide-react";
// import CSVFile from "../public/Electric_Vehicle_Population_Data.csv";

// --- Utility helpers ---
const number = (n) => (isFinite(n) ? n : 0);
const fmt = (n) => new Intl.NumberFormat().format(Math.round(number(n)));

// Best-effort column access across possible dataset variants
const COL = {
  make: ["Make", "make"],
  model: ["Model", "model"],
  modelYear: ["Model Year", "ModelYear", "model_year", "Model_Year"],
  type: ["Electric Vehicle Type", "EV Type", "Type", "Electric_Vehicle_Type"],
  cafv: [
    "Clean Alternative Fuel Vehicle (CAFV) Eligibility",
    "CAFV Eligibility",
    "CAFV",
    "cafv",
  ],
  range: ["Electric Range", "Range", "electric_range"],
  baseMsrp: ["Base MSRP", "MSRP"],
  city: ["City", "city"],
  county: ["County", "county"],
  state: ["State", "state"],
  lat: ["Vehicle Location", "Latitude", "lat"],
  lon: ["Vehicle Location", "Longitude", "lon"],
};

function getField(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") return row[k];
  }
  return undefined;
}

function coerceYear(y) {
  if (y === undefined || y === null || y === "") return null;
  const n = Number(y);
  return Number.isFinite(n) ? n : null;
}

function coerceRange(r) {
  if (r === undefined || r === null || r === "") return null;
  const n = Number(r);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function uniqueSorted(values) {
  return Array.from(
    new Set(values.filter((v) => v !== null && v !== undefined))
  ).sort((a, b) => (a > b ? 1 : -1));
}

// --- Main Component ---
export default function EVAnalyticsDashboard() {
  const [rows, setRows] = useState([]);
  const [rawHeaders, setRawHeaders] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");

  // Filters
  const [evType, setEvType] = useState("All"); // All | BEV | PHEV
  const [make, setMake] = useState("All");
  const [yearFrom, setYearFrom] = useState(0);
  const [yearTo, setYearTo] = useState(9999);
  const [query, setQuery] = useState("");

  useEffect(() => {
    async function fetchCsv() {
      setStatus("loading");
      setError("");

      try {
        const res = await fetch("/Electric_Vehicle_Population_Data.csv");
        if (!res.ok) throw new Error("Failed to fetch CSV");

        const text = await res.text();
        const parsed = Papa.parse(text, {
          header: true,
          dynamicTyping: false,
          skipEmptyLines: true,
        });

        if (parsed?.data?.length) {
          setRows(parsed.data);
          setRawHeaders(parsed.meta?.fields || []);

          // Extract year range
          const ys = parsed.data
            .map((r) => Number(r["Model Year"])) // 👈 adjust column name if needed
            .filter((x) => !isNaN(x));

          if (ys.length) {
            setYearFrom(Math.min(...ys));
            setYearTo(Math.max(...ys));
          }

          setStatus("ready");
        } else {
          throw new Error("CSV file empty or invalid");
        }
      } catch (e) {
        setStatus("error");
        setError(e.message || "Could not auto-load CSV");
      }
    }

    fetchCsv();
  }, []);
  const handleUpload = (file) => {
    if (!file) return;
    setStatus("loading");
    Papa.parse(file, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      complete: (res) => {
        setRows(res.data || []);
        setRawHeaders(res.meta?.fields || []);
        const ys = (res.data || [])
          .map((r) => coerceYear(getField(r, COL.modelYear)))
          .filter((x) => x !== null);
        if (ys.length) {
          setYearFrom(Math.min(...ys));
          setYearTo(Math.max(...ys));
        }
        setStatus("ready");
      },
      error: (err) => {
        setStatus("error");
        setError(err?.message || "Failed to parse CSV");
      },
    });
  };

  // Normalize rows with consistent accessors
  const norm = useMemo(() => {
    return rows.map((r) => {
      const modelYear = coerceYear(getField(r, COL.modelYear));
      const type = String(getField(r, COL.type) || "")
        .toUpperCase()
        .includes("PHEV")
        ? "PHEV"
        : "BEV";
      const range = coerceRange(getField(r, COL.range));
      const make = getField(r, COL.make) || "Unknown";
      const model = getField(r, COL.model) || "";
      const cafv = getField(r, COL.cafv) || "Unknown";
      const city = getField(r, COL.city) || "";
      const county = getField(r, COL.county) || "";
      const state = getField(r, COL.state) || "";
      return {
        modelYear,
        type,
        range,
        make,
        model,
        cafv,
        city,
        county,
        state,
        __raw: r,
      };
    });
  }, [rows]);

  const allMakes = useMemo(
    () => ["All", ...uniqueSorted(norm.map((r) => r.make))],
    [norm]
  );
  const yearBounds = useMemo(() => {
    const ys = norm.map((r) => r.modelYear).filter((x) => x !== null);
    if (!ys.length) return { min: 0, max: 0 };
    return { min: Math.min(...ys), max: Math.max(...ys) };
  }, [norm]);

  // Apply filters
  const filtered = useMemo(() => {
    return norm.filter((r) => {
      if (evType !== "All" && r.type !== evType) return false;
      if (make !== "All" && r.make !== make) return false;
      if (
        r.modelYear !== null &&
        (r.modelYear < yearFrom || r.modelYear > yearTo)
      )
        return false;
      if (query) {
        const q = query.toLowerCase();
        const hay =
          `${r.make} ${r.model} ${r.city} ${r.county} ${r.state}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [norm, evType, make, yearFrom, yearTo, query]);

  // KPIs & aggregations
  const kpis = useMemo(() => {
    const total = filtered.length;
    const bev = filtered.filter((r) => r.type === "BEV").length;
    const phev = filtered.filter((r) => r.type === "PHEV").length;
    const ranges = filtered
      .map((r) => r.range)
      .filter((x) => x !== null && x > 0);
    const avgRange = ranges.length
      ? ranges.reduce((a, b) => a + b, 0) / ranges.length
      : 0;
    const years = filtered.map((r) => r.modelYear).filter((x) => x !== null);
    const medianYear = years.length
      ? [...years].sort((a, b) => a - b)[Math.floor(years.length / 2)]
      : 0;
    return { total, bev, phev, avgRange, medianYear };
  }, [filtered]);

  const byYear = useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      if (r.modelYear === null) continue;
      map.set(r.modelYear, (map.get(r.modelYear) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, count]) => ({ year, count }));
  }, [filtered]);

  const topMakes = useMemo(() => {
    const counts = new Map();
    for (const r of filtered) counts.set(r.make, (counts.get(r.make) || 0) + 1);
    const arr = Array.from(counts.entries()).map(([name, count]) => ({
      name,
      count,
    }));
    return arr.sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filtered]);

  const cafvBreakdown = useMemo(() => {
    const counts = new Map();
    for (const r of filtered) counts.set(r.cafv, (counts.get(r.cafv) || 0) + 1);
    return Array.from(counts.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  }, [filtered]);

  // Table pagination
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => setPage(1), [filtered]);
  const pageRows = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white text-slate-900">
      <header className="sticky top-0 z-20 backdrop-blur bg-white/70 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="w-10 h-10 rounded-2xl bg-slate-900 grid place-items-center shadow-md">
              <Car className="w-5 h-5 text-white" />
            </div>
          </motion.div>
          <div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
              MapUp — EV Analytics Dashboard
            </h1>
            <p className="text-sm text-slate-500 -mt-0.5">
              Interactive insights from the Electric Vehicle Population dataset
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow transition cursor-pointer">
              <Upload className="w-4 h-4" />
              <span className="text-sm font-medium">Upload CSV</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files?.[0])}
              />
            </label>
            <button
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow transition"
              onClick={() => window.location.reload()}
            >
              <RefreshCcw className="w-4 h-4" />
              <span className="text-sm">Reset</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Status / Empty states */}
        {status !== "ready" && (
          <div className="grid place-items-center py-20">
            <div className="max-w-xl text-center">
              {status === "loading" && (
                <>
                  <div className="w-14 h-14 rounded-3xl border-4 border-slate-200 border-t-slate-900 animate-spin mx-auto" />
                  <p className="mt-6 text-slate-600">
                    Loading dataset… Trying common paths in your repo.
                  </p>
                </>
              )}
              {status === "error" && (
                <>
                  <div className="w-14 h-14 rounded-3xl bg-red-50 grid place-items-center mx-auto">
                    <Database className="w-7 h-7 text-red-500" />
                  </div>
                  <p className="mt-4 font-medium">CSV not found</p>
                  <p className="text-slate-600 mt-1">{error}</p>
                  <p className="text-slate-500 text-sm mt-3">
                    Place the CSV at{" "}
                    <code>/Electric_Vehicle_Population_Data.csv</code>{" "}
                    (recommended) or use the Upload button above.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {status === "ready" && (
          <>
            {/* Filters */}
            <section className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 mb-6">
              <div className="md:col-span-4">
                <div className="flex items-center gap-2 px-3 py-2 rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <Search className="w-4 h-4" />
                  <input
                    className="w-full outline-none text-sm py-1"
                    placeholder="Search make, model, city, county, state…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="px-3 py-2 rounded-2xl border border-slate-200 bg-white shadow-sm flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  <select
                    className="w-full bg-transparent text-sm"
                    value={evType}
                    onChange={(e) => setEvType(e.target.value)}
                  >
                    <option>All</option>
                    <option>BEV</option>
                    <option>PHEV</option>
                  </select>
                </div>
              </div>
              <div className="md:col-span-3">
                <div className="px-3 py-2 rounded-2xl border border-slate-200 bg-white shadow-sm flex items-center gap-2">
                  <Battery className="w-4 h-4" />
                  <select
                    className="w-full bg-transparent text-sm"
                    value={make}
                    onChange={(e) => setMake(e.target.value)}
                  >
                    {allMakes.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="md:col-span-3 grid grid-cols-2 gap-2">
                <div className="px-3 py-2 rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <label className="text-[11px] text-slate-500">
                    Year from
                  </label>
                  <input
                    type="number"
                    className="w-full bg-transparent text-sm outline-none"
                    value={yearFrom}
                    min={yearBounds.min || 1990}
                    max={yearTo}
                    onChange={(e) => setYearFrom(Number(e.target.value))}
                  />
                </div>
                <div className="px-3 py-2 rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <label className="text-[11px] text-slate-500">Year to</label>
                  <input
                    type="number"
                    className="w-full bg-transparent text-sm outline-none"
                    value={yearTo}
                    min={yearFrom}
                    max={yearBounds.max || 2050}
                    onChange={(e) => setYearTo(Number(e.target.value))}
                  />
                </div>
              </div>
            </section>

            {/* KPI cards */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
              <KPI
                icon={<Car className="w-5 h-5" />}
                label="Vehicles"
                value={fmt(kpis.total)}
                sub={`${fmt(kpis.bev)} BEV • ${fmt(kpis.phev)} PHEV`}
              />
              <KPI
                icon={<Gauge className="w-5 h-5" />}
                label="Avg. Electric Range"
                value={`${Math.round(kpis.avgRange)} mi`}
                sub="Only non-zero values"
              />
              <KPI
                icon={<Battery className="w-5 h-5" />}
                label="BEV Share"
                value={`${
                  kpis.total ? Math.round((kpis.bev / kpis.total) * 100) : 0
                }%`}
                sub={`${fmt(kpis.bev)} of ${fmt(kpis.total)}`}
              />
              <KPI
                icon={<Database className="w-5 h-5" />}
                label="Median Model Year"
                value={kpis.medianYear || "—"}
                sub={`${yearBounds.min || "—"}–${yearBounds.max || "—"}`}
              />
            </section>

            {/* Charts */}
            <section className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
              <Card
                className="lg:col-span-3"
                title="Registrations by Model Year"
              >
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart
                    data={byYear}
                    margin={{ left: 10, right: 10, top: 10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopOpacity={0.7} />
                        <stop offset="100%" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" />
                    <YAxis />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="count"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#g1)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>

              <Card className="lg:col-span-2" title="Top 10 Makes (filtered)">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={topMakes}
                    margin={{ left: 10, right: 10, top: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
              <Card className="lg:col-span-2" title="BEV vs PHEV">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "BEV", value: kpis.bev },
                        { name: "PHEV", value: kpis.phev },
                      ]}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label
                    >
                      <Cell />
                      <Cell />
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Card>

              <Card
                className="lg:col-span-3"
                title="CAFV Eligibility (filtered)"
              >
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={cafvBreakdown}
                    margin={{ left: 10, right: 10, top: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </section>

            {/* Data table */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold">
                  Rows (filtered): {fmt(filtered.length)}
                </h3>
                <div className="text-xs text-slate-500">
                  Page {page} / {totalPages}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-slate-600">
                      <Th>Year</Th>
                      <Th>Type</Th>
                      <Th>Make</Th>
                      <Th>Model</Th>
                      <Th>Range (mi)</Th>
                      <Th>CAFV</Th>
                      <Th>City</Th>
                      <Th>County</Th>
                      <Th>State</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <Td>{r.modelYear ?? "—"}</Td>
                        <Td>{r.type}</Td>
                        <Td>{r.make}</Td>
                        <Td>{r.model}</Td>
                        <Td>{r.range ?? "—"}</Td>
                        <Td className="max-w-[280px] truncate" title={r.cafv}>
                          {r.cafv}
                        </Td>
                        <Td>{r.city}</Td>
                        <Td>{r.county}</Td>
                        <Td>{r.state}</Td>
                      </tr>
                    ))}
                    {!pageRows.length && (
                      <tr>
                        <td
                          colSpan={9}
                          className="text-center text-slate-500 py-10"
                        >
                          No rows match the current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm disabled:opacity-50"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Prev
                </button>
                <div className="text-xs text-slate-500">
                  Showing {(page - 1) * pageSize + 1}-
                  {Math.min(page * pageSize, filtered.length)} of{" "}
                  {filtered.length}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>Go to:</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={page}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (value >= 1 && value <= totalPages) {
                        setPage(value);
                      }
                    }}
                    className="w-16 px-2 py-1 border rounded-md text-center"
                  />
                  <span>/ {totalPages}</span>
                </div>
                <button
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm disabled:opacity-50"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </button>
              </div>
            </section>

            {/* Raw headers disclosure for debugging */}
            <details className="mt-6 text-sm text-slate-600">
              <summary className="cursor-pointer">
                Raw CSV headers detected
              </summary>
              <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <code className="break-words whitespace-pre-wrap">
                  {rawHeaders.join(", ") || "—"}
                </code>
              </div>
            </details>
          </>
        )}
      </main>
    </div>
  );
}

function KPI({ icon, label, value, sub }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white grid place-items-center">
            {icon}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              {label}
            </div>
            <div className="text-xl font-semibold leading-tight">{value}</div>
            {sub && <div className="text-xs text-slate-500">{sub}</div>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Card({ title, className = "", children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-4 ${className}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="h-[260px]">{children}</div>
    </motion.div>
  );
}

function Th({ children }) {
  return (
    <th className="px-3 py-2 font-medium text-xs uppercase tracking-wide">
      {children}
    </th>
  );
}
function Td({ children }) {
  return <td className="px-3 py-2 text-slate-700">{children}</td>;
}
