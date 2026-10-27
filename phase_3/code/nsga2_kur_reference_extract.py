"""
REFERENCE ONLY (not runnable on its own).
Code extracted verbatim from Kur_River_NSGA2_2_.ipynb (Kur River sensor network, NSGA-II vs weighted-sum GA).
It depends on globals defined elsewhere in that notebook (SENSOR_TYPES, SENSOR_KEYS, CANDIDATE_POSITIONS, ROAD_NODES, ...).
Purpose: show the algorithm structure and parameters to be re-implemented for the wind-turbine problem.
Extracted cells: config (1), genetic operators (7), weighted-sum GA (9), NSGA-II core (12), NSGA-II main loop (13), hypervolume (24).
"""


# ######################################################################
# CONFIG / PARAMETERS  (notebook cell index 2)
# ######################################################################
# ============================================================
# CELL 1 — IMPORTS & GLOBAL CONFIGURATION
# ============================================================

import numpy as np
import pandas as pd
import random
import math
import copy
import time
import warnings
warnings.filterwarnings("ignore")

# Geographic libraries
try:
    import osmnx as ox
    OSMNX_AVAILABLE = True
except ImportError:
    OSMNX_AVAILABLE = False

# Visualisation
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots

# ── Reproducibility seed ─────────────────────────────────────────────────
GLOBAL_SEED = 42
random.seed(GLOBAL_SEED)
np.random.seed(GLOBAL_SEED)

# ── Fleet parameters ─────────────────────────────────────────────────────
N_SENSORS          = 15       # fixed chromosome length
BUDGET             = 6000     # USD hard constraint

# ── GA / NSGA-II hyperparameters ─────────────────────────────────────────
POP_SIZE           = 100
N_GENERATIONS      = 150
CROSSOVER_RATE     = 0.80
MUTATION_RATE      = 0.05
ELITISM_K          = 2
TOURNAMENT_K       = 3

# ── Fitness weights (GA benchmark) ───────────────────────────────────────
W_COVERAGE         = 0.50
W_RELIABILITY      = 0.25
W_REDUNDANCY       = 0.25
LAMBDA_PENALTY     = 1e-5

# ── Reliability decay constant ────────────────────────────────────────────
ALPHA_DECAY        = 0.5      # km⁻¹ — road-distance reliability decay

print("    All libraries imported.")
print(f"   osmnx available : {OSMNX_AVAILABLE}")
print(f"   N_SENSORS       : {N_SENSORS}")
print(f"   Budget          : ${BUDGET:,}")


# ######################################################################
# CHROMOSOME + GENETIC OPERATORS  (notebook cell index 8)
# ######################################################################
# ============================================================
# CELL 7 — PHASE 3: CHROMOSOME ENCODING & GENETIC OPERATORS
# ============================================================

# ── Gene & Chromosome Factories ───────────────────────────────────────────
def random_gene():
    """
    Generate a random gene: (sensor_type, lat, lon).
    Position is sampled from CANDIDATE_POSITIONS (river corridor only).
    """
    stype = random.choice(SENSOR_KEYS)
    lat, lon = random.choice(CANDIDATE_POSITIONS)
    return (stype, lat, lon)


def random_chromosome():
    """
    Generate a random chromosome of N_SENSORS genes.
    No budget enforcement at initialisation — handled by penalty/constraint.
    """
    return [random_gene() for _ in range(N_SENSORS)]


# ── Two-Point Crossover (Article §8.2) ────────────────────────────────────
def two_point_crossover(parent1, parent2):
    """
    Two-point crossover operating on complete gene triplets.
    Preserves gene integrity — never splits a (type, lat, lon) tuple.

    Parameters
    ----------
    parent1, parent2 : list of gene tuples

    Returns
    -------
    Tuple of two offspring chromosomes
    """
    n = len(parent1)
    if n < 3:
        return copy.deepcopy(parent1), copy.deepcopy(parent2)
    c1 = random.randint(1, n - 2)
    c2 = random.randint(c1 + 1, n - 1)
    child1 = parent1[:c1] + parent2[c1:c2] + parent1[c2:]
    child2 = parent2[:c1] + parent1[c1:c2] + parent2[c2:]
    return child1, child2


