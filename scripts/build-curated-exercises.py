#!/usr/bin/env python3
"""Author a curated ~150 common-gym exercise directory with rich metadata.

Each row: canonical_name, primary_muscles[], secondary_muscles[], body_region[]
(derived), equipment, mechanic, modality, aliases[].

Muscle vocabulary is the 17-value free-exercise-db set so a future re-seed can
cross-reference. body_region is derived from PRIMARY muscles only.
"""
import json, collections, sys

# 17 source muscles -> 6 body regions
REGION = {
    'chest': 'Chest',
    'lats': 'Back', 'middle back': 'Back', 'lower back': 'Back', 'traps': 'Back',
    'shoulders': 'Shoulders', 'neck': 'Shoulders',
    'biceps': 'Arms', 'triceps': 'Arms', 'forearms': 'Arms',
    'quadriceps': 'Legs', 'hamstrings': 'Legs', 'glutes': 'Legs',
    'calves': 'Legs', 'abductors': 'Legs', 'adductors': 'Legs',
    'abdominals': 'Core',
}
VOCAB = set(REGION)
MODALITIES = {'weight_reps', 'bodyweight_reps', 'time', 'distance_time'}

# name, primary[], secondary[], equipment, mechanic, modality, aliases[]
W, B, T, D = 'weight_reps', 'bodyweight_reps', 'time', 'distance_time'
CMP, ISO = 'compound', 'isolation'

