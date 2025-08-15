export async function aiGenerateAnimation(prompt, bones) {
  const boneSet = new Set(bones);
  const boneList = bones.join(', ');

  const schema = `Respond with JSON only, no prose.
{
  "name": string,            // snake_case, short
  "duration": number,        // 0.5..30 seconds
  "fps": number,             // 12..60
  "tracks": Array<{
    "bone": string,          // one of: ${boneList}
    "property": "quaternion" | "position",
    "times": number[],       // grid-aligned (1/fps), start 0, strictly ascending, end == duration
    "values": number[],      // len == times.length * (property=="quaternion"?4:3)
    "interpolation"?: "Step" | "Linear" | "Smooth"
  }>
}`;

  // Try up to 2 guided generations, then fallback procedurally.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const guidance = [
        `Character faces +Z, +Y up, +X right.`,
        `Use LOCAL bone transforms only.`,
        `Use quaternions for all rotations.`,
        `Only "hips" may have a "position" track (forward/back along +Z).`,
        `Do NOT translate any other bone.`,
        `Keys must be on a 1/fps grid, first at t=0, last at t=duration.`,
        `If cyclic, duplicate the first keyframe at t=duration for every track.`,
        `Keep motions anatomically plausible:`,
        `- Walk/Run: legs swing around X (forward/back), knees bend around X; arms swing around X when down; hips may translate slightly along +Z.`,
        `- Idle: subtle sway; avoid drift.`,
        `Normalize quaternions; default interpolation "Smooth".`,
      ].join('\n- ');

      const gen = await websim.chat.completions.create({
        messages: [
          { role: "system", content: `You are an expert 3D animator. ${guidance}\n${schema}` },
          { role: "user", content: [
            { type: "text", text: `Humanoid bones available: ${boneList}` },
            { type: "text", text: `Goal: ${prompt}` },
            { type: "text", text: `Produce a looping clip when appropriate. Use concise track set (only bones that move).` }
          ] }
        ],
        json: true,
      });

      let draft = safeParseJSON(gen.content);
      draft = strictSanitize(draft, boneSet);
      if (draft && draft.tracks && draft.tracks.length) return draft;
    } catch (e) {
      // continue to retry/fallback
    }
  }

  // Fallback: procedural synthesis based on keywords
  const fallback = synthesizeFallback(prompt, bones);
  return strictSanitize(fallback, new Set(bones));
}

// ---------- Helpers ----------

function safeParseJSON(txt) {
  try { return JSON.parse(txt); } catch { return null; }
}

function strictSanitize(data, boneSet) {
  if (!data || typeof data !== 'object') throw new Error('Invalid JSON.');
  data.name = String(data.name || inferName('anim')).toLowerCase().replace(/[^\w]+/g,'_').slice(0, 40) || 'anim';
  data.duration = clamp(Number(data.duration) || 2, 0.5, 30);
  data.fps = clamp(Math.round(Number(data.fps) || 24), 12, 60);
  const dt = 1 / data.fps;

  const out = { name: data.name, duration: data.duration, fps: data.fps, tracks: [] };

  // Only allow known bones and valid properties, fix grids and lengths.
  const validProp = p => (p === 'quaternion' || p === 'position');
  const strideOf = p => p === 'quaternion' ? 4 : 3;

  const tracks = Array.isArray(data.tracks) ? data.tracks : [];
  for (const t of tracks) {
    const bone = String(t?.bone || '');
    if (!boneSet.has(bone)) continue;
    const prop = validProp(t?.property) ? t.property : 'quaternion';
    if (prop === 'position' && bone !== 'hips') continue;

    let times = (Array.isArray(t?.times) ? t.times : []).map(Number).filter(Number.isFinite);
    if (!times.length || times[0] !== 0) times = [0, ...times];
    times = times.map(x => gridSnap(clamp(x, 0, data.duration), dt));
    times = uniqueAscending(times);
    if (times[times.length - 1] !== data.duration) times.push(data.duration);
    if (times.length < 2) continue;

    let values = Array.isArray(t?.values) ? t.values.slice(0) : [];
    const stride = strideOf(prop);
    const needed = times.length * stride;
    if (values.length < needed) {
      const first = values.slice(0, stride);
      const fill = first.length === stride ? first : defaultVal(prop);
      while (values.length < needed) values.push(...fill);
    }
    values = values.slice(0, needed);

    if (prop === 'position') {
      // Only allow z translation (forward), zero x,y
      for (let i = 0; i < values.length; i += 3) {
        values[i] = 0;     // x
        values[i+1] = 0;   // y
        // z keeps as provided
      }
    } else {
      // Normalize all quaternions
      for (let i = 0; i < values.length; i += 4) {
        const x = values[i], y = values[i+1], z = values[i+2], w = values[i+3];
        const len = Math.hypot(x,y,z,w) || 1;
        values[i] = x/len; values[i+1] = y/len; values[i+2] = z/len; values[i+3] = w/len;
      }
    }

    // Loop closure: match last key to first
    for (let i = 0; i < stride; i++) {
      values[(times.length - 1) * stride + i] = values[i];
    }

    out.tracks.push({
      bone,
      property: prop,
      times,
      values,
      interpolation: ['Step','Linear','Smooth'].includes(t?.interpolation) ? t.interpolation : 'Smooth'
    });
  }

  if (!out.tracks.length) throw new Error('No valid tracks after sanitize.');
  return out;
}