# ── Per-Gene Replacement Mutation (Article §8.3, §9.1, §9.2) ─────────────
def mutate(chromosome, mutation_rate=MUTATION_RATE):
    """
    Per-gene replacement mutation.
    Each gene is independently replaced with a freshly-sampled random gene
    with probability `mutation_rate`. This maintains diversity in both the
    sensor-type portfolio and the spatial distribution.

    Parameters
    ----------
    chromosome    : list of gene tuples
    mutation_rate : float — probability per gene

    Returns
    -------
    Mutated chromosome (new list)
    """
    return [
        random_gene() if random.random() < mutation_rate else gene
        for gene in chromosome
    ]


# ── Tournament Selection (for GA benchmark) ───────────────────────────────
def tournament_selection(population, fitnesses, k=TOURNAMENT_K):
    """
    Size-k tournament selection: sample k candidates, return best-fitness copy.

    Parameters
    ----------
    population : list of chromosomes
    fitnesses  : list of scalar fitness values (same order)
    k          : tournament pool size

    Returns
    -------
    Deep copy of winning chromosome
    """
    indices = random.sample(range(len(population)), k)
    winner = max(indices, key=lambda i: fitnesses[i])
    return copy.deepcopy(population[winner])


print("   Genetic operators defined.")
print("   random_gene, random_chromosome, two_point_crossover, mutate, tournament_selection")


# ######################################################################
# WEIGHTED-SUM GA  (notebook cell index 10)
# ######################################################################
# ============================================================
# CELL 9 — PHASE 4: WEIGHTED-SUM GA IMPLEMENTATION & RUN
# ============================================================

def fitness_ga(chromosome):
    """
    Scalar fitness for the weighted-sum GA.

    Combines all objectives into a single score for easy comparison;
    the quadratic penalty ensures budget infeasibility is strongly penalised.

    Returns
    -------
    Tuple: (score, coverage, reliability, redundancy, cost)
    """
    m = evaluate_all(chromosome)
    penalty = 0.0
    if m["cost"] > BUDGET:
        excess = m["cost"] - BUDGET
        penalty = LAMBDA_PENALTY * excess ** 2

    score = (W_COVERAGE    * m["coverage"]
           + W_RELIABILITY * m["reliability"]
           + W_REDUNDANCY  * m["redundancy"]
           - penalty)
    return score, m["coverage"], m["reliability"], m["redundancy"], m["cost"]


