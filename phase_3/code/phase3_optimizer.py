"""
PHASE 3 - Wind farm layout optimiser (NSGA-II + weighted-sum GA baseline).
Colab: put the 5 input files in DATA_DIR (default /content/phase2_out + power curve), run `python phase3_optimizer.py`
or paste as a cell. If inputs are missing the script falls back to a SYNTHETIC stand-in (clearly flagged) - only for code testing.
"""
import os, json, math, time, itertools, warnings
import numpy as np, pandas as pd
from math import gamma
warnings.filterwarnings("ignore")

# ============================ CONFIG ============================
CFG = dict(
    DATA_DIR=os.environ.get("P3_DATA", "/content/phase3_in"),
    OUT_DIR=os.environ.get("P3_OUT", "/content/phase3_out"),
    N_TURB=10, RATED_KW=2050.0, DV=0.5, HOURS=8760,
    TYPES=[50, 100, 150],
    # ---- COST ASSUMPTIONS (NOT market prices) ----
    TURBINE_COST=1.0, TOWER_SURCHARGE={50: 0.00, 100: 0.10, 150: 0.25}, ROAD_COST_PER_KM=0.02,
    BUDGET=13.0, MIN_DIST_KM=0.65,
    POP=100, GENS=150, PC=0.80, PM=0.05, ELITE=2, TOURN_K=3,
    SVF_W=(0.50, 0.25, 0.25), PENALTY=50.0,
    SEEDS=list(range(42, 52)), MAIN_SEED=42, N_WEIGHT_VECTORS=10,
    ACCESS_DECAY_SENS=0.5, HV_REF=(1.1, 1.1, 1.1),
)
rng_g = np.random.default_rng(0)

# ============================ DATA ============================
def synthetic_inputs():
    """SYNTHETIC stand-in for code testing ONLY. Not real data."""
    r = np.random.default_rng(1)
    n = 251; gx, gy = np.meshgrid(np.arange(16), np.arange(16)); idx = r.permutation(256)[:n]
    x = gx.ravel()[idx] * 2850.0 + 5e5; y = gy.ravel()[idx] * 2850.0 + 4.4e6
    ws100 = np.clip(r.normal(6.5, 0.8, n), 4, 9)
    sites = pd.DataFrame(dict(site_id=[f"S{i:03d}" for i in range(n)], lon=49 + (x - 5e5) / 1e5, lat=40 + (y - 4.4e6) / 1e5,
                              x_utm=x, y_utm=y, ws50=ws100 * 0.92, ws100=ws100, ws150=ws100 * 1.06))
    acc = pd.DataFrame(dict(id=[f"ACC{i}" for i in range(7)], type=["substation"] * 4 + ["road"] * 3,
                            lat=40 + r.uniform(0, 4, 7) / 10, lon=49 + r.uniform(0, 4, 7) / 10))
    ax = r.uniform(5e5, 5e5 + 45600, 7); ay = r.uniform(4.4e6, 4.4e6 + 45600, 7)
    d = np.sqrt((x[:, None] - ax[None]) ** 2 + (y[:, None] - ay[None]) ** 2) / 1000
    sites["dist_km"] = d.min(1); sites["nearest_access_id"] = acc["id"].values[d.argmin(1)]
    sites["access_score"] = np.exp(-0.1 * sites["dist_km"])
    v = np.arange(0, 25.01, 0.5); p = np.where(v < 3, 0, np.minimum(2050, 2050 * ((v - 3) / 9.5) ** 3)); p[v >= 25] = 0
    pc = pd.DataFrame(dict(wind_speed_ms=v, power_kw=p))
    return sites, acc, pc, True

def load_inputs():
    D = CFG["DATA_DIR"]; need = ["candidate_sites.csv", "accessibility_points.csv", "power_curve_table.csv"]
    if all(os.path.exists(os.path.join(D, f)) for f in need):
        return (pd.read_csv(os.path.join(D, need[0])), pd.read_csv(os.path.join(D, need[1])),
                pd.read_csv(os.path.join(D, need[2])), False)
    print("!!! INPUT FILES NOT FOUND in", D, "-> using SYNTHETIC stand-in data (results are NOT real) !!!")
    return synthetic_inputs()

# ============================ AEP / TABLE ============================
def rayleigh_pdf(v, vm):
    return (np.pi / 2) * v / vm ** 2 * np.exp(-np.pi / 4 * (v / vm) ** 2)

def weibull_pdf(v, A, k):
    return (k / A) * (v / A) ** (k - 1) * np.exp(-(v / A) ** k)

def aep_mwh(vm, pc, pdf="rayleigh", k=None):
    v = pc["wind_speed_ms"].values; P = pc["power_kw"].values
    if pdf == "rayleigh": f = rayleigh_pdf(v, vm)
    else: f = weibull_pdf(v, vm / gamma(1 + 1 / k), k)
    return CFG["HOURS"] * np.sum(P * f * CFG["DV"]) / 1000.0

