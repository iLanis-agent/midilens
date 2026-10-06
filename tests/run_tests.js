/* MidiLens: engine vs tests/expected.json (mido oracle + hand-verified). */
const fs=require('fs'),path=require('path');
const M=require(path.join(__dirname,'..','engine.js'));
const exp=JSON.parse(fs.readFileSync(path.join(__dirname,'expected.json'),'utf8'));
let checks=0,fails=0;
function ok(c,m){checks++;if(!c){fails++;console.log('FAIL',m);}}
function eq(a,b,m){ok(a===b,m+' (exp '+JSON.stringify(b)+' got '+JSON.stringify(a)+')');}
function near(a,b,m){ok(Math.abs(a-b)<1e-6,m+' (exp '+b+' got '+a+')');}
eq(M.vlq([0x00],0).value,0,'vlq 0');
eq(M.vlq([0x81,0x00],0).value,128,'vlq 2-byte');
eq(M.vlq([0xFF,0x7F],0).value,16383,'vlq max-2');
eq(M.vlq([0x81,0x80,0x80,0x00],0).value,2097152,'vlq 4-byte');
ok(M.vlq([0x80],0).truncated,'vlq truncated detected');
for(const it of exp.items){
  let bytes;
  const zp=path.join(__dirname,'corpus',it.file);
  if(fs.existsSync(zp))bytes=fs.readFileSync(zp);
  else bytes=Buffer.from(fs.readFileSync(zp+'.b64','utf8').trim(),'base64');
  const r=M.parseMidi(new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength));
  if(it.expect_error){ok(r.errors.length>0,it.file+': error reported ('+r.errors[0]+')');continue;}
  eq(r.errors.length,0,it.file+': no errors');
  if(it.expect_warnings)it.expect_warnings.forEach(w=>ok(r.warnings.some(x=>x.indexOf(w)>=0),it.file+': warning "'+w+'"'));
  if(it.smpte){eq(r.smpte.fps,it.smpte.fps,it.file+': smpte fps');eq(r.smpte.ticks_per_frame,it.smpte.ticks_per_frame,it.file+': smpte tpf');}
  if(it.format!==undefined)eq(r.format,it.format,it.file+': format');
  if(it.ticks_per_beat!==undefined)eq(r.tpq,it.ticks_per_beat,it.file+': tpq');
  if(it.length_seconds!==undefined)near(r.duration_seconds,it.length_seconds,it.file+': duration seconds (mido length)');
  if(it.note_count!==undefined)eq(r.note_count,it.note_count,it.file+': note count');
  if(it.min_note!==undefined){eq(r.min_note,it.min_note,it.file+': min note');eq(r.max_note,it.max_note,it.file+': max note');}
  if(!it.tracks)continue;
  eq(r.tracks.length,it.tracks.length,it.file+': track count');
  for(let t=0;t<it.tracks.length;t++){
    const A=r.tracks[t].events.filter(e=>e.type!=='sysex');
    const B=it.tracks[t];
    eq(A.length,B.length,it.file+' track '+t+': event count');
    for(let i=0;i<Math.min(A.length,B.length);i++){
      const a=A[i],b=B[i],p=it.file+' t'+t+' e'+i+' '+b.type;
      eq(a.tick,b.tick,p+': tick');
      eq(a.type,b.type,p+': type');
      for(const k of ['channel','note','velocity','control','value','program','pitch','tempo']){
        if(b[k]!==undefined)eq(a[k],b[k],p+': '+k);
      }
      const btxt=b.text!==undefined?b.text:b.name;
      if(btxt!==undefined)eq(a.text,btxt,p+': text');
      if(b.time_signature)eq(JSON.stringify(a.time_signature),JSON.stringify(b.time_signature),p+': timesig');
    }
  }
}
console.log(checks+' checks, '+fails+' failures');
process.exit(fails?1:0);