def run_ga(seed=GLOBAL_SEED):
    """
    Full weighted-sum Genetic Algorithm.

    Algorithm
    ---------
    1. Initialise random population of POP_SIZE chromosomes
    2. For each generation:
       a. Evaluate all chromosomes → fitness scores
       b. Track best-ever individual (elitism seed)
       c. Log history (fitness, objectives, cost)
       d. Rebuild population:
          - Copy ELITISM_K best unchanged
          - Fill remainder: tournament select → crossover → mutate

    Parameters
    ----------
    seed : int — random seed for reproducibility

    Returns
    -------
    best_chromosome : list of genes
    history         : dict of per-generation lists
    """
    random.seed(seed)
    np.random.seed(seed)

    # Initialise population
    population = [random_chromosome() for _ in range(POP_SIZE)]

    # History tracking
    history = {
        "generation":   [],
        "best_fitness": [],
        "mean_fitness": [],
        "coverage":     [],
        "reliability":  [],
        "redundancy":   [],
        "cost":         [],
    }

    best_chromosome  = None
    best_fitness_ever = -np.inf
    t0 = time.time()

    for gen in range(N_GENERATIONS):
        # ── Evaluate ────────────────────────────────────────────────────
        eval_results = [fitness_ga(chrom) for chrom in population]
        scores = [r[0] for r in eval_results]

        # ── Track best-ever ─────────────────────────────────────────────
        gen_best_idx = int(np.argmax(scores))
        if scores[gen_best_idx] > best_fitness_ever:
            best_fitness_ever = scores[gen_best_idx]
            best_chromosome   = copy.deepcopy(population[gen_best_idx])
            best_metrics      = eval_results[gen_best_idx]

        # ── Log history ─────────────────────────────────────────────────
        history["generation"].append(gen)
        history["best_fitness"].append(max(scores))
        history["mean_fitness"].append(float(np.mean(scores)))
        history["coverage"].append(eval_results[gen_best_idx][1])
        history["reliability"].append(eval_results[gen_best_idx][2])
        history["redundancy"].append(eval_results[gen_best_idx][3])
        history["cost"].append(eval_results[gen_best_idx][4])

        # ── Progress reporting ───────────────────────────────────────────
        if gen % 25 == 0 or gen == N_GENERATIONS - 1:
            elapsed = time.time() - t0
            print(f"  GA Gen {gen:>4d}/{N_GENERATIONS} | "
                  f"Best: {max(scores):.4f} | Mean: {np.mean(scores):.4f} | "
                  f"Cov: {eval_results[gen_best_idx][1]:.3f} | "
                  f"Cost: ${eval_results[gen_best_idx][4]:>5,.0f} | "
                  f"Time: {elapsed:.1f}s")

        # ── New generation ───────────────────────────────────────────────
        # Sort for elitism
        sorted_pop = [p for _, p in sorted(zip(scores, population),
                                           key=lambda x: x[0], reverse=True)]
        new_pop = [copy.deepcopy(p) for p in sorted_pop[:ELITISM_K]]

        while len(new_pop) < POP_SIZE:
            p1 = tournament_selection(population, scores)
            p2 = tournament_selection(population, scores)
            if random.random() < CROSSOVER_RATE:
                c1, c2 = two_point_crossover(p1, p2)
            else:
                c1, c2 = copy.deepcopy(p1), copy.deepcopy(p2)
            new_pop.append(mutate(c1))
            if len(new_pop) < POP_SIZE:
                new_pop.append(mutate(c2))

        population = new_pop

    elapsed = time.time() - t0
    print(f"\n   GA complete in {elapsed:.1f}s")
    print(f"   Best fitness : {best_fitness_ever:.4f}")
    return best_chromosome, history


# ── Run GA ────────────────────────────────────────────────────────────────
print("=" * 65)
print("  Running Weighted-Sum Genetic Algorithm (Benchmark)")
print("  Parameters: Pop={}, Gen={}, Pc={}, Pm={}".format(
    POP_SIZE, N_GENERATIONS, CROSSOVER_RATE, MUTATION_RATE))
print("=" * 65)

best_chromosome_ga, history_ga = run_ga()

# ── Report GA result ──────────────────────────────────────────────────────
ga_metrics = evaluate_all(best_chromosome_ga)
sc_ga, cov_ga, rel_ga, red_ga, cost_ga = fitness_ga(best_chromosome_ga)

print(f"\n{'='*65}")
print("  GA BEST SOLUTION SUMMARY")
print(f"{'='*65}")
print(f"  Coverage    : {ga_metrics['coverage']:.4f}  ({ga_metrics['coverage']*100:.1f}%)")
print(f"  Reliability : {ga_metrics['reliability']:.4f}")
print(f"  Redundancy  : {ga_metrics['redundancy']:.4f}")
print(f"  Total Cost  : ${ga_metrics['cost']:,.0f} / ${BUDGET:,} budget")
print(f"  Feasible    : {ga_metrics['cost'] <= BUDGET}")
print(f"{'='*65}")


# ######################################################################
# NSGA-II CORE (non-dominated sort, crowding, SVF)  (notebook cell index 13)
# ######################################################################
# ============================================================
# CELL 12 — PHASE 5: NSGA-II CORE COMPONENTS
# ============================================================

