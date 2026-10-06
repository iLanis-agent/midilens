#!/usr/bin/env python3
"""Oracle for MidiLens: every event field from the REAL mido library.
Hand-crafted files (running/smpte/bad_trunc) get hand-written expectations
cross-checked against mido where mido can read them."""
import mido, json, os

def dump(path):
    m = mido.MidiFile(path)
    item = {'file': os.path.basename(path), 'format': m.type,
            'ticks_per_beat': m.ticks_per_beat, 'length_seconds': m.length,
            'tracks': []}
    for tr in m.tracks:
        evs = []
        tick = 0
        for msg in tr:
            tick += msg.time
            d = {'tick': tick, 'type': msg.type}
            for k in ('channel','note','velocity','control','value','program','pitch','tempo','text','name'):
                if hasattr(msg, k) and not k.startswith('_'):
                    v = getattr(msg, k)
                    if isinstance(v, (int, str)):
                        d[k] = v
            if msg.type == 'time_signature':
                d['time_signature'] = [msg.numerator, msg.denominator, msg.clocks_per_click, msg.notated_32nd_notes_per_beat]
            evs.append(d)
        item['tracks'].append(evs)
    return item

items = []
for f in ['simple.mid', 'format0.mid', 'tempochange.mid']:
    items.append(dump(os.path.join('tests/corpus', f)))

# hand-crafted expectations (verified readable where possible)
items.append({
 'file': 'running.mid', 'format': 0, 'ticks_per_beat': 480, 'hand': True,
 'tracks': [[
   {'tick': 0, 'type': 'track_name', 'text': 'Test'},
   {'tick': 0, 'type': 'note_on', 'channel': 0, 'note': 60, 'velocity': 100},
   {'tick': 480, 'type': 'note_on', 'channel': 0, 'note': 62, 'velocity': 100},
   {'tick': 480, 'type': 'note_on', 'channel': 0, 'note': 60, 'velocity': 0},
   {'tick': 8672, 'type': 'note_on', 'channel': 0, 'note': 62, 'velocity': 0},
   {'tick': 8672, 'type': 'end_of_track'},
 ]],
 'note_count': 2, 'min_note': 60, 'max_note': 62})
items.append({
 'file': 'smpte.mid', 'format': 0, 'hand': True, 'smpte': {'fps': -25, 'ticks_per_frame': 40},
 'expect_warnings': ['SMPTE']})
items.append({
 'file': 'bad_trunc.mid', 'hand': True, 'expect_error': True})

json.dump({'items': items}, open('tests/expected.json', 'w'), indent=1)
open('tests/expected.json', 'a').write('\n')
print('wrote expected.json:', len(items), 'items')
# sanity: does mido read running.mid the same way?
m = mido.MidiFile('tests/corpus/running.mid')
for msg in m.tracks[0]:
    print('mido:', msg.type, getattr(msg,'note',''), getattr(msg,'velocity',''))