E = [
 # ---------------- CHEST ----------------
 ("Barbell Bench Press", ["chest"], ["triceps","shoulders"], "barbell", CMP, W, ["bench","flat bench press"]),
 ("Incline Barbell Bench Press", ["chest"], ["shoulders","triceps"], "barbell", CMP, W, ["incline bench"]),
 ("Decline Barbell Bench Press", ["chest"], ["triceps","shoulders"], "barbell", CMP, W, ["decline bench"]),
 ("Dumbbell Bench Press", ["chest"], ["triceps","shoulders"], "dumbbell", CMP, W, ["db bench","flat db press"]),
 ("Incline Dumbbell Press", ["chest"], ["shoulders","triceps"], "dumbbell", CMP, W, ["incline db press"]),
 ("Machine Chest Press", ["chest"], ["triceps","shoulders"], "machine", CMP, W, ["chest press machine"]),
 ("Dumbbell Fly", ["chest"], ["shoulders"], "dumbbell", ISO, W, ["chest fly","db fly"]),
 ("Incline Dumbbell Fly", ["chest"], ["shoulders"], "dumbbell", ISO, W, []),
 ("Cable Crossover", ["chest"], ["shoulders"], "cable", ISO, W, ["cable fly"]),
 ("Pec Deck", ["chest"], [], "machine", ISO, W, ["machine fly","pec deck fly"]),
 ("Push-Up", ["chest"], ["triceps","shoulders","abdominals"], "body only", CMP, B, ["pushup","press up"]),
 ("Chest Dip", ["chest"], ["triceps","shoulders"], "body only", CMP, B, ["dips","chest dips"]),
 ("Dumbbell Pullover", ["chest"], ["lats","triceps"], "dumbbell", CMP, W, ["pullover"]),
 ("Diamond Push-Up", ["triceps"], ["chest","shoulders"], "body only", CMP, B, ["close grip pushup"]),

 # ---------------- BACK ----------------
 ("Deadlift", ["glutes","hamstrings","lower back"], ["quadriceps","traps","forearms","lats"], "barbell", CMP, W, ["conventional deadlift","dl"]),
 ("Sumo Deadlift", ["glutes","quadriceps","hamstrings"], ["adductors","lower back","traps","forearms"], "barbell", CMP, W, []),
 ("Romanian Deadlift", ["hamstrings","glutes"], ["lower back","forearms"], "barbell", CMP, W, ["rdl"]),
 ("Rack Pull", ["lower back","traps"], ["glutes","hamstrings","forearms"], "barbell", CMP, W, []),
 ("Pull-Up", ["lats"], ["biceps","middle back","forearms"], "body only", CMP, B, ["pullup"]),
 ("Chin-Up", ["lats","biceps"], ["middle back","forearms"], "body only", CMP, B, ["chinup"]),
 ("Lat Pulldown", ["lats"], ["biceps","middle back"], "cable", CMP, W, ["pulldown"]),
 ("Close-Grip Lat Pulldown", ["lats","biceps"], ["middle back"], "cable", CMP, W, []),
 ("Straight-Arm Pulldown", ["lats"], ["triceps"], "cable", ISO, W, ["straight arm pushdown"]),
 ("Bent-Over Barbell Row", ["middle back","lats"], ["biceps","lower back","traps"], "barbell", CMP, W, ["barbell row","bb row"]),
 ("Pendlay Row", ["middle back","lats"], ["biceps","traps"], "barbell", CMP, W, []),
 ("One-Arm Dumbbell Row", ["lats","middle back"], ["biceps","forearms"], "dumbbell", CMP, W, ["db row","single arm row"]),
 ("Seated Cable Row", ["middle back","lats"], ["biceps","forearms"], "cable", CMP, W, ["cable row"]),
 ("T-Bar Row", ["middle back","lats"], ["biceps","traps"], "barbell", CMP, W, []),
 ("Chest-Supported Row", ["middle back","lats"], ["biceps"], "machine", CMP, W, ["seal row"]),
 ("Machine Row", ["middle back","lats"], ["biceps"], "machine", CMP, W, ["hammer strength row"]),
 ("Inverted Row", ["middle back","lats"], ["biceps"], "body only", CMP, B, ["bodyweight row"]),
 ("Face Pull", ["shoulders","traps"], ["middle back"], "cable", ISO, W, []),
 ("Back Extension", ["lower back"], ["glutes","hamstrings"], "body only", ISO, B, ["hyperextension"]),
 ("Barbell Shrug", ["traps"], ["forearms"], "barbell", ISO, W, ["shrug"]),
 ("Dumbbell Shrug", ["traps"], ["forearms"], "dumbbell", ISO, W, []),

 # ---------------- LEGS ----------------
 ("Barbell Back Squat", ["quadriceps","glutes"], ["hamstrings","lower back","adductors"], "barbell", CMP, W, ["squat","back squat"]),
 ("Front Squat", ["quadriceps"], ["glutes","abdominals","lower back"], "barbell", CMP, W, []),
 ("Goblet Squat", ["quadriceps","glutes"], ["abdominals"], "dumbbell", CMP, W, []),
 ("Smith Machine Squat", ["quadriceps","glutes"], ["hamstrings"], "machine", CMP, W, []),
 ("Hack Squat", ["quadriceps"], ["glutes","hamstrings"], "machine", CMP, W, []),
 ("Leg Press", ["quadriceps","glutes"], ["hamstrings"], "machine", CMP, W, []),
 ("Bulgarian Split Squat", ["quadriceps","glutes"], ["hamstrings"], "dumbbell", CMP, W, ["split squat"]),
 ("Walking Lunge", ["quadriceps","glutes"], ["hamstrings"], "dumbbell", CMP, W, ["lunge"]),
 ("Reverse Lunge", ["quadriceps","glutes"], ["hamstrings"], "dumbbell", CMP, W, []),
 ("Step-Up", ["quadriceps","glutes"], ["hamstrings"], "dumbbell", CMP, W, []),
 ("Leg Extension", ["quadriceps"], [], "machine", ISO, W, ["quad extension"]),
 ("Lying Leg Curl", ["hamstrings"], [], "machine", ISO, W, ["leg curl","ham curl"]),
 ("Seated Leg Curl", ["hamstrings"], [], "machine", ISO, W, []),
 ("Nordic Hamstring Curl", ["hamstrings"], ["glutes"], "body only", ISO, B, ["nordic curl"]),
 ("Good Morning", ["hamstrings","lower back"], ["glutes"], "barbell", CMP, W, []),
 ("Hip Thrust", ["glutes"], ["hamstrings"], "barbell", CMP, W, ["barbell hip thrust"]),
 ("Glute Bridge", ["glutes"], ["hamstrings"], "body only", CMP, B, []),
 ("Romanian Deadlift (Dumbbell)", ["hamstrings","glutes"], ["lower back"], "dumbbell", CMP, W, ["db rdl"]),
 ("Single-Leg Deadlift", ["hamstrings","glutes"], ["lower back","abdominals"], "dumbbell", CMP, W, []),
 ("Sumo Squat", ["quadriceps","glutes","adductors"], ["hamstrings"], "dumbbell", CMP, W, ["plie squat"]),
 ("Hip Adduction Machine", ["adductors"], [], "machine", ISO, W, ["inner thigh machine"]),
 ("Hip Abduction Machine", ["abductors"], [], "machine", ISO, W, ["outer thigh machine"]),
 ("Standing Calf Raise", ["calves"], [], "machine", ISO, W, ["calf raise"]),
 ("Seated Calf Raise", ["calves"], [], "machine", ISO, W, []),
 ("Leg Press Calf Raise", ["calves"], [], "machine", ISO, W, ["calf press"]),
 ("Pistol Squat", ["quadriceps","glutes"], ["hamstrings"], "body only", CMP, B, ["single leg squat"]),
 ("Wall Sit", ["quadriceps"], ["glutes"], "body only", ISO, T, []),

 # ---------------- SHOULDERS ----------------
 ("Overhead Press", ["shoulders"], ["triceps","traps"], "barbell", CMP, W, ["ohp","military press","shoulder press"]),
 ("Seated Dumbbell Shoulder Press", ["shoulders"], ["triceps"], "dumbbell", CMP, W, ["db shoulder press"]),
 ("Arnold Press", ["shoulders"], ["triceps"], "dumbbell", CMP, W, []),
 ("Machine Shoulder Press", ["shoulders"], ["triceps"], "machine", CMP, W, []),
 ("Push Press", ["shoulders"], ["triceps","quadriceps"], "barbell", CMP, W, []),
 ("Dumbbell Lateral Raise", ["shoulders"], [], "dumbbell", ISO, W, ["lateral raise","side raise","lat raise"]),
 ("Cable Lateral Raise", ["shoulders"], [], "cable", ISO, W, []),
 ("Front Raise", ["shoulders"], [], "dumbbell", ISO, W, []),
 ("Reverse Fly", ["shoulders"], ["traps","middle back"], "dumbbell", ISO, W, ["rear delt fly","bent over lateral raise"]),
 ("Cable Rear Delt Fly", ["shoulders"], ["middle back"], "cable", ISO, W, []),
 ("Upright Row", ["shoulders","traps"], ["biceps"], "barbell", CMP, W, []),
 ("Landmine Press", ["shoulders"], ["triceps","chest"], "barbell", CMP, W, []),

 # ---------------- ARMS: biceps ----------------
 ("Barbell Curl", ["biceps"], ["forearms"], "barbell", ISO, W, ["bicep curl","bb curl"]),
 ("Dumbbell Curl", ["biceps"], ["forearms"], "dumbbell", ISO, W, ["db curl"]),
 ("Hammer Curl", ["biceps","forearms"], [], "dumbbell", ISO, W, []),
 ("Preacher Curl", ["biceps"], [], "barbell", ISO, W, []),
 ("Incline Dumbbell Curl", ["biceps"], [], "dumbbell", ISO, W, []),
 ("Concentration Curl", ["biceps"], [], "dumbbell", ISO, W, []),
 ("Cable Curl", ["biceps"], ["forearms"], "cable", ISO, W, []),
 ("EZ-Bar Curl", ["biceps"], ["forearms"], "e-z curl bar", ISO, W, []),
 ("Spider Curl", ["biceps"], [], "dumbbell", ISO, W, []),

 # ---------------- ARMS: triceps ----------------
 ("Close-Grip Bench Press", ["triceps"], ["chest","shoulders"], "barbell", CMP, W, ["cgbp"]),
 ("Triceps Pushdown", ["triceps"], [], "cable", ISO, W, ["cable pushdown","rope pushdown"]),
 ("Overhead Triceps Extension", ["triceps"], [], "dumbbell", ISO, W, ["overhead extension"]),
 ("Skull Crusher", ["triceps"], [], "e-z curl bar", ISO, W, ["lying triceps extension"]),
 ("Bench Dip", ["triceps"], ["chest","shoulders"], "body only", CMP, B, ["tricep dip"]),
 ("Triceps Kickback", ["triceps"], [], "dumbbell", ISO, W, ["kickback"]),
 ("Cable Overhead Triceps Extension", ["triceps"], [], "cable", ISO, W, []),

 # ---------------- ARMS: forearms ----------------
 ("Wrist Curl", ["forearms"], [], "dumbbell", ISO, W, []),
 ("Reverse Wrist Curl", ["forearms"], [], "dumbbell", ISO, W, []),
 ("Farmer's Walk", ["forearms","traps"], ["glutes","abdominals","quadriceps"], "dumbbell", CMP, D, ["farmers carry"]),

 # ---------------- CORE ----------------
 ("Plank", ["abdominals"], ["lower back"], "body only", ISO, T, ["front plank"]),
 ("Side Plank", ["abdominals"], [], "body only", ISO, T, []),
 ("Hollow Hold", ["abdominals"], [], "body only", ISO, T, []),
 ("Crunch", ["abdominals"], [], "body only", ISO, B, []),
 ("Sit-Up", ["abdominals"], [], "body only", CMP, B, ["situp"]),
 ("Bicycle Crunch", ["abdominals"], [], "body only", ISO, B, []),
 ("Hanging Leg Raise", ["abdominals"], ["forearms"], "body only", CMP, B, []),
 ("Lying Leg Raise", ["abdominals"], [], "body only", ISO, B, ["leg raise"]),
 ("Cable Crunch", ["abdominals"], [], "cable", ISO, W, []),
 ("Russian Twist", ["abdominals"], [], "body only", ISO, B, []),
 ("Ab Wheel Rollout", ["abdominals"], ["lower back"], "other", CMP, B, ["ab rollout"]),
 ("Mountain Climber", ["abdominals"], ["shoulders"], "body only", CMP, B, []),
 ("Dead Bug", ["abdominals"], [], "body only", ISO, B, []),
 ("V-Up", ["abdominals"], [], "body only", ISO, B, []),
 ("Cable Woodchopper", ["abdominals"], ["shoulders"], "cable", CMP, W, ["woodchopper"]),
 ("Pallof Press", ["abdominals"], [], "cable", ISO, W, []),
 ("Toes-to-Bar", ["abdominals"], ["forearms","lats"], "body only", CMP, B, []),

 # ---------------- FULL BODY / FUNCTIONAL ----------------
 ("Power Clean", ["glutes","hamstrings","traps"], ["quadriceps","shoulders","lower back","forearms"], "barbell", CMP, W, []),
 ("Hang Clean", ["glutes","hamstrings","traps"], ["quadriceps","shoulders","forearms"], "barbell", CMP, W, []),
 ("Kettlebell Swing", ["glutes","hamstrings"], ["lower back","shoulders","abdominals"], "kettlebells", CMP, W, ["kb swing"]),
 ("Thruster", ["quadriceps","glutes","shoulders"], ["triceps","abdominals"], "barbell", CMP, W, []),
 ("Clean and Press", ["shoulders","glutes"], ["hamstrings","quadriceps","triceps","traps"], "barbell", CMP, W, []),
 ("Turkish Get-Up", ["shoulders","abdominals"], ["glutes","quadriceps"], "kettlebells", CMP, W, []),
 ("Burpee", ["quadriceps","chest"], ["shoulders","triceps","abdominals"], "body only", CMP, B, []),
 ("Box Jump", ["quadriceps","glutes"], ["calves","hamstrings"], "body only", CMP, B, []),
 ("Sled Push", ["quadriceps","glutes"], ["calves","hamstrings"], "other", CMP, D, ["prowler push"]),
 ("Battle Ropes", ["shoulders"], ["abdominals","forearms"], "other", CMP, T, []),

 # ---------------- CARDIO ----------------
 ("Treadmill Run", ["quadriceps","hamstrings"], ["calves","glutes"], "machine", CMP, D, ["running","treadmill"]),
 ("Stationary Bike", ["quadriceps","hamstrings"], ["calves","glutes"], "machine", CMP, D, ["cycling","spin bike"]),
 ("Rowing Machine", ["lats","middle back"], ["quadriceps","hamstrings","biceps"], "machine", CMP, D, ["erg","row erg"]),
 ("Elliptical", ["quadriceps","hamstrings"], ["glutes","calves"], "machine", CMP, D, []),
 ("Stair Climber", ["quadriceps","glutes"], ["calves","hamstrings"], "machine", CMP, D, ["stairmaster"]),
 ("Jump Rope", ["calves"], ["shoulders","forearms"], "other", CMP, T, ["skipping"]),
 ("Incline Treadmill Walk", ["glutes","quadriceps"], ["calves","hamstrings"], "machine", CMP, D, ["incline walk"]),

 # ---------------- additional common variations ----------------
 ("Trap Bar Deadlift", ["quadriceps","glutes","hamstrings"], ["traps","forearms","lower back"], "other", CMP, W, ["hex bar deadlift"]),
 ("Dumbbell Deadlift", ["hamstrings","glutes","lower back"], ["quadriceps","forearms"], "dumbbell", CMP, W, []),
 ("Landmine Row", ["middle back","lats"], ["biceps","traps"], "barbell", CMP, W, ["meadows row"]),
 ("Renegade Row", ["middle back","lats"], ["abdominals","biceps"], "dumbbell", CMP, W, []),
 ("Assisted Pull-Up", ["lats"], ["biceps","middle back"], "machine", CMP, W, []),
 ("Cable Pull-Through", ["glutes","hamstrings"], ["lower back"], "cable", CMP, W, []),
 ("Cable Glute Kickback", ["glutes"], ["hamstrings"], "cable", ISO, W, ["glute kickback"]),
 ("Hip Thrust Machine", ["glutes"], ["hamstrings"], "machine", CMP, W, []),
 ("Cossack Squat", ["adductors","quadriceps"], ["glutes"], "body only", CMP, B, []),
 ("Reverse Pec Deck", ["shoulders"], ["middle back","traps"], "machine", ISO, W, ["rear delt machine"]),
 ("Standing Dumbbell Shoulder Press", ["shoulders"], ["triceps","abdominals"], "dumbbell", CMP, W, []),
 ("Machine Bicep Curl", ["biceps"], [], "machine", ISO, W, []),
 ("Machine Triceps Extension", ["triceps"], [], "machine", ISO, W, ["machine dip"]),
 ("Reverse Curl", ["forearms","biceps"], [], "e-z curl bar", ISO, W, []),
 ("Zottman Curl", ["biceps","forearms"], [], "dumbbell", ISO, W, []),
 ("Rope Hammer Curl", ["biceps","forearms"], [], "cable", ISO, W, []),
 ("Incline Push-Up", ["chest"], ["triceps","shoulders"], "body only", CMP, B, []),
 ("Decline Push-Up", ["chest"], ["shoulders","triceps"], "body only", CMP, B, []),
 ("Cable Chest Press", ["chest"], ["triceps","shoulders"], "cable", CMP, W, []),
 ("Dumbbell Floor Press", ["chest","triceps"], ["shoulders"], "dumbbell", CMP, W, []),
 ("Superman", ["lower back"], ["glutes"], "body only", ISO, B, []),
 ("Reverse Crunch", ["abdominals"], [], "body only", ISO, B, []),
 ("Flutter Kicks", ["abdominals"], [], "body only", ISO, B, []),
]

