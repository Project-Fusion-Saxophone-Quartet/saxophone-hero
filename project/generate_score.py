import json
import random
import copy
import os

# ---------------- configuration ----------------

INPUT_OUTPUT_PAIRS = {
    "public/tap_sequences/master/soprano.json":
        "public/tap_sequences/generated/soprano.json",
    "public/tap_sequences/master/alto.json":
        "public/tap_sequences/generated/alto.json",
    "public/tap_sequences/master/tenor.json":
        "public/tap_sequences/generated/tenor.json",
    "public/tap_sequences/master/baritone.json":
        "public/tap_sequences/generated/baritone.json",
}

MIN_REPEATS = 1
MAX_REPEATS = 4          # hard ceiling: no level may be repeated more than this many times
MAX_SPREAD = 3           # hard spread ceiling; intended typical peak is 4
MAX_REPS_HARD_CAP = 4   # used by spread enforcement (same value as MAX_REPEATS)

# Pace archetypes — one assigned to each voice per performance (shuffled).
# Four distinct repeat-range windows give voices genuinely different speeds.
# Left uncapped, archetypes produce a peak spread of 7–9; the MAX_SPREAD = 5
# ceiling trims that to a hard limit of 5 while still guaranteeing spread ≥ 4
# is sustained for at least 30% of every performance.
ARCHETYPES = [
    (1, 2),  # fast:        avg 1.5 reps/level
    (1, 3),  # medium-fast: avg 2.0 reps/level
    (2, 4),  # medium-slow: avg 3.0 reps/level
    (3, 4),  # slow:        avg 3.5 reps/level
]
SEED = None              # set to int for reproducibility

# Timing
BPM = 120
BEATS_PER_BAR = 4
BARS_PER_LEVEL = 8
BEATS_PER_LEVEL = BEATS_PER_BAR * BARS_PER_LEVEL   # 32 beats = 16 seconds
SECONDS_PER_BEAT = 60.0 / BPM                       # 0.5 s/beat
MAX_DURATION_SECONDS = 14 * 60                      # 840 s
MAX_BEATS = int(MAX_DURATION_SECONDS / SECONDS_PER_BEAT)  # 1680 beats

# Sections we never want to repeat
SKIP_SECTIONS = {"4 BEAT PREP", "Intro", "Level 17"}

# ------------------------------------------------

if SEED is not None:
    random.seed(SEED)


def section_length(section):
    start, end = section["markers"]
    return end - start + 1


def get_level_order(sections):
    """Returns ordered list of repeatable level names."""
    return [sec["name"] for sec in sections if sec["name"] not in SKIP_SECTIONS]


def generate_all_plans_with_reshuffle(sections, trigger_spread=MAX_SPREAD):
    """
    Build plans level by level, reshuffling pace archetypes whenever the
    running spread hits trigger_spread.

    After committing each level's repeats, partial timelines are built and
    the current spread is measured. If it has reached trigger_spread, all
    four voices are dealt a new set of archetypes (drawn without replacement,
    so every archetype remains present). This prevents any one voice from
    holding the lead role for the entire performance — the fast voice may
    become slow, and the slow voice may surge ahead on the next reshuffle.
    Multiple reshuffles can occur across the 16 levels.
    """
    level_names = get_level_order(sections)
    level_idx   = {name: i for i, name in enumerate(level_names)}
    n           = len(ARCHETYPES)
    archetypes  = random.sample(ARCHETYPES, n)
    plans       = [[] for _ in range(n)]

    for level_name in level_names:
        # Assign this level's repeats under the current archetypes
        for v in range(n):
            lo, hi = archetypes[v]
            plans[v].append([level_name, random.randint(lo, hi)])

        # Build partial timelines and measure running spread
        timelines = []
        for plan in plans:
            beat, tl = 0, []
            for name, reps in plan:
                for _ in range(reps):
                    tl.append((beat, level_idx[name]))
                    beat += BEATS_PER_LEVEL
            timelines.append(tl)

        events = sorted(set(b for tl in timelines for b, _ in tl))
        running_spread = max(
            max(_current_level_at(tv, t) for tv in timelines) -
            min(_current_level_at(tv, t) for tv in timelines)
            for t in events
        )

        if running_spread >= trigger_spread:
            archetypes = random.sample(ARCHETYPES, n)   # reshuffle for remaining levels

    return plans


