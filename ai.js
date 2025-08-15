export async function aiGenerateAnimationJSON(prompt, bones) {
  const boneList = bones.join(', ');
  const schema = `Respond with JSON only, no prose.
{
  "name": string, // short snake_case
  "duration": number, // seconds (0.5..30)
  "fps": number, // 12..60
  "tracks": Array<{
    "bone": string, // one of: ${boneList}
    "property": "quaternion" | "position",
    "times": number[], // start at 0, strictly ascending, last == duration
    "values": number[], // length == times.length * (property=="quaternion"?4:3)
    "interpolation"?: "Step" | "Linear" | "Smooth"
  }>
}`;
  const gen = await websim.chat.completions.create({
    messages: [
      { role: "system", content: `You are an expert 3D animator. Character faces +Z, +Y up, +X right. Use LOCAL bone transforms only.
- Bones must be exactly from this list; do not invent names.
- Rotations: quaternions only for all bones except "hips".
- Translations: only "hips" may have a "position" track (forward/back moved along +Z). Never translate any other bone.
- Times: start at 0, strictly ascending, end exactly at duration, on a 1/fps grid.
- Loop-friendly: if the motion is cyclic, ensure the first and last keyframes match for every track.
- Keep name short snake_case. Avoid extreme rotations.
Respond with JSON only following this schema:
{
  "name": string,
  "duration": number,      // 0.5..30
  "fps": number,           // 12..60
  "tracks": Array<{
    "bone": string,        // from provided list
    "property": "quaternion" | "position",
    "times": number[],     // grid-aligned, 0..duration
    "values": number[],    // len == times.length * (property=="quaternion"?4:3)
    "interpolation"?: "Step" | "Linear" | "Smooth"
  }>
}` },
      { role: "user", content: [
        { type: "text", text: `Humanoid bones available: ${boneList}` },
        { type: "text", text: `Goal: ${prompt}` },
        { type: "text", text: `Guidance: Use quaternions for all rotations; only "hips" may have a position track (forward/back moved along +Z). Keys on 1/fps grid. If cyclic, duplicate the first keyframe at t=duration for seamless looping.` }
      ] }
    ],
    json: true,
  });
  let draft = JSON.parse(gen.content);

  const refine = await websim.chat.completions.create({
    messages: [
      { role: "system", content: `Validate and correct animation JSON strictly:
- Enforce schema, remove unknown bones, clamp fps 12..60, duration 0.5..30.
- Times start at 0, end at duration, strictly ascending, snapped to 1/fps grid.
- Only "hips" may have "position"; convert others to quaternions is NOT allowed -> drop any non-hips position track.
- Normalize quaternions; default interpolation "Smooth".
- If first and last keys of a track differ and motion is cyclic, set the last key equal to the first.
Return JSON only.` },
      { role: "user", content: [
        { type: "text", text: `Valid bones: ${boneList}` },
        { type: "text", text: `Draft JSON:` },
        { type: "text", text: JSON.stringify(draft) }
      ] }
    ],
    json: true,
  });
  const refined = JSON.parse(refine.content);
  return refined;
}

export function repairAnimationJSON(data, bones) {
  const boneSet = new Set(bones);
  const synonyms = new Map([
    ['pelvis','hips'], ['root','hips'],
    ['chest','spine'], ['spine1','spine'],
    ['neck_base','neck'],
    ['head_top','head'],
    ['l_clavicle','left_clavicle'], ['r_clavicle','right_clavicle'],
    ['left_upper_arm','left_shoulder'], ['right_upper_arm','right_shoulder'],
    ['left_lower_arm','left_elbow'], ['right_lower_arm','right_elbow'],
    ['left_hand','left_wrist'], ['right_hand','right_wrist'],
    ['left_thigh','left_hip'], ['right_thigh','right_hip'],
    ['left_shin','left_knee'], ['right_shin','right_knee'],
    ['left_foot','left_ankle'], ['right_foot','right_ankle'],
  ]);
  if (!data || typeof data !== 'object') throw new Error('Invalid JSON.');
  data.name = String(data.name || 'custom_anim').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g,'').toLowerCase().slice(0, 40) || 'anim';
  let dur = Number(data.duration); if (!isFinite(dur) || dur <= 0) dur = 2; data.duration = Math.min(30, Math.max(0.5, dur));
  let fps = Number(data.fps || 24); fps = Math.min(60, Math.max(12, fps)); data.fps = fps;
  const dt = 1 / fps;
  const outTracks = [];
  for (const t of Array.isArray(data.tracks) ? data.tracks : []) {
    const rawBone = t?.bone ? String(t.bone) : '';
    const mapped = boneSet.has(rawBone) ? rawBone : (synonyms.get(rawBone) || null);
    if (!mapped || !boneSet.has(mapped)) continue;
    const prop = t.property === 'position' ? 'position' : 'quaternion';
    if (prop === 'position' && mapped !== 'hips') continue; // drop illegal translations
    let times = (Array.isArray(t.times) ? t.times : []).map(Number).filter(x => isFinite(x));
    if (!times.length || times[0] !== 0) times = [0, ...times];
    times = times.map(x => Math.min(data.duration, Math.max(0, Math.round(x / dt) * dt)));
    times = [...new Set(times)].sort((a,b)=>a-b);
    if (times[times.length-1] !== data.duration) times.push(data.duration);
    let vals = Array.isArray(t.values) ? t.values.slice(0) : [];
    const needed = times.length * (prop === 'quaternion' ? 4 : 3);
    if (vals.length < needed) {
      const last = vals.slice(-4);
      while (vals.length < needed) vals.push(...(last.length===4?last:new Array(4).fill(0).map((_,i)=>i===3&&prop==='quaternion'?1:0)));
    } else if (vals.length > needed) {
      vals = vals.slice(0, needed);
    }
    // Ensure loop-friendly closure by matching last key to first
    const closeLoop = () => {
      const stride = prop === 'quaternion' ? 4 : 3;
      for (let i = 0; i < stride; i++) vals[(times.length - 1) * stride + i] = vals[i];
    };
    if (prop === 'quaternion') {
      for (let i=0;i<vals.length;i+=4) {
        const x=vals[i],y=vals[i+1],z=vals[i+2],w=vals[i+3];
        const len = Math.hypot(x,y,z,w) || 1;
        vals[i]=x/len; vals[i+1]=y/len; vals[i+2]=z/len; vals[i+3]=w/len;
      }
    }
    closeLoop();
    outTracks.push({
      bone: mapped,
      property: prop,
      times,
      values: vals,
      interpolation: ['Step','Linear','Smooth'].includes(t.interpolation)?t.interpolation:'Smooth'
    });
  }
  data.tracks = outTracks.filter(tr=>tr.times.length>=2);
  if (!data.tracks.length) throw new Error('No valid tracks after repair.');
  return data;
}