def region_for(primary):
    seen = []
    for m in primary:
        r = REGION[m]
        if r not in seen:
            seen.append(r)
    return seen

rows = []
errors = []
seen_names = set()
for name, prim, sec, equip, mech, modality, aliases in E:
    if name.lower() in seen_names:
        errors.append(f"DUPLICATE name: {name}")
    seen_names.add(name.lower())
    for m in prim + sec:
        if m not in VOCAB:
            errors.append(f"{name}: bad muscle '{m}'")
    if modality not in MODALITIES:
        errors.append(f"{name}: bad modality '{modality}'")
    overlap = set(prim) & set(sec)
    if overlap:
        errors.append(f"{name}: muscle in both primary+secondary: {overlap}")
    rows.append({
        "canonical_name": name,
        "primary_muscles": prim,
        "secondary_muscles": sec,
        "body_region": region_for(prim),
        "equipment": equip,
        "mechanic": mech,
        "modality": modality,
        "aliases": aliases,
    })

if errors:
    print("VALIDATION ERRORS:", file=sys.stderr)
    for e in errors:
        print("  -", e, file=sys.stderr)
    sys.exit(1)

json.dump(rows, open("curated-exercises.json", "w"), indent=2)

# ---- report ----
print(f"TOTAL EXERCISES: {len(rows)}\n")
by_region = collections.Counter()
for r in rows:
    for reg in r["body_region"]:
        by_region[reg] += 1
print("By body region (primary-derived, an exercise can span two):")
for reg, n in by_region.most_common():
    print(f"  {reg:12} {n}")
print("\nBy equipment:")
for eq, n in collections.Counter(r["equipment"] for r in rows).most_common():
    print(f"  {eq:14} {n}")
print("\nBy modality:")
for md, n in collections.Counter(r["modality"] for r in rows).most_common():
    print(f"  {md:16} {n}")
print("\nBy mechanic:")
for mc, n in collections.Counter(r["mechanic"] for r in rows).most_common():
    print(f"  {mc:12} {n}")
