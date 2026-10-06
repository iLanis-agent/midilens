/* MidiLens engine - Standard MIDI File (SMF) parser.
   MThd + MTrk walk: VLQ deltas, running status, channel/meta/sysex events,
   tempo map, tick->seconds. No deps. Browser global MidiLens, or module.exports. */
(function(root){
'use strict';
var CC=0xB0;
function vlq(bytes,pos){
  var v=0,b,n=0;
  do{
    if(pos+n>=bytes.length)return {value:null,length:0,truncated:true};
    b=bytes[pos+n];v=(v<<7)|(b&0x7F);n++;
  }while(b&0x80 && n<5);
  return {value:v,length:n};
}
var CHAN_LEN={0x80:2,0x90:2,0xA0:2,0xB0:2,0xC0:1,0xD0:1,0xE0:2};
var CHAN_NAME={0x80:'note_off',0x90:'note_on',0xA0:'polytouch',0xB0:'control_change',0xC0:'program_change',0xD0:'aftertouch',0xE0:'pitchwheel'};
var META_NAME={0x01:'text',0x02:'copyright',0x03:'track_name',0x04:'instrument_name',0x05:'lyrics',0x06:'marker',0x07:'cue_point',0x20:'channel_prefix',0x2F:'end_of_track',0x51:'set_tempo',0x54:'smpte_offset',0x58:'time_signature',0x59:'key_signature',0x7F:'sequencer_specific'};
function txt(bytes,off,len){
  var s='',i;
  for(i=0;i<len;i++)s+=String.fromCharCode(bytes[off+i]);
  try{return decodeURIComponent(escape(s));}catch(e){return s;}
}
function parseMidi(bytes){
  var errors=[],warnings=[],tracks=[];
  function u16(o){return (bytes[o]<<8)|bytes[o+1];}
  function u32(o){return ((bytes[o]<<24)|(bytes[o+1]<<16)|(bytes[o+2]<<8)|bytes[o+3])>>>0;}
  if(bytes.length<14||txt(bytes,0,4)!=='MThd'){errors.push('missing MThd header');return {errors:errors,warnings:warnings,tracks:tracks};}
  var hlen=u32(4);
  if(hlen!==6)warnings.push('unusual header length '+hlen);
  var format=u16(8), ntracks=u16(10), division=u16(12);
  var smpte=null, tpq=null;
  if(division&0x8000){
    var fps=(division>>8)&0xFF; fps=(fps>127)?fps-256:fps;
    smpte={fps:fps,ticks_per_frame:division&0xFF};
    warnings.push('SMPTE time division ('+fps+' fps, '+smpte.ticks_per_frame+' ticks/frame) - second math uses 25fps fallback where needed');
  } else tpq=division;
  var pos=8+hlen, t=0;
  while(t<ntracks){
    if(pos+8>bytes.length){errors.push('track chunk '+t+' truncated at offset '+pos);break;}
    if(txt(bytes,pos,4)!=='MTrk'){errors.push('expected MTrk at offset '+pos+', found "'+txt(bytes,pos,4)+'"');break;}
    var tlen=u32(pos+4), tend=pos+8+tlen;
    if(tend>bytes.length){errors.push('track '+t+' data truncated');tend=bytes.length;}
    var p=pos+8, tick=0, run=0, events=[], eot=false;
    while(p<tend && !eot){
      var d=vlq(bytes,p);
      if(d.truncated){errors.push('track '+t+': truncated delta at '+p);break;}
      p+=d.length; tick+=d.value;
      if(p>=tend){errors.push('track '+t+': truncated event at tick '+tick);break;}
      var st=bytes[p];
      if(st<0x80){
        if(!run){errors.push('track '+t+': running status without prior status at '+p);break;}
        st=run;
      } else {
        p++;
        if(st<0xF0)run=st;
      }
      var cls=st&0xF0, ch=st&0x0F;
      if(st===0xFF){
        if(p>=tend){errors.push('track '+t+': truncated meta event');break;}
        var mt=bytes[p++], ml=vlq(bytes,p);
        if(ml.truncated||p+ml.length+ml.value>tend){errors.push('track '+t+': truncated meta payload');break;}
        p+=ml.length;
        var raw=bytes.slice(p,p+ml.value);
        var ev={tick:tick,type:META_NAME[mt]||('meta_'+mt),meta:mt};
        if(mt===0x51)ev.tempo=(raw[0]<<16)|(raw[1]<<8)|raw[2];
        else if(mt===0x58){ev.time_signature=[raw[0],raw[1],raw[2],raw[3]];}
        else if(mt===0x59)ev.key_signature=[(raw[0]>127?raw[0]-256:raw[0]),raw[1]];
        else if(mt===0x2F)eot=true;
        else if(ml.value&&mt!==0x20&&mt!==0x7F)ev.text=txt(bytes,p,ml.value);
        else if(mt===0x20)ev.channel_prefix=raw[0];
        events.push(ev);
        p+=ml.value;
      } else if(st===0xF0||st===0xF7){
        var sl=vlq(bytes,p);
        if(sl.truncated||p+sl.length+sl.value>tend){errors.push('track '+t+': truncated sysex');break;}
        p+=sl.length+sl.value;
        events.push({tick:tick,type:'sysex',status:st,bytes:sl.value});
      } else if(CHAN_LEN[cls]){
        /* data always starts at p: with running status p was never advanced
           past a status byte; with an explicit status p was incremented above */
        var data=[];
        var di=p;
        for(var k=0;k<CHAN_LEN[cls];k++){
          if(di+k>=tend){errors.push('track '+t+': truncated channel event');break;}
          data.push(bytes[di+k]);
        }
        p=di+CHAN_LEN[cls];
        var ev2={tick:tick,type:CHAN_NAME[cls],channel:ch};
        if(cls===0x80||cls===0x90){ev2.note=data[0];ev2.velocity=data[1];}
        else if(cls===0xA0){ev2.note=data[0];ev2.value=data[1];}
        else if(cls===0xB0){ev2.control=data[0];ev2.value=data[1];}
        else if(cls===0xC0)ev2.program=data[0];
        else if(cls===0xD0)ev2.value=data[0];
        else if(cls===0xE0)ev2.pitch=(data[0]|(data[1]<<7))-8192;
        events.push(ev2);
      } else {
        errors.push('track '+t+': unexpected status byte 0x'+st.toString(16)+' at '+p);break;
      }
    }
    tracks.push({index:t, offset:pos, length:tlen, events:events, end_tick:tick});
    pos=pos+8+tlen; t++;
  }
  if(pos<bytes.length)warnings.push((bytes.length-pos)+' trailing byte(s) after the last track chunk');
  /* tempo map + seconds (uses merged tempo events across tracks) */
  var tempos=[{tick:0,tempo:500000}], maxTick=0, noteCount=0, minNote=128, maxNote=-1, programs={}, channels={};
  tracks.forEach(function(tr){
    tr.events.forEach(function(e){
      if(e.tick>maxTick)maxTick=e.tick;
      if(e.type==='set_tempo')tempos.push({tick:e.tick,tempo:e.tempo});
      if(e.type==='note_on'&&e.velocity>0){noteCount++;if(e.note<minNote)minNote=e.note;if(e.note>maxNote)maxNote=e.note;channels[e.channel]=true;}
      if(e.type==='program_change')programs[e.channel]=e.program;
    });
  });
  tempos.sort(function(a,b){return a.tick-b.tick;});
  var uniq=[]; tempos.forEach(function(x){if(!uniq.length||uniq[uniq.length-1].tempo!==x.tempo||uniq[uniq.length-1].tick!==x.tick)uniq.push(x);});
  tempos=uniq;
  function tickToSec(tk){
    if(!tpq)return null;
    var sec=0,last=0,cur=500000,i;
    for(i=0;i<tempos.length;i++){
      if(tempos[i].tick>tk)break;
      sec+=(tempos[i].tick-last)*cur/1e6/tpq; last=tempos[i].tick; cur=tempos[i].tempo;
    }
    sec+=(tk-last)*cur/1e6/tpq;
    return sec;
  }
  var dur=tickToSec(maxTick);
  return {errors:errors,warnings:warnings,tracks:tracks,format:format,ntracks:ntracks,
          division:division,tpq:tpq,smpte:smpte,tempos:tempos,max_tick:maxTick,
          duration_seconds:dur,note_count:noteCount,min_note:minNote<128?minNote:null,max_note:maxNote>=0?maxNote:null,
          programs:programs,channels_used:Object.keys(channels).map(Number).sort(function(a,b){return a-b;}),size:bytes.length};
}
var api={parseMidi:parseMidi,vlq:vlq};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.MidiLens=api;
})(typeof self!=='undefined'?self:this);