def build_table(sites, pc, decay=None):
    """Returns tidy table + arrays aep[S,T], cost[S,T], acc[S]."""
    T = CFG["TYPES"]; S = len(sites); aep = np.zeros((S, 3)); cost = np.zeros((S, 3))
    for j, t in enumerate(T):
        ws = sites[f"ws{t}"].values
        aep[:, j] = [aep_mwh(w, pc) for w in ws]
        cost[:, j] = CFG["TURBINE_COST"] * (1 + CFG["TOWER_SURCHARGE"][t]) + CFG["ROAD_COST_PER_KM"] * sites["dist_km"].values
    acc = sites["access_score"].values if decay is None else np.exp(-decay * sites["dist_km"].values)
    rows = []
    for j, t in enumerate(T):
        rows.append(pd.DataFrame(dict(site_id=sites.site_id, tower_m=t, hub_ws=sites[f"ws{t}"], aep_mwh=aep[:, j],
                                      capacity_factor=aep[:, j] / (CFG["RATED_KW"] / 1000 * CFG["HOURS"]),
                                      access=acc, cost_units=cost[:, j])))
    return pd.concat(rows, ignore_index=True), aep, cost, acc

# ============================ PROBLEM ============================
class Problem:
    def __init__(self, sites, aep, cost, acc):
        self.sites, self.aep, self.cost, self.acc = sites, aep, cost, acc
        self.S = len(sites); self.N = CFG["N_TURB"]
        xy = sites[["x_utm", "y_utm"]].values / 1000.0
        self.D = np.sqrt(((xy[:, None] - xy[None]) ** 2).sum(-1))           # km
        # FIXED normalisation bounds from the table (not from the current front)
        best_aep_site = aep.max(1); N = self.N
        self.E_hi = np.sort(best_aep_site)[-N:].sum()      # N best distinct sites, each at its best tower
        self.E_lo = N * aep.min()                          # N worst (site,type) entries
        self.C_lo = np.sort(cost.min(1))[:N].sum()         # N cheapest distinct sites at cheapest tower
        self.C_hi = np.sort(cost.max(1))[-N:].sum()        # N costliest distinct sites at dearest tower

    # pop: int array (P, N, 2) -> [type_idx, site_idx]
    def raw(self, pop):
        t, s = pop[..., 0], pop[..., 1]
        E = self.aep[s, t].sum(1); C = self.cost[s, t].sum(1); A = self.acc[s].mean(1)
        dd = self.D[s[:, :, None], s[:, None, :]]
        iu = np.triu_indices(self.N, 1); dpair = dd[:, iu[0], iu[1]]
        short = np.maximum(0, CFG["MIN_DIST_KM"] - dpair).sum(1) / CFG["MIN_DIST_KM"]
        dup = np.array([self.N - len(set(r)) for r in s])
        return E, A, C, short, dup

    def norm(self, E, C):
        return (np.clip((E - self.E_lo) / (self.E_hi - self.E_lo), 0, 1), np.clip((C - self.C_lo) / (self.C_hi - self.C_lo), 0, 1))

    def svf(self, E, A, C, w=None):
        w = w or CFG["SVF_W"]; en, cn = self.norm(E, C)
        return w[0] * en + w[1] * A + w[2] * (1 - cn)

    def violation(self, C, short, dup):
        return np.maximum(0, C - CFG["BUDGET"]) / CFG["BUDGET"] + short + dup

    def evaluate(self, pop):
        E, A, C, short, dup = self.raw(pop)
        return np.column_stack([-E, -A, C]), self.violation(C, short, dup)

    def hv_coords(self, objs):
        """3 minimise coords in fixed normalised space: (1-E_norm_raw, 1-access, C_norm_raw). Unclipped, so ref point can exceed 1."""
        E, A, C = -objs[:, 0], -objs[:, 1], objs[:, 2]
        return np.column_stack([1 - (E - self.E_lo) / (self.E_hi - self.E_lo), 1 - A, (C - self.C_lo) / (self.C_hi - self.C_lo)])

    def random_pop(self, n, rng):
        return np.stack([rng.integers(0, 3, (n, self.N)), rng.integers(0, self.S, (n, self.N))], -1)

    def repair(self, pop, rng):
        for c in pop:
            seen = set(); dups = []
            for i, s in enumerate(c[:, 1]):
                if s in seen: dups.append(i)
                else: seen.add(s)
            if dups:
                free = np.array(sorted(set(range(self.S)) - seen)); pick = rng.choice(free, len(dups), replace=False)
                c[dups, 1] = pick
        return pop