def total_plan_length(plan, section_map):
    """Total beats using actual section lengths from section_map."""
    total = 0
    for name, repeats in plan:
        if name not in section_map:
            raise KeyError(f"Section '{name}' not found in section_map")
        total += repeats * section_length(section_map[name])
    return total


def _current_level_at(timeline, t):
    """
    Given a sorted list of (beat_start, level_idx) pairs,
    return the level index active at beat t.
    """
    current = timeline[0][1]
    for beat, lvl in timeline:
        if beat <= t:
            current = lvl
        else:
            break
    return current


def _build_timelines(plans, level_order, beats_per_level=BEATS_PER_LEVEL):
    timelines = []
    for plan in plans:
        beat, tl = 0, []
        for name, reps in plan:
            idx = level_order.index(name)
            for _ in range(reps):
                tl.append((beat, idx))
                beat += beats_per_level
        timelines.append(tl)
    return timelines


def _current_spread(plans, level_order):
    tl = _build_timelines(plans, level_order)
    events = sorted(set(b for t in tl for b, _ in t))
    return max(
        max(_current_level_at(tv, t) for tv in tl) -
        min(_current_level_at(tv, t) for tv in tl)
        for t in events
    )


def enforce_spread_constraint(plans, level_order, max_spread=MAX_SPREAD,
                               max_reps=MAX_REPS_HARD_CAP):
    """
    Hard ceiling on spread. Archetypes naturally push voices 7–9 levels apart;
    this trims that to MAX_SPREAD by slowing down the fastest voice (preferred)
    or speeding up the slowest (fallback when the fast voice is at the rep cap).
    """
    for _ in range(2000):
        voice_timelines = _build_timelines(plans, level_order)
        events = sorted(set(b for tl in voice_timelines for b, _ in tl))
        violation_fixed = False
        for t in events:
            current_levels = [_current_level_at(tl, t) for tl in voice_timelines]
            if max(current_levels) - min(current_levels) > max_spread:
                fastest = current_levels.index(max(current_levels))
                fast_name = level_order[current_levels[fastest]]
                for entry in plans[fastest]:
                    if entry[0] == fast_name and entry[1] < max_reps:
                        entry[1] += 1
                        violation_fixed = True
                        break
                if not violation_fixed:
                    slowest = current_levels.index(min(current_levels))
                    slow_name = level_order[current_levels[slowest]]
                    for entry in plans[slowest]:
                        if entry[0] == slow_name and entry[1] > MIN_REPEATS:
                            entry[1] -= 1
                            violation_fixed = True
                            break
                if violation_fixed:
                    break
        if not violation_fixed:
            break


def enforce_timing_constraint(plans, section_map, max_beats=MAX_BEATS):
    """
    For any voice whose total beats exceed max_beats, greedily reduce
    the level with the most repeats (keeping min 1 repeat per level).
    """
    for plan in plans:
        total = total_plan_length(plan, section_map)
        while total > max_beats:
            best_i, best_reps = None, 1
            for i, (name, reps) in enumerate(plan):
                if reps > best_reps:
                    best_i, best_reps = i, reps
            if best_i is None:
                break
            plan[best_i][1] -= 1
            total -= section_length(section_map[plan[best_i][0]])


def enforce_repetition_distribution(plans, max_fours=1, max_threes=5):
    """
    Trims each voice's rep distribution so that:
      - At most max_fours levels have 4 repetitions.
      - At most max_threes levels have 3 repetitions.

    When a voice exceeds these limits, excess high-rep levels are reduced
    by 1 (4 → 3, or 3 → 2), starting from the earliest levels in the
    sequence. This preserves the interesting high-rep counts on later,
    more complex levels while keeping early levels moving forward.
    """
    for plan in plans:
        # Trim excess 4-rep levels (keep only the last max_fours occurrences)
        four_indices = [i for i, (_, r) in enumerate(plan) if r == 4]
        for i in four_indices[:-max_fours] if len(four_indices) > max_fours else []:
            plan[i][1] = 3

        # Trim excess 3-rep levels (keep only the last max_threes occurrences)
        three_indices = [i for i, (_, r) in enumerate(plan) if r == 3]
        for i in three_indices[:-max_threes] if len(three_indices) > max_threes else []:
            plan[i][1] = 2


