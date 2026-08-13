# recordings/

Drop your workout dictations here — `.m4a`, `.wav`, or `.mp3`. One file per
workout. These are **gitignored** (private + large); only the labels in
`../ground-truth/` are tracked.

Recording tips (from the research — these are the things that actually move
accuracy):

- **Built-in phone mic**, held **close** (15–30 cm) for your first controlled
  set. Bluetooth/AirPods can clip the start/end of speech.
- Leave ~½ second of silence at the **start and end** — don't clip a trailing
  self-correction.
- Vary deliberately across your corpus so the bakeoff can tell you what hurts:
  quiet room vs gym, rested vs out-of-breath, music vs none, close vs arm's
  length. Record the axis in each ground-truth file's `meta`.
- Include **boring, normal** workouts too, not just hard ones — an ASR that
  aces adversarial numbers but drops a middle exercise on an easy day is still
  bad.

After adding files: `npm run bake:init` scaffolds a ground-truth stub for each.