# ============================ HYPERVOLUME (one convention: all minimise) ============================
def hv2d(P, ref):
    P = P[(P[:, 0] < ref[0]) & (P[:, 1] < ref[1])]
    if len(P) == 0: return 0.0
    P = P[np.argsort(P[:, 0])]; hv = 0.0; prev_y = ref[1]
    for x, y in P:
        if y < prev_y: hv += (ref[0] - x) * (prev_y - y); prev_y = y
    return hv

def hv3d(P, ref):
    """Exact 3D HV (minimisation) by slicing along z. Points not strictly better than ref in all coords are ignored."""
    P = np.asarray(P, float).reshape(-1, 3); ref = np.asarray(ref, float)
    P = P[np.all(P < ref, axis=1)]
    if len(P) == 0: return 0.0
    P = P[np.argsort(P[:, 2])]; hv = 0.0
    for i in range(len(P)):
        z_next = P[i + 1, 2] if i + 1 < len(P) else ref[2]
        hv += hv2d(P[:i + 1, :2], ref[:2]) * (z_next - P[i, 2])
    return hv

# ============================ NSGA-II ============================
def dom_matrix(objs, viol):
    """M[i,j]=True if i constrained-dominates j."""
    feas = viol <= 0
    le = np.all(objs[:, None] <= objs[None], axis=2); lt = np.any(objs[:, None] < objs[None], axis=2)
    pareto = le & lt
    M = (feas[:, None] & feas[None] & pareto) | (feas[:, None] & ~feas[None]) | (~feas[:, None] & ~feas[None] & (viol[:, None] < viol[None]))
    np.fill_diagonal(M, False); return M

def fast_sort(objs, viol):
    M = dom_matrix(objs, viol); cnt = M.sum(0).astype(int); fronts = []; cur = list(np.where(cnt == 0)[0])
    while cur:
        fronts.append(cur); nxt = []
        for i in cur:
            for j in np.where(M[i])[0]:
                cnt[j] -= 1
                if cnt[j] == 0: nxt.append(j)
        cur = nxt
    return fronts

def crowding(objs, front):
    d = np.zeros(len(objs)); l = len(front)
    if l <= 2: d[front] = np.inf; return d
    for m in range(objs.shape[1]):
        o = sorted(front, key=lambda i: objs[i, m]); d[o[0]] = d[o[-1]] = np.inf
        rg = objs[o[-1], m] - objs[o[0], m]
        if rg == 0: continue
        for k in range(1, l - 1): d[o[k]] += (objs[o[k + 1], m] - objs[o[k - 1], m]) / rg
    return d

def make_offspring(pm, pop, pick, rng):
    """pick: array of parent indices (len P). Two-point crossover on whole genes, per-gene replacement mutation, duplicate repair."""
    P, N = len(pop), pm.N; kids = pop[pick].copy()
    for a in range(0, P - 1, 2):
        if rng.random() < CFG["PC"]:
            c1 = rng.integers(1, N - 1); c2 = rng.integers(c1 + 1, N)
            kids[a, c1:c2], kids[a + 1, c1:c2] = pop[pick[a + 1], c1:c2].copy(), pop[pick[a], c1:c2].copy()
    mask = rng.random((P, N)) < CFG["PM"]; k = mask.sum()
    kids[mask, 0] = rng.integers(0, 3, k); kids[mask, 1] = rng.integers(0, pm.S, k)
    return pm.repair(kids, rng)

def canon(c): return tuple(sorted(map(tuple, c.tolist())))

def run_nsga2(pm, seed, log=False):
    rng = np.random.default_rng(seed); P = CFG["POP"]
    pop = pm.repair(pm.random_pop(P, rng), rng); objs, viol = pm.evaluate(pop)
    for g in range(CFG["GENS"]):
        fr = fast_sort(objs, viol); rank = np.zeros(P, int); cd = np.zeros(P)
        for r, f in enumerate(fr): rank[f] = r; cd[f] = crowding(objs, f)[f]
        def tour():
            a, b = rng.choice(P, 2, replace=False)
            if rank[a] != rank[b]: return a if rank[a] < rank[b] else b
            return a if cd[a] >= cd[b] else b
        pick = np.array([tour() for _ in range(P)])
        kids = make_offspring(pm, pop, pick, rng); ko, kv = pm.evaluate(kids)
        allp = np.concatenate([pop, kids]); allo = np.vstack([objs, ko]); allv = np.concatenate([viol, kv])
        fr = fast_sort(allo, allv); sel = []
        for f in fr:
            if len(sel) + len(f) <= P: sel += f
            else:
                d = crowding(allo, f); sel += sorted(f, key=lambda i: -d[i])[:P - len(sel)]; break
        pop, objs, viol = allp[sel], allo[sel], allv[sel]
        if log and (g % 50 == 0 or g == CFG["GENS"] - 1):
            print(f"  NSGA-II gen {g:3d} | feasible {np.mean(viol<=0):.2f} | front0 {len(fast_sort(objs,viol)[0])}")
    f0 = [i for i in fast_sort(objs, viol)[0] if viol[i] <= 0]
    seen = {};
    for i in f0: seen.setdefault(canon(pop[i]), i)
    keep = list(seen.values())
    return pop[keep], objs[keep], viol[keep]

