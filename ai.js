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
      { role: "system", content: `You are an expert 3D animator. Character faces +Z, +Y up, +X right. Use local bone transforms. Use quaternions for rotations. Avoid unrealistic extremes. Ensure a clean short snake_case name. ${schema}` },
      { role: "user", content: [
        { type: "text", text: `Humanoid bones available: ${boneList}` },
        { type: "text", text: `Goal: ${prompt}` },
        { type: "text", text: `Guidance: Prefer quaternion tracks for limbs/spine/neck/head; position only for root "hips". Keys should be on an fps grid and loopable if appropriate.` }
      ] }
    ],
    json: true,
  });
  let draft = JSON.parse(gen.content);

  const refine = await websim.chat.completions.create({
    messages: [
      { role: "system", content: `You validate and correct animation JSON. Keep the user's intent but fix structure: enforce schema, remove unknown bones, clamp fps 12..60, snap times to 1/fps grid, ensure times start at 0 and end at duration, strictly ascending, values length matches, normalize quaternions, default interpolation to "Smooth". Return JSON only matching the schema.` },
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
  if (!data || typeof data !== 'object') throw new Error('Invalid JSON.');
  data.name = String(data.name || 'custom_anim').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g,'').toLowerCase().slice(0, 40) || 'anim';
  let dur = Number(data.duration); if (!isFinite(dur) || dur <= 0) dur = 2; data.duration = Math.min(30, Math.max(0.5, dur));
  let fps = Number(data.fps || 24); fps = Math.min(60, Math.max(12, fps)); data.fps = fps;
  const dt = 1 / fps;
  const outTracks = [];
  for (const t of Array.isArray(data.tracks) ? data.tracks : []) {
    if (!t || !boneSet.has(t.bone)) continue;
    const prop = t.property === 'position' ? 'position' : 'quaternion';
    const stride = prop === 'quaternion' ? 4 : 3;
    let times = (Array.isArray(t.times) ? t.times : []).map(Number).filter(x => isFinite(x));
    if (!times.length || times[0] !== 0) times = [0, ...times];
    times = times.map(x => Math.min(data.duration, Math.max(0, Math.round(x / dt) * dt)));
    times = [...new Set(times)].sort((a,b)=>a-b);
    if (times[times.length-1] !== data.duration) times.push(data.duration);
    let vals = Array.isArray(t.values) ? t.values.slice(0) : [];
    const needed = times.length * stride;
    if (vals.length < needed) {
      const last = vals.slice(-stride);
      while (vals.length < needed) vals.push(...(last.length===stride?last:new Array(stride).fill(0).map((_,i)=>i===stride-1&&prop==='quaternion'?1:0)));
    } else if (vals.length > needed) {
      vals = vals.slice(0, needed);
    }
    if (prop === 'quaternion') {
      for (let i=0;i<vals.length;i+=4) {
        const x=vals[i],y=vals[i+1],z=vals[i+2],w=vals[i+3];
        const len = Math.hypot(x,y,z,w) || 1;
        vals[i]=x/len; vals[i+1]=y/len; vals[i+2]=z/len; vals[i+3]=w/len;
      }
    }
    outTracks.push({
      bone: t.bone,
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