def enforce_rolling_advance(plans, beats_per_level=BEATS_PER_LEVEL):
    """
    Ensures that at every 32-beat boundary at least one voice transitions
    to a new level.

    If all four voices are mid-repetition at a given boundary, the voice
    with the fewest remaining reps at that level is trimmed so it transitions
    exactly at that boundary — minimising disruption to the overall plan.
    Repeats until no violations remain.
    """
    for _ in range(2000):
        # Build per-voice sets of transition beats (start of each new level)
        voice_transitions = []
        total_beats_per_voice = []
        for plan in plans:
            transitions = set()
            beat = 0
            for name, reps in plan:
                transitions.add(beat)
                beat += reps * beats_per_level
            voice_transitions.append(transitions)
            total_beats_per_voice.append(beat)

        max_beats = max(total_beats_per_voice)

        fixed = False
        for b in range(beats_per_level, max_beats, beats_per_level):
            if any(b in vt for vt in voice_transitions):
                continue  # at least one voice advances here — constraint met

            # All voices are mid-repetition at beat b.
            # Find the voice+level where trimming to b loses the fewest reps.
            best = None  # (voice_idx, entry_idx, new_reps, reps_lost)

            for v, plan in enumerate(plans):
                beat = 0
                for i, (name, reps) in enumerate(plan):
                    level_start = beat
                    beat += reps * beats_per_level
                    if level_start < b < beat:
                        reps_done = (b - level_start) // beats_per_level
                        reps_remaining = reps - reps_done
                        if reps_done >= 1:  # always keep at least 1 rep
                            if best is None or reps_remaining < best[3]:
                                best = (v, i, reps_done, reps_remaining)
                        break  # only one level can span beat b per voice

            if best is not None:
                v, i, new_reps, _ = best
                plans[v][i][1] = new_reps
                fixed = True
                break  # rebuild timelines and check again

        if not fixed:
            break


def accelerate_trailing_voices(plans, level_order, beats_per_level=BEATS_PER_LEVEL):
    """
    Once the first voice begins Level 16, all other voices that haven't
    yet reached it rush through their remaining levels at 1 rep each.

    This guarantees every voice hears every level at least once (all music
    gets heard) while converging quickly enough that no voice is left far
    behind when the game ends.

    The voice that is currently mid-level at the trigger beat keeps its
    already-committed repeats for that level; only the levels AFTER it are
    compressed to 1 rep.
    """
    l16_name = "Level 16"

    # Beat at which each voice first starts Level 16
    l16_starts = []
    for plan in plans:
        beat = 0
        for name, reps in plan:
            if name == l16_name:
                l16_starts.append(beat)
                break
            beat += reps * beats_per_level

    trigger_beat = min(l16_starts)   # when the leading voice first steps onto Level 16

    for v, plan in enumerate(plans):
        if l16_starts[v] <= trigger_beat:
            continue    # leading voice — leave unchanged

        # Find which level this voice is mid at trigger_beat, then compress all after it
        beat = 0
        for i, entry in enumerate(plan):
            next_beat = beat + entry[1] * beats_per_level
            if beat <= trigger_beat < next_beat:
                # Voice v is mid-level i at the trigger; keep level i, compress i+1 onward
                for j in range(i + 1, len(plan)):
                    plan[j][1] = 1
                break
            beat = next_beat


