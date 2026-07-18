/**
 * Reviewable alias map for the ~60 most common lifts.
 * Key = canonical_name EXACTLY as it appears in free-exercise-db.
 * Values = abbreviations / gym shorthand people actually say or type.
 *
 * All keys were verified against the dataset; the seed script warns (and skips)
 * if a key no longer resolves, so edits here are safe.
 * Sources = 'seed'. Phase 2 adds 'user' and 'llm' aliases on top.
 */
export const SEED_ALIASES: Record<string, string[]> = {
  // -- Squat / hinge ---------------------------------------------------------
  'Barbell Squat': ['Squat', 'Back Squat', 'BB Squat', 'Barbell Back Squat'],
  'Barbell Full Squat': ['ATG Squat', 'Full Squat', 'High Bar Squat'],
  'Front Squat (Clean Grip)': ['Front Squat', 'BB Front Squat', 'Barbell Front Squat'],
  'Goblet Squat': ['DB Goblet Squat', 'KB Goblet Squat', 'Goblet'],
  'Overhead Squat': ['OH Squat', 'OHS'],
  'Barbell Deadlift': ['Deadlift', 'DL', 'Conventional Deadlift', 'BB Deadlift'],
  'Sumo Deadlift': ['Sumo DL', 'Sumo'],
  'Romanian Deadlift': ['RDL', 'Romanian DL', 'BB RDL', 'Barbell Romanian Deadlift'],
  'Stiff-Legged Barbell Deadlift': ['SLDL', 'Stiff Leg Deadlift', 'Stiff-Legged Deadlift'],
  'Good Morning': ['Goodmorning', 'BB Good Morning'],
  'Barbell Hip Thrust': ['Hip Thrust', 'BB Hip Thrust'],
  'Barbell Glute Bridge': ['Glute Bridge', 'BB Glute Bridge'],
  'Glute Ham Raise': ['GHR', 'Glute-Ham Raise'],
  'Hyperextensions (Back Extensions)': ['Back Extension', 'Hyperextension', '45 Degree Back Extension'],
  'Barbell Lunge': ['Lunge', 'BB Lunge', 'Barbell Lunges'],
  'Dumbbell Lunges': ['DB Lunge', 'DB Lunges', 'Dumbbell Lunge'],

  // -- Horizontal press ------------------------------------------------------
  'Barbell Bench Press - Medium Grip': ['Bench Press', 'Bench', 'BB Bench Press', 'Barbell Bench Press', 'Flat Bench Press', 'Flat Barbell Bench Press'],
  'Barbell Incline Bench Press - Medium Grip': ['Incline Bench Press', 'Incline Bench', 'Incline BB Press', 'Incline Barbell Bench Press', 'Incline Barbell Press'],
  'Close-Grip Barbell Bench Press': ['Close Grip Bench Press', 'CGBP', 'Close Grip Bench'],
  'Decline Barbell Bench Press': ['Decline Bench Press', 'Decline Bench'],
  'Dumbbell Bench Press': ['DB Bench Press', 'DB Bench', 'Dumbbell Bench', 'Flat DB Press', 'Flat Dumbbell Press'],
  'Incline Dumbbell Press': ['Incline DB Press', 'Incline DB Bench', 'Incline Dumbbell Bench Press', 'Incline Press (Dumbbell)', 'Incline Press'],
  'Machine Bench Press': ['Chest Press Machine', 'Machine Chest Press'],
  'Pushups': ['Push-Up', 'Push Ups', 'Pushup', 'Press-Up'],
  'Dumbbell Flyes': ['DB Fly', 'DB Flyes', 'Chest Fly', 'Dumbbell Fly', 'Flat Fly'],
  'Cable Crossover': ['Cable Fly', 'Cable Flyes', 'Crossover'],
  'Butterfly': ['Pec Deck', 'Pec Dec', 'Machine Fly', 'Chest Fly Machine'],
  'Dips - Triceps Version': ['Dips', 'Dip', 'Tricep Dips', 'Parallel Bar Dips'],

  // -- Vertical press --------------------------------------------------------
  'Standing Military Press': ['OHP', 'Overhead Press', 'Military Press', 'Standing Overhead Press', 'Standing Barbell Press', 'Strict Press'],
  'Seated Barbell Military Press': ['Seated OHP', 'Seated Military Press', 'Seated Barbell Overhead Press'],
  'Barbell Shoulder Press': ['BB Shoulder Press', 'Barbell Overhead Press'],
  'Dumbbell Shoulder Press': ['DB Shoulder Press', 'DB OHP', 'Dumbbell Overhead Press', 'DB Press'],
  'Seated Dumbbell Press': ['Seated DB Press', 'Seated DB Shoulder Press', 'Seated Dumbbell Shoulder Press'],
  'Arnold Dumbbell Press': ['Arnold Press'],
  'Push Press': ['BB Push Press'],
  'Side Lateral Raise': ['Lateral Raise', 'Lat Raise', 'Side Raise', 'DB Lateral Raise', 'Dumbbell Lateral Raise'],
  'Seated Side Lateral Raise': ['Seated Lateral Raise'],
  'Front Dumbbell Raise': ['Front Raise', 'DB Front Raise'],
  'Reverse Flyes': ['Rear Delt Fly', 'Reverse Fly', 'Rear Delt Raise', 'RD Fly'],
  'Face Pull': ['Facepull', 'Cable Face Pull', 'Rope Face Pull'],

  // -- Pull / back -----------------------------------------------------------
  'Pullups': ['Pull-Up', 'Pull Ups', 'Pullup', 'Pull Up'],
  'Chin-Up': ['Chin Up', 'Chinup', 'Chins'],
  'Wide-Grip Lat Pulldown': ['Lat Pulldown', 'Pulldown', 'Lat Pull Down', 'Wide Grip Pulldown'],
  'Close-Grip Front Lat Pulldown': ['Close Grip Pulldown', 'Close-Grip Pulldown', 'CG Pulldown'],
  'Straight-Arm Pulldown': ['Straight Arm Pulldown', 'Lat Pullover (Cable)', 'Cable Pullover'],
  'Bent Over Barbell Row': ['Barbell Row', 'BB Row', 'Bent Over Row', 'BOR'],
  'One-Arm Dumbbell Row': ['DB Row', 'Dumbbell Row', 'Single Arm Row', 'One Arm Row'],
  'Seated Cable Rows': ['Cable Row', 'Seated Row', 'Seated Cable Row', 'Low Row'],
  'T-Bar Row with Handle': ['T-Bar Row', 'T Bar Row', 'TBar Row'],
  'Upright Barbell Row': ['Upright Row', 'BB Upright Row'],
  'Barbell Shrug': ['Shrug', 'BB Shrug', 'Shrugs'],
  'Dumbbell Shrug': ['DB Shrug', 'DB Shrugs'],

  // -- Arms ------------------------------------------------------------------
  'Barbell Curl': ['BB Curl', 'Barbell Bicep Curl', 'Bicep Curl (Barbell)'],
  'Dumbbell Bicep Curl': ['DB Curl', 'Dumbbell Curl', 'Bicep Curl', 'Biceps Curl'],
  'Hammer Curls': ['Hammer Curl', 'DB Hammer Curl', 'Neutral Grip Curl'],
  'Preacher Curl': ['Preacher Curls', 'EZ Bar Preacher Curl'],
  'Concentration Curls': ['Concentration Curl'],
  'EZ-Bar Curl': ['EZ Bar Curl', 'EZ Curl'],
  'Triceps Pushdown': ['Pushdown', 'Tricep Pushdown', 'Cable Pushdown', 'Tricep Extension (Cable)'],
  'Triceps Pushdown - Rope Attachment': ['Rope Pushdown', 'Rope Tricep Pushdown', 'Rope Extension'],
  'EZ-Bar Skullcrusher': ['Skullcrusher', 'Skull Crusher', 'Skullcrushers', 'Lying Tricep Extension'],
  'Cable Rope Overhead Triceps Extension': ['Overhead Tricep Extension', 'Overhead Rope Extension', 'OH Tricep Extension'],
  'Tricep Dumbbell Kickback': ['Tricep Kickback', 'DB Kickback', 'Kickbacks'],

  // -- Legs (machines) & calves ----------------------------------------------
  'Leg Press': ['Leg Press Machine', '45 Degree Leg Press'],
  'Leg Extensions': ['Leg Extension', 'Quad Extension', 'Knee Extension'],
  'Lying Leg Curls': ['Leg Curl', 'Lying Leg Curl', 'Hamstring Curl'],
  'Seated Leg Curl': ['Seated Ham Curl', 'Seated Hamstring Curl'],
  'Standing Calf Raises': ['Calf Raise', 'Standing Calf Raise', 'Calf Raises'],
  'Seated Calf Raise': ['Seated Calf Raises'],

  // -- Olympic / other -------------------------------------------------------
  'Clean and Jerk': ['C&J', 'Clean & Jerk'],
  'Power Clean': ['Cleans', 'Clean'],
};
