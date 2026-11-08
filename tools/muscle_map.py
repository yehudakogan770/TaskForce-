"""Muscle regions on the continuous body surface.

Every vertex gets a surface muscle (what you see) and, where there is one, the deep muscle underneath.
All shapes are drawn for the body's left side (x > 0) and mirrored.

Two ways to draw a region:
  * torso, neck and hips: an outline in the front or back view (metres), like an anatomy chart;
  * arms and legs: bands around the limb. For each point t along the bone (0 = upper joint, 1 = lower joint)
    a centre angle and a half width in degrees: 0 = front of the limb, 90 = outer side, 180 = back, -90 = inner side.
Borders between regions become shallow grooves, and each muscle is raised slightly in the middle,
so the body reads as one smooth surface with natural muscle contours.
"""
import collections, heapq
import numpy as np

# ---------------------------------------------------------------- outlines (x, y) on the left half
FRONT, BACK, ANY = "front", "back", "any"
TORSO = {"torso", "head"}

# (id, part, side, segments, outline, extra normal test)  - first match wins
OUTLINES = [
    ("sternocleidomastoid", 0, FRONT, TORSO, [(0.056, 1.565), (0.066, 1.535), (0.042, 1.492), (0.022, 1.462), (0.008, 1.466), (0.02, 1.492), (0.046, 1.548)], lambda n: n[2] > -0.35 and n[1] < 0.45),
    ("trapezius", 0, BACK, TORSO, [(0.0, 1.565), (0.03, 1.565), (0.05, 1.52), (0.09, 1.475), (0.15, 1.455), (0.205, 1.44), (0.20, 1.415), (0.15, 1.40), (0.10, 1.365),
                                   (0.065, 1.30), (0.035, 1.21), (0.0, 1.175)], lambda n: n[2] < 0.25),
    ("deltoid", 0, ANY, {"torso", "uarm"}, [(0.152, 1.432), (0.20, 1.462), (0.243, 1.45), (0.275, 1.415), (0.30, 1.36), (0.31, 1.315), (0.30, 1.285), (0.275, 1.29),
                                           (0.24, 1.315), (0.212, 1.338), (0.196, 1.37), (0.172, 1.408)], None),
    ("pec_major_clavicular", 0, FRONT, TORSO, [(0.008, 1.448), (0.06, 1.448), (0.12, 1.438), (0.158, 1.43), (0.18, 1.40), (0.195, 1.36), (0.15, 1.362), (0.09, 1.372),
                                              (0.03, 1.38), (0.008, 1.381)], None),
    ("pec_major_sternal", 0, FRONT, TORSO | {"uarm"}, [(0.008, 1.381), (0.03, 1.38), (0.09, 1.372), (0.15, 1.362), (0.195, 1.36), (0.208, 1.33), (0.198, 1.30),
                                                       (0.18, 1.275), (0.16, 1.252), (0.132, 1.232), (0.10, 1.222), (0.06, 1.222), (0.025, 1.23), (0.008, 1.234)], None),
    ("serratus_anterior", 0, ANY, TORSO, [(0.135, 1.228), (0.162, 1.25), (0.182, 1.28), (0.198, 1.30), (0.215, 1.27), (0.205, 1.215), (0.188, 1.175), (0.168, 1.16),
                                          (0.15, 1.175), (0.132, 1.205)], lambda n: n[2] > -0.25),
    ("infraspinatus", 0, BACK, TORSO, [(0.085, 1.395), (0.15, 1.39), (0.18, 1.365), (0.17, 1.325), (0.14, 1.30), (0.105, 1.31), (0.085, 1.35)], None),
    ("teres_minor", 0, BACK, TORSO | {"uarm"}, [(0.17, 1.375), (0.195, 1.365), (0.206, 1.34), (0.19, 1.33), (0.17, 1.335)], None),
    ("teres_major", 0, BACK, TORSO | {"uarm"}, [(0.14, 1.30), (0.17, 1.325), (0.19, 1.33), (0.206, 1.338), (0.21, 1.31), (0.19, 1.29), (0.16, 1.275)], None),
    ("rectus_abdominis", 1, FRONT, TORSO, [(0.008, 1.228), (0.065, 1.222), (0.074, 1.17), (0.008, 1.172)], None),
    ("rectus_abdominis", 2, FRONT, TORSO, [(0.008, 1.164), (0.074, 1.162), (0.076, 1.11), (0.008, 1.112)], None),
    ("rectus_abdominis", 3, FRONT, TORSO, [(0.008, 1.104), (0.076, 1.102), (0.074, 1.045), (0.008, 1.048)], None),
    ("rectus_abdominis", 4, FRONT, TORSO, [(0.008, 1.040), (0.074, 1.037), (0.066, 0.96), (0.045, 0.905), (0.008, 0.885)], None),
    ("external_oblique", 0, ANY, TORSO, [(0.078, 1.21), (0.12, 1.212), (0.148, 1.18), (0.168, 1.162), (0.185, 1.13), (0.18, 1.06), (0.175, 1.00), (0.155, 0.945),
                                         (0.115, 0.905), (0.072, 0.925), (0.078, 1.05), (0.079, 1.15)], lambda n: n[2] > -0.45),
    ("iliopsoas", 0, FRONT, TORSO | {"thigh"}, [(0.05, 0.915), (0.072, 0.925), (0.10, 0.905), (0.105, 0.875), (0.085, 0.862), (0.06, 0.88)], None),
    ("tensor_fasciae_latae", 0, ANY, TORSO | {"thigh"}, [(0.155, 0.945), (0.175, 0.935), (0.19, 0.89), (0.19, 0.83), (0.175, 0.82), (0.16, 0.86), (0.145, 0.91)], lambda n: n[2] > -0.2 and n[0] > 0.2),
    ("latissimus_dorsi", 0, ANY, TORSO, [(0.035, 1.21), (0.065, 1.30), (0.105, 1.31), (0.14, 1.30), (0.16, 1.275), (0.19, 1.29), (0.21, 1.31), (0.212, 1.285),
                                          (0.198, 1.24), (0.185, 1.19), (0.18, 1.13), (0.18, 1.06), (0.16, 1.00), (0.10, 1.02), (0.06, 1.06), (0.038, 1.10)], lambda n: n[2] < 0.1),
    ("erector_spinae", 0, BACK, TORSO, [(0.008, 1.18), (0.036, 1.205), (0.038, 1.10), (0.058, 1.06), (0.068, 1.00), (0.06, 0.965), (0.025, 0.955), (0.008, 0.965)], None),
    ("gluteus_medius", 0, ANY, TORSO | {"thigh"}, [(0.068, 1.00), (0.16, 1.00), (0.185, 0.96), (0.19, 0.93), (0.165, 0.915), (0.11, 0.935), (0.065, 0.96)], lambda n: n[2] < 0.15),
    ("gluteus_maximus", 0, BACK, TORSO | {"thigh"}, [(0.008, 0.965), (0.06, 0.96), (0.11, 0.935), (0.165, 0.915), (0.185, 0.88), (0.18, 0.82), (0.15, 0.785),
                                                     (0.10, 0.78), (0.05, 0.795), (0.012, 0.84)], None),
]
DEEP_OUTLINES = [
    ("supraspinatus", BACK, [(0.06, 1.445), (0.17, 1.435), (0.175, 1.41), (0.07, 1.415)]),
    ("rhomboids", BACK, [(0.008, 1.44), (0.06, 1.40), (0.085, 1.31), (0.04, 1.255), (0.008, 1.27)]),
    ("subscapularis", BACK, [(0.08, 1.40), (0.16, 1.40), (0.19, 1.35), (0.16, 1.29), (0.10, 1.29), (0.08, 1.34)]),
    ("pec_minor", FRONT, [(0.06, 1.34), (0.12, 1.37), (0.17, 1.385), (0.175, 1.36), (0.10, 1.29), (0.06, 1.285)]),
    ("quadratus_lumborum", BACK, [(0.02, 1.10), (0.075, 1.10), (0.085, 1.00), (0.02, 0.985)]),
    ("internal_oblique", ANY, [(0.08, 1.10), (0.17, 1.08), (0.17, 1.0), (0.15, 0.94), (0.10, 0.91), (0.075, 0.95)]),
    ("transverse_abdominis", FRONT, [(0.008, 1.12), (0.17, 1.10), (0.17, 0.98), (0.10, 0.90), (0.008, 0.89)]),
    ("gluteus_minimus", ANY, [(0.08, 0.99), (0.16, 0.99), (0.18, 0.95), (0.15, 0.93), (0.10, 0.94)]),
]

