/* ============================================================
   TEACHER FIGHTER — audio (Web Audio API, sintetizado)
   Sin archivos externos: todos los efectos y la música chiptune
   se generan por código. Se expone el objeto global `SFX`.
   ============================================================ */
'use strict';

const SFX = (function(){
  let ctx = null, master = null, sfxGain = null, musicGain = null;
  let enabled = true;
  try{ enabled = localStorage.getItem('tf_sound') !== '0'; }catch(e){}

  const music = { playing:false, name:null, step:0, timer:null, tempo:150 };

  // Pista de música de fondo (archivo) para la batalla
  let bgTrack = null;
  function ensureTrack(){
    if(!bgTrack){
      bgTrack = new Audio('musica/musicafondo.mp3');
      bgTrack.loop = true;
      bgTrack.volume = 0.42;
    }
    return bgTrack;
  }

  function ensure(){
    if(ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    ctx = new AC();
    master = ctx.createGain();  master.gain.value = 0.9; master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.28; musicGain.connect(master);
  }

  function unlock(){
    ensure();
    if(ctx && ctx.state === 'suspended') ctx.resume();
  }

  /* --- buffer de ruido reutilizable --- */
  let noiseBuf = null;
  function noise(){
    if(noiseBuf) return noiseBuf;
    const n = ctx.sampleRate * 0.5;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for(let i=0;i<n;i++) d[i] = Math.random()*2 - 1;
    return noiseBuf;
  }

  /* --- tono simple con envolvente --- */
  function tone(freq, dur, type='square', vol=0.5, dest=sfxGain, slideTo=null){
    if(!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if(slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t+dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t+0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t+dur+0.02);
  }

  /* --- ráfaga de ruido filtrado --- */
  function noiseHit(dur, cutoff, vol=0.6, type='lowpass'){
    if(!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noise();
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t); src.stop(t+dur);
  }

  /* ------------------ EFECTOS ------------------ */
  const api = {
    unlock,
    isEnabled: () => enabled,
    setEnabled(v){
      enabled = v;
      try{ localStorage.setItem('tf_sound', v ? '1':'0'); }catch(e){}
      if(!v) this.stopMusic();
    },

    click(){ if(!enabled) return; ensure(); tone(520, 0.07, 'square', 0.35); },
    select(){ if(!enabled) return; ensure(); tone(440,0.06,'square',0.4); tone(660,0.12,'square',0.4); },

    whoosh(kind){
      if(!enabled) return; ensure();
      if(kind === 'kick'){ noiseHit(0.14, 900, 0.5, 'bandpass'); tone(180,0.14,'sawtooth',0.18,sfxGain,90); }
      else { noiseHit(0.09, 1400, 0.4, 'bandpass'); tone(260,0.09,'sawtooth',0.14,sfxGain,160); }
    },
    hit(strong){
      if(!enabled) return; ensure();
      noiseHit(strong?0.18:0.12, strong?600:900, strong?0.8:0.6);
      tone(strong?90:120, strong?0.18:0.12, 'square', 0.5, sfxGain, 50);
    },
    block(){ if(!enabled) return; ensure(); noiseHit(0.08, 2600, 0.4,'highpass'); tone(880,0.06,'square',0.25); },
    jump(){ if(!enabled) return; ensure(); tone(300,0.16,'square',0.3,sfxGain,620); },

    bell(){ if(!enabled) return; ensure();
      tone(880,0.5,'triangle',0.5); tone(1320,0.5,'triangle',0.3);
      setTimeout(()=>{ tone(880,0.5,'triangle',0.45); tone(1320,0.5,'triangle',0.28); }, 160);
    },
    ko(){ if(!enabled) return; ensure();
      tone(400,0.5,'sawtooth',0.5,sfxGain,60); noiseHit(0.4, 500, 0.6);
    },
    win(){ if(!enabled) return; ensure();
      const seq = [523,659,784,1047];
      seq.forEach((f,i)=> setTimeout(()=> tone(f,0.18,'square',0.45), i*120));
    },
    roundWin(){ if(!enabled) return; ensure();
      [660,880].forEach((f,i)=> setTimeout(()=> tone(f,0.14,'square',0.4), i*110));
    },

    /* ------------------ MÚSICA ------------------ */
    startMusic(name){
      if(!enabled) return; ensure();
      if(name === 'battle'){
        // Música de la partida: pista de audio real (archivo mp3)
        this.stopMusic();
        music.name = 'battle';
        const t = ensureTrack();
        try{ t.currentTime = 0; }catch(e){}
        const pr = t.play();
        if(pr && pr.catch) pr.catch(()=>{});
        return;
      }
      // Menús: chiptune sintetizado
      if(bgTrack) bgTrack.pause();
      if(music.playing && music.name === name) return;
      this.stopMusic();
      music.playing = true; music.name = name; music.step = 0;
      music.tempo = 120;
      const step = () => {
        if(!music.playing) return;
        playStep(name, music.step);
        music.step = (music.step + 1) % 16;
        music.timer = setTimeout(step, (60000/music.tempo)/2); // corcheas
      };
      step();
    },
    stopMusic(){
      music.playing = false; music.name = null;
      if(music.timer){ clearTimeout(music.timer); music.timer = null; }
      if(bgTrack) bgTrack.pause();
    },
  };

  /* Patrones chiptune sencillos (frecuencias en Hz, 0 = silencio) */
  const N = { C3:131,D3:147,E3:165,F3:175,G3:196,A3:220,C4:262,D4:294,E4:330,F4:349,G4:392,A4:440,C5:523,E5:659,G5:784 };
  const PATTERNS = {
    menu: {
      bass: [N.C3,0,N.C3,0, N.A3,0,N.A3,0, N.F3,0,N.F3,0, N.G3,0,N.G3,0],
      lead: [N.C5,0,N.E5,N.G5, N.A4,0,N.C5,0, N.F4,0,N.A4,0, N.G4,0,N.E5,0],
    },
    battle: {
      bass: [N.E3,N.E3,0,N.E3, N.G3,0,N.A3,0, N.E3,N.E3,0,N.E3, N.D3,0,N.G3,0],
      lead: [N.E5,0,N.G5,N.E5, N.A4,N.C5,0,N.A4, N.E5,0,N.G5,N.E5, N.D4,N.G4,0,0],
    },
  };
  function playStep(name, s){
    const p = PATTERNS[name]; if(!p || !ctx) return;
    const b = p.bass[s], l = p.lead[s];
    if(b) tone(b, 0.18, 'triangle', 0.5, musicGain);
    if(l) tone(l, 0.14, 'square', 0.28, musicGain);
  }

  return api;
})();