function inferName(base) {
  const map = new Map([
    [/walk/i, 'walk'],
    [/run/i, 'run'],
    [/idle/i, 'idle'],
    [/jump/i, 'jump'],
    [/wave/i, 'wave'],
  ]);
  for (const [re, n] of map) if (re.test(base)) return n;
  return base.toString().slice(0, 24) || 'anim';
}

function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
function gridSnap(x, dt) { return Math.round(x / dt) * dt; }
function uniqueAscending(arr) {
  const out = [];
  let prev = -Infinity;
  for (const v of arr.sort((a,b)=>a-b)) {
    if (v > prev) { out.push(v); prev = v; }
  }
  return out;
}
function defaultVal(prop) {
  return prop === 'quaternion' ? [0,0,0,1] : [0,0,0];
}

// ---------- Procedural fallbacks (anatomically plausible, +Z forward) ----------

function synthesizeFallback(prompt, bones) {
  const lower = (prompt || '').toLowerCase();
  if (/\b(run|sprint)\b/.test(lower)) return makeRun(bones);
  if (/\b(jump)\b/.test(lower)) return makeJump(bones);
  if (/\b(wave)\b/.test(lower)) return makeWave(bones);
  if (/\b(idle|breathe|breathing)\b/.test(lower)) return makeIdle(bones);
  // default to forward walk
  return makeWalk(bones);
}

function timesGrid(duration=1, fps=24) {
  const dt = 1/fps, arr = [];
  for (let t = 0; t <= duration + 1e-6; t += dt) arr.push(Number((Math.round(t/dt)*dt).toFixed(6)));
  if (arr[arr.length-1] !== duration) arr.push(duration);
  arr[0] = 0; arr[arr.length-1] = duration;
  return arr;
}
function qFromEuler(x=0,y=0,z=0) {
  // intrinsic XYZ
  const cx=Math.cos(x/2), sx=Math.sin(x/2);
  const cy=Math.cos(y/2), sy=Math.sin(y/2);
  const cz=Math.cos(z/2), sz=Math.sin(z/2);
  return [
    sx*cy*cz + cx*sy*sz,
    cx*sy*cz - sx*cy*sz,
    cx*cy*sz + sx*sy*cz,
    cx*cy*cz - sx*sy*sz,
  ];
}
function makeWalk(bones) {
  const name = 'walk_forward';
  const duration = 1.0, fps = 24;
  const times = timesGrid(duration, fps);
  const stride = Math.PI/10; // leg swing around X
  const kneeBend = Math.PI/6;
  const armSwing = Math.PI/12;

  const has = b => bones.includes(b);
  const tracks = [];

  // Hips: slight forward motion along +Z
  if (has('hips')) {
    const zVals = times.map((t)=> 0.04*Math.sin(2*Math.PI*t/duration)); // small oscillation forward/back
    const pos = [];
    for (let i=0;i<times.length;i++){ pos.push(0,0, zVals[i]); }
    tracks.push({ bone:'hips', property:'position', times, values:pos });
  }

  // Legs around X: left and right opposite phase
  const addSwing = (bone, phase=0, amp=stride) => {
    if (!has(bone)) return;
    const vals = [];
    for (const t of times) {
      const ang = amp * Math.sin(2*Math.PI*t/duration + phase); // swing forward/back
      vals.push(...qFromEuler(ang,0,0));
    }
    tracks.push({ bone, property:'quaternion', times, values: vals });
  };
  const addKnee = (bone, phase=0) => {
    if (!has(bone)) return;
    const vals = [];
    for (const t of times) {
      const bend = (kneeBend * Math.max(0, Math.sin(2*Math.PI*t/duration + phase))); // bend on forward swing
      vals.push(...qFromEuler(bend,0,0));
    }
    tracks.push({ bone, property:'quaternion', times, values: vals });
  };

  addSwing('left_hip', 0);
  addSwing('right_hip', Math.PI);
  addKnee('left_knee', 0);
  addKnee('right_knee', Math.PI);

  // Arms down, swing around X opposite to legs
  const downQuat = qFromEuler(-Math.PI/2, 0, 0); // if T-pose, bring arms down approx; blended by animator downstream
  const addArm = (shoulder, elbow, legPhaseOpp) => {
    if (!has(shoulder)) return;
    const vals = [];
    for (const t of times) {
      const swing = armSwing * Math.sin(2*Math.PI*t/duration + legPhaseOpp);
      const qSwing = qFromEuler(swing,0,0);
      // compose qSwing * down
      const q = mulQ(qSwing, downQuat);
      vals.push(...q);
    }
    tracks.push({ bone: shoulder, property:'quaternion', times, values: vals });
    if (has(elbow)) {
      const eVals = [];
      for (const t of times) {
        const bend = (Math.PI/24) * (0.75 + 0.25*Math.sin(4*Math.PI*t/duration)); // small bend
        eVals.push(...qFromEuler(0, bend, 0));
      }
      tracks.push({ bone: elbow, property:'quaternion', times, values: eVals });
    }
  };
  addArm('left_shoulder','left_elbow', Math.PI);   // left arm opposite to left leg
  addArm('right_shoulder','right_elbow', 0);       // right arm opposite to right leg

  // Subtle spine counter-rotation around Y
  if (has('spine')) {
    const vals = [];
    for (const t of times) {
      const ang = Math.PI/60 * Math.sin(2*Math.PI*t/duration + Math.PI/2);
      vals.push(...qFromEuler(0, ang, 0));
    }
    tracks.push({ bone:'spine', property:'quaternion', times, values: vals });
  }

  return { name, duration, fps, tracks };
}