def non_dominated_sort(objectives, violations):
    """
    Fast non-dominated sorting with constraint-aware domination (Article §7.3).

    Constrained-domination rule:
      i constrained-dominates j if:
        (a) i feasible,  j infeasible, OR
        (b) both infeasible but i has smaller violation, OR
        (c) both feasible AND i Pareto-dominates j

    Parameters
    ----------
    objectives : np.ndarray shape (N, 4) — objective values
    violations : np.ndarray shape (N,)   — constraint violations (≥0)

    Returns
    -------
    List of fronts; each front is a list of population indices.
    fronts[0] = Pareto front.
    """
    N = len(objectives)
    dominates = [[] for _ in range(N)]   # i dominates these
    dominated_by = [0] * N               # domination counter

    def constrained_dominates(i, j):
        """True if solution i constrained-dominates solution j."""
        vi, vj = violations[i], violations[j]
        feasible_i = vi <= 0
        feasible_j = vj <= 0
        if feasible_i and not feasible_j:
            return True
        if not feasible_i and not feasible_j:
            return vi < vj   # less infeasible wins
        if feasible_i and feasible_j:
            # Pareto dominance: i ≤ j on all objectives AND i < j on at least one
            at_least_one_better = False
            for k in range(objectives.shape[1]):
                if objectives[i, k] > objectives[j, k]:
                    return False   # j is better on objective k
                if objectives[i, k] < objectives[j, k]:
                    at_least_one_better = True
            return at_least_one_better
        return False  # i infeasible, j feasible

    for i in range(N):
        for j in range(N):
            if i == j:
                continue
            if constrained_dominates(i, j):
                dominates[i].append(j)
            elif constrained_dominates(j, i):
                dominated_by[i] += 1

    fronts = []
    current_front = [i for i in range(N) if dominated_by[i] == 0]
    while current_front:
        fronts.append(current_front)
        next_front = []
        for i in current_front:
            for j in dominates[i]:
                dominated_by[j] -= 1
                if dominated_by[j] == 0:
                    next_front.append(j)
        current_front = next_front
    return fronts


def crowding_distance(objectives, front_indices):
    """
    Crowding distance for diversity preservation (Deb et al. 2002).

    Boundary solutions receive infinite distance (always selected).
    Interior solutions are ranked by the sum of normalised distances to
    neighbours across all objectives.

    Parameters
    ----------
    objectives     : np.ndarray shape (N, n_obj)
    front_indices  : list of indices belonging to this front

    Returns
    -------
    np.ndarray shape (N,) — crowding distances (only front members populated)
    """
    N     = len(objectives)
    n_obj = objectives.shape[1]
    dist  = np.zeros(N)
    l     = len(front_indices)

    if l <= 2:
        for idx in front_indices:
            dist[idx] = np.inf
        return dist

    for m in range(n_obj):
        sorted_front = sorted(front_indices, key=lambda i: objectives[i, m])
        dist[sorted_front[0]]  = np.inf
        dist[sorted_front[-1]] = np.inf
        obj_range = objectives[sorted_front[-1], m] - objectives[sorted_front[0], m]
        if obj_range == 0:
            continue
        for k in range(1, l - 1):
            dist[sorted_front[k]] += (
                objectives[sorted_front[k+1], m] - objectives[sorted_front[k-1], m]
            ) / obj_range
    return dist


def crowded_tournament(pop_indices, ranks, crowd_dist):
    """
    Binary crowded tournament selection (Article §7.2).
    Prefers lower rank; breaks ties using higher crowding distance.

    Parameters
    ----------
    pop_indices : list of two candidate indices
    ranks       : np.ndarray — Pareto rank of each individual
    crowd_dist  : np.ndarray — crowding distance

    Returns
    -------
    Index of the winner
    """
    i, j = pop_indices
    if ranks[i] < ranks[j]:
        return i
    if ranks[j] < ranks[i]:
        return j
    return i if crowd_dist[i] >= crowd_dist[j] else j


def compute_svf(metrics_dict):
    """
    Sensor Validity Function (Article §10).
    Provides a single scalar for selecting the best-compromise Pareto solution.

    SVF = 0.50 × Coverage + 0.25 × Reliability + 0.25 × Redundancy

    Returns
    -------
    float ∈ [0, 1]
    """
    return (0.50 * metrics_dict["coverage"]
          + 0.25 * metrics_dict["reliability"]
          + 0.25 * metrics_dict["redundancy"])


print("   NSGA-II core components defined.")
print("   non_dominated_sort, crowding_distance, crowded_tournament, compute_svf")


# ######################################################################
# NSGA-II MAIN LOOP  (notebook cell index 14)
# ######################################################################
# ============================================================
# CELL 13 — PHASE 5: NSGA-II MAIN LOOP & RUN
# ============================================================