# ---------------------------------------------------------------- bands on the limbs: (id, part, segment, rows [(t, centre, half width)])
BANDS = [
    # upper arm (deltoid comes from the outline above and wins)
    ("biceps_brachii", 0, "uarm", [(0.22, 0, 30), (0.45, -2, 46), (0.7, 0, 44), (0.88, 5, 28), (0.97, 8, 12)]),
    ("brachialis", 0, "uarm", [(0.55, 62, 10), (0.75, 60, 18), (0.92, 48, 16), (1.0, 40, 8)]),
    ("triceps_brachii", 0, "uarm", [(0.12, 180, 70), (0.4, 178, 92), (0.75, 175, 75), (0.92, 175, 40), (1.0, 175, 20)]),
    # forearm
    ("brachioradialis", 0, "farm", [(-0.04, 55, 18), (0.12, 62, 30), (0.45, 70, 24), (0.75, 78, 14), (0.9, 82, 8)]),
    ("forearm_flexors", 0, "farm", [(-0.02, -40, 40), (0.2, -35, 62), (0.6, -40, 55), (0.85, -42, 40), (0.95, -42, 25)]),
    ("forearm_extensors", 0, "farm", [(-0.02, 150, 40), (0.2, 155, 60), (0.6, 155, 58), (0.85, 155, 42), (0.95, 155, 25)]),
    # thigh (sartorius lies on top of the others)
    ("sartorius", 0, "thigh", [(0.03, 52, 7), (0.2, 22, 7), (0.4, -22, 7.5), (0.6, -62, 8), (0.82, -98, 8), (0.97, -118, 7)]),
    ("rectus_femoris", 0, "thigh", [(0.1, 2, 16), (0.3, 0, 25), (0.55, 0, 27), (0.8, 2, 20), (0.9, 4, 12)]),
    ("vastus_medialis", 0, "thigh", [(0.5, -38, 10), (0.68, -42, 24), (0.85, -38, 30), (0.95, -28, 20), (1.0, -20, 8)]),
    ("vastus_lateralis", 0, "thigh", [(0.12, 70, 42), (0.45, 70, 45), (0.75, 58, 35), (0.92, 42, 22), (0.98, 30, 10)]),
    ("adductors", 0, "thigh", [(0.0, -95, 55), (0.3, -95, 50), (0.55, -100, 30), (0.7, -105, 14), (0.78, -110, 6)]),
    ("biceps_femoris", 0, "thigh", [(0.18, 150, 22), (0.5, 140, 28), (0.8, 128, 22), (0.95, 120, 12)]),
    ("semitendinosus", 0, "thigh", [(0.18, -172, 20), (0.5, -168, 20), (0.8, -158, 14), (0.95, -150, 8)]),
    ("semimembranosus", 0, "thigh", [(0.3, -135, 14), (0.6, -135, 22), (0.85, -138, 18), (0.96, -140, 10)]),
    # lower leg
    ("gastrocnemius", 1, "shin", [(0.02, 145, 33), (0.25, 140, 42), (0.5, 150, 30), (0.62, 160, 14)]),
    ("gastrocnemius", 2, "shin", [(0.02, -150, 30), (0.25, -145, 40), (0.52, -155, 30), (0.66, -165, 14)]),
    ("tibialis_anterior", 0, "shin", [(0.05, 28, 22), (0.4, 30, 22), (0.7, 22, 16), (0.88, 10, 10)]),
    ("peroneals", 0, "shin", [(0.08, 88, 20), (0.45, 92, 20), (0.75, 100, 15), (0.88, 105, 8)]),
    ("soleus", 0, "shin", [(0.3, 180, 100), (0.6, 180, 90), (0.8, 180, 55), (0.88, 180, 25)]),
]
DEEP_BANDS = [
    ("vastus_intermedius", "thigh", [(0.15, 10, 30), (0.5, 10, 35), (0.85, 5, 25)]),
]