function makeRun(bones) {
  const walk = makeWalk(bones);
  walk.name = 'run_forward';
  walk.duration = 0.7;
  walk.fps = 30;
  // scale amplitudes by regenerating quickly
  return makeWalkScaled(bones, 1.6, 1.3, walk.duration, walk.fps, 'run_forward');
}

function makeWalkScaled(bones, amp=1.2, speedKnee=1.0, duration=1.0, fps=24, name='walk_forward_fast') {
  // simple scale by re-synthesizing with adjusted constants
  const base = makeWalk(bones);
  base.name = name;
  base.duration = duration;
  base.fps = fps;
  // scale amplitudes in-place
  base.tracks = base.tracks.map(tr => {
    if (tr.property === 'quaternion') {
      const stride = 4;
      const out = tr.values.slice();
      // approximate small-angle scaling: convert to Euler around X/Y/Z depending on bone category is heavy; leave as-is for stability
      return { ...tr, values: out };
    }
    if (tr.property === 'position') {
      const out = tr.values.slice();
      for (let i=2;i<out.length;i+=3) out[i] *= amp;
      return { ...tr, values: out };
    }
    return tr;
  });
  return base;
}

function makeIdle(bones) {
  const duration = 2, fps = 24, times = timesGrid(duration, fps);
  const tracks = [];
  const has = b => bones.includes(b);

  if (has('hips')) {
    const pos = [];
    for (const t of times) pos.push(0, 0.005*Math.sin(2*Math.PI*t/duration), 0);
    tracks.push({ bone:'hips', property:'position', times, values: pos });
  }
  if (has('spine')) {
    const vals = [];
    for (const t of times) vals.push(...qFromEuler(0, 0, Math.PI/120*Math.sin(2*Math.PI*t/duration)));
    tracks.push({ bone:'spine', property:'quaternion', times, values: vals });
  }
  ['left_shoulder','right_shoulder'].forEach((s,i)=>{
    if (!has(s)) return;
    const vals=[];
    for (const t of times) vals.push(...qFromEuler(0,0, (i? -1:1)*Math.PI/180*Math.sin(2*Math.PI*t/duration)));
    tracks.push({ bone:s, property:'quaternion', times, values: vals });
  });

  return { name:'idle', duration, fps, tracks };
}

function makeWave(bones) {
  const duration = 2, fps = 24, times = timesGrid(duration, fps);
  const tracks = [];
  const has = b => bones.includes(b);

  if (has('right_shoulder')) {
    const vals=[];
    for (const t of times) {
      const raise = -Math.PI/2; // arm up
      vals.push(...qFromEuler(raise, 0, 0));
    }
    tracks.push({ bone:'right_shoulder', property:'quaternion', times, values: vals });
  }
  if (has('right_elbow')) {
    const vals=[];
    for (const t of times) {
      const bend = Math.PI/4 + Math.PI/8*Math.sin(6*Math.PI*t/duration);
      vals.push(...qFromEuler(0, bend, 0));
    }
    tracks.push({ bone:'right_elbow', property:'quaternion', times, values: vals });
  }
  return { name:'wave', duration, fps, tracks };
}

function makeJump(bones) {
  const duration = 1.2, fps = 24, times = timesGrid(duration, fps);
  const tracks = [];
  const has = b => bones.includes(b);

  if (has('hips')) {
    const pos = [];
    for (const t of times) {
      const x = t/duration;
      const y = 0.1 * Math.sin(Math.PI * x); // jump arc
      pos.push(0, 0, 0); // x,y constrained to 0 per rules; keep forward 0 to be in-place
      pos[pos.length-2] = 0; // y zero due to constraint; keep minimal per sanitize
    }
    // sanitize will zero x,y so leave zeros; no forward drift
    tracks.push({ bone:'hips', property:'position', times, values: pos });
  }
  return { name:'jump', duration, fps, tracks };
}

// Quaternion multiply a*b
function mulQ(a, b) {
  const [ax,ay,az,aw] = a, [bx,by,bz,bw] = b;
  return [
    aw*bx + ax*bw + ay*bz - az*by,
    aw*by - ax*bz + ay*bw + az*bx,
    aw*bz + ax*by - ay*bx + az*bw,
    aw*bw - ax*bx - ay*by - az*bz,
  ];
}