def run_nsga2(seed=GLOBAL_SEED):
    """
    Full NSGA-II implementation for the Kür River sensor placement problem.

    Algorithm (Deb et al. 2002 + constraint handling)
    --------------------------------------------------
    1. Initialise population P of size N
    2. Evaluate all objectives and constraint violations
    3. For each generation:
       a. Generate offspring Q via crowded tournament + crossover + mutation
       b. Combine R = P ∪ Q  (size 2N)
       c. Evaluate R
       d. Non-dominated sort R → fronts F₁, F₂, …
       e. Environmental selection: fill N slots greedily front-by-front;
          when a front overflows, sort remaining by crowding distance ↓
    4. Return Pareto front chromosomes and objectives

    Parameters
    ----------
    seed : int

    Returns
    -------
    pareto_chroms     : list of feasible Pareto-front chromosomes
    pareto_objectives : np.ndarray shape (|P|, 4)
    pareto_metrics    : list of evaluate_all dicts
    history           : dict of Pareto front size per generation
    """
    random.seed(seed)
    np.random.seed(seed)

    def eval_individual(chrom):
        m = evaluate_all(chrom)
        # Objectives: minimise all (negate coverage/reliability/redundancy)
        objs = np.array([
            -m["coverage"],
            -m["reliability"],
            -m["redundancy"],
             m["cost"],
        ])
        # Constraint violation: amount by which cost exceeds budget (0 if feasible)
        viol = max(0.0, m["cost"] - BUDGET)
        return objs, viol, m

    # ── Initialise ────────────────────────────────────────────────────────
    population = [random_chromosome() for _ in range(POP_SIZE)]
    pop_objs   = np.zeros((POP_SIZE, 4))
    pop_viols  = np.zeros(POP_SIZE)
    pop_metrics = [None] * POP_SIZE

    for i, chrom in enumerate(population):
        pop_objs[i], pop_viols[i], pop_metrics[i] = eval_individual(chrom)

    history = {"generation": [], "pareto_size": []}
    t0 = time.time()

    for gen in range(N_GENERATIONS):
        # ── Generate offspring ────────────────────────────────────────────
        fronts   = non_dominated_sort(pop_objs, pop_viols)
        ranks    = np.zeros(POP_SIZE, dtype=int)
        crowd    = np.zeros(POP_SIZE)
        for rank, front in enumerate(fronts):
            for idx in front:
                ranks[idx] = rank
            d = crowding_distance(pop_objs, front)
            for idx in front:
                crowd[idx] = d[idx]

        offspring = []
        while len(offspring) < POP_SIZE:
            # Crowded tournament — draw two random pairs
            candidates1 = random.sample(range(POP_SIZE), 2)
            candidates2 = random.sample(range(POP_SIZE), 2)
            p1_idx = crowded_tournament(candidates1, ranks, crowd)
            p2_idx = crowded_tournament(candidates2, ranks, crowd)
            p1 = copy.deepcopy(population[p1_idx])
            p2 = copy.deepcopy(population[p2_idx])
            if random.random() < CROSSOVER_RATE:
                c1, c2 = two_point_crossover(p1, p2)
            else:
                c1, c2 = p1, p2
            offspring.append(mutate(c1))
            if len(offspring) < POP_SIZE:
                offspring.append(mutate(c2))

        # ── Evaluate offspring ────────────────────────────────────────────
        off_objs   = np.zeros((POP_SIZE, 4))
        off_viols  = np.zeros(POP_SIZE)
        off_metrics = [None] * POP_SIZE
        for i, chrom in enumerate(offspring):
            off_objs[i], off_viols[i], off_metrics[i] = eval_individual(chrom)

        # ── Combine (R = P ∪ Q) ───────────────────────────────────────────
        combined      = population + offspring
        comb_objs     = np.vstack([pop_objs,  off_objs])
        comb_viols    = np.concatenate([pop_viols, off_viols])
        comb_metrics  = pop_metrics + off_metrics

        # ── Environmental selection ───────────────────────────────────────
        all_fronts    = non_dominated_sort(comb_objs, comb_viols)
        all_crowd     = np.zeros(len(combined))
        for front in all_fronts:
            d = crowding_distance(comb_objs, front)
            for idx in front:
                all_crowd[idx] = d[idx]

        new_pop     = []
        new_objs    = []
        new_viols   = []
        new_metrics = []

        for front in all_fronts:
            if len(new_pop) + len(front) <= POP_SIZE:
                for idx in front:
                    new_pop.append(copy.deepcopy(combined[idx]))
                    new_objs.append(comb_objs[idx])
                    new_viols.append(comb_viols[idx])
                    new_metrics.append(comb_metrics[idx])
            else:
                # Fill remaining slots by crowding distance (descending)
                remaining = POP_SIZE - len(new_pop)
                sorted_front = sorted(front, key=lambda i: all_crowd[i], reverse=True)
                for idx in sorted_front[:remaining]:
                    new_pop.append(copy.deepcopy(combined[idx]))
                    new_objs.append(comb_objs[idx])
                    new_viols.append(comb_viols[idx])
                    new_metrics.append(comb_metrics[idx])
                break

        population  = new_pop
        pop_objs    = np.array(new_objs)
        pop_viols   = np.array(new_viols)
        pop_metrics = new_metrics

        # ── Track Pareto front size (feasible solutions on front 0) ──────
        current_fronts = non_dominated_sort(pop_objs, pop_viols)
        pareto_size = sum(1 for idx in current_fronts[0] if pop_viols[idx] <= 0)
        history["generation"].append(gen)
        history["pareto_size"].append(pareto_size)

        if gen % 25 == 0 or gen == N_GENERATIONS - 1:
            elapsed = time.time() - t0
            mean_cov = float(np.mean([-pop_objs[i, 0] for i in range(POP_SIZE)]))
            print(f"  NSGA-II Gen {gen:>4d}/{N_GENERATIONS} | "
                  f"Pareto size: {pareto_size:>3d} | "
                  f"Mean coverage: {mean_cov:.3f} | "
                  f"Time: {elapsed:.1f}s")

    elapsed = time.time() - t0
    print(f"\n✅  NSGA-II complete in {elapsed:.1f}s")

    # ── Extract final feasible Pareto front ───────────────────────────────
    final_fronts = non_dominated_sort(pop_objs, pop_viols)
    pareto_indices = [i for i in final_fronts[0] if pop_viols[i] <= 0]

    if not pareto_indices:
        # Fallback: take least-infeasible front
        pareto_indices = final_fronts[0][:10]
        print("   No fully feasible solutions — using least-infeasible front")

    pareto_chroms     = [population[i] for i in pareto_indices]
    pareto_objectives = pop_objs[pareto_indices]
    pareto_metrics    = [pop_metrics[i] for i in pareto_indices]

    print(f"   Feasible Pareto solutions : {len(pareto_chroms)}")

    # ── Identify best-compromise via SVF ──────────────────────────────────
    svf_scores = [compute_svf(m) for m in pareto_metrics]
    best_idx   = int(np.argmax(svf_scores))
    print(f"   Best-compromise SVF       : {svf_scores[best_idx]:.4f}")
    print(f"   Best-compromise Coverage  : {pareto_metrics[best_idx]['coverage']:.4f}")
    print(f"   Best-compromise Cost      : ${pareto_metrics[best_idx]['cost']:,.0f}")

    return pareto_chroms, pareto_objectives, pareto_metrics, history