NAMES = ["none"]
def mid(name):
    if name not in NAMES: NAMES.append(name)
    return NAMES.index(name)

# ---------------------------------------------------------------- helpers
def vertex_normals(P, Q):
    N = np.zeros_like(P)
    for a, b, c in ((0, 1, 2), (0, 2, 3)):
        n = np.cross(P[Q[:, b]] - P[Q[:, a]], P[Q[:, c]] - P[Q[:, a]])
        for k in (a, b, c): np.add.at(N, Q[:, k], n)
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)

def in_poly(pts, poly):
    x, y = pts[:, 0], pts[:, 1]; inside = np.zeros(len(pts), bool)
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]; xj, yj = poly[j]
        cross = ((yi > y) != (yj > y)) & (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi)
        inside ^= cross; j = i
    return inside

def seg_dist(P, a, b):
    ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)

def label(P, Q, J):
    n = len(P)
    N = vertex_normals(P, Q)
    # work on the left half: mirror the right side's points and normals
    side = np.where(P[:, 0] >= 0, 1, -1)
    L = P.copy(); L[:, 0] = np.abs(L[:, 0])
    NL = N.copy(); NL[:, 0] *= side
    j = lambda k: np.array(J[k])
    sh, el, wr = j("l-shoulder"), j("l-elbow"), j("l-hand")
    hip, kn, an = j("l-upper-leg"), j("l-knee"), j("l-ankle")
    sh = sh + np.array([0.0, 0.0, 0.0])
    caps = {
        "torso": (np.array([0, 0.90, 0.0]), np.array([0, 1.47, 0.0]), 0.12),
        "head": (np.array([0, 1.50, 0.02]), np.array([0, 1.66, 0.04]), 0.07),
        "uarm": (sh, el, 0.045),
        "farm": (el, wr, 0.035),
        "hand": (wr, wr + (wr - el) * 0.6, 0.03),
        "thigh": (hip, kn, 0.075),
        "shin": (kn, an, 0.045),
        "foot": (an, an + np.array([0, -0.05, 0.16]), 0.035),
    }
    names = list(caps)
    D = np.stack([seg_dist(L, a, b) - r for a, b, r in caps.values()], 1)
    seg = np.array(names)[D.argmin(1)]

    surface = np.zeros(n, "u1"); deep = np.zeros(n, "u1"); part = np.zeros(n, "i4")
    # the face and skull stay bare
    bare = ((L[:, 1] > 1.535) & (NL[:, 2] > -0.2)) | (L[:, 1] > 1.575)
    seg = np.where(bare, "head", seg)
    front = NL[:, 2] >= 0
    for mid_, partno, sd, segs, poly, test in OUTLINES:
        m = (surface == 0) & np.isin(seg, list(segs)) & in_poly(L, poly)
        if sd == FRONT: m &= front
        if sd == BACK: m &= ~front
        if test is not None: m &= np.array([bool(test(v)) for v in NL])
        if mid_ == "deltoid":
            # one outline, split by which way the surface faces
            for name, mm in (("deltoid_anterior", NL[:, 2] > 0.32), ("deltoid_posterior", NL[:, 2] < -0.32), ("deltoid_lateral", np.abs(NL[:, 2]) <= 0.32)):
                k = m & mm; surface[k] = mid(name); part[k] = 0
            continue
        surface[m] = mid(mid_); part[m] = partno
    for mid_, sd, poly in DEEP_OUTLINES:
        m = (deep == 0) & np.isin(seg, list(TORSO | {"thigh", "uarm"})) & in_poly(L, poly)
        if sd == FRONT: m &= front
        if sd == BACK: m &= ~front
        deep[m] = mid(mid_)

    # limb coordinates: t along the bone, angle around it (0 front, +90 outer side)
    def limb(segname):
        a, b, _ = caps[segname]; ax = b - a; ln = np.linalg.norm(ax); ax = ax / ln
        fwd = np.array([0, 0, 1.0]) - ax * ax[2]; fwd /= np.linalg.norm(fwd)
        lat = np.cross(ax, fwd)
        if lat[0] < 0: lat = -lat
        d = L - a; t = (d @ ax) / ln
        r = d - np.outer(d @ ax, ax)
        ang = np.degrees(np.arctan2(r @ lat, r @ fwd))
        return t, ang
    def rows_at(rows, t):
        ts = np.array([r[0] for r in rows]); c = np.array([r[1] for r in rows], float); w = np.array([r[2] for r in rows], float)
        # unwrap centres so interpolation goes the short way round
        c = np.degrees(np.unwrap(np.radians(c)))
        ok = (t >= ts[0]) & (t <= ts[-1])
        return ok, np.interp(t, ts, c), np.interp(t, ts, w)
    cache = {}
    for mid_, partno, segname, rows in BANDS:
        if segname not in cache: cache[segname] = limb(segname)
        t, ang = cache[segname]
        ok, c, w = rows_at(rows, t)
        dif = (ang - c + 180) % 360 - 180
        m = (surface == 0) & (seg == segname) & ok & (np.abs(dif) < w)
        surface[m] = mid(mid_); part[m] = partno
    for mid_, segname, rows in DEEP_BANDS:
        t, ang = cache[segname]
        ok, c, w = rows_at(rows, t)
        m = (deep == 0) & (seg == segname) & ok & (np.abs((ang - c + 180) % 360 - 180) < w)
        deep[m] = mid(mid_)

    nbr = collections.defaultdict(set)
    for f in Q:
        for k in range(4):
            a, b = f[k], f[(k + 1) % 4]; nbr[a].add(b); nbr[b].add(a)
    nbl = [np.fromiter(nbr[v], int) for v in range(n)]
    grow_ok = np.isin(seg, ["torso", "uarm", "farm", "thigh", "shin"]) & (L[:, 1] < 1.565)
    key0 = surface.astype(np.int64) * 16 + part
    def grow(key, reach):
        # muscles spread into bare skin nearby, so the body reads as covered in muscle
        dist0 = np.full(n, np.inf); owner = key.copy(); heap = []
        for v in np.nonzero(key)[0]: dist0[v] = 0; heap.append((0.0, int(v)))
        heapq.heapify(heap)
        while heap:
            d, v = heapq.heappop(heap)
            if d > dist0[v]: continue
            for u in nbl[v]:
                if key[u] or not grow_ok[u]: continue
                nd = d + np.linalg.norm(P[u] - P[v])
                if nd < dist0[u] and nd < reach[u]: dist0[u] = nd; owner[u] = owner[v]; heapq.heappush(heap, (nd, u))
        return owner
    def smooth(key, rounds):
        # each vertex takes the most common label in its ring, which rounds off jagged outlines
        for _ in range(rounds):
            new = key.copy()
            for v in np.nonzero(grow_ok)[0]:
                ring = np.append(key[nbl[v]], key[v])
                vals, cnt = np.unique(ring, return_counts=True)
                if cnt.max() > np.sum(ring == key[v]): new[v] = vals[cnt.argmax()]
            key = new
        return key
    reach = np.where(np.isin(seg, ["torso", "thigh", "uarm"]), 0.05, 0.02)
    key0 = grow(key0, reach)
    key0 = smooth(key0, 8)
    key0 = grow(key0, reach * 0.5)
    surface = (key0 // 16).astype("u1"); part = (key0 % 16).astype("i4")

    # ------------------------------------------------ contours: grooves at borders, a gentle rise inside each muscle
    key = surface.astype(np.int64) * 16 + part
    key[surface == 0] = 0
    # the left and right halves of a muscle are separate shapes (the midline groove)
    key = key * 2 + (side > 0)
    key[surface == 0] = 0
    dist = np.full(n, np.inf); heap = []
    for v in range(n):
        if any(key[u] != key[v] for u in nbr[v]): dist[v] = 0; heap.append((0.0, v))
    heapq.heapify(heap)
    while heap:
        d, v = heapq.heappop(heap)
        if d > dist[v] or d > 0.05: continue
        for u in nbr[v]:
            if key[u] != key[v]: continue
            nd = d + np.linalg.norm(P[u] - P[v])
            if nd < dist[u]: dist[u] = nd; heapq.heappush(heap, (nd, u))
    dist = np.minimum(dist, 0.05)
    musc = surface > 0
    groove = np.exp(-dist / 0.0045)
    shade = 1 - 0.30 * groove * musc - 0.08 * groove * (~musc)
    rise = np.where(musc, 0.0045 * (1 - np.exp(-dist / 0.012)) - 0.0012 * groove, 0.0)
    P2 = P + N * rise[:, None]
    return surface, deep, np.clip(shade * 255, 0, 255).astype("u1"), NAMES, P2