def run_nsga2_budget(pm, seed, gens):
    """NSGA-II with a different number of generations (used for the equal-evaluation-budget comparison with GA-multi)."""
    old = CFG["GENS"]; CFG["GENS"] = gens
    try: return run_nsga2(pm, seed)
    finally: CFG["GENS"] = old

# ============================ weighted-sum GA ============================
def ga_fitness(pm, pop, w):
    E, A, C, short, dup = pm.raw(pop); viol = pm.violation(C, short, dup)
    return pm.svf(E, A, C, w) - CFG["PENALTY"] * viol ** 2, viol

def run_ga(pm, seed, w):
    rng = np.random.default_rng(seed); P = CFG["POP"]
    pop = pm.repair(pm.random_pop(P, rng), rng); best = None; bestf = -np.inf
    for g in range(CFG["GENS"]):
        fit, viol = ga_fitness(pm, pop, w)
        # track best feasible
        ff = np.where(viol <= 0, fit, -np.inf); i = int(ff.argmax())
        if ff[i] > bestf: bestf, best = ff[i], pop[i].copy()
        order = np.argsort(-fit); elite = pop[order[:CFG["ELITE"]]].copy()
        cand = rng.integers(0, P, (P, CFG["TOURN_K"])); pick = cand[np.arange(P), fit[cand].argmax(1)]
        kids = make_offspring(pm, pop, pick, rng)
        pop = np.concatenate([elite, kids[:P - CFG["ELITE"]]])
    if best is None:                                  # no feasible ever: least-violating
        fit, viol = ga_fitness(pm, pop, w); best = pop[int(viol.argmin())].copy()
    return best

def simplex_weights(n=10):
    for den in range(3, 12):
        comps = [(a / den, b / den, (den - a - b) / den) for a in range(1, den) for b in range(1, den - a) if den - a - b >= 1]
        if len(comps) == n: return comps
    raise ValueError

# ============================ helpers ============================
def pareto_filter(objs):
    n = len(objs); keep = np.ones(n, bool)
    for i in range(n):
        if np.any(np.all(objs <= objs[i], 1) & np.any(objs < objs[i], 1)): keep[i] = False
    return keep

def solution_summary(pm, c):
    E, A, C, short, dup = pm.raw(c[None])
    return dict(E=E[0], A=A[0], C=C[0], svf=pm.svf(E, A, C)[0], viol=pm.violation(C, short, dup)[0], dup=dup[0])

def best_table(pm, bc, sites, acc_pts, aep, cost, acc):
    ap = acc_pts.set_index("id"); T = np.array(CFG["TYPES"]); rr = []
    for t, s in bc:
        sr = sites.iloc[s]; tw = T[t]; allws = sites[f"ws{tw}"].values
        rr.append(dict(site_id=sr.site_id, lon=sr.lon, lat=sr.lat, tower_m=tw, hub_ws=sr[f"ws{tw}"], aep_mwh=aep[s, t],
                       capacity_factor=aep[s, t] / (CFG["RATED_KW"] / 1000 * CFG["HOURS"]), access_score=acc[s], dist_km=sr.dist_km,
                       nearest_access_id=sr.nearest_access_id, nearest_access_type=ap.loc[sr.nearest_access_id, "type"] if sr.nearest_access_id in ap.index else "",
                       cost_units=cost[s, t], hub_ws_rank_percentile=100 * np.mean(allws <= sr[f"ws{tw}"])))
    return pd.DataFrame(rr)

def genes_str(pm, c):
    return ";".join(f"{pm.sites.site_id.iloc[s]}:{CFG['TYPES'][t]}" for t, s in c)

def feasibility_report(pm, n=100000):
    rng = np.random.default_rng(123); pop = pm.repair(pm.random_pop(n, rng), rng)
    E, A, C, short, dup = pm.raw(pop); feas = pm.violation(C, short, dup) <= 0
    q = np.quantile(C, [0, .05, .25, .5, .75, .95, 1])
    print(f"[Feasibility] random chromosomes feasible (cost<=BUDGET={CFG['BUDGET']}, min-dist ok): {feas.mean()*100:.1f}% (n={n})")
    print(f"[Feasibility] random cost quantiles 0/5/25/50/75/95/100%: {np.round(q,2).tolist()}")
    print(f"[Feasibility] min-dist violated in {np.mean(short>0)*100:.2f}% of random chromosomes (grid spacing ~ 2.85 km >> 0.65 km => practically inactive)")
    sug = None
    if feas.mean() < 0.02 or feas.mean() > 0.98:
        sug = float(round(np.quantile(C, 0.30), 1))
        print(f"[Feasibility] BUDGET looks non-binding/over-binding. SUGGESTION: BUDGET ~ {sug} (30th pct of random cost) - rerun with CFG['BUDGET']={sug}")
    return float(feas.mean()), sug