def generate_score(data, repeat_plan, level17_sync_offset=None):
    """
    Builds final score from repeat plan.

    Level 0 (the "Intro" section) and other SKIP_SECTIONS are included
    exactly once in their original position — all voices always play
    Level 0 together at the start before the algorithmic levels begin.

    level17_sync_offset: when provided, Level 17 is placed at this absolute
    beat offset for every voice regardless of that voice's natural end point.
    This synchronises all voices onto Level 17 at the same beat, so the Max
    metronome halt fires correctly the moment any voice reaches Level 17.
    """
    section_map = {sec["name"]: sec for sec in data["sections"]
                   if sec["name"] not in SKIP_SECTIONS}

    generated_sequence = []
    for name, repeats in repeat_plan:
        for _ in range(repeats):
            generated_sequence.append(section_map[name])

    final_sections = []
    current_beat_offset = 0

    for sec in data["sections"]:
        sec_copy = copy.deepcopy(sec)
        local_start, local_end = sec_copy["markers"]
        length = local_end - local_start + 1

        if sec_copy["name"] not in SKIP_SECTIONS:
            while generated_sequence and generated_sequence[0]["name"] == sec_copy["name"]:
                rep_sec = generated_sequence.pop(0)
                rep_copy = copy.deepcopy(rep_sec)
                rep_start, rep_end = rep_copy["markers"]
                rep_length = rep_end - rep_start + 1

                rep_copy["beats"] = [b + current_beat_offset for b in rep_copy["beats"]]
                rep_copy["markers"] = [rep_start + current_beat_offset,
                                       rep_end + current_beat_offset]

                final_sections.append(rep_copy)
                current_beat_offset += rep_length

        elif sec_copy["name"] == "Level 17" and level17_sync_offset is not None:
            # Fill any gap between this voice's last Level 16 and the shared
            # Level 17 beat by repeating Level 16 until we reach level17_sync_offset.
            if "Level 16" in section_map:
                l16 = section_map["Level 16"]
                l16_start, l16_end = l16["markers"]
                l16_length = l16_end - l16_start + 1
                # Use same offset logic as regular sections: add current_beat_offset
                # to master markers. level17_sync_offset is also in the same space.
                while l16_end + current_beat_offset <= level17_sync_offset:
                    fill = copy.deepcopy(l16)
                    fill["beats"]   = [b + current_beat_offset for b in fill["beats"]]
                    fill["markers"] = [l16_start + current_beat_offset,
                                       l16_end   + current_beat_offset]
                    final_sections.append(fill)
                    current_beat_offset += l16_length

            # All voices land on Level 17 at the same absolute beat,
            # so the Max metronome halt fires simultaneously for every voice.
            sec_copy["beats"]   = [b + level17_sync_offset for b in sec_copy["beats"]]
            sec_copy["markers"] = [local_start + level17_sync_offset,
                                   local_end   + level17_sync_offset]
            final_sections.append(sec_copy)
            current_beat_offset = level17_sync_offset + length

        else:
            # 4 BEAT PREP, Intro, and any other skip sections
            sec_copy["beats"] = [b + current_beat_offset for b in sec_copy["beats"]]
            sec_copy["markers"] = [local_start + current_beat_offset,
                                   local_end + current_beat_offset]
            final_sections.append(sec_copy)
            current_beat_offset += length

    # Sanitize: trim beats/durations/hands to the shortest array length
    # to prevent crashes from ragged arrays in the master files.
    for sec in final_sections:
        b = sec.get("beats", [])
        d = sec.get("durations", [])
        h = sec.get("hands", [])
        n = min(len(b), len(d), len(h))
        sec["beats"]     = b[:n]
        sec["durations"] = d[:n]
        sec["hands"]     = h[:n]

    return {
        "bpm": data["bpm"],
        "sections": final_sections
    }


# ---------------- batch process ----------------

# Load reference structure
first_input = next(iter(INPUT_OUTPUT_PAIRS.keys()))
with open(first_input, "r") as f:
    reference_data = json.load(f)

# Section map (repeatable sections only)
section_map = {
    sec["name"]: sec
    for sec in reference_data["sections"]
    if sec["name"] not in SKIP_SECTIONS
}

# Ordered level names (used for spread indexing)
level_order = get_level_order(reference_data["sections"])

