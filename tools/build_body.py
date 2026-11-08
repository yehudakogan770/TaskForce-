#!/usr/bin/env python3
"""Builds fitness/body.bin: the anatomy figure's mesh with a muscle id on every vertex.

Source: the MakeHuman base mesh and shape targets (released as CC0, https://github.com/makehumancommunity/makehuman).
Run:  python3 tools/build_body.py <folder with base.obj and the .target files>
"""
import sys, os, json, struct, collections
import numpy as np

SRC = sys.argv[1] if len(sys.argv) > 1 else "mh"
OUT = os.path.join(os.path.dirname(__file__), "..", "fitness", "body.bin")

# ---------------------------------------------------------------- mesh and shape
def load_obj(path):
    V, groups, grp = [], collections.defaultdict(list), None
    for line in open(path):
        if line.startswith("v "): V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("g "): grp = line.split()[1]
        elif line.startswith("f "): groups[grp].append([int(t.split("/")[0]) - 1 for t in line.split()[1:]])
    return np.array(V), groups

def load_target(name):
    d = []
    for line in open(os.path.join(SRC, name)):
        if line.startswith("#") or not line.strip(): continue
        p = line.split(); d.append((int(p[0]), float(p[1]), float(p[2]), float(p[3])))
    return d

V, G = load_obj(os.path.join(SRC, "base.obj"))
# an athletic adult man: male (all three ethnic bases equally), more muscle than average, ideal proportions
SHAPE = [("caucasian-male-young.target", 1 / 3), ("african-male-young.target", 1 / 3), ("asian-male-young.target", 1 / 3),
         ("universal-male-young-maxmuscle-averageweight.target", 0.5), ("universal-male-young-maxmuscle-minweight.target", 0.5),
         ("proportions_male-young-maxmuscle-averageweight-idealproportions.target", 1.0)]
for name, w in SHAPE:
    for i, dx, dy, dz in load_target(name): V[i] += w * np.array([dx, dy, dz])

joints = {}
for g, faces in G.items():
    if g.startswith("joint-"):
        vs = sorted({i for f in faces for i in f}); joints[g[6:]] = V[vs].mean(0)

body = G["body"]
used = sorted({i for f in body for i in f}); remap = {o: n for n, o in enumerate(used)}
P = V[used].copy()
Q = np.array([[remap[i] for i in f] for f in body])

# metres, feet on the floor, facing +z
P *= 0.1
for k in joints: joints[k] = joints[k] * 0.1
floor = P[:, 1].min()
P[:, 1] -= floor
for k in joints: joints[k][1] -= floor
J = joints

# ---------------------------------------------------------------- smoothing: one Catmull-Clark step
def catmull_clark(P, Q):
    nV = len(P)
    edges = {}
    def ekey(a, b): return (a, b) if a < b else (b, a)
    face_pts = P[Q].mean(1)
    edge_faces = collections.defaultdict(list)
    for fi, f in enumerate(Q):
        for k in range(4): edge_faces[ekey(f[k], f[(k + 1) % 4])].append(fi)
    elist = list(edge_faces.keys()); eidx = {e: i for i, e in enumerate(elist)}
    E = np.zeros((len(elist), 3))
    for i, (a, b) in enumerate(elist):
        fs = edge_faces[(a, b)]
        E[i] = (P[a] + P[b] + sum(face_pts[f] for f in fs)) / (2 + len(fs)) if len(fs) == 2 else (P[a] + P[b]) / 2
    # move original points
    vf = collections.defaultdict(list); ve = collections.defaultdict(list)
    for fi, f in enumerate(Q):
        for k in range(4): vf[f[k]].append(fi)
    for (a, b) in elist: ve[a].append((a, b)); ve[b].append((a, b))
    NP = P.copy()
    for v in range(nV):
        es = ve[v]
        border = [e for e in es if len(edge_faces[e]) == 1]
        if border:
            if len(border) == 2:
                o = [e[0] if e[1] == v else e[1] for e in border]
                NP[v] = 0.75 * P[v] + 0.125 * (P[o[0]] + P[o[1]])
            continue
        n = len(vf[v]); Fv = face_pts[vf[v]].mean(0); R = np.mean([(P[a] + P[b]) / 2 for a, b in es], 0)
        NP[v] = (Fv + 2 * R + (n - 3) * P[v]) / n
    base_e, base_f = nV, nV + len(elist)
    allP = np.vstack([NP, E, face_pts])
    NQ = []
    for fi, f in enumerate(Q):
        for k in range(4):
            a, b, prev = f[k], f[(k + 1) % 4], f[(k + 3) % 4]
            NQ.append([a, base_e + eidx[ekey(a, b)], base_f + fi, base_e + eidx[ekey(prev, a)]])
    return allP, np.array(NQ)

P, Q = catmull_clark(P, Q)

# ---------------------------------------------------------------- muscles
from muscle_map import label   # muscle regions, kept in their own file
surface, deep, shade, NAMES, P = label(P, Q, J)

# ---------------------------------------------------------------- write
T = np.concatenate([Q[:, [0, 1, 2]], Q[:, [0, 2, 3]]])
assert len(P) < 65536
names = json.dumps(NAMES).encode()
with open(OUT, "wb") as f:
    f.write(b"TFB1"); f.write(struct.pack("<IIII", len(P), len(T), len(names), 0))
    f.write(names + b" " * ((4 - len(names) % 4) % 4))
    f.write(P.astype("<f4").tobytes())
    f.write(T.astype("<u2").tobytes()); f.write(b"\0\0" if len(T) * 3 % 2 else b"")
    f.write(np.asarray(surface, "u1").tobytes()); f.write(np.asarray(deep, "u1").tobytes()); f.write(np.asarray(shade, "u1").tobytes())
print("wrote", OUT, os.path.getsize(OUT), "bytes;", len(P), "vertices,", len(T), "triangles")