# ============================ UNIT TESTS ============================
def run_tests(pm, pc, results=None):
    out = []
    def chk(name, ok): out.append(ok); print(f"[{'PASS' if ok else 'FAIL'}] {name}")
    a8 = aep_mwh(8.0, pc); rated = CFG["RATED_KW"] * CFG["HOURS"] / 1000
    chk(f"AEP(8 m/s Rayleigh)={a8:.0f} MWh >0 and < rated {rated:.0f}", 0 < a8 < rated)
    vs = [5, 6, 7, 8, 9]; ae = [aep_mwh(v, pc) for v in vs]
    chk("AEP increases with mean wind speed (5..9 m/s)", all(np.diff(ae) > 0))
    ref = (1, 1, 1)
    chk("HV: single point (0,0,0), ref (1,1,1) = 1", abs(hv3d([[0, 0, 0]], ref) - 1) < 1e-12)
    chk("HV: two points known union = 0.5+0.5-0.25=0.75 for (0,.5,0),(.5,0,0)", abs(hv3d([[0, .5, 0], [.5, 0, 0]], ref) - 0.75) < 1e-12)
    A = np.array([[.5, .5, .5]]); B = np.array([[.4, .5, .5]])
    chk("HV: better solution gives larger HV", hv3d(B, ref) > hv3d(A, ref))
    chk("HV: dominated point adds nothing", abs(hv3d(np.vstack([A, [[.6, .6, .6]]]), ref) - hv3d(A, ref)) < 1e-12)
    chk("HV: point outside ref ignored", hv3d(np.vstack([A, [[1.2, 0, 0]]]), ref) == hv3d(A, ref))
    # semantic check: in problem coordinates, more energy/more access/less cost => larger HV
    # test points are built from the problem's own normalisation bounds so they lie inside the reference box
    Em, dE = 0.5 * (pm.E_lo + pm.E_hi), 0.05 * (pm.E_hi - pm.E_lo); Cm, dC = 0.5 * (pm.C_lo + pm.C_hi), 0.05 * (pm.C_hi - pm.C_lo)
    base = np.array([[-Em, -.5, Cm]]); better = np.array([[-(Em + dE), -.5, Cm]])
    ref_p = np.array(CFG["HV_REF"]); hb = hv3d(pm.hv_coords(base), ref_p)
    chk("HV (problem coords): test point lies inside the reference box (HV>0)", hb > 0)
    chk("HV (problem coords): more energy => larger HV", hv3d(pm.hv_coords(better), ref_p) > hb)
    chk("HV (problem coords): lower cost => larger HV", hv3d(pm.hv_coords(np.array([[-Em, -.5, Cm - dC]])), ref_p) > hb)
    chk("HV (problem coords): higher access => larger HV", hv3d(pm.hv_coords(np.array([[-Em, -.6, Cm]])), ref_p) > hb)
    if results:
        pareto, ga_best = results
        chk("no duplicate sites in any returned solution (NSGA-II + GA)", all(len(set(c[:, 1])) == pm.N for c in list(pareto) + list(ga_best)))
        chk("all returned Pareto solutions feasible", all(pm.violation(*pm.raw(c[None])[2:3], pm.raw(c[None])[3], pm.raw(c[None])[4])[0] <= 0 for c in pareto))
    print(f"UNIT TESTS: {sum(out)}/{len(out)} passed"); return all(out)

# ============================ GWC (WAsP .lib) ============================
def parse_lib(path):
    """ASSUMED layout: line1 = text; line2 = nR nH nS; line3 = roughness lengths (nR); line4 = heights (nH);
    then per roughness class: 1 sector-frequency row (nS) followed, for each height, by an A row and a k row.
    Units auto-detected: A > 50 => 0.1 m/s ; k > 10 => x100 ; frequencies normalised to sum 1."""
    L = [l.strip() for l in open(path, errors="ignore") if l.strip()]
    nR, nH, nS = map(int, L[1].split()[:3]); z0 = [float(x) for x in L[2].split()][:nR]; hts = [float(x) for x in L[3].split()][:nH]
    pos = 4; classes = []
    for r in range(nR):
        f = np.array(L[pos].split(), float); pos += 1; f = f / f.sum(); d = {}
        for h in range(nH):
            A = np.array(L[pos].split(), float); k = np.array(L[pos + 1].split(), float); pos += 2
            if A.mean() > 50: A = A / 10
            if k.mean() > 10: k = k / 100
            d[hts[h]] = (A, k)
        classes.append(dict(z0=z0[r], freq=f, hts=d))
    return classes

