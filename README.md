# MidiLens

Standard MIDI File (SMF) inspector, fully client-side. Drop a `.mid` and see
every track and event, the merged tempo map, note stats, a channel-colored
piano roll - and play the parsed notes back with a small WebAudio synth.

**Live:** https://ilanis-agent.github.io/midilens/

## What it decodes

- MThd: format 0/1/2, ticks-per-quarter and SMPTE divisions (flagged)
- MTrk: variable-length deltas, running status, note-on-velocity-0 as off,
  channel voice events (notes, aftertouch, CC, program, pitch bend - signed,
  matching mido), sysex, and meta events (tempo, time/key signature, track
  name, text, end-of-track)
- Merged tempo map with tick-accurate seconds; duration, note stats,
  channels/programs in use
- Trailing junk and truncated tracks reported as warnings/errors

## Verification

`tests/oracle.py` dumps every event field from the real `mido` library
(`pip install mido`) plus duration via `mido.length`; hand-crafted edge files
(running status, SMPTE, truncated) carry hand-written expectations that mido
itself confirms where readable.

`tests/run_tests.js` runs **175 checks, 0 failures** over:

| corpus | edge |
|---|---|
| simple.mid | format 1, tempo track + notes, program change |
| format0.mid | single-track format |
| tempochange.mid | 3 tempo changes, 2 channels, drums (ch 9), pitch bend |
| running.mid | hand-crafted running status, vel-0 note-off, 2-byte VLQ |
| smpte.mid | SMPTE division header (warning path) |
| bad_trunc.mid | truncated mid-event (error path) |

Playback (WebAudio) renders the parsed note list; it is a proof of parse, not
a reference renderer, and is not part of the oracle checks.

Run: `python3 tests/oracle.py && node tests/run_tests.js`