# ── Run NSGA-II ───────────────────────────────────────────────────────────
print("=" * 65)
print("  Running NSGA-II Multi-Objective Optimisation (Proposed)")
print("  Parameters: Pop={}, Gen={}, Pc={}, Pm={}".format(
    POP_SIZE, N_GENERATIONS, CROSSOVER_RATE, MUTATION_RATE))
print("  Objectives: f1=-Coverage, f2=-Reliability, f3=-Redundancy, f4=Cost")
print("=" * 65)

pareto_chroms, pareto_objectives, pareto_metrics, history_nsga2 = run_nsga2()

# ── Best-compromise selection ─────────────────────────────────────────────
svf_scores   = [compute_svf(m) for m in pareto_metrics]
best_nsga2_idx    = int(np.argmax(svf_scores))
best_chromosome_nsga2 = pareto_chroms[best_nsga2_idx]
best_nsga2_metrics    = pareto_metrics[best_nsga2_idx]

print(f"\n{'='*65}")
print("  NSGA-II BEST-COMPROMISE SOLUTION (highest SVF)")
print(f"{'='*65}")
print(f"  SVF Score   : {svf_scores[best_nsga2_idx]:.4f}")
print(f"  Coverage    : {best_nsga2_metrics['coverage']:.4f}  ({best_nsga2_metrics['coverage']*100:.1f}%)")
print(f"  Reliability : {best_nsga2_metrics['reliability']:.4f}")
print(f"  Redundancy  : {best_nsga2_metrics['redundancy']:.4f}")
print(f"  Total Cost  : ${best_nsga2_metrics['cost']:,.0f} / ${BUDGET:,} budget")
print(f"  Pareto size : {len(pareto_chroms)} non-dominated solutions")
print(f"{'='*65}")