def gwc_report(lib_path, sites, pc, ws_col="ws100"):
    cl = parse_lib(lib_path); c = min(cl, key=lambda c: abs(c["z0"] - 0.03))      # closest to open land (z0~0.03 m)
    h = min(c["hts"], key=lambda hh: abs(hh - 100)); A, k = c["hts"][h]
    k_eff = float(np.sum(c["freq"] * k))
    order = sites[ws_col].sort_values().index.values; pick = order[np.linspace(0, len(order) - 1, 5).astype(int)]
    rows = []
    for i in pick:
        vm = sites.loc[i, ws_col]; a_r = aep_mwh(vm, pc); a_w = aep_mwh(vm, pc, "weibull", k_eff)
        rows.append(dict(site_id=sites.loc[i, "site_id"], ws100=vm, aep_rayleigh=a_r, aep_weibull=a_w, change_pct=100 * (a_w / a_r - 1)))
    df = pd.DataFrame(rows); print(f"[GWC] roughness class z0={c['z0']} m, height {h} m, sector-weighted k={k_eff:.3f}"); print(df.round(2).to_string(index=False))
    print("[GWC] AREA-LEVEL approximation: one k for the whole area; Weibull A set so mean speed equals the site's ws100; file layout as ASSUMED in parse_lib docstring.")
    return df, k_eff

