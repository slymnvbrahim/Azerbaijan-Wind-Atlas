# Phase 3 - Optimizer (NSGA-II) and comparison with a genetic algorithm

Goal: choose 10 turbines (site + tower height 50/100/150 m) with three goals: more energy, better access, lower cost.

Folders
- code/          phase3_optimizer.py (final script), phase3_optimizer.ipynb (Colab wrapper),
                 nsga2_kur_reference_extract.py and source_kur_river_paper_notebook.ipynb (your earlier paper code, source of the algorithm)
- data_inputs/   candidate_sites.csv, accessibility_points.csv, power_curve_table.csv, gwc_area_1.lib
- outputs/       Pareto solutions, best compromise, site-turbine table, hypervolume tables, 3 charts, run config

Key results: 91 Pareto solutions; best compromise 104.5 GWh/year, access 0.64, cost 11.48 units (5 towers of 50 m, 5 of 100 m).
Hypervolume (higher is better): GA one weight 0.679, NSGA-II 150 generations 0.950, GA with 10 weights 0.973, NSGA-II 10x generations 0.999.
13 of 13 unit tests pass.
Found on the way: the hypervolume code in the Kur notebook used inconsistent signs (see the progress report).