# ######################################################################
# HYPERVOLUME (notebook cell index 25)  -- SEE REVIEW NOTE
# ######################################################################

# !!! REVIEW NOTE (found while preparing the wind project): the hypervolume comparison below is NOT consistent.
# !!! nsga2_2d uses x = +coverage  (minus sign applied to an already negated objective), while ga_2d uses x = -coverage,
# !!! and hypervolume_2d treats SMALLER x as better. Same solution (cov 0.8, cost 5000) gives HV 440 as NSGA-style and 3960 as GA-style.
# !!! Do NOT copy this block. Re-implement the hypervolume with one convention (all objectives in minimise form) and unit-test it.
# ============================================================
# CELL 24 — PHASE 7.1: HYPERVOLUME INDICATOR
# ============================================================

def hypervolume_2d(objectives_2d, ref_point):
    """
    2D hypervolume calculation for a set of non-dominated points.

    The hypervolume (or S-metric) measures the area in objective space dominated
    by the solution set and bounded by a reference point.
    Larger hypervolume → better spread and convergence.

    For multi-dimensional sets we use a sweep-line algorithm on 2D projections
    (Coverage × Cost, the two most informative axes).

    Parameters
    ----------
    objectives_2d : np.ndarray shape (N, 2) — already in 'minimise' form
    ref_point     : tuple (ref_x, ref_y)

    Returns
    -------
    float — hypervolume
    """
    # Sort by first objective ascending
    pts = sorted(objectives_2d, key=lambda p: p[0])
    hv = 0.0
    prev_y = ref_point[1]
    for x, y in pts:
        if y < prev_y:   # only non-dominated in 2D
            hv += (ref_point[0] - x) * (prev_y - y)
            prev_y = y
    return max(0.0, hv)


# Build 2D projection: (−Coverage, Cost) — both in minimise convention
# NSGA-II: use entire Pareto front
nsga2_2d = np.column_stack([-pareto_objectives[:, 0],   # −(−cov) = cov in min
                              pareto_objectives[:, 3]])   # cost

# GA: single point
ga_2d = np.array([[-ga_metrics["coverage"], ga_metrics["cost"]]])

# Reference point: worst-case corner (minimum coverage = −1 in min form → 0; max cost)
ref_point_cov  = 0.0   # worst coverage (in minimise form: 0 means cov=0)
ref_point_cost = BUDGET * 1.2  # 20% above budget

# Convert to minimise: (−cov) means higher = worse → ref is (1.0, ref_cost)
ref = (1.0, ref_point_cost)

# Re-express: we stored -cov in pareto_objectives[:,0]
# For hypervolume in 2D (x=−coverage, y=cost), smaller x = better, smaller y = better
hv_nsga2 = hypervolume_2d(nsga2_2d, ref)
hv_ga    = hypervolume_2d(ga_2d,    ref)

ratio = hv_nsga2 / hv_ga if hv_ga > 0 else float("inf")

print("=" * 65)
print("  HYPERVOLUME INDICATOR COMPARISON")
print("=" * 65)
print(f"  NSGA-II Hypervolume : {hv_nsga2:.6f}")
print(f"  GA Hypervolume      : {hv_ga:.6f}  (single point)")
print(f"  HV Ratio            : {ratio:.2f}×")
print(f"  → NSGA-II covers {ratio:.1f}× more objective space than GA")
print("=" * 65)