# ============================ MAIN ============================
def main():
    t0 = time.time(); os.makedirs(CFG["OUT_DIR"], exist_ok=True)
    sites, acc_pts, pc, synthetic = load_inputs()
    tab, aep, cost, acc = build_table(sites, pc); pm = Problem(sites, aep, cost, acc)
    tab.to_csv(f"{CFG['OUT_DIR']}/site_turbine_table.csv", index=False)
    print(f"Table: {len(tab)} rows | SVF bounds: E_lo={pm.E_lo:.0f} E_hi={pm.E_hi:.0f} MWh | C_lo={pm.C_lo:.2f} C_hi={pm.C_hi:.2f}")
    print("  E_norm=(sumAEP-E_lo)/(E_hi-E_lo): E_lo=10x the smallest table AEP, E_hi=sum of the 10 best distinct sites at their best tower.")
    print("  C_norm=(cost-C_lo)/(C_hi-C_lo): C_lo=10 cheapest distinct sites at cheapest tower, C_hi=10 dearest distinct sites at tallest tower.")
    share, sug = feasibility_report(pm)

    # ---- main seed run ----
    print("\n=== NSGA-II seed", CFG["MAIN_SEED"]); par, pobj, pviol = run_nsga2(pm, CFG["MAIN_SEED"], log=True)
    W = simplex_weights(CFG["N_WEIGHT_VECTORS"])
    ga1 = run_ga(pm, CFG["MAIN_SEED"], CFG["SVF_W"]); gam = [run_ga(pm, CFG["MAIN_SEED"], w) for w in W]
    run_tests(pm, pc, (par, [ga1] + gam))

    # ---- 10 seeds ----
    rows = []; ref = np.array(CFG["HV_REF"])
    def objs_of(cs): return pm.evaluate(np.array(cs))[0]
    for sd in CFG["SEEDS"]:
        p, po, _ = (par, pobj, pviol) if sd == CFG["MAIN_SEED"] else run_nsga2(pm, sd)
        g1 = ga1 if sd == CFG["MAIN_SEED"] else run_ga(pm, sd, CFG["SVF_W"])
        gm = gam if sd == CFG["MAIN_SEED"] else [run_ga(pm, sd, w) for w in W]
        o1, ov1 = pm.evaluate(g1[None]); om, ovm = pm.evaluate(np.array(gm))
        o1 = o1[ov1 <= 0]; om = om[ovm <= 0]
        hv_n = hv3d(pm.hv_coords(po), ref); hv_1 = hv3d(pm.hv_coords(o1), ref) if len(o1) else 0.0
        p10, po10, _ = run_nsga2_budget(pm, sd, CFG["GENS"] * len(W)); hv_n10 = hv3d(pm.hv_coords(po10), ref)   # GA-multi uses len(W) GA runs, so give NSGA-II len(W)x generations
        if sd == CFG["MAIN_SEED"]: par10 = p10
        hv_m = hv3d(pm.hv_coords(om), ref) if len(om) else 0.0
        best_svf_n = max(solution_summary(pm, c)["svf"] for c in p); best_svf_g = solution_summary(pm, g1)["svf"]
        rows.append(dict(seed=sd, hv_nsga2=hv_n, hv_nsga2_10x=hv_n10, hv_ga_single=hv_1, hv_ga_multi=hv_m, n_pareto=len(p), best_svf_nsga2=best_svf_n, best_svf_ga_single=best_svf_g))
        print(f"seed {sd}: HV NSGA-II={hv_n:.4f} NSGA-II(10x)={hv_n10:.4f} GA-single={hv_1:.4f} GA-multi={hv_m:.4f} | |front|={len(p)} | bestSVF NSGA={best_svf_n:.4f} GA={best_svf_g:.4f}")
    H = pd.DataFrame(rows)
    summ = pd.DataFrame({m: [H[c].mean(), H[c].std(ddof=1)] for m, c in [("NSGA-II", "hv_nsga2"), ("NSGA-II (10x generations)", "hv_nsga2_10x"), ("GA-single", "hv_ga_single"), ("GA-multi", "hv_ga_multi")]}, index=["hv_mean", "hv_std"]).T
    print("\nHYPERVOLUME (fixed normalised space, ref=%s, 10 seeds)\n" % (CFG["HV_REF"],), summ.round(4))
    print("NOTE: GA-multi is N_WEIGHT_VECTORS separate GA runs, so NSGA-II (10x generations) is the equal-evaluation-budget comparison. GA-single optimises SVF directly, so it may beat NSGA-II on best SVF; HV is the weight-free comparison.")
    H.to_csv(f"{CFG['OUT_DIR']}/hypervolume_per_seed.csv", index=False); summ.to_csv(f"{CFG['OUT_DIR']}/hypervolume_comparison.csv")

    # ---- pareto_solutions.csv (seed 42) ----
    sm = [solution_summary(pm, c) for c in par]
    PS = pd.DataFrame(dict(id=range(len(par)), f1_aep_mwh=[s["E"] for s in sm], f2_mean_access=[s["A"] for s in sm], f3_cost_units=[s["C"] for s in sm],
                           SVF=[s["svf"] for s in sm], feasible=[s["viol"] <= 0 for s in sm], genes=[genes_str(pm, c) for c in par])).sort_values("SVF", ascending=False)
    PS.to_csv(f"{CFG['OUT_DIR']}/pareto_solutions.csv", index=False)
    print("\nPareto solutions (seed 42):", len(PS), "| SVF range", round(float(PS.SVF.min()), 4), "-", round(float(PS.SVF.max()), 4))
    bi = int(np.argmax([s["svf"] for s in sm])); bc = par[bi]

    # ---- best_compromise.csv ----
    ap = acc_pts.set_index("id"); T = np.array(CFG["TYPES"]); hub_all = tab.groupby("tower_m").hub_ws
    rr = []
    for t, s in bc:
        sr = sites.iloc[s]; tw = T[t]; allws = sites[f"ws{tw}"].values
        rr.append(dict(site_id=sr.site_id, lon=sr.lon, lat=sr.lat, tower_m=tw, hub_ws=sr[f"ws{tw}"], aep_mwh=aep[s, t],
                       capacity_factor=aep[s, t] / (CFG["RATED_KW"] / 1000 * CFG["HOURS"]), access_score=acc[s], dist_km=sr.dist_km,
                       nearest_access_id=sr.nearest_access_id, nearest_access_type=ap.loc[sr.nearest_access_id, "type"] if sr.nearest_access_id in ap.index else "",
                       cost_units=cost[s, t], hub_ws_rank_percentile=100 * np.mean(allws <= sr[f"ws{tw}"])))
    BC = pd.DataFrame(rr); BC.to_csv(f"{CFG['OUT_DIR']}/best_compromise.csv", index=False)
    print("\nBEST COMPROMISE (seed 42):", {k: round(float(v), 4) for k, v in sm[bi].items()}); print(BC.round(3).to_string(index=False))

    # ---- converged front (NSGA-II with 10x generations, seed 42): use this one for the website / final report ----
    sm10 = [solution_summary(pm, c) for c in par10]
    PS10 = pd.DataFrame(dict(id=range(len(par10)), f1_aep_mwh=[x["E"] for x in sm10], f2_mean_access=[x["A"] for x in sm10], f3_cost_units=[x["C"] for x in sm10],
                             SVF=[x["svf"] for x in sm10], feasible=[x["viol"] <= 0 for x in sm10], genes=[genes_str(pm, c) for c in par10])).sort_values("SVF", ascending=False)
    PS10.to_csv(f"{CFG['OUT_DIR']}/pareto_solutions_10x.csv", index=False)
    bi10 = int(np.argmax([x["svf"] for x in sm10])); BC10 = best_table(pm, par10[bi10], sites, acc_pts, aep, cost, acc)
    BC10.to_csv(f"{CFG['OUT_DIR']}/best_compromise_10x.csv", index=False)
    print("\nCONVERGED FRONT (10x generations, seed 42):", len(PS10), "solutions | SVF range", round(float(PS10.SVF.min()), 4), "-", round(float(PS10.SVF.max()), 4))
    print("BEST COMPROMISE (10x):", {k: round(float(v), 4) for k, v in sm10[bi10].items()}); print(BC10.round(3).to_string(index=False))

    # ---- plots ----
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    fn = pm.evaluate(par)[0]; f10 = pm.evaluate(par10)[0]; g1o = pm.evaluate(ga1[None])[0]; gmo = pm.evaluate(np.array(gam))[0]
    gmo = gmo[pm.evaluate(np.array(gam))[1] <= 0]; gmo = gmo[pareto_filter(gmo)] if len(gmo) else gmo
    pairs = [("energy_vs_cost", 2, 0, "Cost (units, assumption)", "AEP (MWh/yr)", 1, -1), ("energy_vs_access", 1, 0, "Mean access", "AEP (MWh/yr)", -1, -1),
             ("cost_vs_access", 1, 2, "Mean access", "Cost (units)", -1, 1)]
    for name, xi, yi, xl, yl, sx, sy in pairs:
        fig, ax = plt.subplots(figsize=(6, 4.5))
        for o, lab, mk, col in [(fn, "NSGA-II front (150 gen)", "o", "tab:blue"), (f10, "NSGA-II (10x generations)", "^", "tab:green"), (gmo, "GA-multi", "s", "tab:orange"), (g1o, "GA-single (SVF weights)", "*", "tab:red")]:
            if len(o): ax.scatter(sx * o[:, xi] if xi != 2 else o[:, xi], sy * o[:, yi] if yi != 2 else o[:, yi], marker=mk, c=col, s=60 if mk == "*" else 25, label=lab, alpha=.8)
        ax.set_xlabel(xl); ax.set_ylabel(yl); ax.grid(alpha=.3); ax.legend(fontsize=8); ax.set_title(f"{name.replace('_',' ')} (seed {CFG['MAIN_SEED']})" + ("  [SYNTHETIC DATA]" if synthetic else ""))
        fig.tight_layout(); fig.savefig(f"{CFG['OUT_DIR']}/pareto_{name}.png", dpi=130); plt.close(fig)

    # ---- sensitivity: access decay 0.5 ----
    _, aep2, cost2, acc2 = build_table(sites, pc, decay=CFG["ACCESS_DECAY_SENS"]); pm2 = Problem(sites, aep2, cost2, acc2)
    par2, po2, _ = run_nsga2(pm2, CFG["MAIN_SEED"]); b2 = par2[int(np.argmax([solution_summary(pm2, c)["svf"] for c in par2]))]
    s1, s2 = set(bc[:, 1]), set(b2[:, 1]); u1 = {s for c in par for s in c[:, 1]}; u2 = {s for c in par2 for s in c[:, 1]}
    sens = dict(best_compromise_shared_sites=len(s1 & s2), of=pm.N, jaccard_best=len(s1 & s2) / len(s1 | s2),
                union_sites_decay01=len(u1), union_sites_decay05=len(u2), jaccard_union=len(u1 & u2) / len(u1 | u2),
                mean_dist_km_best_decay01=float(sites.dist_km.values[list(s1)].mean()), mean_dist_km_best_decay05=float(sites.dist_km.values[list(s2)].mean()))
    print("\nSENSITIVITY (access decay 0.1 -> 0.5):", {k: round(v, 3) if isinstance(v, float) else v for k, v in sens.items()})

    # ---- GWC ----
    lib = os.path.join(CFG["DATA_DIR"], "gwc_area_1.lib"); gwc = None
    if os.path.exists(lib):
        try: gwc = gwc_report(lib, sites, pc)[1]
        except Exception as e: print("[GWC] parse failed:", repr(e), "- check file layout assumption")
    else: print("[GWC] gwc_area_1.lib not found - skipped")

    json.dump(dict(config={k: (v if not isinstance(v, dict) else {str(a): b for a, b in v.items()}) for k, v in CFG.items()}, synthetic_data=synthetic,
                   weight_vectors=W, feasible_share_random=share, budget_suggestion=sug, svf_bounds=dict(E_lo=pm.E_lo, E_hi=pm.E_hi, C_lo=pm.C_lo, C_hi=pm.C_hi),
                   sensitivity=sens, gwc_k=gwc, runtime_s=time.time() - t0), open(f"{CFG['OUT_DIR']}/phase3_run_config.json", "w"), indent=2)
    print("\nOutputs:", sorted(os.listdir(CFG["OUT_DIR"])), f"| runtime {time.time()-t0:.0f}s")

if __name__ == "__main__":
    main()