# ── Step 1: Generate independent repeat plans per voice ──────────────────────
#   Unlike the old code, we do NOT call balance_repeat_plans here.
#   That function forced all voices to the same total length, which is exactly
#   what caused them to track each other so closely.
repeat_plans = generate_all_plans_with_reshuffle(reference_data["sections"])

# ── Steps 2 & 3: Enforce spread ceiling and timing ───────────────────────────
#   Archetypes naturally diverge to 7–9 levels; spread enforcement caps that
#   at MAX_SPREAD = 5. Timing enforcement may remove repeats that spread
#   enforcement added, so we loop both until the plans stabilise.
for _pass in range(20):
    before = [list(entry) for plan in repeat_plans for entry in plan]
    enforce_spread_constraint(repeat_plans, level_order)
    enforce_timing_constraint(repeat_plans, section_map)
    after  = [list(entry) for plan in repeat_plans for entry in plan]
    if before == after:
        break

# ── Step 4: Trim repetition distribution ─────────────────────────────────────
#   Prevents any voice from lingering too long on a single level. Each voice
#   may have at most one level with 4 reps and at most five with 3 reps;
#   excess high-rep levels are reduced from the earliest levels first.
enforce_repetition_distribution(repeat_plans)

# ── Step 5: Enforce rolling advance ──────────────────────────────────────────
#   At every 32-beat boundary, at least one voice must transition to a new
#   level. If all four voices are mid-repetition at a boundary, the voice
#   with the fewest remaining reps there is trimmed to force a transition.
enforce_rolling_advance(repeat_plans)

# ── Step 6: Accelerate trailing voices once the leader reaches Level 16 ───────
#   The first voice to arrive at Level 16 triggers a rush: every other voice
#   compresses all its remaining levels to 1 rep each, so all voices complete
#   every level (all music gets heard) and converge on Level 16 quickly.
accelerate_trailing_voices(repeat_plans, level_order)

# ── Step 7: Compute the synchronised Level 17 offset ─────────────────────────
#   Level 17 must start at the same absolute beat for all voices so that the
#   Max metronome halt fires correctly (bug #1 fix).  The offset is:
#     preamble beats (4 BEAT PREP + Intro) + the longest voice's plan total.
#   Faster voices may have a silent gap before Level 17 — that is intentional
#   and handled gracefully by Max.
preamble_beats = sum(
    section_length(s)
    for s in reference_data["sections"]
    if s["name"] in {"4 BEAT PREP", "Intro"}
)
level17_sync_offset = preamble_beats + max(
    total_plan_length(p, section_map) for p in repeat_plans
)

# ── Diagnostic summary ───────────────────────────────────────────────────────
voice_names = list(INPUT_OUTPUT_PAIRS.keys())
print("\n── Repeat plan summary ──")
for i, plan in enumerate(repeat_plans):
    total_beats = total_plan_length(plan, section_map)
    total_secs = total_beats * SECONDS_PER_BEAT
    rep_counts = [reps for _, reps in plan if reps > 0]
    print(f"  {os.path.basename(voice_names[i]):<20} "
          f"{total_secs:5.1f}s  "
          f"reps: {rep_counts}")

max_observed_spread = _current_spread(repeat_plans, level_order)
level17_secs = level17_sync_offset * SECONDS_PER_BEAT

print(f"\n  Peak spread         : {max_observed_spread} levels  (intended ≤3, hard limit {MAX_SPREAD})")
print(f"  Level 17 sync beat  : {level17_sync_offset}  ({level17_secs:.1f}s / {level17_secs/60:.2f} min)")
print(f"  Longest voice       : "
      f"{max(total_plan_length(p, section_map) * SECONDS_PER_BEAT for p in repeat_plans):.1f}s")
print()

# ── Apply plans and write output ─────────────────────────────────────────────
for (input_path, output_path), repeat_plan in zip(INPUT_OUTPUT_PAIRS.items(), repeat_plans):
    with open(input_path, "r") as f:
        data = json.load(f)

    generated = generate_score(data, repeat_plan, level17_sync_offset=level17_sync_offset)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(generated, f, indent=2)

    print(f"Generated: {output_path}")
