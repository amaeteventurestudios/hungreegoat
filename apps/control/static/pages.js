/* HUNGREE GOAT CONTROL — pages v2 */
(() => {
'use strict';
const { state, api, post, put, patch, del, act, toast, confirmDlg, render, refresh, h, I, fmtDur, fmtLong, fmtBytes, fmtTime, fmtDate, st, artUrl, ASSET, ACTIONS, FORMS, CHANGES, previewTrack, mobile, help } = HGC;
const S = () => state.station; const P = () => `/api/stations/${state.station}`;
const pages = HGC.pages;
const ic = (svg, cls='') => `<span class="ic ${cls}">${svg}</span>`;
const led = (c, extra='') => `<span class="led ${c} ${extra}"></span>`;
const pill = (cls, txt) => `<span class="pill ${cls}">${h(txt)}</span>`;
const empty = (icon, title, text, action='') => `<div class="empty"><span class="ic">${icon}</span><b>${h(title)}</b><p>${h(text)}</p>${action}</div>`;
const rule = (key, icon, label, on, sub='', disabled=false, cls='') => `<div class="rule" data-key="rule-${key}"><span class="ic">${icon}</span><span class="lbl">${label}${sub?`<small>${h(sub)}</small>`:''}</span><span class="toggle ${cls} ${on?'on':''} ${disabled?'disabled':''}" data-act="toggle" data-key="${key}" role="switch" aria-checked="${!!on}"></span></div>`;
const srcState = (stt) => ({active:['on','Active'],ready:['ready','Ready'],enabled:['on','Enabled'],disabled:['off','Disabled'],unavailable:['warn','Unavailable'],empty:['off','Empty']}[stt]||['off',stt]);
const srcRow = (name, detail, stt) => { const [cls,lbl]=srcState(stt); return `<div class="src" data-key="src-${name}"><span class="led ${cls==='on'?'on':cls==='ready'?'blue':cls==='warn'?'warn':''}"></span><div class="n"><b>${h(name)}</b><span>${h(detail)}</span></div>${pill(cls,lbl)}</div>`; };
const evRow = e => { const cls={info:'blue',warning:'warn',error:'err',critical:'err'}[e.severity]||''; return `<div class="ev" data-key="ev-${e.id}"><span class="led ${cls}"></span><span class="t">${fmtTime(e.ts)}</span><span class="m" title="${h(e.message)}">${h(e.message)}${e.station?`<small>${h(e.station)}</small>`:''}</span></div>`; };
const streamState = (s) => { const stream=s.stream; if(s.on_air) return ['LIVE','on']; if(stream.state==='running'&&!stream.stale) return [stream.target==='local'?'LOCAL TEST':'ENCODING','cyan']; if(stream.state==='waiting') return ['WAITING','warn']; if(stream.state==='restarting') return ['RESTARTING','warn']; return ['STOPPED','err']; };
/* State-aware Start/Stop/Restart, driven by the real systemd ActiveState (never optimistic):
   activating -> Starting… (everything disabled while it settles); deactivating -> Stopping…;
   active -> Start disabled, Stop/Restart live; inactive/failed -> only Start is live. */
function svcButtons(svcInfo, {svcKind, startAct, stopAct, restartAct, startDisabled=false, startDisabledTitle='', suffix=''}={}){
  const as=(svcInfo&&svcInfo.ActiveState)||'inactive'; const starting=as==='activating', stopping=as==='deactivating', running=as==='active', failed=as==='failed';
  const busy=starting||stopping; const sfx=suffix?' '+suffix:'';
  const attrs=(a)=>svcKind?`data-act="svc" data-svc="${svcKind}:${a}"`:`data-act="${{start:startAct,stop:stopAct,restart:restartAct}[a]}"`;
  return `<button class="btn green sm" ${attrs('start')} ${running||busy||startDisabled?'disabled':''} ${startDisabled&&startDisabledTitle?`title="${h(startDisabledTitle)}"`:''}>${I.play} ${starting?'Starting…':'Start'+sfx}</button>`+
    `<button class="btn red sm" ${attrs('stop')} ${(!running&&!starting)||stopping?'disabled':''}>${I.stop} ${stopping?'Stopping…':'Stop'+sfx}</button>`+
    `<button class="btn sm" ${attrs('restart')} ${!running||busy?'disabled':''} title="${!running&&!busy?'Only meaningful while running':''}">${I.restart} Restart${sfx}</button>`+
    (failed?`<span class="pill err" style="margin-left:4px">SERVICE ERROR</span>`:'');
}
function modal(html, opts={}){ state.modal={html, wide:opts.wide}; render(); }
const closeModal = () => { state.modal=null; render(); };
Object.assign(ACTIONS, { 'close-modal': closeModal });

/* ======================= DASHBOARD ======================= */
pages.dashboard = { live:true, async load(){ const [mixes, pls] = await Promise.all([api(`/api/dj/mixes?station=${S()}`), api(`${P()}/playlists`)]);
  return {mixes, workoutPlaylists: pls.filter(p=>p.kind==='workout')}; },
  view(d){ const s=st(), ov=state.overview; const np=s.now_playing, sys=ov.system, stream=s.stream, sched=s.schedule, set=s.settings;
  const liqOn=s.liquidsoap.alive; const [airLabel, airCls]=streamState(s);
  const airDesc = s.on_air ? 'Streaming to YouTube' : liqOn ? (stream.state==='running' ? `Video pipeline running (${stream.target} output)` : stream.state==='waiting' ? 'Waiting for YouTube stream key' : 'Audio running · video stream stopped') : (s.library.empty ? 'Station waiting for media' : 'Audio engine stopped');
  const nextSw = sched.next_switch_in_sec!=null ? fmtLong(sched.next_switch_in_sec).replace(/ \d+s$/,'') : null;
  const fb=s.fallback; const fbReady=fb.backup.state==='ready'||fb.backup.state==='active'; const queue=s.queue||[]; const prepared=s.prepared||[]; const planned=s.planned||[]; const health=ov.health; const usb=sys.usb; const ytOn=s.on_air;
  // Rolling ~10-track horizon for the overview card: READY (Liquidsoap already has it) -> QUEUED
  // (operator requests, always next) -> PLANNED (engine rotation beyond that). A planned track is
  // popped out of PLAN the instant Liquidsoap actually takes it, but the seenIds guard skips any
  // planned row whose id already appears earlier so a slow poll can never show the same track twice.
  const seenIds=new Set([...prepared,...queue].map(t=>t.id).filter(id=>id!=null));
  const dashRows=[
    ...prepared.map(t=>({t, st:'ready'})),
    ...queue.map(t=>({t, st:'queued'})),
    ...planned.filter(t=>!(t.id!=null && seenIds.has(t.id))).map(t=>({t, st:'planned'})),
  ].slice(0,10).map((r,i)=>({...r, pos:i+1}));
  const dashPill={ready:pill('on','READY'), queued:pill('blue','QUEUED'), planned:pill('gold','PLANNED')};
  const dashItem=(row)=>{ const {t,st,pos}=row;
    return `<div class="row" data-key="dq-${st}-${t.qid||t.id||pos}"><span class="idx">${pos}</span><img class="th" src="${artUrl(t)}" loading="lazy"><div class="tt"><b>${h(t.title)}</b><span>${h(t.artist||'')}</span></div>${dashPill[st]}<span class="dur">${t.duration!=null?fmtDur(t.duration):''}</span>${st==='queued'?`<span class="acts"><button class="btn xs icon ghost" data-act="q-del" data-qid="${t.qid}">${I.x}</button></span>`:''}</div>`; };
  const card=(cls,k,v,d,icon,iconCls,extra='')=>`<div class="panel card ${cls}"><div class="k">${k}</div><div class="v"><span class="ic ${iconCls}">${icon}</span><span>${v}</span>${extra}</div><div class="d" title="${h(d.replace(/<[^>]+>/g,''))}">${d}</div></div>`;
  return `
  <section class="grid cards eq">
    ${card('onair '+(airCls==='on'?'':airCls==='cyan'?'local':airCls==='warn'?'wait':'off'),'On Air',airLabel,airDesc,I.stream,airCls==='on'?'green':airCls==='cyan'?'cyan':airCls==='warn'?'amber':'red',`<span class="led ${airCls==='on'?'on pulse':airCls==='cyan'?'cyan':airCls==='warn'?'warn':'err'}" style="margin-left:auto"></span>`)}
    ${card('','Active Source',h(np.source_label||'—'), liqOn ? (np.source==='main' ? `Scheduled: ${h(sched.current?sched.current.name:'Full library')}` : h(np.source||'')) : 'Audio engine not running',I.music,'blue')}
    ${card('','Scheduled Switch', nextSw?`In ${nextSw}`:'—', h(sched.next_entry?`${sched.next_entry.name} · ${sched.next_entry.start_time}`:'Continuous rotation'),I.clock,'gold',`<a href="#/schedules" class="link" style="margin-left:auto">${I.chev}</a>`)}
    ${card('','Queue Depth',`${queue.length} track${queue.length===1?'':'s'}`, queue.length?`Next request: ${h(queue[0].title)}`:(prepared[0]?`Up next: ${h(prepared[0].title)}`:'No requests queued'),I.db,'cyan')}
    ${card('','Fallback', fb.forced?'<span class="amber">FORCED</span>':(fbReady?'<span class="green">Ready</span>':'<span class="amber">Not ready</span>'), fb.forced?'Operator forced backup source':(fbReady?'Backup source armed':'Backup playlist unavailable'),I.shield,fb.forced?'amber':'green')}
    ${card('','Output', ytOn?'<span class="green">1 / 1 live</span>':`0 / 1 live`, ytOn?`${led('on')} YouTube Live · ${stream.bitrate_kbps?Math.round(stream.bitrate_kbps)+' kbps':''}`:(s.stream.youtube_configured?'YouTube configured · not streaming':'YouTube: needs stream key'),I.out,ytOn?'green':'blue',`<a href="#/youtube" class="link" style="margin-left:auto">${I.chev}</a>`)}
  </section>

  <section class="grid g-now eq">
    <div class="panel hl now" data-key="np">
      <div class="watermark" style="--wm-img:url(${ASSET.logoGold})"></div>
      <div class="np-h">${ic(I.play,'gold')}<div><h3>Now Playing${help('What is actually on air right now, straight from the audio engine — not a guess. Skip moves to the next prepared track; Restart restarts both the audio engine and video stream.')}</h3><div class="sub">${h(s.short)} · ${h(np.source_label||'—')}</div></div><button class="btn xs ghost" style="margin-left:auto" data-act="listen-toggle" title="Listen Live">${I.headphones} <span class="hide-m">Listen</span></button></div>
      <div class="body">
        <div class="art" id="np-art" data-static></div>
        <div style="min-width:0">
          <div class="title">${h(np.title||(liqOn?'Waiting for track…':'Nothing on air'))}</div>
          <div class="artist">${h(np.artist||'')}</div><div class="album">${h(np.album||'')}</div>
          <div class="chips">${(s.tags||[]).map(t=>`<span class="chip">${h(t)}</span>`).join('')}${np.source&&np.source!=='main'?`<span class="chip amber">${h(np.source)}</span>`:''}</div>
          <div class="meter">${'<i></i>'.repeat(56)}</div>
          <div class="progress" data-np><b style="width:${np.duration&&np.elapsed!=null?Math.min(100,np.elapsed/np.duration*100):0}%"></b><i style="left:${np.duration&&np.elapsed!=null?Math.min(100,np.elapsed/np.duration*100):0}%"></i></div>
          <div class="times"><span data-np-el>${fmtDur(np.elapsed)}</span><span data-np-rem>${np.duration?'-'+fmtDur((np.duration||0)-(np.elapsed||0)):''}</span></div>
          <div class="actions"><button class="btn" data-act="skip" ${liqOn?'':'disabled'}>${I.skip} Skip</button><button class="btn" disabled title="A 24/7 broadcast cannot pause — use Stop Stream or Fallback">${I.pause} Pause</button><button class="btn" data-act="restart-all">${I.restart} Restart</button></div>
        </div>
      </div>
      <div class="panel-f qa">${svcButtons(stream.service,{startAct:'stream-start',stopAct:'stream-stop',restartAct:'stream-restart',startDisabled:s.library.empty,startDisabledTitle:'Station library is empty — add media first',suffix:'Stream'})}<button class="btn amber sm" data-act="fallback-toggle">${I.shield} ${fb.forced?'Release Fallback':'Switch to Fallback'}</button><button class="btn sm" data-act="queue-clear">${I.x} Clear Queue</button></div>
    </div>

    <div class="panel"><div class="panel-h"><h3>${ic(I.cal)}Schedule${help('The scheduled playlist rotation for today. The highest-priority block matching the current day and time wins; when nothing matches, the full library plays.')}</h3><a class="right link" href="#/schedules">Full schedule ${I.chev}</a></div>
      <div class="panel-b scroll"><div class="sched">${(s.today_schedule||[]).length?(s.today_schedule).map(e=>`<div class="slot ${e.on_now?'now':''}" data-key="sl-${e.id}">${led(e.on_now?'on':'gold')}<span class="t">${h(e.start_time)}</span><div class="n"><b>${h(e.name)}</b><span>${h(e.description||e.playlist_slug)}</span></div>${e.on_now?'<span class="badge">ON NOW</span>':(sched.next_entry&&sched.next_entry.id===e.id?'<span class="badge next">NEXT</span>':'')}</div>`).join(''):empty(I.cal,'No programme today','Add schedule blocks to switch playlists automatically.',`<a class="btn sm gold" href="#/schedules">${I.plus} New schedule</a>`)}</div>
      ${sched.override?`<div class="note warn small">Manual override active: ${h(sched.override.playlist_slug)} until ${fmtTime(sched.override.until)}</div>`:''}</div>
      <div class="panel-f"><span class="muted small">${I.clock} Next switch ${sched.next_switch_in_sec!=null?`in ${fmtLong(sched.next_switch_in_sec)}`:'— none scheduled'}</span></div></div>

    <div class="panel"><div class="panel-h"><h3>${ic(I.cog)}Playback Rules${help('How the scheduled playlist picks and blends tracks. These apply to normal automated programming only — they have no effect on a live input or forced fallback.')}</h3></div><div class="panel-b"><div class="rules">
      ${rule('shuffle', I.shuffle, 'Shuffle Mode', set.shuffle)}${rule('sequential', I.list, 'Sequential Mode', set.sequential)}
      <div class="rule"><span class="ic">${I.wave}</span><span class="lbl">Track fade-in<small>gentle start for each track</small></span><select class="sel" data-change="setting" data-key="crossfade_sec">${[0,1,2,3,5].map(v=>`<option value="${v}" ${Number(set.crossfade_sec)===v?'selected':''}>${v?v+' sec':'Off'}</option>`).join('')}</select></div>
      ${rule('normalization', I.bars, 'ReplayGain / Normalization', set.normalization)}${rule('silence_guard', I.shield, 'Silence Detection (Guard)', set.silence_guard)}${rule('cue_points', I.cut, 'Cue Points (In/Out)', set.cue_points, 'liq_cue_in / liq_cue_out metadata')}${rule('weighted_rotation', I.shuffle, 'Weighted Rotation', set.weighted_rotation)}
    </div></div></div>
  </section>

  <section class="grid g-mid eq">
    <div class="panel"><div class="panel-h"><h3>${ic(I.queue,'cyan')}Queue / Requests${help('The actual expected play order, unified: READY is what Liquidsoap already has locked in next, QUEUED are operator requests (always play before rotation resumes), PLANNED is the engine\'s own rotation beyond that. Same real horizon as the Queue page, just the next ~10.')}</h3><span class="right small">${dashRows.length} upcoming</span></div><div class="panel-b scroll"><div class="list">
      ${dashRows.length?dashRows.map(dashItem).join(''):empty(I.queue,'Nothing queued yet','The engine plans ahead once the scheduled playlist has tracks to draw from.',`<a class="btn sm" href="#/library">${I.plus} Add from Library</a>`)}</div></div>
      <div class="panel-f"><span class="toggle ${set.request_queue_enabled?'on':''}" data-act="toggle" data-key="request_queue_enabled"></span><span class="small muted">Requests enabled</span><a class="btn xs" href="#/queue" style="margin-left:auto">Open queue ${I.chev}</a></div></div>

    <div class="panel"><div class="panel-h"><h3>${ic(I.megaphone,'amber')}Jingles / Station IDs</h3></div><div class="panel-b scroll">${(s.jingles&&(s.jingles.jingles||s.jingles.station_ids))?`<div class="rules">
      ${rule('jingle_top_of_hour', I.clock, 'Top of Hour ID', set.jingle_top_of_hour, `${s.jingles.station_ids} station IDs`, !s.jingles.station_ids)}
      <div class="rule"><span class="ic">${I.clock}</span><span class="lbl">Every N minutes</span><select class="sel" data-change="setting" data-key="jingle_every_minutes" ${s.jingles.jingles?'':'disabled'}>${[0,15,30,60].map(v=>`<option value="${v}" ${Number(set.jingle_every_minutes)===v?'selected':''}>${v?v+' min':'Off'}</option>`).join('')}</select></div>
      <div class="rule"><span class="ic">${I.music}</span><span class="lbl">Every N songs</span><select class="sel" data-change="setting" data-key="jingle_every_songs" ${s.jingles.jingles?'':'disabled'}>${[0,3,5,8,12].map(v=>`<option value="${v}" ${Number(set.jingle_every_songs)===v?'selected':''}>${v?v+' songs':'Off'}</option>`).join('')}</select></div></div>`
      : empty(I.megaphone,'No jingles yet','Upload jingles or station IDs to enable scheduled inserts.',`<a class="btn sm gold" href="#/playlists">${I.upload} Upload jingles</a>`)}</div>
      <div class="panel-f"><span class="small muted">${s.jingles?`${s.jingles.jingles} jingles · ${s.jingles.station_ids} station IDs`:''}</span></div></div>

    <div class="panel"><div class="panel-h"><h3>${ic(I.shield,'green')}Fallback Sources${help('The order the engine falls back through if the scheduled source fails: backup playlist, then the emergency loop, with silence detection as a last resort. "Force fallback" skips straight to the backup playlist.')}</h3></div><div class="panel-b scroll">
      ${srcRow('Primary Playlist', sched.current?sched.current.name:'Full library', fb.primary.state)}${srcRow('Backup Playlist', fb.backup.name, fb.backup.state)}${srcRow('Emergency Loop', fb.emergency.state==='empty'?'No files in /fallback':fb.emergency.name, fb.emergency.state)}${srcRow('Silence Failover', fb.silence.detail, fb.silence.state)}</div>
      <div class="panel-f"><button class="btn amber sm" data-act="fallback-toggle">${I.shield} ${fb.forced?'Release':'Force fallback'}</button><a class="btn xs ghost" href="#/sources" style="margin-left:auto">Sources ${I.chev}</a></div></div>

    <div class="panel"><div class="panel-h"><h3>${ic(I.mic,'blue')}Live Inputs</h3></div><div class="panel-b scroll"><div class="rules">
      <div class="rule"><span class="ic">${I.mic}</span><span class="lbl">Browser Microphone${help('Lets this computer or phone\'s microphone go on air. Turning this on does not start broadcasting by itself — go to Sources and press Take Live.')}<small>${s.live.mic_ready?'live audio connected':(set.live_mic_enabled?'accepting live audio':'off')}</small></span><span class="toggle ${set.live_mic_enabled?'on':''}" data-act="toggle" data-key="live_mic_enabled"></span></div>
      <div class="rule"><span class="ic">${I.link}</span><span class="lbl">Remote Stream URL<small>${set.live_remote_url?h(set.live_remote_url):'no URL configured'}</small></span><span class="toggle ${set.live_remote_enabled?'on':''} ${set.live_remote_url?'':'disabled'}" data-act="toggle" data-key="live_remote_enabled"></span></div></div>
      <div class="small muted" style="margin-top:auto">${I.info} A live input always overrides scheduled music.</div></div>
      <div class="panel-f"><a class="btn sm wide gold" href="#/sources">${I.mic} Go Live From This Device</a></div></div>

    <div class="panel"><div class="panel-h"><h3>${ic(I.tag,'cyan')}Metadata${help('What listeners see: the title/artist shown on YouTube\'s video overlay and sent to the public API. Artwork Sync re-renders that overlay whenever the track changes.')}</h3></div><div class="panel-b scroll">
      <dl class="kv"><dt>Title</dt><dd>${h(np.title||'—')}</dd><dt>Artist</dt><dd>${h(np.artist||'—')}</dd><dt>Genre</dt><dd>${h(np.genre||s.genre)}</dd></dl>
      <div class="rules">${rule('artwork_sync', I.image, 'Artwork Sync', set.artwork_sync)}${rule('metadata_rewrite', I.tag, 'Metadata Rewrite', set.metadata_rewrite)}${rule('send_now_playing', I.send, 'Send Now-Playing', set.send_now_playing)}</div></div>
      <div class="panel-f"><a class="btn xs ghost" href="#/metadata" style="margin-left:auto">Metadata ${I.chev}</a></div></div>
  </section>

  <section class="grid g-bot eq">
    <div class="panel"><div class="panel-h"><h3>${ic(I.list)}Library / Playlists</h3><a class="right link" href="#/library">Library ${I.chev}</a></div><div class="panel-b scroll">
      <div class="pl-tiles">${(s.playlists||[]).map(p=>`<a class="tile ${sched.playlist_slug===p.slug?'active':''}" href="#/playlists" data-key="pl-${p.id}"><span class="ph">${I.list}</span><div class="n"><b>${h(p.name)}</b><span>${p.track_count} tracks</span></div></a>`).join('')}</div></div>
      <div class="panel-f"><span class="small muted">Mode</span><select class="sel" data-change="mode" style="height:34px">${[['shuffle','Shuffle'],['sequential','Sequential']].map(([v,l])=>`<option value="${v}" ${(set.sequential&&!set.shuffle?'sequential':'shuffle')===v?'selected':''}>${l}</option>`).join('')}</select><span class="small muted" style="margin-left:auto;text-align:right">${s.library.tracks} tracks · ${fmtLong(s.library.duration)}</span></div></div>

    ${(()=>{ const latest=(d.mixes||[])[0]; const active=latest&&['creating','recording','mastering'].includes(latest.status);
      return `<div class="panel"><div class="panel-h"><h3>${ic(I.mic,'gold')}Workout DJ${active?help('Auto-DJ is generating a mix right now — recording in real time, then mastering.'):''}</h3><a class="right link" href="#/workout">Workout DJ ${I.chev}</a></div><div class="panel-b scroll">
      <div class="grid" style="grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:10px">
        <div class="stat"><div class="k">Workout playlists</div><div class="v">${(d.workoutPlaylists||[]).length}</div></div>
        <div class="stat"><div class="k">Mixes saved</div><div class="v">${(d.mixes||[]).length}</div></div>
      </div>
      ${active?`<div class="rule" style="background:rgba(242,193,78,.08);border-radius:10px;padding:8px 10px"><span class="led warn pulse"></span><span class="lbl">Auto-DJ: ACTIVE<small>${h(latest.title)} · ${latest.status}</small></span></div>`
        :latest?`<div class="small muted">Latest: <b>${h(latest.title)}</b> — ${latest.status==='ready'?(latest.actual_duration_sec?fmtLong(latest.actual_duration_sec):''):latest.status}${latest.measured_lufs!=null?` · ${latest.measured_lufs.toFixed(1)} LUFS`:''}</div>`
        :`<div class="small muted">No mixes generated yet.</div>`}
      </div>
      <div class="panel-f qa"><a class="btn sm gold" href="#/workout">${I.plus} Create Workout Mix</a><a class="btn sm" href="/dj/index.html" target="_blank" rel="noopener">${I.headphones} Open DJ Studio</a></div></div>`; })()}

    <div class="panel"><div class="panel-h"><h3>${ic(I.out,'blue')}Outputs / Destinations${help('Where the encoded video/audio actually goes: YouTube Live (public broadcast), a local test file on the Pi, or Listen Live (authenticated audio-only for Control users). Change the active destination on the Outputs page.')}</h3></div><div class="panel-b scroll">
      <div class="out"><span class="ic red">${I.yt}</span><div class="n"><b>YouTube Live</b><span>${s.stream.youtube_configured?'rtmps · key configured':'Stream key not configured'}</span></div>${ytOn?pill('on','Live'):(stream.state==='waiting'?pill('warn','Waiting'):(s.stream.youtube_configured?pill('off','Idle'):pill('warn','Needs key')))}</div>
      <div class="out"><span class="ic cyan">${I.stream}</span><div class="n"><b>Local Test Output</b><span>FLV file on the Pi (300 MB cap)</span></div>${stream.target==='local'&&stream.state==='running'?pill('cyan','Active'):pill('off','Off')}</div>
      <div class="out"><span class="ic blue">${I.headphones}</span><div class="n"><b>Listen Live</b><span>MP3 128 kbps · Control users</span></div>${liqOn?pill('on','Ready'):pill('off','Off')}</div></div>
      <div class="panel-f qa" style="grid-template-columns:1fr 1fr">${(()=>{ const as=(stream.service&&stream.service.ActiveState)||'inactive'; const running=as==='active', busy=as==='activating'||as==='deactivating';
        return `<button class="btn green sm" data-act="stream-start" ${running||busy||s.library.empty?'disabled':''}>${I.play} ${as==='activating'?'Starting…':'Start'}</button><button class="btn red sm" data-act="stream-stop" ${(!running&&as!=='activating')||as==='deactivating'?'disabled':''}>${I.stop} ${as==='deactivating'?'Stopping…':'Stop'}</button>`; })()}</div></div>

    <div class="panel"><div class="panel-h"><h3>${ic(I.cpu,'blue')}Stream Metrics / Health${help('Live checks on the Pi itself and each station\'s audio/video engines. Everything here reflects the real system state — nothing is simulated. "Attention required" means at least one check below failed.')}</h3><span class="right">${led('blue','pulse')} live</span></div><div class="panel-b scroll">
      <div class="metrics">
        <div class="metric"><div class="k">Uptime</div><div class="v">${stream.state==='running'?fmtLong(stream.uptime_sec):'—'}</div><div class="s">${stream.state==='running'?'video pipeline':(stream.state||'stopped')}</div></div>
        <div class="metric"><div class="k">CPU</div><div class="v">${sys.cpu_percent.toFixed(0)}<small>%</small></div><canvas data-spark="cpu"></canvas></div>
        <div class="metric"><div class="k">Temperature</div><div class="v">${sys.temp_c!=null?sys.temp_c.toFixed(0)+'<small>°C</small>':'—'}</div><canvas data-spark="temp"></canvas></div>
        <div class="metric"><div class="k">RAM</div><div class="v">${sys.ram.percent.toFixed(0)}<small>%</small></div><div class="s">${fmtBytes(sys.ram.used)} / ${fmtBytes(sys.ram.total)}</div></div>
        <div class="metric"><div class="k">Bitrate</div><div class="v">${stream.bitrate_kbps&&stream.state==='running'?Math.round(stream.bitrate_kbps)+'<small>kbps</small>':'—'}</div><div class="s">${stream.state==='running'?`${(stream.fps||0).toFixed(1)} fps · 720p`:'not encoding'}</div></div>
        <div class="metric"><div class="k">HUNGREE-GOAT</div><div class="v">${usb.mounted&&usb.writable?usb.percent.toFixed(0)+'<small>%</small>':'<span class="red">FAULT</span>'}</div><div class="s">${usb.mounted&&usb.writable?fmtBytes(usb.free)+' free':'needs repair'}</div></div>
      </div>
      <div class="health">${health.checks.map(c=>`<div class="h" data-key="hc-${c.name}">${led(c.ok?'on':(c.level==='critical'||c.level==='error'?'err':'warn'))}<span class="lbl">${h(c.name)}</span><span class="val">${h(c.detail)}</span></div>`).join('')}</div></div>
      <div class="panel-f"><div class="nominal ${health.nominal?'ok':'bad'}" style="flex:1">${health.nominal?'ALL SYSTEMS NOMINAL':'ATTENTION REQUIRED'}</div>${(!usb.writable||usb.fs_shutdown)?`<button class="btn amber xs" data-act="usb-repair">Repair drive</button>`:''}</div></div>

    <div class="panel"><div class="panel-h"><h3>${ic(I.logs)}Logs / Automation</h3><a class="right link" href="#/logs">View all ${I.chev}</a></div><div class="panel-b"><div class="events">${ov.events.slice(0,16).map(evRow).join('')||empty(I.logs,'No events yet','Track changes and system events appear here.')}</div></div>
      <div class="panel-f"><span class="small muted">${ov.events.length} recent events</span><button class="btn xs ghost" data-act="alerts-open" style="margin-left:auto">${I.bell} Alerts</button></div></div>
  </section>`; } };

/* ======================= STREAMS ======================= */
pages.streams = { live:true, async load(){ return api(`${P()}/outputs`); }, view(out){ const s=st(), ov=state.overview, stream=s.stream, liq=s.liquidsoap, np=s.now_playing; const [lbl,cls]=streamState(s); const liqLbl = liq.alive?'RUNNING':'STOPPED';
  const tech = state.techOpen||{};
  return `<div class="page-h"><h2>Streams</h2><div class="right"><span class="chip ${cls==='on'?'green':cls==='err'?'red':cls==='warn'?'amber':'cyan'}">${lbl}</span></div></div>
  <div class="two">
    <div class="panel"><div class="panel-h"><h3>${ic(I.music,'blue')}Audio Engine <span class="muted small" style="font-weight:500">Liquidsoap</span></h3><span class="right">${led(liq.alive?'on':'err')}</span></div><div class="panel-b">
      <div class="bigstate ${liq.alive?'green':'red'}">${liqLbl}</div>
      <div class="chips">${pill('blue','48 kHz')}${pill('blue','Stereo')}${pill('blue','AAC 192 kbps')}${pill('cyan','MP3 128 listen')}${liq.alive?pill('on','uptime '+fmtLong(parseFloat(liq.uptime||0))):''}</div>
      <dl class="kv"><dt>Current source</dt><dd>${h(np.source_label||'—')}${np.title?` · ${h(np.title)}`:''}</dd><dt>Audio level</dt><dd><div class="vu"><b></b></div></dd><dt>Source readiness</dt><dd>${['main','backup','emergency','live','remote'].map(k=>`<span class="chip ${liq[k]==='true'?'green':'slate'}">${k}</span>`).join(' ')}</dd></dl>
      <details ${tech.audio?'open':''} data-key="tech-audio"><summary class="link" style="cursor:pointer">Technical details</summary><dl class="kv small" style="margin-top:8px"><dt>Service</dt><dd class="mono">${h(liq.service.unit)} · ${h(liq.service.ActiveState||'?')}/${h(liq.service.SubState||'')} · restarts ${h(liq.service.NRestarts||0)}</dd><dt>Engine</dt><dd>savonet/liquidsoap 2.4.5 (Docker, host network, uid 1000)</dd><dt>Audio feed</dt><dd class="mono">${h(out.harbor.url)}</dd><dt>Control</dt><dd class="mono">unix socket run/liq-${S()}.sock (loopback only)</dd></dl></details></div>
      <div class="panel-f qa">${svcButtons(liq.service,{svcKind:'liquidsoap'})}</div></div>

    <div class="panel"><div class="panel-h"><h3>${ic(I.stream,'cyan')}Video Pipeline <span class="muted small" style="font-weight:500">FFmpeg</span></h3><span class="right">${led(cls)}</span></div><div class="panel-b">
      <div class="bigstate ${cls==='on'?'green':cls==='err'?'red':cls==='warn'?'amber':'cyan'}">${lbl}</div>
      <div class="chips">${pill('blue','720p')}${pill('blue','30 fps')}${pill('blue','H.264')}${pill('blue',out.encoder.video_kbps/1000+' Mbps')}${pill('cyan','Hardware accelerated')}</div>
      <dl class="kv"><dt>Destination</dt><dd>${stream.target==='youtube'?'YouTube Live (RTMPS)':stream.target==='local'?'Local test file':stream.target==='none'?'Encode only':h(out.output_target)}${stream.state==='waiting'?' · <span class="amber">'+h(stream.last_error||'waiting')+'</span>':''}</dd><dt>Live</dt><dd>${stream.state==='running'?`${(stream.fps||0).toFixed(1)} fps · ${Math.round(stream.bitrate_kbps||0)} kbps · ${h(stream.speed||'')}`:'—'}</dd><dt>Uptime</dt><dd>${stream.state==='running'?fmtLong(stream.uptime_sec):'—'}</dd></dl>
      <details ${tech.video?'open':''}><summary class="link" style="cursor:pointer">Technical details</summary><dl class="kv small" style="margin-top:8px"><dt>Encoder</dt><dd>h264_v4l2m2m (Pi 4 VideoCore) · hw decode of the loop · overlay 1280×300 yuva420p piped at 30 fps</dd><dt>Audio</dt><dd>AAC-LC 192 kbps 48 kHz stereo, stream-copied from Liquidsoap</dd><dt>Frames</dt><dd>${stream.frame||0} · dup ${stream.dup_frames||0} · drop ${stream.drop_frames||0}</dd><dt>Service</dt><dd class="mono">${h(stream.service.unit)} · ${h(stream.service.ActiveState||'?')} · restarts ${h(stream.service.NRestarts||0)}${stream.restarts?` (+${stream.restarts} supervisor)`:''}</dd></dl></details></div>
      <div class="panel-f qa">${svcButtons(stream.service,{startAct:'stream-start',stopAct:'stream-stop',restartAct:'stream-restart',startDisabled:s.library.empty,startDisabledTitle:'Station library is empty — add media first'})}</div></div>
  </div>
  <div class="two" style="margin-top:12px">
    <div class="panel"><div class="panel-h"><h3>${ic(I.image)}Stream Preview</h3><span class="right small">what the audience sees</span></div><div class="panel-b">
      <div class="preview" data-static id="stream-preview"><video src="${ASSET.loopPreview}" poster="${ASSET.loopFrame}" muted loop playsinline autoplay preload="metadata"></video><img class="ov" id="preview-overlay" src="${P()}/overlay.png?t=${Math.floor(Date.now()/15000)}" alt=""><span class="lbl">LIVE COMPOSITION</span></div>
      <div class="small muted">Looping background · current artwork · title · artist · HUNGREE Goat branding — composed in the browser from the real overlay, no extra Pi encode.</div></div></div>
    <div class="panel"><div class="panel-h"><h3>${ic(I.stream,'gold')}Station</h3></div><div class="panel-b"><div class="station-card"><img class="cover" src="${np.track_id?artUrl(np):ASSET.defaultArtBig}" alt=""><div style="min-width:0"><h4>${h(s.name)}</h4><div class="chips" style="margin:0 0 8px">${pill(cls,lbl)}${pill(liq.alive?'on':'off',liq.alive?'audio running':'audio stopped')}${s.library.empty?pill('warn','waiting for media'):pill('blue',s.library.tracks+' tracks')}</div>
      <div class="stat-grid">
        <div class="stat"><div class="k">Current track</div><div class="v">${h(np.title||'—')}</div></div><div class="stat"><div class="k">Source</div><div class="v">${h(np.source_label||'—')}</div></div>
        <div class="stat"><div class="k">Schedule</div><div class="v">${h(s.schedule.current?s.schedule.current.name:'Full library')}</div></div><div class="stat"><div class="k">Library</div><div class="v">${fmtLong(s.library.duration)} · ${fmtBytes(s.library.bytes)}</div></div>
        <div class="stat"><div class="k">YouTube</div><div class="v">${s.stream.youtube_configured?'key ready':'needs key'}</div></div><div class="stat"><div class="k">Destination</div><div class="v">${h(out.output_target)}</div></div>
        <div class="stat"><div class="k">Uptime</div><div class="v">${stream.state==='running'?fmtLong(stream.uptime_sec):'—'}</div></div><div class="stat"><div class="k">Health</div><div class="v ${ov.health.nominal?'green':'amber'}">${ov.health.nominal?'Nominal':'Attention'}</div></div>
        <div class="stat"><div class="k">System</div><div class="v">CPU ${ov.system.cpu_percent.toFixed(0)}% · ${ov.system.temp_c?ov.system.temp_c.toFixed(0)+'°C':''}</div></div><div class="stat"><div class="k">Media</div><div class="v">${ov.system.usb.mounted&&ov.system.usb.writable?'drive healthy':'<span class="red">drive fault</span>'}</div></div>
      </div></div></div></div></div>
  </div>`; }, after(){ const v=document.querySelector('#stream-preview video'); if(v && v.paused) v.play().catch(()=>{}); const o=document.getElementById('preview-overlay'); const s=st(); if(o && s){ const key=`${s.now_playing.title}|${s.now_playing.track_id}`; if(o.dataset.k!==key){ o.dataset.k=key; const img=new Image(); img.onload=()=>{ o.src=img.src; }; img.src=`${P()}/overlay.png?t=${Date.now()}`; } } } };

/* ======================= SCHEDULES ======================= */
pages.schedules = { live:true, async load(){ const view=state.schedView||'today'; const off=view==='tomorrow'?1:0; const [d, pls, day] = await Promise.all([api(`${P()}/schedules`), api(`${P()}/playlists`), api(`${P()}/schedules/day/${off}`)]); return {d, pls, day:day.blocks, view}; },
  view({d,pls,day,view}){ const ev=d.evaluation; const plName=slug=>(pls.find(p=>p.slug===slug)||{}).name||slug;
    const block=(e)=>`<div class="tl-block ${e.on_now?'now':''} ${e.is_next?'next':''} ${e.enabled?'':'disabled'} ${e.override?'override':''}" data-key="tb-${e.id}"><span class="bar"></span><div class="n"><b>${h(e.name)}</b><span>${h(e.start_time)}–${h(e.end_time)} · ${h(plName(e.playlist_slug))}${e.description?' · '+h(e.description):''}</span><div class="chips">${e.on_now?pill('gold','On now'):''}${e.is_next?pill('cyan','Next'):''}${e.day_names?pill('slate',e.day_names.length===7?'Every day':e.day_names.join(' ')):''}${e.priority>10?pill('amber','priority '+e.priority):''}${e.date_from||e.date_to?pill('amber','special'):''}${e.enabled?'':pill('off','disabled')}</div></div>
      ${e.override?`<div class="acts"><button class="btn xs amber" data-act="override-clear">End override</button></div>`:`<div class="acts"><button class="btn xs" data-act="sched-edit" data-id="${e.id}" title="Edit">${I.edit}</button><button class="btn xs" data-act="sched-dup" data-id="${e.id}" title="Duplicate">${I.copy}</button><button class="btn xs ${e.enabled?'':'green'}" data-act="sched-toggle" data-id="${e.id}" title="${e.enabled?'Disable':'Enable'}">${e.enabled?I.pause:I.play}</button><button class="btn xs red" data-act="sched-del" data-id="${e.id}" title="Delete">${I.trash}</button></div>`}</div>`;
    let body='';
    if(view==='week'){ const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; const today=(new Date().getDay()+6)%7; body=`<div class="week">${days.map((dn,i)=>`<div class="day"><h5>${dn}${i===today?' · today':''}</h5>${d.entries.filter(e=>e.enabled&&String(e.days).split(',').includes(String(i))).sort((a,b)=>a.start_time.localeCompare(b.start_time)).map(e=>`<div class="b ${i===today&&ev.current&&ev.current.id===e.id?'now':''}" title="${h(e.name)}">${h(e.start_time)} ${h(e.name)}</div>`).join('')||'<div class="small muted2">—</div>'}</div>`).join('')}</div>`; }
    else { const list=[...day]; if(view==='today'&&ev.override) list.unshift({...ev.current, on_now:true, override:true, day_names:null}); body=list.length?`<div class="timeline">${list.map(e=>`<div class="hour">${h(e.start_time)}</div>${block(e)}`).join('')}</div>`:empty(I.cal,'No programme blocks','Create a schedule block to switch playlists automatically at set times.',`<button class="btn sm gold" data-act="sched-new">${I.plus} New Schedule</button>`); }
    return `<div class="page-h"><h2>Schedules</h2><span class="seg">${[['today','Today'],['tomorrow','Tomorrow'],['week','Week']].map(([v,l])=>`<button class="${view===v?'active':''}" data-act="sched-view" data-v="${v}">${l}</button>`).join('')}</span><div class="right"><span class="chip gold">${ev.current?`Now: ${h(ev.current.name)}`:'Now: full library'}</span><span class="chip">${ev.next_switch?`Next: ${h(new Date(ev.next_switch).toLocaleString([], {weekday:'short',hour:'2-digit',minute:'2-digit'}))}`:'No upcoming switch'}</span><button class="btn sm amber" data-act="override-new">${I.shield} Manual Override</button><button class="btn sm gold" data-act="sched-new">${I.plus} New Schedule</button></div></div>
    <div class="panel"><div class="panel-b">${body}</div><div class="panel-f small muted">Highest-priority block matching the current day and time wins; blocks may cross midnight; date-limited blocks act as specials. A manual override plays one playlist for a set time, then the schedule resumes.</div></div>`; } };
function schedModal(e, pls){ e = e || {name:'',description:'',playlist_slug:'all',start_time:'06:00',end_time:'12:00',days:'0,1,2,3,4,5,6',priority:10,enabled:1,date_from:'',date_to:''}; const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; const sel=new Set(String(e.days).split(',').filter(x=>x!=='').map(Number));
  return `<h3>${I.cal} ${e.id?'Edit':'New'} schedule block<button class="btn xs ghost icon x" data-act="close-modal">${I.x}</button></h3><form data-form="sched" data-id="${e.id||''}" class="form">
    <label>Name<input class="inp" name="name" value="${h(e.name)}" required></label><label>Playlist<select class="sel" name="playlist_slug">${pls.filter(p=>p.kind==='music'||p.kind==='fallback').map(p=>`<option value="${h(p.slug)}" ${p.slug===e.playlist_slug?'selected':''}>${h(p.name)}</option>`).join('')}</select></label>
    <label class="wide">Description<input class="inp" name="description" value="${h(e.description)}"></label>
    <label>Start<input class="inp" name="start_time" type="time" value="${h(e.start_time)}" required></label><label>End<input class="inp" name="end_time" type="time" value="${h(e.end_time)}" required></label><label>Priority<input class="inp" name="priority" type="number" value="${e.priority}" min="0" max="100"></label>
    <label class="wide">Days<div class="days">${days.map((d,i)=>`<button type="button" class="${sel.has(i)?'on':''}" data-act="day-toggle" data-day="${i}">${d}</button>`).join('')}<button type="button" data-act="day-set" data-days="0,1,2,3,4">Weekdays</button><button type="button" data-act="day-set" data-days="5,6">Weekend</button><button type="button" data-act="day-set" data-days="0,1,2,3,4,5,6">All</button></div></label>
    <label>Special from<input class="inp" name="date_from" type="date" value="${h(e.date_from||'')}"></label><label>Special to<input class="inp" name="date_to" type="date" value="${h(e.date_to||'')}"></label><label>Enabled<select class="sel" name="enabled"><option value="1" ${e.enabled?'selected':''}>Yes</option><option value="0" ${!e.enabled?'selected':''}>No</option></select></label>
    <div class="row-actions"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn gold" type="submit">Save</button></div></form>`; }
Object.assign(ACTIONS, {
  'sched-view': (el)=>{ state.schedView=el.dataset.v; delete state.pageData.schedules; render(); },
  'sched-new': ()=>modal(()=>schedModal(null, state.pageData.schedules.pls)),
  'sched-edit': (el)=>modal(()=>schedModal(state.pageData.schedules.d.entries.find(e=>e.id===Number(el.dataset.id)), state.pageData.schedules.pls)),
  'sched-dup': (el)=>{ const e={...state.pageData.schedules.d.entries.find(x=>x.id===Number(el.dataset.id))}; delete e.id; e.name+=' (copy)'; modal(()=>schedModal(e, state.pageData.schedules.pls)); },
  'sched-toggle': (el)=>{ const e=state.pageData.schedules.d.entries.find(x=>x.id===Number(el.dataset.id)); act(()=>put(`${P()}/schedules/${e.id}`,{...e, enabled:!e.enabled, date_from:e.date_from||null, date_to:e.date_to||null}), e.enabled?'Block disabled':'Block enabled'); },
  'sched-del': async(el)=>{ if(await confirmDlg('Delete this schedule block?','Delete',true)) act(()=>del(`${P()}/schedules/${el.dataset.id}`),'Deleted'); },
  'day-toggle': (el)=>el.classList.toggle('on'), 'day-set': (el)=>{ const set=new Set(el.dataset.days.split(',')); el.closest('.days').querySelectorAll('[data-day]').forEach(d=>d.classList.toggle('on',set.has(d.dataset.day))); },
  'override-new': ()=>modal(()=>`<h3>${I.shield} Manual override<button class="btn xs ghost icon x" data-act="close-modal">${I.x}</button></h3><form data-form="override" class="form"><label>Playlist<select class="sel" name="playlist_slug">${(state.pageData.schedules?state.pageData.schedules.pls:st().playlists).filter(p=>p.kind==='music'||p.kind==='fallback').map(p=>`<option value="${h(p.slug)}">${h(p.name)}</option>`).join('')}</select></label><label>Duration<select class="sel" name="minutes">${[[30,'30 minutes'],[60,'1 hour'],[120,'2 hours'],[240,'4 hours'],[480,'8 hours'],[1440,'24 hours']].map(([v,l])=>`<option value="${v}" ${v===60?'selected':''}>${l}</option>`).join('')}</select></label><label class="wide">Label (optional)<input class="inp" name="name" placeholder="e.g. Special mix"></label><div class="wide note small">The chosen playlist replaces the schedule for that time, then normal programming resumes automatically.</div><div class="row-actions"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn amber" type="submit">Start override</button></div></form>`),
  'override-clear': ()=>act(()=>del(`${P()}/schedule-override`),'Override ended'),
});
Object.assign(FORMS, {
  'sched': async(f,b)=>{ b.priority=Number(b.priority); b.enabled=b.enabled==='1'; b.days=[...f.querySelectorAll('[data-day].on')].map(d=>d.dataset.day).join(','); if(!b.days) return toast('Pick at least one day','err'); b.date_from=b.date_from||null; b.date_to=b.date_to||null; const id=f.dataset.id; const r=await act(()=>id?put(`${P()}/schedules/${id}`,b):post(`${P()}/schedules`,b),'Schedule saved'); if(r) closeModal(); },
  'override': async(f,b)=>{ b.minutes=Number(b.minutes); const r=await act(()=>post(`${P()}/schedule-override`,b),'Override started'); if(r) closeModal(); },
});

/* ======================= LIBRARY ======================= */
const trackRow = (t, opts={}) => `<div class="trk ${state.sel&&state.sel.has(t.id)?'selected':''}" data-key="t-${t.id}">
  <input type="checkbox" ${state.sel&&state.sel.has(t.id)?'checked':''} data-change="sel" data-id="${t.id}" aria-label="select">
  <img src="${artUrl(t)}" loading="lazy" alt="">
  <div class="t"><b>${h(t.title)}</b><span>${h(t.album||t.filename||'')}</span></div>
  <div class="a hide-m"><span>${h(t.artist)}</span><span>${t.codec?h(t.codec)+' · ':''}${t.sample_rate?t.sample_rate/1000+' kHz':''}${t.loudness_i!=null?' · '+t.loudness_i.toFixed(1)+' LUFS':''}</span></div>
  <div class="hide-m mono small">${fmtDur(t.duration)}</div>
  <div class="hide-m">${pill(t.artwork_source==='external'?'green':t.artwork_source==='embedded'?'blue':'off', t.artwork_source==='external'?'cover':t.artwork_source==='embedded'?'embedded':'default')}</div>
  <div class="hide-m" style="display:flex;align-items:center;gap:6px" title="${t.enabled?'Enabled — eligible for playback':'Disabled — excluded from playback'}"><span class="toggle green ${t.enabled?'on':''}" data-act="track-enable" data-id="${t.id}" role="switch" aria-checked="${!!t.enabled}" aria-label="${t.enabled?'Enabled':'Disabled'} — eligible for playback"></span><small class="muted2" style="width:44px">${t.enabled?'Enabled':'Disabled'}</small></div>
  <div class="acts"><button class="btn xs icon ${state.previewing===t.id?'gold':''}" data-act="preview" data-id="${t.id}" data-title="${h(t.title)}" title="Preview">${state.previewing===t.id?I.pause:I.play}</button><button class="btn xs icon" data-act="q-add" data-id="${t.id}" title="Add to queue">${I.plus}</button><button class="btn xs icon gold" data-act="q-next" data-id="${t.id}" title="Play next">${I.skip}</button><button class="btn xs icon" data-act="track-edit" data-id="${t.id}" title="Edit">${I.edit}</button>${opts.remove?`<button class="btn xs icon red" data-act="pl-rm" data-id="${t.id}" title="Remove from playlist">${I.x}</button>`:''}</div></div>`;
pages.library = { async load(){ const q=state.search||''; const page=state._libPage||1; const sort=state._libSort||'title'; const [d, sum, scan] = await Promise.all([api(`/api/library?station=${S()}&q=${encodeURIComponent(q)}&page=${page}&per_page=50&sort=${sort}`), api('/api/media/summary'), api('/api/library/rescan')]); return {d, m:sum[S()], scan}; },
  view({d,m,scan}){ const sel=state.sel||new Set(); const q=state.search||'';
    return `<div class="page-h"><h2>Library</h2><span class="chip">${d.total} tracks</span><div class="right"><select class="sel" data-change="lib-sort" style="height:36px">${[['title','Title'],['artist','Artist'],['duration','Duration'],['plays','Most played'],['recent','Recently played']].map(([v,l])=>`<option value="${v}" ${(state._libSort||'title')===v?'selected':''}>${l}</option>`).join('')}</select><button class="btn sm" data-act="rescan" ${scan.running?'disabled':''}>${I.restart} ${scan.running?'Scanning…':'Rescan'}</button><button class="btn sm gold" data-act="upload-open">${I.upload} Upload Tracks</button><button class="btn sm" data-act="cover-bulk-open">${I.image} Upload Covers</button></div></div>
    <div class="grid cards eq" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      <div class="panel card"><div class="k">Catalog</div><div class="v"><span class="ic blue">${I.music}</span><span>${m.n} tracks</span></div><div class="d">${fmtBytes(m.b)} · ${fmtLong(m.d)} · ${m.corrupt||0} unreadable · ${m.disabled||0} disabled</div></div>
      <div class="panel card"><div class="k">Artwork</div><div class="v"><span class="ic gold">${I.image}</span><span>${m.ext||0} covers</span></div><div class="d">${m.emb||0} embedded · ${m.def_||0} using default</div></div>
      <div class="panel card"><div class="k">Formats</div><div class="v"><span class="ic cyan">${I.wave}</span><span style="font-size:14px">${m.formats.map(f=>`${h(f.format)} ${f.sample_rate/1000}k ×${f.n}`).join(', ')||'—'}</span></div><div class="d">WAV · MP3 · FLAC · M4A/AAC · OGG · OPUS</div></div>
    </div>
    ${q?`<div class="bulkbar">Search: <b>${h(q)}</b><button class="btn xs ghost" data-act="search-clear">${I.x} clear</button></div>`:''}
    ${sel.size?`<div class="bulkbar">${sel.size} selected <button class="btn xs" data-act="bulk-queue">${I.plus} Queue all</button><button class="btn xs" data-act="bulk-enable" data-v="1">Enable</button><button class="btn xs" data-act="bulk-enable" data-v="0">Disable</button><button class="btn xs" data-act="bulk-art" data-mode="auto">${I.image} Auto-match art</button><button class="btn xs" data-act="bulk-playlist">${I.list} Add to playlist…</button><button class="btn xs ghost" data-act="sel-clear" style="margin-left:auto">${I.x}</button></div>`:''}
    <div class="panel"><div class="panel-b" style="gap:0">${d.tracks.length?d.tracks.map(t=>trackRow(t)).join(''):empty(I.music, q?'No tracks match':'No media in this station yet', q?'Try a different search.':(S()==='afrobeats'?'Upload Afrobeats tracks to bring this station to life.':'Upload tracks to build the library.'), `<button class="btn sm gold" data-act="upload-open">${I.upload} Upload Tracks</button>`)}</div>
    <div class="panel-f"><span class="small muted">Page ${d.page} of ${Math.max(1,Math.ceil(d.total/d.per_page))}</span><span style="margin-left:auto;display:flex;gap:6px"><button class="btn xs" data-act="lib-page" data-p="${d.page-1}" ${d.page<=1?'disabled':''}>‹</button><button class="btn xs" data-act="lib-page" data-p="${d.page+1}" ${d.page*d.per_page>=d.total?'disabled':''}>›</button></span></div></div>`; } };
function trackModal(t){ return `<h3>${I.tag} Edit track<button class="btn xs ghost icon x" data-act="close-modal">${I.x}</button></h3>
  <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px"><img src="${artUrl(t)}?r=${Date.now()}" style="width:140px;height:140px;border-radius:12px;object-fit:cover;border:1px solid var(--line-gold)" alt=""><div style="flex:1;min-width:200px"><div class="small muted" style="margin-bottom:6px">Artwork: <b>${h(t.artwork_source||'default')}</b>${t.external_artwork?' · '+h(t.external_artwork.split('/').pop()):''}</div><div style="display:flex;gap:6px;flex-wrap:wrap"><label class="btn sm">${I.upload} Upload cover<input type="file" accept="image/*" class="hidden" data-change="cover-upload" data-id="${t.id}"></label><button class="btn sm" data-act="art-mode" data-id="${t.id}" data-mode="auto">${I.image} Auto match</button><button class="btn sm" data-act="art-mode" data-id="${t.id}" data-mode="default">Use default</button></div></div></div>
  <form data-form="track" data-id="${t.id}" class="form"><label>Title<input class="inp" name="title" value="${h(t.title)}"></label><label>Artist<input class="inp" name="artist" value="${h(t.artist)}"></label><label>Album / tagline<input class="inp" name="album" value="${h(t.album||'')}"></label><label>Genre<input class="inp" name="genre" value="${h(t.genre||'')}"></label>
  <div class="wide small muted">File: <span class="mono">${h(t.filename)}</span> · ${h(t.codec||'')} ${t.sample_rate?t.sample_rate/1000+' kHz':''} · ${fmtDur(t.duration)} · ${t.loudness_i!=null?t.loudness_i.toFixed(1)+' LUFS':'loudness pending'} · played ${t.play_count}×</div>
  <div class="row-actions"><button type="button" class="btn red" data-act="track-delete" data-id="${t.id}">${I.trash} Remove</button><span style="flex:1"></span><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn gold" type="submit">Save</button></div></form>`; }
/* uploads */
const UP = { items:[], running:false };
function uploadModal(){ const done=UP.items.filter(i=>i.status&&i.status!=='uploading'&&i.status!=='queued'); const sum={accepted:0,duplicate:0,unsupported:0,unreadable:0,error:0,art:0,def:0}; done.forEach(i=>{ sum[i.status]=(sum[i.status]||0)+1; if(i.track){ if(i.track.artwork_source==='external'||i.track.artwork_source==='embedded') sum.art++; else sum.def++; } });
  return `<h3>${I.upload} Upload tracks — ${h(st().short)}<button class="btn xs ghost icon x" data-act="close-modal">${I.x}</button></h3>
  <div class="dropzone" data-act="upload-pick" data-drop>${I.upload}<div><b>Drop audio files here</b> or tap to choose</div><div class="small muted2">WAV · MP3 · FLAC · M4A · AAC · OGG · OPUS · titles are cleaned automatically (e.g. "02_Abaamani_FINAL" → "Abaamani")</div><input type="file" multiple accept=".wav,.mp3,.flac,.m4a,.aac,.ogg,.opus,audio/*" class="hidden" id="upload-input" data-change="upload-files"></div>
  <div style="max-height:40vh;overflow:auto;margin-top:10px">${UP.items.map(i=>`<div class="upl" data-key="up-${i.key}"><span style="width:44%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${h(i.name)}">${h(i.track?i.track.title:i.name)}</span><span class="bar"><b style="width:${i.pct||0}%"></b></span><span class="st">${i.status==='uploading'?`${i.pct}%`:i.status==='queued'?'queued':i.status==='accepted'?'<span class="green">accepted</span>':i.status==='duplicate'?'<span class="amber">duplicate</span>':`<span class="red">${h(i.status)}</span>`}</span>${i.track?`<button class="btn xs icon" data-act="track-edit" data-id="${i.track.id}" title="Correct metadata">${I.edit}</button>`:''}</div>`).join('')}</div>
  ${done.length?`<div class="note" style="margin-top:10px"><b>${done.length} file${done.length===1?'':'s'} processed</b> — ${sum.accepted} accepted · ${sum.duplicate} duplicate · ${(sum.unsupported||0)+(sum.unreadable||0)+(sum.error||0)} rejected · ${sum.art} with artwork · ${sum.def} using default artwork${UP.running?' · uploading…':''}</div>`:''}
  <div class="row-actions" style="margin-top:10px"><button class="btn" data-act="close-modal">${UP.running?'Continue in background':'Done'}</button></div>`; }
async function runUploads(){ if(UP.running) return; UP.running=true; for(const it of UP.items){ if(it.status!=='queued') continue; it.status='uploading'; if(state.modal) render(); await new Promise(res=>{ const fd=new FormData(); fd.append('station', S()); fd.append('file', it.file, it.file.name); const x=new XMLHttpRequest(); x.open('POST','/api/library/upload'); x.upload.onprogress=e=>{ if(e.lengthComputable){ it.pct=Math.round(e.loaded/e.total*100); const b=document.querySelector(`[data-key="up-${it.key}"] .bar b`); if(b) b.style.width=it.pct+'%'; const s=document.querySelector(`[data-key="up-${it.key}"] .st`); if(s) s.textContent=it.pct+'%'; } }; x.onload=()=>{ try{ const r=JSON.parse(x.responseText); it.status=r.status||(x.status<300?'accepted':'error'); it.track=r.track; it.reason=r.reason; }catch{ it.status='error'; } res(); }; x.onerror=()=>{ it.status='error'; res(); }; x.send(fd); }); if(state.modal) render(); }
  UP.running=false; toast(`Upload finished: ${UP.items.filter(i=>i.status==='accepted').length} accepted`,'ok'); delete state.pageData.library; refresh(true); }
function queueFiles(files){ for(const f of files){ UP.items.push({key:Date.now()+'-'+Math.random().toString(36).slice(2,7), name:f.name, file:f, status:'queued', pct:0}); } render(); runUploads(); }
Object.assign(ACTIONS, {
  'lib-page': (el)=>{ state._libPage=Number(el.dataset.p); delete state.pageData.library; render(); }, 'search-clear': ()=>{ state.search=''; state._libPage=1; delete state.pageData.library; render(); },
  'rescan': ()=>act(()=>post('/api/library/rescan'),'Rescan started — loudness analysis takes a few minutes'),
  'track-edit': async(el)=>{ const row=(state.pageData.library&&state.pageData.library.d.tracks.find(x=>x.id===Number(el.dataset.id))) || (state.pageData.playlists&&state.pageData.playlists.tracks&&state.pageData.playlists.tracks.find(x=>x.id===Number(el.dataset.id))) || (UP.items.map(i=>i.track).find(x=>x&&x.id===Number(el.dataset.id))); if(row) modal(()=>trackModal(row)); else { const d=await api(`/api/library?station=${S()}&per_page=500`); const r2=d.tracks.find(x=>x.id===Number(el.dataset.id)); if(r2) modal(()=>trackModal(r2)); } },
  'track-enable': (el)=>{ const on=!el.classList.contains('on'); el.classList.toggle('on'); act(()=>patch(`/api/library/${el.dataset.id}`,{enabled:on})); },
  'track-delete': async(el)=>{ if(await confirmDlg('Remove this track from the library? The file is moved to .trash on the drive, not deleted.','Remove',true)) { const r=await act(()=>del(`/api/library/${el.dataset.id}`),'Track removed'); if(r) closeModal(); } },
  'art-mode': async(el)=>{ const r=await act(()=>post(`/api/library/${el.dataset.id}/artwork/${el.dataset.mode}`),'Artwork updated'); if(r){ delete state.pageData.library; const d=await api(`/api/library?station=${S()}&per_page=500`); const t=d.tracks.find(x=>x.id===Number(el.dataset.id)); if(t) modal(()=>trackModal(t)); } },
  'upload-open': ()=>modal(uploadModal), 'upload-pick': (el,e)=>{ if(e.target.closest('input')) return; document.getElementById('upload-input').click(); },
  'cover-bulk-open': ()=>modal(()=>`<h3>${I.image} Upload covers<button class="btn xs ghost icon x" data-act="close-modal">${I.x}</button></h3><div class="dropzone" data-act="cover-pick">${I.image}<div><b>Drop cover images here</b> or tap to choose</div><div class="small muted2">Name each image like its track (e.g. "Gokwa - Melodies.jpg"); matching is tolerant of spacing, case and shortened titles.</div><input type="file" multiple accept="image/*" class="hidden" id="cover-input" data-change="cover-files"></div><div id="cover-results" style="margin-top:10px"></div><div class="row-actions" style="margin-top:10px"><button class="btn" data-act="close-modal">Done</button></div>`),
  'cover-pick': (el,e)=>{ if(e.target.closest('input')) return; document.getElementById('cover-input').click(); },
  'sel-clear': ()=>{ state.sel=new Set(); render(); },
  'bulk-queue': async()=>{ for(const id of state.sel) await post(`${P()}/queue`,{track_id:id}).catch(()=>{}); toast(`${state.sel.size} tracks queued`,'ok'); state.sel=new Set(); refresh(true); },
  'bulk-enable': async(el)=>{ for(const id of state.sel) await patch(`/api/library/${id}`,{enabled:el.dataset.v==='1'}).catch(()=>{}); toast('Updated','ok'); state.sel=new Set(); delete state.pageData.library; refresh(true); },
  'bulk-art': async(el)=>{ let n=0; for(const id of state.sel){ const r=await post(`/api/library/${id}/artwork/${el.dataset.mode}`).catch(()=>null); if(r&&r.artwork_source!=='default') n++; } toast(`${n} covers matched`,'ok'); state.sel=new Set(); delete state.pageData.library; refresh(true); },
  'bulk-playlist': async()=>{ const pls=await api(`${P()}/playlists`); modal(()=>`<h3>${I.list} Add ${state.sel.size} tracks to playlist<button class="btn xs ghost icon x" data-act="close-modal">${I.x}</button></h3><div class="list">${pls.filter(p=>p.slug!=='all').map(p=>`<button class="row" data-act="bulk-playlist-go" data-id="${p.id}" style="border:0;background:none;text-align:left;width:100%"><span style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#1f3b5c,#0c1a2e);display:grid;place-items:center;color:var(--blue2);flex:none">${ic(I.list)}</span><div class="tt"><b>${h(p.name)}</b><span>${p.track_count} tracks</span></div>${ic(I.chev)}</button>`).join('')}</div>`); },
  'bulk-playlist-go': async(el)=>{ const r=await act(()=>post(`${P()}/playlists/${el.dataset.id}/tracks`,{track_ids:[...state.sel]}),'Added to playlist'); if(r){ state.sel=new Set(); closeModal(); } },
});
Object.assign(CHANGES, {
  'lib-sort': (el)=>{ state._libSort=el.value; state._libPage=1; delete state.pageData.library; render(); },
  'sel': (el)=>{ state.sel=state.sel||new Set(); el.checked?state.sel.add(Number(el.dataset.id)):state.sel.delete(Number(el.dataset.id)); render(); },
  'upload-files': (el)=>{ queueFiles([...el.files]); el.value=''; },
  'cover-upload': async(el)=>{ const f=el.files[0]; if(!f) return; const fd=new FormData(); fd.append('file',f); const r=await act(()=>api(`/api/library/${el.dataset.id}/artwork`,{method:'POST',body:fd}),'Cover uploaded'); if(r){ delete state.pageData.library; const d=await api(`/api/library?station=${S()}&per_page=500`); const t=d.tracks.find(x=>x.id===Number(el.dataset.id)); if(t) modal(()=>trackModal(t)); } },
  'cover-files': async(el)=>{ const box=document.getElementById('cover-results'); const files=[...el.files]; el.value=''; let m=0; for(const f of files){ const fd=new FormData(); fd.append('station',S()); fd.append('file',f); try{ const r=await api('/api/artwork/bulk',{method:'POST',body:fd}); if(r.status==='matched') m++; box.insertAdjacentHTML('beforeend',`<div class="upl"><span style="flex:1">${h(f.name)}</span><span class="st ${r.status==='matched'?'green':'amber'}">${r.status==='matched'?`matched ${r.matched_tracks.length}`:r.status}</span></div>`); }catch(e){ box.insertAdjacentHTML('beforeend',`<div class="upl"><span style="flex:1">${h(f.name)}</span><span class="st red">error</span></div>`); } } toast(`${m} of ${files.length} covers matched`,'ok'); delete state.pageData.library; refresh(true); },
});
Object.assign(FORMS, { 'track': async(f,b)=>{ const r=await act(()=>patch(`/api/library/${f.dataset.id}`,b),'Track updated'); if(r){ delete state.pageData.library; delete state.pageData.playlists; closeModal(); } } });
document.addEventListener('dragover', e=>{ const z=e.target.closest('[data-drop]'); if(z){ e.preventDefault(); z.classList.add('over'); } });
document.addEventListener('dragleave', e=>{ const z=e.target.closest('[data-drop]'); if(z) z.classList.remove('over'); });
document.addEventListener('drop', e=>{ const z=e.target.closest('[data-drop]'); if(!z) return; e.preventDefault(); z.classList.remove('over');
  const dropKind=z.dataset.dropKind; const files=[...e.dataTransfer.files]; if(!files.length) return;
  if(dropKind==='skin-visual'){ const f=files[0]; skinUploadAsset(f, f.type.startsWith('video')?'video':'image'); return; }
  if(dropKind==='skin-thumbnail'){ skinUploadAsset(files[0], 'thumbnail'); return; }
  queueFiles(files); });

/* ======================= PLAYLISTS ======================= */
pages.playlists = { async load(){ const pls=await api(`${P()}/playlists`); const sel = state._pl && pls.find(p=>p.id===state._pl) ? state._pl : (pls[0]||{}).id; state._pl=sel; const tracks = sel ? await api(`${P()}/playlists/${sel}/tracks`) : []; return {pls, tracks, cur:pls.find(p=>p.id===sel)||{}}; },
  view({pls,tracks,cur}){ const q=(state._plq||'').toLowerCase(); const sort=state._plSort||'position'; let list=tracks.filter(t=>!q||`${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q)); if(sort==='title') list.sort((a,b)=>a.title.localeCompare(b.title)); if(sort==='duration') list.sort((a,b)=>(b.duration||0)-(a.duration||0)); const core=['all','fallback','jingles','station-ids'].includes(cur.slug);
    const kindIcon={music:I.music,fallback:I.shield,jingles:I.megaphone,station_ids:I.megaphone};
    return `<div class="page-h"><h2>Playlists</h2><div class="right"><button class="btn sm gold" data-act="pl-new">${I.plus} New Playlist</button></div></div>
    <div class="pl-tiles" style="margin-bottom:12px">${pls.map(p=>`<a class="tile ${p.id===cur.id?'active':''}" href="#" data-act="pl-select" data-id="${p.id}" data-key="plt-${p.id}"><span class="ph">${kindIcon[p.kind]||I.list}</span><div class="n"><b>${h(p.name)}</b><span>${p.track_count} tracks · ${fmtLong(p.duration)} · ${h(p.mode)}${p.enabled?'':' · disabled'}</span></div></a>`).join('')}</div>
    <div class="panel"><div class="panel-h"><h3>${ic(kindIcon[cur.kind]||I.list)}${h(cur.name||'')}</h3><span class="right">${pill(cur.enabled?'on':'off',cur.enabled?'enabled':'disabled')}${pill('blue',cur.mode||'')}<button class="btn xs" data-act="pl-edit" data-id="${cur.id}">${I.edit}</button>${core?'':`<button class="btn xs red" data-act="pl-del" data-id="${cur.id}">${I.trash}</button>`}</span></div>
    <div class="panel-b" style="gap:8px"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><div class="search" style="flex:1;min-width:160px">${I.search}<input placeholder="Filter this playlist…" value="${h(state._plq||'')}" data-input="pl-filter"></div><select class="sel" data-change="pl-sort" style="height:36px">${[['position','Playlist order'],['title','Title'],['duration','Duration']].map(([v,l])=>`<option value="${v}" ${sort===v?'selected':''}>${l}</option>`).join('')}</select>${cur.slug==='all'?'':`<button class="btn sm" data-act="pl-add-open">${I.plus} Add tracks</button>`}${['jingles','station_ids'].includes(cur.kind)?`<button class="btn sm gold" data-act="upload-open">${I.upload} Upload ${cur.kind==='jingles'?'jingles':'station IDs'}</button>`:''}${cur.kind==='workout'?`<a class="btn sm gold" href="#/workout" data-act="pl-goto-workout" data-slug="${h(cur.slug)}">${I.mic} Create Workout Mix</a>`:''}</div>
      ${cur.description?`<div class="small muted">${h(cur.description)}${cur.slug==='all'?' — follows the library automatically.':''}</div>`:''}
      <div style="display:flex;flex-direction:column;max-height:65vh;overflow:auto">${list.length?list.map((t,i)=>trackRow({...t, idx:i}, {remove: cur.slug!=='all'})).join(''):empty(kindIcon[cur.kind]||I.list, cur.kind==='jingles'?'No jingles yet':cur.kind==='station_ids'?'No station IDs yet':'This playlist is empty', ['jingles','station_ids'].includes(cur.kind)?'Upload short idents to enable scheduled inserts between songs.':'Add tracks from the library to build this playlist.', ['jingles','station_ids'].includes(cur.kind)?`<button class="btn sm gold" data-act="upload-open">${I.upload} Upload</button>`:`<button class="btn sm gold" data-act="pl-add-open">${I.plus} Add tracks</button>`)}</div></div>
    <div class="panel-f small muted">${list.length} tracks shown · ${fmtLong(list.reduce((a,t)=>a+(t.duration||0),0))}${cur.mode==='sequential'?' · order = playlist position':''}</div></div>`; } };
/* Add Tracks modal — browses the real Library immediately (no search required first) and a
   From Playlist tab that imports membership references from another playlist (never copies
   files, never duplicates Library rows — playlist_add's INSERT OR IGNORE already makes
   re-adding an existing member a safe no-op, so "eligible" here is a UI/reporting concern,
   not a correctness one). */
const PL_ADD = { active:false, tab:'library', q:'', readyOnly:false, libTracks:[], loading:true,
  selected:new Set(), srcPlaylistId:null, srcTracks:[], srcLoading:false, srcSelected:new Set() };
function plAddHave(){ return new Set((state.pageData.playlists.tracks||[]).map(t=>t.id)); }
function plAddFilteredLib(){ const have=plAddHave(); const q=PL_ADD.q.trim().toLowerCase();
  return PL_ADD.libTracks.filter(t=>{ if(PL_ADD.readyOnly && !t.dj_bpm) return false;
    if(!q) return true;
    return `${t.title} ${t.artist||''} ${t.dj_key||''} ${t.dj_bpm||''} ${t.genre||''}`.toLowerCase().includes(q);
  }).map(t=>({...t, _already:have.has(t.id)})); }
function plAddRow(t, changeKey, selSet){ const already=t._already;
  return `<div class="row" data-key="pr-${t.id}">
    <input type="checkbox" ${already?'disabled':''} ${!already && selSet.has(t.id)?'checked':''} data-change="${changeKey}" data-id="${t.id}" aria-label="select ${h(t.title)}">
    <img class="th" src="${artUrl(t)}" loading="lazy" alt="">
    <div class="tt"><b>${h(t.title)}</b><span>${h(t.artist||'')}</span></div>
    <span class="small muted hide-m" style="width:110px;flex:none">${t.dj_bpm?Math.round(t.dj_bpm)+' BPM':'<span class="muted2">not analyzed</span>'}${t.dj_bpm&&t.dj_key?' · ':''}${t.dj_key?h(t.dj_key):''}</span>
    <span class="dur">${fmtDur(t.duration)}</span>
    <span class="acts"><button class="btn xs icon ${state.previewing===t.id?'gold':''}" data-act="preview" data-id="${t.id}" data-title="${h(t.title)}" title="Preview">${state.previewing===t.id?I.pause:I.play}</button>${already?pill('slate','Already added'):''}</span></div>`; }
function plAddModalHtml(){ const cur=state.pageData.playlists.cur;
  return `<h3>${I.plus} Add tracks to ${h(cur.name)}<button class="btn xs ghost icon x" data-act="close-modal">${I.x}</button></h3>
  <div class="seg" style="margin-bottom:10px"><button class="${PL_ADD.tab==='library'?'active':''}" data-act="pl-add-tab" data-v="library">Library Tracks</button><button class="${PL_ADD.tab==='playlist'?'active':''}" data-act="pl-add-tab" data-v="playlist">From Playlist</button></div>
  ${PL_ADD.tab==='library'?plAddLibraryTab():plAddPlaylistTab(cur)}`; }
function plAddLibraryTab(){
  if(PL_ADD.loading) return `<div class="small muted" style="padding:20px 0">Loading library…</div>`;
  const rows=plAddFilteredLib(); const n=PL_ADD.selected.size;
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
    <div class="search" style="flex:1;min-width:160px">${I.search}<input placeholder="Search title, artist, BPM, key…" value="${h(PL_ADD.q)}" data-input="pl-add-q" autofocus></div>
    <label class="small muted" style="display:flex;gap:6px;align-items:center;white-space:nowrap"><input type="checkbox" ${PL_ADD.readyOnly?'checked':''} data-change="pl-add-ready-only"> DJ ready only</label></div>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
    <span class="small muted">${rows.length} track${rows.length===1?'':'s'} shown</span>
    <button class="btn xs" data-act="pl-add-select-all">Select All Visible</button>
    <button class="btn xs ghost" data-act="pl-add-select-clear">Clear Selection</button>
    <span style="margin-left:auto" class="small ${n?'gold':'muted'}">${n} track${n===1?'':'s'} selected</span></div>
  <div class="list" style="max-height:46vh;overflow:auto;border-radius:10px">${rows.length?rows.map(t=>plAddRow(t,'pl-add-chk',PL_ADD.selected)).join(''):empty(I.music,'No matches','Try a different search.')}</div>
  <div class="row-actions" style="margin-top:12px"><button class="btn" data-act="close-modal">Cancel</button><button class="btn gold" data-act="pl-add-commit-lib" ${n?'':'disabled'}>${I.plus} Add ${n||''} Track${n===1?'':'s'}</button></div>`; }
function plAddPlaylistTab(cur){ const sources=state.pageData.playlists.pls.filter(p=>p.id!==cur.id);
  if(!PL_ADD.srcPlaylistId) return `<div class="list" style="max-height:52vh;overflow:auto">${sources.map(p=>`<button class="row" data-act="pl-add-src-select" data-id="${p.id}" style="border:0;background:none;text-align:left;width:100%;cursor:pointer"><span style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#1f3b5c,#0c1a2e);display:grid;place-items:center;color:var(--blue2);flex:none">${ic(I.list)}</span><div class="tt"><b>${h(p.name)}</b><span>${p.track_count} track${p.track_count===1?'':'s'}</span></div>${ic(I.chev)}</button>`).join('')}</div>`;
  const src=sources.find(p=>p.id===PL_ADD.srcPlaylistId);
  if(PL_ADD.srcLoading) return `<div class="small muted" style="padding:20px 0">Loading ${h(src?src.name:'')}…</div>`;
  const have=plAddHave(); const rows=PL_ADD.srcTracks.map(t=>({...t,_already:have.has(t.id)}));
  const eligible=rows.filter(t=>!t._already); const n=PL_ADD.srcSelected.size;
  return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><button class="btn xs ghost" data-act="pl-add-src-back">‹ Back</button><b style="font:800 14px var(--display)">${h(src?src.name:'')}</b><span class="small muted">${rows.length} tracks · ${eligible.length} eligible</span></div>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
    <button class="btn xs" data-act="pl-add-src-select-all">Select All Eligible</button>
    <button class="btn xs ghost" data-act="pl-add-src-select-clear">Clear Selection</button>
    <span style="margin-left:auto" class="small ${n?'gold':'muted'}">${n} track${n===1?'':'s'} selected</span></div>
  <div class="list" style="max-height:42vh;overflow:auto;border-radius:10px">${rows.length?rows.map(t=>plAddRow(t,'pl-add-src-chk',PL_ADD.srcSelected)).join(''):empty(I.music,'Empty playlist','This playlist has no tracks yet.')}</div>
  <div class="row-actions" style="margin-top:12px"><button class="btn" data-act="close-modal">Cancel</button><button class="btn" data-act="pl-add-src-all-eligible" ${eligible.length?'':'disabled'}>${I.plus} Add All Eligible (${eligible.length})</button><button class="btn gold" data-act="pl-add-commit-src" ${n?'':'disabled'}>${I.plus} Add ${n||''} Track${n===1?'':'s'}</button></div>`; }
function plModal(p){ p=p||{name:'',description:'',mode:'shuffle',kind:'music',enabled:1}; return `<h3>${I.list} ${p.id?'Edit':'New'} playlist<button class="btn xs ghost icon x" data-act="close-modal">${I.x}</button></h3><form data-form="playlist" data-id="${p.id||''}" class="form"><label>Name<input class="inp" name="name" value="${h(p.name)}" required></label><label>Kind<select class="sel" name="kind" ${p.id?'disabled':''}>${['music','jingles','station_ids','fallback'].map(k=>`<option ${p.kind===k?'selected':''}>${k}</option>`).join('')}</select></label><label class="wide">Description<input class="inp" name="description" value="${h(p.description||'')}"></label><label>Mode<select class="sel" name="mode">${['shuffle','sequential','weighted'].map(k=>`<option ${p.mode===k?'selected':''}>${k}</option>`).join('')}</select></label><label>Enabled<select class="sel" name="enabled"><option value="1" ${p.enabled?'selected':''}>Yes</option><option value="0" ${!p.enabled?'selected':''}>No</option></select></label><div class="row-actions"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn gold" type="submit">Save</button></div></form>`; }
Object.assign(ACTIONS, {
  'pl-select': (el)=>{ state._pl=Number(el.dataset.id); state._plq=''; delete state.pageData.playlists; render(); },
  'pl-goto-workout': (el)=>{ state._woForm = {workout_type:'general', intensity:'moderate', duration_choice:'5', custom_minutes:75,
    tempo_choice:'automatic', custom_pct:50, target_bpm:140, key_lock:true, ...(state._woForm||{}), playlist: el.dataset.slug}; },
  'pl-new': ()=>modal(()=>plModal(null)), 'pl-edit': (el)=>modal(()=>plModal(state.pageData.playlists.pls.find(p=>p.id===Number(el.dataset.id)))),
  'pl-del': async(el)=>{ if(await confirmDlg('Delete this playlist? Tracks stay in the library.','Delete',true)){ const r=await act(()=>del(`${P()}/playlists/${el.dataset.id}`),'Deleted'); if(r){ state._pl=null; delete state.pageData.playlists; render(); } } },
  'pl-rm': (el)=>act(()=>del(`${P()}/playlists/${state._pl}/tracks/${el.dataset.id}`)).then(()=>{ delete state.pageData.playlists; render(); }),
  'pl-add-open': async()=>{ Object.assign(PL_ADD,{active:true,tab:'library',q:'',readyOnly:false,loading:true,selected:new Set(),srcPlaylistId:null,srcTracks:[],srcLoading:false,srcSelected:new Set()});
    modal(()=>plAddModalHtml(),{wide:true});
    const d=await api(`/api/library?station=${S()}&per_page=1000`);
    PL_ADD.libTracks=d.tracks; PL_ADD.loading=false;
    if(state.modal) modal(()=>plAddModalHtml(),{wide:true}); },
  'pl-add-tab': (el)=>{ PL_ADD.tab=el.dataset.v; modal(()=>plAddModalHtml(),{wide:true}); },
  'pl-add-select-all': ()=>{ plAddFilteredLib().forEach(t=>{ if(!t._already) PL_ADD.selected.add(t.id); }); modal(()=>plAddModalHtml(),{wide:true}); },
  'pl-add-select-clear': ()=>{ PL_ADD.selected=new Set(); modal(()=>plAddModalHtml(),{wide:true}); },
  'pl-add-commit-lib': async()=>{ const ids=[...PL_ADD.selected]; if(!ids.length) return; PL_ADD.selected=new Set();
    await act(()=>post(`${P()}/playlists/${state._pl}/tracks`,{track_ids:ids}),`Added ${ids.length} track${ids.length===1?'':'s'}.`); },
  'pl-add-src-select': async(el)=>{ const pid=Number(el.dataset.id); PL_ADD.srcPlaylistId=pid; PL_ADD.srcLoading=true; PL_ADD.srcSelected=new Set();
    modal(()=>plAddModalHtml(),{wide:true});
    PL_ADD.srcTracks=await api(`${P()}/playlists/${pid}/tracks`); PL_ADD.srcLoading=false;
    if(state.modal) modal(()=>plAddModalHtml(),{wide:true}); },
  'pl-add-src-back': ()=>{ PL_ADD.srcPlaylistId=null; PL_ADD.srcTracks=[]; PL_ADD.srcSelected=new Set(); modal(()=>plAddModalHtml(),{wide:true}); },
  'pl-add-src-select-all': ()=>{ const have=plAddHave(); PL_ADD.srcTracks.forEach(t=>{ if(!have.has(t.id)) PL_ADD.srcSelected.add(t.id); }); modal(()=>plAddModalHtml(),{wide:true}); },
  'pl-add-src-select-clear': ()=>{ PL_ADD.srcSelected=new Set(); modal(()=>plAddModalHtml(),{wide:true}); },
  'pl-add-src-all-eligible': async()=>{ const have=plAddHave(); const eligible=PL_ADD.srcTracks.filter(t=>!have.has(t.id)).map(t=>t.id); const already=PL_ADD.srcTracks.length-eligible.length;
    if(!eligible.length){ toast('All tracks in this playlist are already in '+state.pageData.playlists.cur.name+'.'); return; }
    PL_ADD.srcSelected=new Set();
    await act(()=>post(`${P()}/playlists/${state._pl}/tracks`,{track_ids:eligible}),
      `Added ${eligible.length} track${eligible.length===1?'':'s'}.${already?` ${already} ${already===1?'was':'were'} already in ${state.pageData.playlists.cur.name}.`:''}`); },
  'pl-add-commit-src': async()=>{ const ids=[...PL_ADD.srcSelected]; if(!ids.length) return; PL_ADD.srcSelected=new Set();
    await act(()=>post(`${P()}/playlists/${state._pl}/tracks`,{track_ids:ids}),`Added ${ids.length} track${ids.length===1?'':'s'}.`); },
});
Object.assign(CHANGES, {
  'pl-filter': (el)=>{ state._plq=el.value; clearTimeout(state._plt); state._plt=setTimeout(()=>render(),120); }, 'pl-sort': (el)=>{ state._plSort=el.value; render(); },
  'pl-add-q': (el)=>{ PL_ADD.q=el.value; clearTimeout(state._pat); state._pat=setTimeout(()=>{ if(state.modal) modal(()=>plAddModalHtml(),{wide:true}); },120); },
  'pl-add-ready-only': (el)=>{ PL_ADD.readyOnly=el.checked; modal(()=>plAddModalHtml(),{wide:true}); },
  'pl-add-chk': (el)=>{ const id=Number(el.dataset.id); el.checked?PL_ADD.selected.add(id):PL_ADD.selected.delete(id); modal(()=>plAddModalHtml(),{wide:true}); },
  'pl-add-src-chk': (el)=>{ const id=Number(el.dataset.id); el.checked?PL_ADD.srcSelected.add(id):PL_ADD.srcSelected.delete(id); modal(()=>plAddModalHtml(),{wide:true}); },
});
Object.assign(FORMS, { 'playlist': async(f,b)=>{ b.enabled=b.enabled==='1'; const id=f.dataset.id; const r=await act(()=>id?put(`${P()}/playlists/${id}`,b):post(`${P()}/playlists`,b),'Playlist saved'); if(r){ delete state.pageData.playlists; closeModal(); } } });

/* ======================= QUEUE ======================= */
pages.queue = { live:true, async load(){ const [q,hist]=await Promise.all([api(`${P()}/queue`), api(`/api/history?station=${S()}&limit=30`)]); return {q,hist}; },
  view({q,hist}){ const s=st(); const np=s.now_playing; const prepared=s.prepared||[]; const planned=s.planned||[];
    // One list, in the actual order these will play: READY (Liquidsoap has it locked in) ->
    // QUEUED (your requests, which always jump ahead of rotation) -> PLANNED (the engine's
    // own rotation picks beyond that). No separate mental models to combine.
    const rows = [
      ...prepared.map((t,i)=>({t, st:'ready', i})),
      ...q.map((t,i)=>({t, st:'queued', i})),
      ...planned.map((t,i)=>({t, st:'planned', i})),
    ];
    const stPill = {ready:pill('on','READY'), queued:pill('blue','QUEUED'), planned:pill('gold','PLANNED')};
    const item=(row,pos)=>{ const {t,st,i}=row; const drag = st==='queued';
      return `<div class="row ${drag?'draggable':''}" data-key="up-${st}-${t.qid||t.id||i}" ${drag?`draggable="true" data-qid="${t.qid}"`:''}>${drag?`<span class="idx" style="cursor:grab">${I.grip}</span>`:`<span class="idx">${pos}</span>`}<img class="th" src="${t.track_id&&!t.id?`/api/library/${t.track_id}/artwork`:artUrl(t)}" loading="lazy"><div class="tt"><b>${h(t.title)}</b><span>${h(t.artist||'')}${t.requested_by?' · requested by '+h(t.requested_by)+' '+fmtTime(t.added_at):''}</span></div>${stPill[st]}<span class="dur">${t.duration!=null?fmtDur(t.duration):''}</span><span class="acts">${(t.id||t.track_id)?`<button class="btn xs icon" data-act="preview" data-id="${t.id||t.track_id}" data-title="${h(t.title)}" title="Preview">${state.previewing===(t.id||t.track_id)?I.pause:I.play}</button>`:''}${st==='queued'?`<button class="btn xs icon" data-act="q-move" data-qid="${t.qid}" data-dir="-1" ${i===0?'disabled':''}>${I.up}</button><button class="btn xs icon" data-act="q-move" data-qid="${t.qid}" data-dir="1" ${i===q.length-1?'disabled':''}>${I.down}</button><button class="btn xs icon red" data-act="q-del" data-qid="${t.qid}" title="Remove">${I.x}</button>`:''}${st==='planned'?`<button class="btn xs icon ghost" data-act="plan-del" data-idx="${i}" title="Remove from planned">${I.x}</button>`:''}</span></div>`; };
    const hitem=(t,i)=>`<div class="row" data-key="h-${t.id||i}"><span class="idx">${i+1}</span><img class="th" src="${artUrl(t)}" loading="lazy"><div class="tt"><b>${h(t.title)}</b><span>${h(t.artist||'')}</span></div><span class="dur">${t.started_at?fmtDate(t.started_at):''}</span><span class="acts">${(t.id||t.track_id)?`<button class="btn xs icon" data-act="preview" data-id="${t.id||t.track_id}" data-title="${h(t.title)}" title="Preview">${state.previewing===(t.id||t.track_id)?I.pause:I.play}</button><button class="btn xs icon" data-act="q-add" data-id="${t.id||t.track_id}" title="Queue again">${I.plus}</button><button class="btn xs icon gold" data-act="q-next" data-id="${t.id||t.track_id}" title="Play next">${I.skip}</button>`:''}</span></div>`;
    return `<div class="page-h"><h2>Queue</h2><span class="chip">${q.length} request${q.length===1?'':'s'}</span><div class="right"><a class="btn sm" href="#/library">${I.plus} Add from Library</a><button class="btn sm red" data-act="queue-clear" ${q.length?'':'disabled'}>${I.x} Clear</button></div></div>
    <div class="two"><div style="display:flex;flex-direction:column;gap:12px">
      <div class="panel hl"><div class="panel-h"><h3>${ic(I.play,'gold')}Now Playing</h3><span class="right">${h(np.source_label||'')}</span></div><div class="panel-b">${np.title?`<div class="row"><img class="th" src="${np.track_id?artUrl(np):ASSET.defaultArt}" style="width:56px;height:56px"><div class="tt"><b style="font-size:15px">${h(np.title)}</b><span>${h(np.artist||'')} · ${h(np.album||'')}</span></div><span class="dur" data-np-el>${fmtDur(np.elapsed)}</span><span class="acts"><button class="btn xs" data-act="skip">${I.skip} Skip</button></span></div><div class="progress" data-np><b style="width:${np.duration&&np.elapsed!=null?Math.min(100,np.elapsed/np.duration*100):0}%"></b><i style="left:${np.duration&&np.elapsed!=null?Math.min(100,np.elapsed/np.duration*100):0}%"></i></div>`:empty(I.music,'Nothing on air','Start the audio engine to begin playback.')}</div></div>
      <div class="panel"><div class="panel-h"><h3>${ic(I.queue,'gold')}Upcoming Playback${help('The actual expected play order: READY is what Liquidsoap already has locked in next; QUEUED are your requests, which always play before the engine resumes its own picks; PLANNED is the engine\'s rotation beyond that. This is one real list, not a guess.')}</h3><span class="right small">${rows.length} tracks</span></div><div class="panel-b"><div class="list" id="queue-list">${rows.length?rows.map((r,pos)=>item(r,pos+1)).join(''):empty(I.queue,'Nothing queued yet','The engine plans ahead once the scheduled playlist has tracks to draw from.')}</div></div>${q.length?'<div class="panel-f small muted">Drag a QUEUED row to reorder, or use the arrows. READY and PLANNED rows reflect the engine\'s own state.</div>':''}</div></div>
      <div class="panel"><div class="panel-h"><h3>${ic(I.clock)}Recently Played</h3></div><div class="panel-b"><div class="list">${hist.length?hist.map(hitem).join(''):empty(I.clock,'Nothing played yet','')}</div></div></div></div>`; },
  after(){ const list=document.getElementById('queue-list'); if(!list||list.dataset.dnd) return; list.dataset.dnd='1'; let dragEl=null;
    list.addEventListener('dragstart', e=>{ dragEl=e.target.closest('[draggable]'); if(dragEl){ dragEl.classList.add('drag'); e.dataTransfer.effectAllowed='move'; } });
    list.addEventListener('dragover', e=>{ e.preventDefault(); const over=e.target.closest('[draggable]'); list.querySelectorAll('.over').forEach(x=>x.classList.remove('over')); if(over&&over!==dragEl) over.classList.add('over'); });
    list.addEventListener('drop', e=>{ e.preventDefault(); const over=e.target.closest('[draggable]'); if(dragEl&&over&&over!==dragEl){ const items=[...list.querySelectorAll('[draggable]')]; const from=items.indexOf(dragEl), to=items.indexOf(over); if(from<to) over.after(dragEl); else over.before(dragEl); const order=[...list.querySelectorAll('[draggable]')].map(x=>Number(x.dataset.qid)); act(()=>post(`${P()}/queue/reorder`,{order})); } list.querySelectorAll('.over,.drag').forEach(x=>x.classList.remove('over','drag')); dragEl=null; });
    list.addEventListener('dragend', ()=>{ list.querySelectorAll('.over,.drag').forEach(x=>x.classList.remove('over','drag')); }); } };
Object.assign(ACTIONS, { 'plan-del': (el)=>act(()=>post(`${P()}/queue/planned/${el.dataset.idx}/remove`)) });

/* ======================= SOURCES ======================= */
/* Go Live From This Device — browser mic → PCM over an authenticated WebSocket → engine live input. */
const DJ = { ctx:null, stream:null, src:null, gain:null, proc:null, an:null, ws:null, monitor:null, level:0, state:'idle', device:'', devices:[], err:'', sent:0 };
async function djPrepare(deviceId){ try{ if(!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)) throw new Error('HTTPS_REQUIRED');
    djStopCapture(); DJ.state='asking'; djPaint();
    DJ.stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId: deviceId?{exact:deviceId}:undefined, echoCancellation:false, noiseSuppression:false, autoGainControl:false}, video:false});
    DJ.devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput'); DJ.device=DJ.stream.getAudioTracks()[0].getSettings().deviceId||deviceId||'';
    DJ.ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:48000}); DJ.src=DJ.ctx.createMediaStreamSource(DJ.stream); DJ.gain=DJ.ctx.createGain(); DJ.gain.gain.value=DJ.gainVal||1; DJ.an=DJ.ctx.createAnalyser(); DJ.an.fftSize=1024;
    DJ.proc=DJ.ctx.createScriptProcessor(4096,1,1); DJ.monitor=DJ.ctx.createGain(); DJ.monitor.gain.value=0;
    DJ.src.connect(DJ.gain); DJ.gain.connect(DJ.an); DJ.gain.connect(DJ.proc); DJ.proc.connect(DJ.monitor); DJ.monitor.connect(DJ.ctx.destination);
    DJ.proc.onaudioprocess=e=>{ const inp=e.inputBuffer.getChannelData(0); let s=0; for(let i=0;i<inp.length;i++) s+=inp[i]*inp[i]; DJ.level=Math.sqrt(s/inp.length); if(DJ.ws&&DJ.ws.readyState===1&&!DJ.muted){ const out=new Int16Array(inp.length); for(let i=0;i<inp.length;i++){ const v=Math.max(-1,Math.min(1,inp[i])); out[i]=v<0?v*32768:v*32767; } DJ.ws.send(out.buffer); DJ.sent+=out.byteLength; } const o=e.outputBuffer.getChannelData(0); o.set(DJ.muted?new Float32Array(inp.length):inp); };
    DJ.state='ready'; DJ.err=''; }catch(e){ if(e.message==='HTTPS_REQUIRED'){ DJ.state='insecure'; DJ.err='This page must be loaded over HTTPS (https://control.hungreegoat.com) for the browser to allow microphone access. HTTP over the LAN cannot request it.'; } else { DJ.state='error'; DJ.err=e.name==='NotAllowedError'?'Microphone permission was denied. Allow microphone access for this site in your browser settings and try again.':(e.message||String(e)); } } djPaint(); }
function djConnect(){ const rate=DJ.ctx?DJ.ctx.sampleRate:48000; const proto=location.protocol==='https:'?'wss':'ws'; DJ.ws=new WebSocket(`${proto}://${location.host}/api/stations/${S()}/dj/ws?rate=${rate}&channels=1`); DJ.ws.binaryType='arraybuffer'; DJ.state='connecting'; djPaint();
  DJ.ws.onopen=()=>{ DJ.state='streaming'; djPaint(); DJ.pingT=setInterval(()=>{ if(DJ.ws&&DJ.ws.readyState===1) DJ.ws.send('ping'); },4000); };
  DJ.ws.onmessage=e=>{ try{ const m=JSON.parse(e.data); if(m.error){ DJ.err=m.error; DJ.state='error'; djPaint(); } else { DJ.harbor=m.live; djPaint(); } }catch{} };
  DJ.ws.onclose=()=>{ clearInterval(DJ.pingT); if(DJ.state==='streaming'||DJ.state==='connecting'){ DJ.state=DJ.onAir?'error':'ready'; if(DJ.onAir) DJ.err='Connection to the station dropped — press Take Live again'; } djPaint(); }; }
function djStopCapture(){ try{ if(DJ.ws){ DJ.ws.close(); DJ.ws=null; } if(DJ.proc){ DJ.proc.disconnect(); DJ.proc.onaudioprocess=null; } if(DJ.stream) DJ.stream.getTracks().forEach(t=>t.stop()); if(DJ.ctx) DJ.ctx.close(); }catch{} DJ.ctx=DJ.stream=DJ.src=DJ.gain=DJ.proc=DJ.an=DJ.monitor=null; DJ.level=0; DJ.state='idle'; }
async function djTake(){ if(DJ.state!=='ready'&&DJ.state!=='streaming') return; if(!DJ.ws||DJ.ws.readyState!==1) djConnect(); const r=await act(()=>post(`${P()}/dj/take`,{live:true}),'Station is LIVE from this device'); if(r){ DJ.onAir=true; } djPaint(); }
async function djReturn(){ const r=await act(()=>post(`${P()}/dj/take`,{live:false}),'Returned to scheduled music'); if(r){ DJ.onAir=false; } if(DJ.ws){ DJ.ws.close(); DJ.ws=null; } if(DJ.state==='streaming') DJ.state='ready'; djPaint(); }
function djPaint(){ const box=document.getElementById('dj-panel'); if(!box) return;
  if(DJ.state==='idle' && !window.isSecureContext) DJ.state='insecure';
  const lvl=Math.min(100, DJ.level*250); const st=DJ.state; const onAir=DJ.onAir;
  const statusLabel={idle:'READY',insecure:'HTTPS REQUIRED',asking:'ASKING PERMISSION…',ready:'READY',connecting:'CONNECTING…',streaming:'RECEIVING AUDIO',error:'ERROR'}[st];
  const statusCls={streaming:'cyan',ready:'blue',connecting:'blue',error:'err',insecure:'warn'}[st]||'off';
  box.innerHTML=`<div class="chips"><span class="pill ${onAir?'on':'off'}">${onAir?'ON AIR — this device':'not on air'}</span><span class="pill ${statusCls}">${statusLabel}</span>${DJ.harbor?pill('on','engine receiving'):''}</div>
    ${st==='error'||st==='insecure'?`<div class="note ${st==='insecure'?'warn':'red'} small">${h(DJ.err||'Microphone unavailable.')}</div>`:''}
    ${st==='idle'||st==='error'?`<button class="btn gold" data-act="dj-prepare">${I.mic} Go Live From This Device</button><div class="small muted" style="margin-top:6px">Your browser will ask for microphone permission. Nothing goes on air until you press <b>Take Live</b>.</div>`:''}
    ${st==='insecure'?`<button class="btn" disabled>${I.mic} Go Live From This Device</button>`:''}
    ${(st==='ready'||st==='streaming'||st==='connecting')?`
      <label class="small muted">Microphone<select class="sel" data-change="dj-device" style="width:100%;margin-top:4px">${DJ.devices.map(d=>`<option value="${h(d.deviceId)}" ${d.deviceId===DJ.device?'selected':''}>${h(d.label||'Microphone')}</option>`).join('')}</select></label>
      <div class="small muted" style="margin-top:8px">Input level</div><div class="vu" id="dj-vu"><b style="width:${lvl}%"></b></div>
      <div class="rule"><span class="lbl">Gain</span><input type="range" min="0" max="2" step="0.05" value="${DJ.gainVal||1}" data-input="dj-gain" style="width:140px;accent-color:var(--gold)"><b class="small mono" style="width:36px;text-align:right">${((DJ.gainVal||1)*100).toFixed(0)}%</b></div>
      <div class="rule"><span class="lbl">Mute</span><span class="toggle ${DJ.muted?'on':''}" data-act="dj-mute"></span></div>
      <div class="rule"><span class="lbl">Headphone monitoring<small>hear yourself (use headphones to avoid feedback)</small></span><span class="toggle ${DJ.monitorOn?'on':''}" data-act="dj-monitor"></span></div>
      <div class="qa" style="margin-top:8px">${onAir?`<button class="btn amber" data-act="dj-return">${I.restart} Return to Scheduled Music</button>`:`<button class="btn green" data-act="dj-take">${I.stream} Take Live</button>`}<button class="btn" data-act="dj-stop">${I.x} Stop microphone</button></div>
      <div class="small muted2" style="margin-top:6px">${DJ.sent?`${(DJ.sent/1048576).toFixed(1)} MB sent`:''} · secure transport: ${location.protocol==='https:'?'wss (TLS)':'ws (LAN only — use HTTPS for production)'}</div>`:''}`; }
setInterval(()=>{ const vu=document.querySelector('#dj-vu b'); if(vu) vu.style.width=Math.min(100, DJ.level*250)+'%'; },80);
Object.assign(ACTIONS, { 'dj-prepare': ()=>djPrepare(), 'dj-take': ()=>djTake(), 'dj-return': ()=>djReturn(), 'dj-stop': ()=>{ if(DJ.onAir) djReturn(); djStopCapture(); djPaint(); }, 'dj-mute': ()=>{ DJ.muted=!DJ.muted; djPaint(); }, 'dj-monitor': ()=>{ DJ.monitorOn=!DJ.monitorOn; if(DJ.monitor) DJ.monitor.gain.value=DJ.monitorOn?1:0; djPaint(); } });
Object.assign(CHANGES, { 'dj-device': (el)=>djPrepare(el.value), 'dj-gain': (el)=>{ DJ.gainVal=+el.value; if(DJ.gain) DJ.gain.gain.value=DJ.gainVal; const b=el.nextElementSibling; if(b) b.textContent=(DJ.gainVal*100).toFixed(0)+'%'; } });

pages.sources = { view(){ const s=st(); const set=s.settings; const fb=s.fallback; const liq=s.liquidsoap; const np=s.now_playing;
  const onair=(k)=>np.source===k?['on','On air']:null;
  const card=(key,name,icon,cls,status,ready,prio,cfg,extra='')=>{ const whatIsIdx=cfg.findIndex(([k])=>k==='What it is'); const whatIs=whatIsIdx>=0?cfg[whatIsIdx][1]:''; const rest=whatIsIdx>=0?cfg.filter((_,i)=>i!==whatIsIdx):cfg;
    return `<div class="panel src-card ${np.source===key?'hl':''}" data-key="sc-${key}"><div class="panel-h"><h3>${ic(icon,cls)}${name}${whatIs?help(whatIs):''}</h3><span class="right">${pill(status[0],status[1])}</span></div><div class="panel-b"><div class="chips">${pill('blue','priority '+prio)}${pill(ready?'on':'off',ready?'ready':'not ready')}</div>${rest.length?`<dl class="kv small">${rest.map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`:''}${extra}</div></div>`; };
  setTimeout(djPaint,0);
  return `<div class="page-h"><h2>Sources</h2><span class="chip ${fb.forced?'amber':'green'}">${fb.forced?'FALLBACK FORCED':'Automation'}</span><div class="right"><button class="btn amber sm" data-act="fallback-toggle">${I.shield} ${fb.forced?'Release Fallback':'Force Fallback'}</button><button class="btn sm" data-act="skip">${I.skip} Skip Track</button></div></div>
  <div class="grid g-sources">
    <div class="grid eq g-auto" style="margin:0">
      ${card('live','Browser Microphone',I.mic,'blue', onair('live')||(set.live_mic_enabled?['blue',liq.live==='true'?'Connected':'Waiting for audio']:['off','Off']), liq.live==='true', 1, [['What it is','Use the microphone of this computer or phone as the live source of the station.']], `<div id="dj-panel" data-static></div>`)}
      ${card('main','Scheduled Playlist',I.cal,'gold', onair('main')||(liq.main==='true'?['blue','Standby']:['warn','Unavailable']), liq.main==='true', 3, [['Playlist',h(s.schedule.current?s.schedule.current.name:'Full library')],['Selection',set.sequential&&!set.shuffle?'sequential':'shuffle'+(set.weighted_rotation?' · weighted':'')],['What it is','Normal automated programming from your schedules and playlists.']])}
      ${card('remote','Remote Stream URL',I.link,'cyan', onair('remote')||(set.live_remote_enabled?['blue',liq.remote==='true'?'Connected':'Connecting']:['off','Off']), liq.remote==='true', 2, [['What it is','The station pulls an existing internet audio stream (MP3/AAC URL) and puts it on air.'],['URL',set.live_remote_url?`<span class="mono">${h(set.live_remote_url)}</span>`:'not configured']], `<form data-form="remote" style="display:flex;gap:6px;margin-top:6px"><input class="inp" name="url" placeholder="https://…/stream.mp3" value="${h(set.live_remote_url||'')}" style="flex:1;min-width:0"><button class="btn sm gold" type="submit">Save</button></form><div class="rules">${rule('live_remote_enabled', I.link, 'Put remote stream on air', set.live_remote_enabled, '', !set.live_remote_url)}</div>`)}
      ${card('backup','Backup Playlist',I.shield,'green', onair('backup')||(fb.backup.state==='ready'?['blue','Armed']:['warn','Unavailable']), fb.backup.state!=='unavailable', 4, [['What it is','Plays automatically if the scheduled source fails.'],['Playlist',h(fb.backup.name)]])}
      ${card('emergency','Emergency Loop',I.megaphone,'amber', onair('emergency')||(fb.emergency.state==='ready'?['blue','Armed']:['off','Empty']), fb.emergency.state==='ready', 5, [['What it is','Last-resort audio if both playlists fail.']], fb.emergency.state==='ready'?'':empty(I.megaphone,'No emergency audio','Drop a long instrumental loop into the fallback folder and rescan.'))}
      ${card('encoder','External Encoder',I.stream,'blue', set.live_mic_enabled?['blue','Accepting']:['off','Off'], true, 1, [['What it is','For DJ software or hardware encoders (BUTT, Mixxx, OBS…) that connect to the station like an Icecast server.']], `<details><summary class="link" style="cursor:pointer">Connection details</summary><dl class="kv small" style="margin-top:8px"><dt>Server</dt><dd class="mono">${h(location.hostname)}</dd><dt>Port</dt><dd class="mono">${s.live.live_port}</dd><dt>Mount</dt><dd class="mono">/live</dd><dt>User</dt><dd class="mono">source</dd><dt>Password</dt><dd>stored on the Pi in <span class="mono">secrets/live-${S()}.password</span> (ask your administrator)</dd><dt>Reach</dt><dd>LAN only until the live port is widened (data/live-bind-${S()} = 0.0.0.0)</dd></dl></details><div class="rules">${rule('live_mic_enabled', I.mic, 'Accept live connections', set.live_mic_enabled, 'Shared with Browser Microphone / DJ')}</div>`)}
    </div>
    <div class="panel"><div class="panel-h"><h3>${ic(I.sources)}Failover Chain</h3></div><div class="panel-b"><div class="chain">
      ${[['live','Live Override',set.live_mic_enabled||set.live_remote_enabled?'armed':'off'],['main','Scheduled Source',liq.main==='true'?'ready':'not ready'],['backup','Backup Playlist',fb.backup.state],['emergency','Emergency Loop',fb.emergency.state],['blank','Silence Protection','always']].map(([k,n,d],i)=>`${i?'<div class="arrow">↓</div>':''}<div class="node ${np.source===k||(k==='live'&&(np.source==='live'||np.source==='remote'))?'active':''}">${led(np.source===k||(k==='live'&&(np.source==='live'||np.source==='remote'))?'on':d==='ready'||d==='armed'?'blue':d==='always'?'cyan':d==='off'||d==='empty'?'':'warn')}<b>${n}</b><span class="small muted">${h(d)}</span></div>`).join('')}
    </div><div class="note small" style="margin-top:10px">A live input (microphone, remote stream or external encoder) always wins. If the scheduled source fails, the backup playlist takes over; then the emergency loop; the engine never drops the stream.</div></div></div>
  </div>`; }, after(){ djPaint(); } };
Object.assign(FORMS, { 'remote': (f,b)=>act(()=>post(`${P()}/settings`,{settings:{live_remote_url:b.url.trim()}}),'Remote URL saved') });

/* ======================= METADATA ======================= */
pages.metadata = { view(){ const s=st(); const np=s.now_playing; const set=s.settings; return `<div class="page-h"><h2>Metadata</h2></div>
  <div class="two"><div class="panel"><div class="panel-h"><h3>${ic(I.tag,'cyan')}On Air Now</h3></div><div class="panel-b"><div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap"><div class="art" id="np-art" data-static style="width:140px;height:140px"></div><dl class="kv" style="flex:1;min-width:200px"><dt>Title</dt><dd>${h(np.title||'—')}</dd><dt>Artist</dt><dd>${h(np.artist||'—')}</dd><dt>Album</dt><dd>${h(np.album||'—')}</dd><dt>Genre</dt><dd>${h(np.genre||'—')}</dd><dt>Source</dt><dd>${h(np.source_label)}</dd><dt>Artwork</dt><dd>${np.artwork?(np.artwork.includes('default')?'default cover':'matched cover'):'—'}</dd></dl></div>
    <div class="rules">${rule('artwork_sync', I.image, 'Artwork Sync', set.artwork_sync, 'Re-render the video overlay on track change')}${rule('metadata_rewrite', I.tag, 'Metadata Rewrite', set.metadata_rewrite, 'Catalog title/artist override file tags')}${rule('send_now_playing', I.send, 'Send Now-Playing', set.send_now_playing, 'Engine posts each track to Control')}</div>${np.track_id?`<div><button class="btn sm" data-act="track-edit" data-id="${np.track_id}">${I.edit} Edit this track</button></div>`:''}</div></div>
  <div class="panel"><div class="panel-h"><h3>${ic(I.image)}Video Overlay</h3></div><div class="panel-b"><div class="preview" data-static id="stream-preview"><img class="bg" src="${ASSET.loopFrame}" alt=""><img class="ov" id="preview-overlay" src="${P()}/overlay.png?t=${Math.floor(Date.now()/15000)}" alt=""><span class="lbl">OVERLAY</span></div><div class="note small">Artwork order: matched cover in <code>/media/hungree-goat/artwork</code> → embedded artwork → the HUNGREE Goat default cover. The overlay updates on the next track change after an edit.</div></div></div></div>`; }, after: pages.streams.after };

/* ======================= OUTPUTS ======================= */
pages.outputs = { live:true, async load(){ return api(`${P()}/outputs`); }, view(o){ const s=st(); const [lbl,cls]=streamState(s); const yt=o.youtube; const stream=s.stream;
  return `<div class="page-h"><h2>Outputs</h2><span class="chip ${cls==='on'?'green':cls==='err'?'red':cls==='warn'?'amber':'cyan'}">${lbl}</span></div>
  <div class="two"><div class="panel"><div class="panel-h"><h3>${ic(I.yt,'red')}YouTube Live — ${h(s.short)}</h3><span class="right">${yt.configured?pill('on','key present'):pill('warn','key missing')}</span></div><div class="panel-b">
    <dl class="kv"><dt>RTMPS</dt><dd class="mono">${h(yt.rtmps_url)}</dd><dt>State</dt><dd>${h(yt.state||'stopped')}${yt.last_error?` · <span class="amber">${h(yt.last_error)}</span>`:''}</dd><dt>Live</dt><dd>${yt.state==='running'&&yt.target==='youtube'?`${Math.round(yt.bitrate_kbps||0)} kbps · ${(yt.fps||0).toFixed(1)} fps · up ${fmtLong(yt.uptime_sec)}`:'—'}</dd><dt>Encoder</dt><dd>720p30 H.264 (hardware) · ${o.encoder.video_kbps} kbps · ${h(o.encoder.audio)}</dd></dl>
    <div class="rule"><span class="lbl">Output target</span><select class="sel" data-change="setting" data-key="output_target">${[['youtube','YouTube Live (RTMPS)'],['local','Local test file (FLV)'],['none','Encode only (no output)']].map(([v,l])=>`<option value="${v}" ${o.output_target===v?'selected':''}>${l}</option>`).join('')}</select></div></div>
    <div class="panel-f qa">${svcButtons(stream.service,{startAct:'stream-start',stopAct:'stream-stop',restartAct:'stream-restart',startDisabled:s.library.empty,startDisabledTitle:'Station library is empty — add media first'})}<a class="btn sm gold" href="#/youtube">${I.cog} YouTube Setup</a></div></div>
  <div class="panel"><div class="panel-h"><h3>${ic(I.stream,'blue')}Other Destinations</h3></div><div class="panel-b">
    <div class="out"><span class="ic cyan">${I.stream}</span><div class="n"><b>Local test output</b><span class="mono">${h(o.local_test.path)}</span></div>${o.output_target==='local'?pill('cyan','selected'):pill('off','off')}</div>
    <div class="out"><span class="ic blue">${I.headphones}</span><div class="n"><b>Listen Live (MP3 128k)</b><span>authenticated · ${h(location.origin)}/api/stations/${S()}/listen.mp3</span></div>${s.liquidsoap.alive?pill('on','ready'):pill('off','off')}</div>
    <div class="out"><span class="ic blue">${I.music}</span><div class="n"><b>Audio feed (loopback)</b><span class="mono">${h(o.harbor.url)}</span></div>${pill('blue','internal')}</div>
    <div class="out"><span class="ic slate" style="background:rgba(128,168,214,.1);color:var(--muted)">${I.link}</span><div class="n"><b>Icecast / Custom RTMP</b><span>Not configured in this build</span></div>${pill('off','unavailable')}</div>
    <div class="preview" style="margin-top:6px" data-static><img class="bg" src="${ASSET.loopFrame}" alt=""><img class="ov" src="${P()}/overlay.png?t=${Math.floor(Date.now()/15000)}" alt=""><span class="lbl">COMPOSITION</span></div></div></div></div>`; } };

/* ======================= YOUTUBE SETUP ======================= */
pages.youtube = { live:true,
  async load(){ const [yr, evr, oauthr, bcr] = await Promise.allSettled([api(`${P()}/youtube`), api(`/api/events?station=${S()}&limit=80`), api('/api/youtube/oauth/status'), api(`${P()}/youtube/broadcast`)]);
    // allSettled, not all: an events/OAuth hiccup (or an older backend missing a field) must
    // never blank the whole page — each half degrades to a safe empty value independently.
    // OAuth/broadcast state failing to load is treated exactly like "not connected"/"not
    // bound" — never a page-breaking error, since this is an optional feature.
    return { y: (yr.status==='fulfilled' && yr.value) ? yr.value : {}, ev: (evr.status==='fulfilled' && Array.isArray(evr.value)) ? evr.value : [],
      oauth: (oauthr.status==='fulfilled' && oauthr.value) ? oauthr.value : {connected:false, client_configured:false},
      broadcast: (bcr.status==='fulfilled' && bcr.value) ? bcr.value : {bound:false} }; },
  after(){ const b=(HGC.hist.yt||{})[S()]||{bitrate:[],speed:[]};
    HGC.drawLineChart(document.querySelector('canvas[data-ytchart="bitrate"]'), b.bitrate, {color:'#2ecc8a', fill:true, fmtY:v=>(v/1000).toFixed(1)+'M'});
    HGC.drawLineChart(document.querySelector('canvas[data-ytchart="speed"]'), b.speed, {color:'#ff5a6a', target:1.0, min:1.0, fmtY:v=>v.toFixed(1)+'×'}); },
  view({y, ev, oauth, broadcast}) {
  y = y || {}; ev = Array.isArray(ev) ? ev : []; oauth = oauth || {connected:false, client_configured:false}; broadcast = broadcast || {bound:false};
  const s=st(); const m=y.meta||{}; const show=state._showKey;
  // Defensive by design: this page must render something usable even when talking to an
  // older backend (no `health` key yet — e.g. right after a frontend-only deploy, before the
  // Control service has restarted to pick up its half of this redesign), or when any single
  // nested block below is missing, null, or malformed. Nothing here assumes a shape beyond
  // "y is an object" — every nested object gets its own safe default before first use.
  const healthAvailable = !!(y.health && typeof y.health === 'object');
  const H = y.health || {};
  const OV = (H.overall && typeof H.overall === 'object') ? H.overall : { level: 'unverified', title: 'Health Information Unavailable',
    message: "The Control service hasn't reported detailed health data for this station yet — this page usually needs the Control service to restart once after an update before this section fills in. Basic stream status below still reflects the real, current state." };
  const AR = (H.auto_recovery && typeof H.auto_recovery === 'object') ? H.auto_recovery
    : { armed: false, in_progress: false, layers: [], attempts_this_run: 0, lifetime_restarts_video: 0, lifetime_restarts_audio: 0, watchdog_timeout_sec: 60, last_error: null };
  const DG = (H.diagnostics && typeof H.diagnostics === 'object') ? H.diagnostics : {};
  const pipeline = Array.isArray(H.pipeline) ? H.pipeline : [];
  const encoder = (y.encoder && typeof y.encoder === 'object') ? y.encoder : { resolution: '—', fps: 30, video_kbps: 0, audio_kbps: 0 };
  const running = y.state==='running' && !y.stale; const speedN = (H.speed!=null) ? H.speed : null;
  const LVL_LABEL={healthy:'Healthy',warning:'Warning',critical:'Critical',offline:'Offline',unverified:'Unverified'};
  const LVL_ICON={healthy:I.check,warning:I.alert,critical:I.alert,offline:I.stop,unverified:I.info};
  const STAGE_HELP={music:"The part of the system that keeps your station's music playing.",
    audio:"This checks whether your music is successfully reaching the stream.",
    video:"This combines your audio and visuals into the live video stream.",
    bg:"This checks whether your looping background visuals are working properly.",
    send:"This shows whether HUNGREE Goat is trying to send the stream to YouTube.",
    receive:"This shows whether YouTube is actually receiving your stream.",
    live:"This shows whether your viewers can actually watch the stream live on YouTube."};
  const STAGE_LED={ok:'on',warn:'warn',err:'err',off:'',unverified:'cyan'};
  const stageCard = t => `<div class="pipe ${t.status}" data-key="pipe-${t.key}"><div class="h">${led(STAGE_LED[t.status]||'')}<span>${h(t.label)}</span>${STAGE_HELP[t.key]?help(STAGE_HELP[t.key]):''}</div><div class="d">${h(t.detail)}</div>${t.tech?`<div class="t" title="${h(t.tech)}">${h(t.tech)}</div>`:''}</div>`;
  const card = (cls,k,v,d_,icon,iconCls,helpTxt='') => `<div class="panel card ${cls}"><div class="k">${h(k)}${helpTxt?help(helpTxt):''}</div><div class="v"><span class="ic ${iconCls}">${icon}</span><span>${v}</span></div><div class="d">${d_}</div></div>`;
  const CLR={green:'onair',amber:'onair wait',red:'onair off',slate:''}; const ICN={green:'green',amber:'amber',red:'red',slate:''};

  const resLabel = {'1280x720':'720p HD','1920x1080':'1080p Full HD','854x480':'480p SD'}[encoder.resolution] || encoder.resolution;
  const smooth = !running ? ['—','slate'] : ((y.fps||0)>=encoder.fps*0.9 && (y.drop_frames||0)<5) ? ['Good','green'] : ((y.fps||0)>=encoder.fps*0.6) ? ['Fair','amber'] : ['Poor','red'];
  const speedLbl = !running||speedN==null ? ['—','slate'] : speedN>=0.97 ? ['Good','green'] : speedN>=0.85 ? ['Slightly Slow','amber'] : ['Too Slow','red'];
  const streamQ = !running ? ['Offline','slate'] : (smooth[1]==='red'||speedLbl[1]==='red') ? ['Poor','red'] : (smooth[1]==='amber'||speedLbl[1]==='amber') ? ['Fair','amber'] : ['Good','green'];
  const audioQ = running ? ['Good','green'] : ['—','slate'];

  const heroHtml = `<div class="panel yt-status ${OV.level}" data-key="yt-hero"><span class="ic badge-lvl ${ICN[{healthy:'green',warning:'amber',critical:'red',offline:'slate',unverified:'cyan'}[OV.level]]||''}">${LVL_ICON[OV.level]||I.info}</span>
    <div class="body"><span class="lvl-tag ${OV.level}">${h(LVL_LABEL[OV.level]||OV.level)}</span><h2>${h(OV.title)}</h2><p>${h(OV.message)}</p>
    <div class="yt-mini">
      <div class="m"><div class="k">Local Encoder Uptime</div><div class="v">${running?fmtLong(y.uptime_sec):'—'}</div></div>
      <div class="m"><div class="k">YouTube Live Duration</div><div class="v">${broadcast.lifecycle_status==='live'&&broadcast.actual_start_time?fmtLong(Math.max(0,Math.round((Date.now()-new Date(broadcast.actual_start_time).getTime())/1000))):'Unavailable'}</div></div>
      <div class="m"><div class="k">Auto-Recovery</div><div class="v">${AR.armed?(AR.in_progress?'Recovering…':'Armed'):'Disabled'}</div></div>
      <div class="m"><div class="k">Watchdog</div><div class="v">${AR.watchdog_timeout_sec}s</div></div>
    </div></div></div>`;
  // Real OAuth state, one of: not set up on this server / not connected / connected /
  // degraded (token exists but the API call is failing — e.g. a revoked refresh token).
  // Local streaming is never gated on any of this — see docs/youtube-oauth.md.
  const oauthHelp = "This connection lets HUNGREE Goat verify whether YouTube is actually receiving the stream and whether the broadcast is live.";
  let apiCardHtml;
  if (!oauth.client_configured) {
    apiCardHtml = `<div class="panel" data-key="yt-api"><div class="panel-b" style="gap:9px;justify-content:center">
      <div style="display:flex;align-items:center;gap:8px"><span class="ic amber">${I.alert}</span><b style="font:800 13.5px var(--display)">YouTube Account Integration</b><span class="right">${help(oauthHelp)}</span></div>
      <span class="pill off" style="align-self:flex-start">Not set up on this server</span>
      <p class="small muted" style="margin:0">Connecting a YouTube account lets HUNGREE Goat Control verify whether YouTube is actually receiving your stream and whether the broadcast is live — instead of only inferring it from the local encoder. This server doesn't have an OAuth client configured yet.</p>
      <a class="btn ghost wide" href="https://github.com/amaeteventurestudios/hungreegoat/blob/main/docs/youtube-oauth.md" target="_blank" rel="noopener">${I.link} Setup instructions <span class="pill off" style="margin-left:6px">docs/youtube-oauth.md</span></a>
    </div></div>`;
  } else if (!oauth.connected) {
    apiCardHtml = `<div class="panel" data-key="yt-api"><div class="panel-b" style="gap:9px;justify-content:center">
      <div style="display:flex;align-items:center;gap:8px"><span class="ic amber">${I.alert}</span><b style="font:800 13.5px var(--display)">YouTube Account Integration</b><span class="right">${help(oauthHelp)}</span></div>
      <span class="pill off" style="align-self:flex-start">Not connected</span>
      <p class="small muted" style="margin:0">Connecting your YouTube account lets HUNGREE Goat Control verify whether YouTube is actually receiving your stream and whether the broadcast is live.</p>
      <a class="btn gold wide" href="/api/youtube/oauth/connect">${I.link} Connect YouTube Account</a>
    </div></div>`;
  } else {
    const degraded = !!oauth.degraded;
    const verifiedAgo = oauth.last_verified ? Math.max(0, Math.round(Date.now()/1000 - oauth.last_verified)) : null;
    apiCardHtml = `<div class="panel" data-key="yt-api"><div class="panel-b" style="gap:9px;justify-content:center">
      <div style="display:flex;align-items:center;gap:8px"><span class="ic ${degraded?'amber':'green'}">${degraded?I.alert:I.check}</span><b style="font:800 13.5px var(--display)">YouTube Account Integration</b><span class="right">${help(oauthHelp)}</span></div>
      <span class="pill ${degraded?'amber':'green'}" style="align-self:flex-start">${degraded?'Connected — degraded':'Connected'}</span>
      <dl class="kv"><dt>Channel</dt><dd>${h(oauth.channel_title||'—')}</dd>${verifiedAgo!=null?`<dt>Last verified</dt><dd>${verifiedAgo}s ago</dd>`:''}${degraded?`<dt>Issue</dt><dd class="small" style="color:var(--red)">${h(oauth.error||'Reconnection may be needed')}</dd>`:''}</dl>
      <div class="row-actions">
        <button class="btn sm" type="button" data-act="yt-oauth-refresh">${I.restart} Refresh</button>
        ${degraded?`<a class="btn sm amber" href="/api/youtube/oauth/connect?reauthorize=1">${I.link} Reconnect</a>`:''}
        <button class="btn sm ghost red" type="button" data-act="yt-oauth-disconnect">Disconnect</button>
      </div>
    </div></div>`;
  }

  // Broadcast binding + gated Go Live — only shown once an account is actually connected.
  // Never invoked automatically: every transition requires an explicit operator click plus
  // confirmDlg(), same pattern already used for USB repair (see app.js).
  let goLiveHtml = '';
  if (oauth.connected) {
    const bound = !!broadcast.bound && !broadcast.stale;
    if (!bound) {
      const bindErr = y.youtube_bind_error && y.youtube_bind_error.reason;
      const reason = broadcast.stale ? 'The previous binding no longer matches the connected account (a different channel was connected) — re-bind to continue.'
        : (!y.configured ? 'Save a YouTube stream key for this station first (Stream URLs & Key, above), then bind it here.'
        : (bindErr || "This station hasn't been matched to a specific YouTube stream/broadcast yet."));
      goLiveHtml = `<div class="panel" data-key="yt-golive"><div class="panel-h"><h3>${ic(I.yt,'red')}Broadcast Lifecycle</h3><span class="right">${help("Shows the real YouTube broadcast bound to this station's stream key, and lets you move it through YouTube's own broadcast lifecycle.")}</span></div><div class="panel-b">
        <p class="small muted" style="margin:0 0 8px">${h(reason)}</p>
        <button class="btn sm" type="button" data-act="yt-rebind" ${y.configured?'':'disabled'}>${I.restart} ${broadcast.stale?'Re-bind':'Bind station to YouTube stream'}</button>
      </div></div>`;
    } else if (!broadcast.broadcast_id) {
      // Bound to a discovered liveStream, but no liveBroadcast is bound to it on YouTube's
      // side — nothing to transition yet. Distinct from "not bound" above: the stream match
      // itself is real and verified (ingest status still shown), there's just no broadcast.
      goLiveHtml = `<div class="panel" data-key="yt-golive"><div class="panel-h"><h3>${ic(I.yt,'amber')}Broadcast Lifecycle</h3><span class="right">${help("Shows the real YouTube broadcast bound to this station's stream key, and lets you move it through YouTube's own broadcast lifecycle.")}</span></div><div class="panel-b">
        <dl class="kv"><dt>Ingest status</dt><dd>${h(broadcast.stream_status||'—')}</dd></dl>
        <p class="small muted" style="margin:8px 0 0">This stream is verified, but isn't bound to any YouTube broadcast — create one in YouTube Studio and bound to this stream key, then Re-bind here.</p>
        <button class="btn sm ghost" type="button" data-act="yt-rebind" style="margin-top:8px">${I.restart} Re-bind</button>
      </div></div>`;
    } else if (broadcast.lifecycle_status === 'complete' || broadcast.lifecycle_status === 'revoked') {
      // Terminal state — YouTube will reject every transition from here (this is exactly the
      // 2026-09-20/21 incident: the old code showed this lifecycle while still enabling Start
      // Testing/Go Live, both of which the API correctly rejected as invalidTransition). No
      // transition button is ever shown for a terminal lifecycle, full stop.
      goLiveHtml = `<div class="panel" data-key="yt-golive"><div class="panel-h"><h3>${ic(I.yt,'red')}Broadcast Lifecycle</h3><span class="right">${pill('off',broadcast.lifecycle_status)}${help("Shows the real YouTube broadcast bound to this station's stream key, and lets you move it through YouTube's own broadcast lifecycle.")}</span></div><div class="panel-b">
        <dl class="kv"><dt>Ingest status</dt><dd>${h(broadcast.stream_status||'—')}</dd><dt>Lifecycle status</dt><dd>${h(broadcast.lifecycle_status)}</dd><dt>Broadcast ID</dt><dd class="mono small">${h(broadcast.broadcast_id||'—')}</dd></dl>
        <p class="small muted" style="margin:8px 0 0"><b>This YouTube broadcast has ended and cannot be restarted.</b> Create a new broadcast in YouTube Studio bound to this station's persistent stream, then Re-bind here — HUNGREE Goat never creates a broadcast on your channel automatically.</p>
        <button class="btn sm ghost" type="button" data-act="yt-rebind" style="margin-top:8px">${I.restart} Re-bind</button>
      </div></div>`;
    } else {
      const lifecycle = broadcast.lifecycle_status;
      const legal = broadcast.legal_transitions || [];
      const TRANSITIONS = [['testing','Start Testing'],['live','Go Live'],['complete','End Broadcast']];
      goLiveHtml = `<div class="panel" data-key="yt-golive"><div class="panel-h"><h3>${ic(I.yt,lifecycle==='live'?'green':'red')}Broadcast Lifecycle</h3><span class="right">${lifecycle?pill(lifecycle==='live'?'green':'amber',lifecycle):''}${help("Shows the real YouTube broadcast bound to this station's stream key, and lets you move it through YouTube's own broadcast lifecycle. Go Live and End Broadcast affect your real, public YouTube channel immediately.")}</span></div><div class="panel-b">
        <dl class="kv"><dt>Ingest status</dt><dd>${h(broadcast.stream_status||'—')}</dd><dt>Lifecycle status</dt><dd>${h(lifecycle||'—')}</dd><dt>Broadcast ID</dt><dd class="mono small">${h(broadcast.broadcast_id||'—')}</dd></dl>
        <div class="row-actions" style="margin-top:8px">${TRANSITIONS.map(([v,l])=>`<button class="btn sm ${v==='live'?'recover':v==='complete'?'ghost red':''}" type="button" data-act="yt-golive" data-status="${v}" ${legal.includes(v)?'':'disabled'}>${l}</button>`).join('')}
        <button class="btn sm ghost" type="button" data-act="yt-rebind">${I.restart} Re-bind</button></div>
        <div class="small muted" style="margin-top:8px">These buttons call the real YouTube Live Streaming API — Go Live and End Broadcast take effect on your actual channel immediately, and each requires a confirmation click. Only the transitions the backend confirms are legal from the current lifecycle are enabled — not just "not the current state."</div>
        ${!legal.length && lifecycle!=='live' ? `<p class="small muted" style="margin-top:8px">${lifecycle==='ready'||lifecycle==='created' ? 'Waiting for YouTube ingest to show active before any transition can be offered.' : ''}</p>` : ''}
      </div></div>`;
    }
  }

  const pipeHtml = `<div class="panel"><div class="panel-h"><h3>${ic(I.stream,'blue')}Pipeline Health</h3><span class="right">${help("The chain that turns your music into a live YouTube broadcast, stage by stage — from the local station right through to whether YouTube is actually airing it.")}</span></div><div class="panel-b">
    ${pipeline.length?`<div class="pipe-row">${pipeline.map(stageCard).join('')}</div>`:empty(I.info,'Waiting for stream health data','Stage-by-stage status isn\'t available from the Control service yet — this usually clears up on its own shortly after an update.')}
  </div></div>`;

  // "Reconnect to YouTube" is deliberately the exact same backend action as Danger Zone's
  // "Restart engine" (services.action("stream","restart",sid) — verified against
  // app/hgc/main.py's stream_action route and app/hgc/services.py's UNITS map): in this
  // architecture the RTMPS connection to YouTube is not a separable component — it lives
  // inside the same FFmpeg process that also does the audio/video encode, so there is no
  // finer-grained "just reconnect the YouTube leg" available yet. This panel exists so an
  // operator never has to know that and go digging in Danger Zone to fix a dropped YouTube
  // connection — the copy says plainly what actually restarts (video/YouTube process only;
  // Liquidsoap/music is untouched), rather than implying something lighter-weight.
  const sendStage = pipeline.find(p=>p.key==='send'); const bgStage = pipeline.find(p=>p.key==='bg');
  const sendOk = !!(sendStage && sendStage.status==='ok');
  const sendBad = !!(sendStage && (sendStage.status==='err'||sendStage.status==='warn'));
  // A restart command completing (act() resolving) doesn't mean the stream is back up yet —
  // FFmpeg starts in "starting" state for a few seconds. Rather than a separate timer, this
  // just re-checks on every render (the page already polls live data every 5s): once real
  // pipeline data confirms sending resumed, or 25s pass without that, resolve to a real
  // success/failure banner — never claiming success before the data actually shows it.
  if (state._reconnectPending) {
    if (sendOk) { state._reconnectResult = {ok:true, at:Date.now()}; state._reconnectPending = null; }
    else if (Date.now() - state._reconnectPending.since > 25000) { state._reconnectResult = {ok:false, at:Date.now(), error:'The stream did not come back up in time — check Diagnostics, or try again.'}; state._reconnectPending = null; }
  }
  if (state._reconnectResult && Date.now() - state._reconnectResult.at > 12000) state._reconnectResult = null;   // a one-off event, not a permanent panel state — real-time truth takes back over
  const recovering = !state._reconnecting && !state._reconnectPending && !!AR.in_progress;   // backend auto-recovery already restarting — never implies a manual click is also needed
  let connState;
  if (state._reconnecting || state._reconnectPending) connState = 'reconnecting';
  else if (recovering) connState = 'recovering';
  else if (state._reconnectResult) connState = state._reconnectResult.ok ? 'success' : 'failed';
  else if (!running) connState = 'stopped';
  else if (sendBad) connState = 'disconnected';
  else if (sendOk) connState = 'sending';
  else connState = 'stopped';
  // Real YouTube-backed semantic badge — never the vague "SENDING" when real API state is
  // available (see Part 7 of the 2026-09-20/21 incident follow-up): local delivery being fine
  // (connState sending/success) says nothing about whether YouTube is actually receiving or
  // airing it, which is exactly the contradiction this used to show ("YouTube Verification:
  // Verified" next to "YouTube confirmation unavailable" in the same panel).
  const ytVerified = !!broadcast.bound && !broadcast.stale && !!broadcast.connected && !broadcast.error;
  const ytSemanticLabel = () => {
    if (!ytVerified) return 'UNVERIFIED';
    if (broadcast.lifecycle_status === 'live') return 'LIVE';
    if (broadcast.lifecycle_status === 'complete' || broadcast.lifecycle_status === 'revoked') return 'COMPLETE';
    if (broadcast.stream_status === 'active') return 'RECEIVING';
    return 'DEGRADED';
  };
  const CONN_LABEL = {sending:ytSemanticLabel(),disconnected:'DISCONNECTED',reconnecting:'RECONNECTING',recovering:'RECOVERING',success:ytSemanticLabel(),failed:'RECONNECT FAILED',stopped:'STOPPED'};
  const outputLabel = (connState==='reconnecting'||connState==='recovering') ? ['Restarting','amber'] : (connState==='sending'||connState==='success') ? ['Sending','green'] : (connState==='disconnected'||connState==='failed') ? ['Not Sending','red'] : ['Not Sending','muted2'];
  const bgLbl = !healthAvailable ? ['Unavailable','muted2'] : bgStage ? (bgStage.status==='ok'?['Running','green']:(running?['Stopped','red']:['Unavailable','muted2'])) : ['Unavailable','muted2'];
  const elapsedS = state._reconnecting ? Math.max(0,Math.round((Date.now()-state._reconnecting.since)/1000)) : state._reconnectPending ? Math.max(0,Math.round((Date.now()-state._reconnectPending.since)/1000)) : 0;
  const btnBusy = connState==='reconnecting';
  const btnDisabled = btnBusy || connState==='recovering' || !running;
  const btnCls = (connState==='disconnected'||connState==='failed') ? 'recover' : btnBusy||connState==='recovering' ? 'amber' : '';
  const btnLabel = btnBusy ? `Reconnecting…${elapsedS?` (${elapsedS}s)`:''}` : connState==='recovering' ? 'Auto-Recovery in Progress…' : connState==='failed' ? 'Try Again' : 'Reconnect to YouTube';
  // Real-state copy for the local-delivery-is-fine cases — never the old fixed "YouTube
  // confirmation unavailable" line once a real YouTube API connection actually confirms
  // (or contradicts) it. This was the exact contradiction flagged after the outage: this panel
  // said "confirmation unavailable" in the same render as Advanced Settings saying "Verified."
  const ytSendingNote = () => {
    if (!ytVerified) return `Sending locally — <b>YouTube confirmation unavailable.</b>`;
    if (broadcast.lifecycle_status === 'live') return `<b>${I.check} Local encoder is healthy. YouTube is receiving the stream and confirms the broadcast is live.</b>`;
    if (broadcast.lifecycle_status === 'complete' || broadcast.lifecycle_status === 'revoked') return `<b>${I.alert} Local encoder is running, but the bound YouTube broadcast has ended</b> — it cannot resume on its own. See Broadcast Lifecycle below.`;
    if (broadcast.stream_status === 'active') return `Local encoder is healthy. YouTube confirms it is receiving the stream (not live yet — see Broadcast Lifecycle below).`;
    return `<b>${I.alert} Local encoder is running, but YouTube is not currently confirming ingest.</b>`;
  };
  const stateNote = {
    sending: `<div class="note${ytVerified&&broadcast.lifecycle_status!=='live'&&broadcast.stream_status!=='active'?' warn':''}" style="margin-top:10px">${ytSendingNote()}</div>`,
    disconnected: `<div class="note red" style="margin-top:10px"><b>${I.alert} YouTube is not receiving the stream right now.</b><br>Your music can keep playing while HUNGREE Goat restarts the video/YouTube streaming process.</div>`,
    reconnecting: `<div class="note warn" style="margin-top:10px"><b><span class="spin" style="display:inline-flex">${I.restart}</span> ${state._reconnectPending?'Waiting for the stream to come back up…':'Restarting the video/YouTube streaming process…'}</b></div>`,
    recovering: `<div class="note warn" style="margin-top:10px"><b><span class="spin" style="display:inline-flex">${I.restart}</span> Auto-recovery is already restarting the stream…</b><br>Manual reconnect is disabled for a moment so we don't start a second, overlapping restart.</div>`,
    success: `<div class="note green" style="margin-top:10px"><b>${I.check} Local streaming output restarted successfully.</b><br>${ytSendingNote()}</div>`,
    failed: `<div class="note red" style="margin-top:10px"><b>${I.alert} Could not restart the YouTube streaming output.</b><br>${h((state._reconnectResult&&state._reconnectResult.error)||'')}</div>`,
    stopped: `<div class="note" style="margin-top:10px">Start the engine first — see Advanced Settings → Danger Zone.</div>`,
  }[connState] || '';
  const reconnectHtml = `<div class="panel yt-conn ${connState}" data-key="yt-reconnect"><div class="panel-h"><h3>${ic(I.link,{sending:'green',success:'green',disconnected:'red',failed:'red',reconnecting:'amber',recovering:'amber',stopped:''}[connState])}YouTube Connection</h3><span class="right"><span class="yt-conn-badge ${connState}">${CONN_LABEL[connState]}</span>${help("This shows whether HUNGREE Goat is sending the stream toward YouTube and lets you restart that connection if it stops working.")}</span></div><div class="panel-b">
    <dl class="kv"><dt>Engine</dt><dd>${running?'<span class="green">Running</span>':'<span class="red">Stopped</span>'}</dd><dt>Music</dt><dd>${s.liquidsoap.alive?'<span class="green">Playing</span>':'<span class="muted2">Not Playing</span>'}</dd><dt>Background Visuals</dt><dd><span class="${bgLbl[1]}">${bgLbl[0]}</span></dd><dt>Stream Output</dt><dd><span class="${outputLabel[1]}">${outputLabel[0]}</span></dd><dt>YouTube Verification</dt><dd>${ytVerified?'<span class="green">Verified</span>':'<span class="muted2">Unavailable</span>'}</dd></dl>
    ${stateNote}
    <button class="btn ${btnCls} wide" type="button" style="margin-top:10px" data-act="yt-reconnect" title="This restarts the video streaming connection. Your music keeps playing." ${btnDisabled?'disabled':''}>${btnBusy?`<span class="spin">${I.restart}</span>`:I.restart} ${btnLabel}</button>
    <div class="small muted" style="margin-top:8px">Restarts the video/YouTube streaming process only — Liquidsoap and your music are not affected. Same action as "Restart engine" in Advanced Settings → Danger Zone.${(y.restarts||0)>0?` Restarted ${y.restarts} time${y.restarts===1?'':'s'} this run.`:''}</div>
  </div></div>`;

  const metricsHtml = `<div class="panel"><div class="panel-h"><h3>${ic(I.cpu,'cyan')}Local Encoder Metrics</h3><span class="right">${help("These cards show how well the local streaming system is running — not what YouTube does with the stream once it leaves this building.")}</span></div><div class="panel-b">
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(148px,1fr))">
    ${card(CLR[streamQ[1]],'Stream Quality',streamQ[0],running?(streamQ[0]==='Poor'?'Needs attention':streamQ[0]==='Fair'?'Some issues detected':'Stable and steady'):'Not currently streaming',I.wave,ICN[streamQ[1]],'This shows how strong and stable the outgoing video stream is.')}
    ${card('','Video Quality',resLabel,`${encoder.fps} fps target · ${encoder.video_kbps} kbps`,I.image,'blue','This shows the picture quality viewers should receive.')}
    ${card(CLR[smooth[1]],'Video Smoothness',smooth[0],running?`${(y.fps||0).toFixed(1)} / ${encoder.fps} frames per second${(y.drop_frames||0)?` · ${y.drop_frames} dropped`:''}`:'—',I.bars,ICN[smooth[1]],'This shows whether the video is playing smoothly or dropping too many frames.')}
    ${card(CLR[speedLbl[1]],'Streaming Speed',speedLbl[0],running&&speedN!=null?`${Math.round(speedN*100)}% of realtime<br><span class="muted2" style="font-size:10px">Technical: ${speedN.toFixed(2)}× realtime</span>`:'—',I.restart,ICN[speedLbl[1]],'This shows whether the system is keeping up with live video in real time.')}
    ${card(CLR[audioQ[1]],'Audio Quality',audioQ[0],`${encoder.audio_kbps} kbps AAC · 48 kHz stereo`,I.headphones,ICN[audioQ[1]],'This shows the sound quality being sent with the stream.')}
    ${card('','Running Time',running?fmtLong(y.uptime_sec):'—',running?'since last (re)start':'not running',I.clock,'gold','This shows how long the current streaming process has been running.')}
    </div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(148px,1fr));margin-top:2px">
    ${card('','Output Bitrate',running?`${((y.bitrate_kbps||0)/1000).toFixed(1)}<small> Mbps</small>`:'—',running?`${Math.round(y.bitrate_kbps||0)} kbps`:'not streaming',I.stream,'blue','This shows how much video data is being sent each second.')}
    ${card('','Main Encoder PID',y.pid||'—','FFmpeg',I.cpu,'','This is the internal ID of the main streaming process. You normally do not need this number.')}
    ${card('','Background Visuals PID',DG.bg_pid||'—','BgFeeder helper',I.film,'','This is the internal ID of the helper that keeps the background visuals running.')}
    ${card('','Encoder Restarts',y.restarts||0,'this run',I.restart,(y.restarts||0)>0?'amber':'','This shows how many times the main streaming process restarted during this run.')}
    ${card('','Background Restarts',DG.bg_restarts||0,'this run',I.restart,(DG.bg_restarts||0)>0?'amber':'','This shows how many times the background-visual process restarted during this run.')}
    </div>
  </div></div>`;

  const chartsHtml = `<div class="two">
    <div class="panel"><div class="panel-h"><h3>${ic(I.bars,'green')}Output Bitrate<span class="small muted" style="font-weight:500;margin-left:4px">(last 30 min)</span></h3><span class="right">${help("This graph shows how much video data has been sent over the last 30 minutes.")}</span></div><div class="panel-b">
      <div class="mini-chart"><span class="chart-tag">${running?((y.bitrate_kbps||0)/1000).toFixed(1)+' Mbps':'—'}</span><canvas data-ytchart="bitrate"></canvas></div>
      <div class="small muted2">Recorded in this browser tab only — refreshing the page or reopening this later starts the graph over. Not stored on the server yet.</div>
    </div></div>
    <div class="panel"><div class="panel-h"><h3>${ic(I.restart,'cyan')}Realtime Speed<span class="small muted" style="font-weight:500;margin-left:4px">(last 30 min)</span></h3><span class="right">${help("This graph shows whether the stream is keeping up with real time. The dashed line is 1.0× — right on pace.")}</span></div><div class="panel-b">
      <div class="mini-chart"><span class="chart-tag">${running&&speedN!=null?speedN.toFixed(2)+'×':'—'}</span><canvas data-ytchart="speed"></canvas></div>
      <div class="small muted2">Recorded in this browser tab only — refreshing the page or reopening this later starts the graph over. Not stored on the server yet.</div>
    </div></div>
  </div>`;

  const relevant = (ev||[]).filter(e=>['stream','silence','fallback'].includes(e.category)).slice(0,14);
  const incidentHtml = `<div class="panel"><div class="panel-h"><h3>${ic(I.logs,'amber')}Incident Timeline</h3><span class="right">${help("This shows recent problems, warnings, recoveries, and important stream events — recorded on the server, so refreshing the page never loses the story.")}</span><a class="link" href="#/logs">View All ${I.chev}</a></div><div class="panel-b scroll" style="max-height:280px">
    ${relevant.length?`<div class="events">${relevant.map(evRow).join('')}</div>`:empty(I.check,'No incidents recently','Warnings, errors and recoveries for this station will show up here as they happen.')}
  </div></div>`;

  const myAlerts=(state.alerts.alerts||[]).filter(a=>a.station===S()); const activeAlerts=myAlerts.filter(a=>a.state!=='resolved'); const lastAlert=myAlerts[0];
  const notifHtml = `<div class="panel" data-key="yt-notif"><div class="panel-h"><h3>${ic(I.bell,activeAlerts.length?'red':'green')}Notifications</h3><span class="right">${activeAlerts.length?pill('err',activeAlerts.length+' active'):pill('green','clear')}${help("This shows current warnings or problems that may need your attention.")}</span></div><div class="panel-b">
    ${activeAlerts.length?`<div class="note red">${activeAlerts.slice(0,3).map(a=>`<div style="margin-bottom:6px"><b>${h(a.title)}</b> — ${h(a.message)}<div class="small muted2">${fmtDate(a.updated_at||a.ts)}</div></div>`).join('')}</div>`:`<div class="note">No active warnings for this station.</div>`}
    <dl class="kv" style="margin-top:8px"><dt>Last alert</dt><dd>${lastAlert?fmtDate(lastAlert.updated_at||lastAlert.ts):'never'}</dd><dt>Recovery attempts</dt><dd>${AR.attempts_this_run} this run · ${AR.lifetime_restarts_video} lifetime</dd></dl>
    <button class="btn sm ghost wide" type="button" data-act="alerts-open">${I.bell} Open Alerts</button>
  </div></div>`;

  // AR.armed reflects a real, verified check the backend runs against the live systemd unit
  // (`systemctl show -p Restart`) — not a guess and not a hardcoded "true". If it's ever
  // false, that's a genuine finding (someone changed the unit file), not this page lying.
  const autorecHtml = `<div class="panel" data-key="yt-autorec"><div class="panel-h"><h3>${ic(I.shield,AR.armed?'green':'red')}Auto-Recovery & Watchdog</h3><span class="right">${AR.armed?(AR.in_progress?pill('warn','recovering'):pill('green','armed')):pill('err','disabled')}${help("This watches the stream and can help recover it when something stops working.")}</span></div><div class="panel-b">
    ${!AR.armed?`<div class="note red"><b>${I.alert} Auto-Recovery: Disabled</b><br>The stream won't restart itself if it fails — use Reconnect to YouTube above, or Danger Zone below, if it goes down.</div>`
      :AR.in_progress?`<div class="note warn"><b>${I.restart} Attempting reconnection…</b></div>`:(AR.last_error?`<div class="note small">Last issue: ${h(AR.last_error)}</div>`:'')}
    <dl class="kv" style="margin-top:8px"><dt>Attempts (this run)</dt><dd>${AR.attempts_this_run}</dd><dt>Lifetime restarts</dt><dd>${AR.lifetime_restarts_video} video · ${AR.lifetime_restarts_audio} audio</dd><dt>Stall watchdog</dt><dd>${AR.watchdog_timeout_sec}s of no progress</dd><dt>Restart delay</dt><dd>${AR.restart_sec_video||'?'} video · ${AR.restart_sec_audio||'?'} audio</dd></dl>
    <div class="small muted" style="margin-top:6px">${(Array.isArray(AR.layers)&&AR.layers.length)?AR.layers.map(l=>`<div style="margin-bottom:4px"><b style="color:var(--text)">${h((l&&l.name)||'')}:</b> ${h((l&&l.detail)||'')}</div>`).join(''):'No recovery details reported yet.'}</div>
  </div></div>`;

  const metaHtml = `<div class="panel" data-key="yt-meta"><div class="panel-h"><h3>${ic(I.tag)}YouTube & Broadcast Details</h3><span class="right">${pill('warn','reference only')}${help("This shows the basic information for your YouTube live broadcast.")}</span></div><div class="panel-b">
    <form data-form="youtube-meta" class="form">
    <label class="wide">Stream title<input class="inp" name="title" value="${h(m.title||'')}" placeholder="HUNGREE Goat ${h(s.short)} — 24/7 Study · Chill · Relax"></label>
    <label>Category<input class="inp" name="category" value="${h(m.category||'Music')}"></label>
    <label>Visibility<input class="inp" name="visibility" value="${h(m.visibility||'Public')}"></label>
    <label>Latency<input class="inp" name="latency" value="${h(m.latency||'Normal')}"></label>
    <label>Channel<input class="inp" name="channel" value="${h(m.channel||'')}" placeholder="e.g. HUNGREE Goat Music"></label>
    <div class="row-actions"><button class="btn sm gold" type="submit">Save details</button></div>
    </form>
  </div></div>`;

  const destHtml = `<div class="panel" data-key="yt-dest"><div class="panel-h"><h3>${ic(I.link,'blue')}Stream URLs & Key</h3><span class="right">${help("This contains the secure address and key used to send the stream to YouTube.")}</span></div><div class="panel-b">
    <form data-form="youtube" class="form">
    <label class="wide">RTMPS endpoint<div style="display:flex;gap:6px"><input class="inp mono" name="rtmps_url" value="${h(y.rtmps_url)}" required style="flex:1"><button type="button" class="btn icon" data-act="copy" data-copy="${h(y.rtmps_url)}" title="Copy">${I.copy}</button></div></label>
    <label class="wide">Stream key ${y.configured?`<span class="muted2">(currently ${h(y.key_masked)} — leave blank to keep)</span>`:''}<div style="display:flex;gap:6px"><input class="inp mono" name="stream_key" type="${show?'text':'password'}" placeholder="${y.configured?'••••••••••••••••':'paste the stream key from YouTube Studio'}" autocomplete="off" style="flex:1"><button type="button" class="btn icon" data-act="key-show" title="${show?'Hide':'Show'} while typing">${I.eye}</button></div></label>
    <label>Output<select class="sel" name="output_enabled"><option value="1" ${y.output_enabled?'selected':''}>Yes — publish to YouTube</option><option value="0" ${!y.output_enabled?'selected':''}>No — encode only</option></select></label>
    <div class="row-actions">${y.configured?`<button type="button" class="btn sm red ghost" data-act="yt-clear">${I.trash} Remove key</button>`:''}<button type="button" class="btn sm" data-act="yt-test" ${state._ytTesting?'disabled':''}>${I.link} ${state._ytTesting?'Testing…':'Test connection'}</button><button class="btn sm gold" type="submit">Save</button></div>
    </form>
    ${state._ytTesting?`<div class="note" style="margin-top:8px"><b>${I.info} Testing connection to YouTube…</b></div>`
      :state._ytTest?(state._ytTest.ok
        ? `<div class="note green" style="margin-top:8px"><b>${I.check} Connection test passed</b><br>Reached ${h(state._ytTest.host||'YouTube')} in ${state._ytTest.ms||'?'} ms. The network path is working.<div class="small" style="margin-top:5px;opacity:.85">This only proves HUNGREE Goat can reach YouTube's server. It does not prove the stream key is valid, that YouTube is receiving media, or that the broadcast is live.</div></div>`
        : `<div class="note red" style="margin-top:8px"><b>${I.alert} Connection test failed</b><br>${h(state._ytTest.error||'Could not reach YouTube. Check your network or stream settings.')}</div>`)
      :''}
    <div class="small muted" style="margin-top:6px">Stored on the server only (mode 600), never shown again after saving, never logged, never committed to Git.</div>
  </div></div>`;

  // A small card-panel factory so every Advanced Settings section uses the exact same
  // polished panel/header/help language as the rest of the dashboard, instead of the old
  // plain stacked-text blocks.
  const advCard = (icon, iconCls, title, helpTxt, bodyHtml, rightExtra='') =>
    `<div class="panel"><div class="panel-h"><h3>${ic(icon,iconCls)}${h(title)}</h3><span class="right">${rightExtra}${help(helpTxt)}</span></div><div class="panel-b">${bodyHtml}</div></div>`;

  const advHtml = `<details class="adv" data-key="yt-adv"${state._advOpen?' open':''}>
    <summary data-act="adv-toggle">${ic(I.cog)}<span style="flex:1">Advanced Settings</span>${help("These are extra controls for video, audio, recovery, YouTube connection, and troubleshooting.")}<span class="chev">${I.chev}</span></summary>
    <div class="adv-body">
      <div class="two">
        ${advCard(I.link,'blue','Stream Destination',"This is where HUNGREE Goat sends your live stream.",
          `<dl class="kv"><dt>Server</dt><dd class="mono small">${h(y.rtmps_url)}</dd><dt>Stream key</dt><dd class="mono">${y.configured?h(y.key_masked):'Not set'}</dd><dt>Destination</dt><dd>${(y.output_target||'youtube')==='youtube'?'YouTube Live':h(y.output_target)}</dd></dl>
          <div class="small muted" style="margin-top:8px">Edit these in the Stream URLs &amp; Key panel above.</div>`)}
        ${advCard(I.image,'cyan','Video Settings',"These settings control the picture quality and how smoothly the video plays.",
          `<dl class="kv"><dt>Video Quality</dt><dd>${h(resLabel)}</dd><dt>Frame Rate</dt><dd>${encoder.fps} frames/sec</dd><dt>Video Bitrate</dt><dd>${encoder.video_kbps} kbps</dd><dt>Keyframe Interval</dt><dd>2 seconds</dd></dl>
          <div class="small muted" style="margin-top:8px">Read-only — fixed in the station's profile, not editable from this page yet.</div>`)}
      </div>
      <div class="two">
        ${advCard(I.headphones,'gold','Audio Settings',"These settings control the sound quality of your live stream.",
          `<dl class="kv"><dt>Audio Quality</dt><dd>${encoder.audio_kbps} kbps</dd><dt>Sample Rate</dt><dd>48 kHz</dd><dt>Channels</dt><dd>Stereo</dd></dl>
          <div class="small muted" style="margin-top:8px">Read-only — fixed in the station's profile, not editable from this page yet.</div>`)}
        ${advCard(I.shield,AR.armed?'green':'red','Recovery Settings',"These settings control how HUNGREE Goat tries to recover when the stream stops working.",
          `<dl class="kv"><dt>Auto-Recovery</dt><dd>${AR.armed?'<span class="green">Enabled</span>':'<span class="red">Disabled</span>'}</dd><dt>Grace Period</dt><dd>${AR.watchdog_timeout_sec} seconds</dd><dt>Restart Delay</dt><dd>${AR.restart_sec_video||'?'} video · ${AR.restart_sec_audio||'?'} audio</dd><dt>Attempts This Run</dt><dd>${AR.attempts_this_run}</dd><dt>Lifetime Recoveries</dt><dd>${AR.lifetime_restarts_video} video · ${AR.lifetime_restarts_audio} audio</dd></dl>
          <div class="small muted" style="margin-top:8px">Fixed in the stream supervisor and systemd — not yet operator-configurable from here.</div>`)}
      </div>
      <div class="two">
        ${advCard(I.yt,oauth.connected?'green':'red','YouTube Connection',"This connection lets HUNGREE Goat verify whether YouTube is actually receiving the stream and whether the broadcast is live.",
          `<dl class="kv"><dt>Account Authorization</dt><dd>${oauth.connected?pill(oauth.degraded?'amber':'green',oauth.degraded?'degraded':'connected'):pill('off','not connected')}</dd><dt>YouTube Verification</dt><dd>${ytVerified?pill('green','bound'):pill('off','unavailable')}</dd><dt>Channel${(oauth.connected&&oauth.channel_title)?'':' <span class="muted2">(reference only)</span>'}</dt><dd>${h((oauth.connected&&oauth.channel_title)?oauth.channel_title:(m.channel||'—'))}</dd></dl>
          <div class="small muted" style="margin-top:8px">See the YouTube Account Integration card near the top of this page.</div>`)}
        ${advCard(I.cpu,'','Diagnostics',"This contains technical troubleshooting information. You normally will not need this unless something goes wrong.",
          `<dl class="kv"><dt>Main FFmpeg PID</dt><dd>${y.pid||'—'}</dd><dt>Background helper PID</dt><dd>${DG.bg_pid||'—'}</dd><dt>Dropped frames</dt><dd>${y.drop_frames||0}</dd><dt>Duplicate frames</dt><dd>${y.dup_frames||0}</dd><dt>Restart counters</dt><dd>${y.restarts||0} video (this run) · ${DG.bg_restarts||0} background</dd><dt>Status file</dt><dd class="mono small">${h(DG.status_file||'—')}</dd><dt>FFmpeg log</dt><dd class="mono small">${h(DG.ffmpeg_log||'—')}</dd></dl>
          <div class="row-actions" style="margin-top:8px"><button type="button" class="btn sm" data-act="yt-viewlog">${I.logs} View FFmpeg log</button><button type="button" class="btn sm ghost" data-act="yt-raw-toggle">${I.info} ${state._ytRaw?'Hide':'Show'} raw health JSON</button></div>
          ${state._ytRaw?`<pre class="raw">${h(JSON.stringify(H,null,2))}</pre>`:''}`)}
      </div>
      <div class="panel danger"><div class="panel-h"><h3>${ic(I.alert,'red')}Danger Zone</h3><span class="right">${help("These controls directly start, stop, or restart the streaming system. Viewers may be interrupted.")}</span></div><div class="panel-b">
        <div class="qa">${svcButtons(s.stream.service,{startAct:'stream-start',stopAct:'stream-stop',restartAct:'stream-restart',startDisabled:s.library.empty,startDisabledTitle:'Station library is empty — add media first',suffix:'engine'})}</div>
        <div class="small muted" style="margin-top:8px">Restart reconnects to YouTube from scratch — this is the same action as "Reconnect to YouTube" above, and restarts the video/YouTube streaming process only (Liquidsoap and your music are not affected). Stop ends the broadcast until you start it again. Both interrupt viewers briefly.</div>
      </div></div>
    </div></details>`;

  return `<div class="page-h"><h2>YouTube Setup</h2><span class="small muted">Monitors and manages ${h(s.name)}'s YouTube live stream — local encoder health, sending to YouTube, and what YouTube itself reports, kept separate on purpose.</span>
    <span class="right"><a class="btn sm ghost" href="https://studio.youtube.com" target="_blank" rel="noopener">${I.link} Open in YouTube Studio</a></span></div>
    <div class="grid yt-hero">${heroHtml}${apiCardHtml}</div>
    <div class="grid g-yt">
      <div style="display:flex;flex-direction:column;gap:var(--gap)">${reconnectHtml}${goLiveHtml}${pipeHtml}${metricsHtml}${chartsHtml}${incidentHtml}</div>
      <div style="display:flex;flex-direction:column;gap:var(--gap)">${notifHtml}${autorecHtml}${metaHtml}${destHtml}</div>
    </div>
    ${advHtml}`;
  } };
Object.assign(ACTIONS, {
  'key-show': ()=>{ state._showKey=!state._showKey; render(); },
  'copy': async(el)=>{ try{ await navigator.clipboard.writeText(el.dataset.copy||''); toast('Copied to clipboard','ok'); }catch(e){ toast('Could not copy — select and copy manually','err'); } },
  'adv-toggle': ()=>{ state._advOpen=!state._advOpen; render(); },
  'yt-raw-toggle': ()=>{ state._ytRaw=!state._ytRaw; render(); },
  'yt-viewlog': ()=>{ state._logSrc='ffmpeg'; state._logAll=false; location.hash='#/logs'; },
  // Connect/Reconnect are real <a href> navigations (see apiCardHtml) — a data-act fetch would
  // follow Google's redirect internally instead of actually navigating the browser there.
  'yt-oauth-refresh': async()=>{ await act(()=>api('/api/youtube/oauth/status?force=1'), null, {noRefresh:true}); delete state.pageData.youtube; render(); },
  'yt-oauth-disconnect': async()=>{ if(await confirmDlg('Disconnect the YouTube account? Local streaming is not affected — this only removes HUNGREE Goat\'s ability to verify YouTube-side status.','Disconnect',true)){ const r=await act(()=>post('/api/youtube/oauth/disconnect')); if(r){ delete state.pageData.youtube; render(); } } },
  'yt-rebind': async()=>{ const r=await act(()=>post(`${P()}/youtube/broadcast/rebind`),'Station bound to a discovered YouTube stream/broadcast'); if(r){ delete state.pageData.youtube; render(); } },
  'yt-golive': async(el)=>{ const status=el.dataset.status; const bc=(state.pageData.youtube&&state.pageData.youtube.broadcast)||{};
    const LABEL={testing:'start testing',live:'go LIVE on your real YouTube channel',complete:'end the broadcast'};
    if(!(await confirmDlg(`Are you sure you want to ${LABEL[status]||status}? This calls the real YouTube Live Streaming API immediately.`, status==='live'?'Go Live':'Confirm', status!=='testing'))) return;
    const r=await act(()=>post(`${P()}/youtube/broadcast/${bc.broadcast_id}/transition`,{status}), `Broadcast transitioned to ${status}`);
    if(r){ delete state.pageData.youtube; render(); } },
  // Same backend action as Danger Zone's "Restart engine" (see the comment above
  // reconnectHtml) — deliberately not a separate, lighter-weight endpoint that doesn't exist.
  // GUARDED_ACTIONS already blocks a second click while a request is in flight; this extra
  // check also blocks a manual reconnect while the backend's own auto-recovery is already
  // mid-restart (health.auto_recovery.in_progress) — belt-and-braces against ever issuing
  // two overlapping "systemctl restart" calls for the same unit (a restart storm).
  'yt-reconnect': async()=>{
    const yd = state.pageData.youtube && state.pageData.youtube.y;
    const inProgress = yd && yd.health && yd.health.auto_recovery && yd.health.auto_recovery.in_progress;
    if (state._reconnecting || state._reconnectPending || inProgress) { toast('A restart is already in progress.'); return; }
    state._reconnecting = {since: Date.now()}; state._reconnectResult = null; state._reconnectPending = null; render();
    const r = await act(()=>post(`${P()}/stream/restart`), 'Restart requested — waiting for the stream to come back up');
    state._reconnecting = false;
    if (r === null) state._reconnectResult = {ok:false, at:Date.now(), error:'Could not restart the streaming output — see the error above.'};
    else state._reconnectPending = {since: Date.now()};
    render();
  },
  'yt-clear': async()=>{ if(await confirmDlg('Remove the saved YouTube stream key? The output will stop publishing.','Remove key',true)){ const r=await act(()=>post(`${P()}/youtube`,{rtmps_url:state.pageData.youtube.y.rtmps_url, clear_key:true}),'Stream key removed'); if(r){ delete state.pageData.youtube; render(); } } },
  'yt-test': async()=>{ state._ytTesting=true; state._ytTest=null; render(); try{ state._ytTest=await post(`${P()}/youtube/test`); }catch(e){ state._ytTest={ok:false,error:e.message}; } state._ytTesting=false; render(); } });
Object.assign(FORMS, {
  'youtube': async(f,b)=>{ const body={rtmps_url:b.rtmps_url, output_enabled:b.output_enabled==='1'}; if(b.stream_key&&b.stream_key.trim()) body.stream_key=b.stream_key.trim(); const r=await act(()=>post(`${P()}/youtube`,body), body.stream_key?'Stream key saved — output restarting':'Saved'); if(r){ f.stream_key.value=''; state._showKey=false; delete state.pageData.youtube; render(); } },
  'youtube-meta': async(f,b)=>{ const r=await act(()=>post(`${P()}/youtube`,{rtmps_url:state.pageData.youtube.y.rtmps_url, meta:b}),'Broadcast details saved'); if(r){ delete state.pageData.youtube; render(); } } });

/* ======================= PLAYER SKINS ======================= */
const TIMES4=[['dawn','Dawn'],['afternoon','Afternoon'],['dusk','Dusk'],['night','Night']];
const ACCENT_PRESETS=[['Gold','#f2c14e'],['Blue','#4f8cff'],['Orange','#ff8a3d'],['Green','#2ecc8a'],['Teal','#38d6e8']];
/* Mirrors hgc/broadcast.py::local_path exactly — only a managed local video file (a bare
   filename under SKINS_DIR, not an image and not an externally-hosted URL) can ever be
   broadcast-eligible, so the bulk table never lets you flip on something the backend would
   reject anyway. */
const skinCanBroadcast=(s)=>!!(s.video && !/^https?:\/\//i.test(s.video));
const SKIN_MGMT={open:true,selected:new Set()};
function skinManageTableHtml(list){
  const e=SKIN_MGMT; const rows=list;
  const allChecked=rows.length>0 && rows.every(s=>e.selected.has(s.id));
  const row=(s)=>{ const bc=skinCanBroadcast(s);
    return `<div class="rule" data-key="mgmt-${s.id}" style="align-items:center">
      <input type="checkbox" data-act="skin-mgmt-sel" data-id="${s.id}" ${e.selected.has(s.id)?'checked':''} style="width:16px;height:16px;flex:none">
      <span class="preview" style="width:56px;height:35px;flex:none;border-radius:8px;overflow:hidden;position:relative">${(s.thumbnail||s.image)?`<img class="bg" src="${h(s.thumbnail||s.image)}" alt="" style="width:100%;height:100%;object-fit:cover">`:''}</span>
      <span class="lbl" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700">${h(s.name)}${s.default?` ${pill('gold','default')}`:''}</span>
      ${pill(s.source==='built-in'?'blue':'gold',s.source==='built-in'?'built-in':'custom')}
      <span class="small muted" style="width:76px;text-align:center;flex:none">Player</span><span class="toggle ${s.enabled?'on':''}" data-act="skin-toggle" data-id="${s.id}" title="Visible in Player"></span>
      <span class="small muted" style="width:86px;text-align:center;flex:none">Broadcast</span><span class="toggle ${s.broadcast_eligible?'on':''} ${bc?'':'disabled'}" data-act="skin-toggle-bc" data-id="${s.id}" title="${bc?'Use in YouTube broadcast rotation':'Needs a managed uploaded video (not an image, not externally-hosted) to be broadcast-eligible'}"></span>
    </div>`; };
  return `<div class="panel" style="margin-bottom:18px">
    <div class="panel-h" style="cursor:pointer" data-act="skin-mgmt-open"><h3 style="margin:0">${ic(I.image,'cyan')}Manage visibility${help('Quickly control which skins are visible in the Player and which are eligible for the YouTube broadcast rotation, across every skin at once — no need to open each one individually.')}</h3><button class="btn xs ghost icon" data-act="skin-mgmt-open">${e.open?I.up:I.down}</button></div>
    ${e.open?`<div class="panel-b">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
        <button class="btn xs" data-act="skin-mgmt-select-all">${allChecked?'Clear selection':'Select all'}</button>
        <span class="small muted">${e.selected.size} selected</span>
        <span style="flex:1"></span>
        <button class="btn xs" data-act="skin-mgmt-bulk" data-field="enabled" data-value="1" ${e.selected.size?'':'disabled'}>Enable selected for Player</button>
        <button class="btn xs ghost" data-act="skin-mgmt-bulk" data-field="enabled" data-value="0" ${e.selected.size?'':'disabled'}>Disable selected for Player</button>
        <button class="btn xs" data-act="skin-mgmt-bulk" data-field="broadcast_eligible" data-value="1" ${e.selected.size?'':'disabled'}>Enable selected for Broadcast</button>
        <button class="btn xs ghost" data-act="skin-mgmt-bulk" data-field="broadcast_eligible" data-value="0" ${e.selected.size?'':'disabled'}>Disable selected for Broadcast</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">${rows.map(row).join('')}</div>
    </div>`:''}
  </div>`;
}
/* ======================= MONITORING & ALERTS ======================= */
const MON_TABS = [['overview','Overview'],['monitors','Monitors'],['notifications','Notifications'],['alertrules','Alert Rules'],['incidents','Incident History'],['settings','Settings']];
const MON_RANGES = [['30m','30m'],['1h','1h'],['6h','6h'],['24h','24h'],['7d','7d']];
const MON_LVL_CLS = {healthy:'green', warning:'amber', critical:'red', offline:'off', unverified:'blue'};
const MON_SEV_CLS = {critical:'red', error:'red', warning:'amber', info:'blue'};
const monFresh = (tel) => {
  if (!tel || tel.freshness==='no_data') return pill('off', 'NO DATA' + (tel&&tel.last_sample_age_sec!=null?` — last sample ${fmtLong(tel.last_sample_age_sec)} ago`:' — no samples yet'));
  if (tel.freshness==='stale') return pill('amber', `STALE — last sample ${Math.round(tel.last_sample_age_sec)}s ago`);
  return pill('green', `LIVE · last sample ${Math.round(tel.last_sample_age_sec)}s ago · ${tel.sample_count} samples`);
};
const monStat = (label, stats, fmt) => `<div class="m"><div class="k">${label}</div><div class="v">${stats&&stats.current!=null?fmt(stats.current):'—'}</div><div class="small muted2">min ${stats&&stats.min!=null?fmt(stats.min):'—'} · avg ${stats&&stats.avg!=null?fmt(stats.avg):'—'} · max ${stats&&stats.max!=null?fmt(stats.max):'—'}</div></div>`;
// Incident messages can be a raw exception repr (e.g. a YouTube API HttpError with its full
// URL/JSON body) — scannable history needs the human gist, not a dumped stack trace; the full
// text is one click away in Logs → Events, never lost.
const monShortMsg = (msg) => { const s = String(msg||''); const cut = s.search(/\s*<HttpError|\s*Traceback/); const base = cut>0?s.slice(0,cut):s; return base.length>140?base.slice(0,137)+'…':base; };
// Cross-monitor correlation (Part 10 of the monitoring pass): HGC only ever has its OWN
// internal signal directly — it cannot see the external/local monitors' own last-check state
// (see docs/monitoring-alerts.md). This classifies from the one signal it does have, and is
// worded as evidence/hypothesis, never a claimed root cause it can't actually prove.
const monCorrelate = (ov) => {
  const bh = (ov.broadcast_health||{}).level;
  if (bh === 'healthy') return null;
  if (bh === 'critical' || bh === 'warning') return {cls: bh==='critical'?'red':'amber',
    title: 'Broadcast-side issue (confirmed from inside HGC)',
    body: 'HGC itself is reachable and reporting this — if the external (Hetzner) monitor ALSO reports an outage, that’s not a coincidence: something in the broadcast pipeline or the tunnel/gateway path is affected, not just one monitor’s perspective. If external and local monitors both stayed healthy while this fired, the issue is local to the encoder/YouTube state, not connectivity.'};
  return null;
};
pages.monitoring = { live:true,
  async load(){
    const range = state._monRange||'1h';
    const [ovR, rulesR, telR, alertsR] = await Promise.allSettled([
      api(`/api/monitoring/overview?station=${S()}`), api('/api/monitoring/rules'),
      api(`/api/monitoring/telemetry?station=${S()}&range=${range}`), api('/api/alerts?state=all&limit=200'),
    ]);
    return {
      ov: ovR.status==='fulfilled' ? ovR.value : null,
      rules: rulesR.status==='fulfilled' ? rulesR.value.rules : [],
      tel: telR.status==='fulfilled' ? telR.value : null,
      alerts: alertsR.status==='fulfilled' ? alertsR.value : {alerts:[], counts:{}},
    };
  },
  after(){
    const d = state.pageData.monitoring; if (!d || !d.tel) return;
    const pts = d.tel.points||[];
    HGC.drawLineChart(document.querySelector('canvas[data-monchart="fps"]'), pts.map(p=>p.fps), {color:'#4f8cff', target:30, fmtY:v=>v.toFixed(0)});
    HGC.drawLineChart(document.querySelector('canvas[data-monchart="speed"]'), pts.map(p=>p.speed), {color:'#ff5a6a', target:1.0, min:1.0, fmtY:v=>v.toFixed(1)+'×'});
    HGC.drawLineChart(document.querySelector('canvas[data-monchart="bitrate"]'), pts.map(p=>p.bitrate_kbps), {color:'#2ecc8a', fill:true, fmtY:v=>(v/1000).toFixed(1)+'M'});
  },
  view({ov, rules, tel, alerts}) {
  const tab = state._monTab||'overview';
  ov = ov || {};
  const card = (cls,k,v,d,icon,iconCls,helpTxt='') => `<div class="panel card ${cls}"><div class="k">${h(k)}${helpTxt?help(helpTxt):''}</div><div class="v"><span class="ic ${iconCls}">${icon}</span><span>${v}</span></div><div class="d">${h(String(d))}</div></div>`;
  const relevantCats = ['stream','silence','usb','youtube_ingest','youtube_lifecycle','test'];
  const relAlerts = (alerts.alerts||[]).filter(a=>relevantCats.includes(a.category));
  const openIncidents = relAlerts.filter(a=>a.state!=='resolved');
  const resolvedIncidents = relAlerts.filter(a=>a.state==='resolved');
  const bh = ov.broadcast_health || {level:'unverified', title:'Unknown', message:''};
  const corr = monCorrelate(ov);

  const tabsHtml = `<div class="mon-tabs">${MON_TABS.map(([v,l])=>`<button class="${tab===v?'active':''}" data-act="mon-tab" data-v="${v}">${l}</button>`).join('')}</div>`;
  const heroHtml = `<div class="mon-hero ${bh.level}"><span class="ic">${{healthy:I.check,warning:I.alert,critical:I.alert,offline:I.stop,unverified:I.info}[bh.level]||I.info}</span>
    <div class="body"><div class="lbl">Is HUNGREE Goat healthy right now?</div><h3>${h(bh.title)}</h3><p>${h(bh.message||'')}</p></div>
    <div class="meta">${ov.open_incident_count?`<div class="red" style="font-weight:700">${ov.open_incident_count} open incident${ov.open_incident_count===1?'':'s'}</div>`:'<div class="green" style="font-weight:700">All clear</div>'}<div>${fmtDate(Date.now()/1000)}</div></div>
  </div>`;

  let body = '';
  if (tab === 'overview') {
    body = `${heroHtml}
    ${corr?`<div class="note ${corr.cls==='red'?'red':'warn'}" style="margin-bottom:14px"><b>${I.alert} ${h(corr.title)}</b><br>${h(corr.body)}</div>`:''}
    <div class="mon-section-h">${ic(I.shield)}System State</div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      ${card('',"Monitoring",ov.monitoring_active?'Active':'Inactive','local watchdog',I.shield,ov.monitoring_active?'green':'red','Whether HGC\'s own background health/telemetry loop is running.')}
      ${card('',"External Monitor",'Configured','hetzner-usg · every 2 min',I.link,'green','Runs outside the house — the only monitor that can see a full home/power outage.')}
      ${card('',"Local Monitor",'Configured','pi-node-01 · every 2 min',I.link,'green','Checks Beelink directly over the LAN, bypassing the public gateway.')}
      ${card('',"Alerting",ov.alerting_armed?'Armed':'Off',ov.alerting_armed?'push via ntfy':'no topic configured',I.bell,ov.alerting_armed?'green':'red','Whether a push-notification channel is configured for outage/recovery alerts.')}
      ${card('',"Open Incidents",ov.open_incident_count||0,ov.open_incident_count?'needs attention':'all clear',I.alert,ov.open_incident_count?'red':'green','Currently open alerts across stream, silence, media, and YouTube monitoring.')}
      ${card('',"YouTube",ov.youtube?(ov.youtube.lifecycle_status||'—').toUpperCase():'—',ov.youtube&&ov.youtube.stream_status?`ingest ${ov.youtube.stream_status}`:'not connected',I.yt,ov.youtube&&ov.youtube.lifecycle_status==='live'?'green':'amber','Real YouTube API lifecycle and ingest status.')}
    </div>
    <div class="mon-section-h">${ic(I.cpu,'cyan')}Encoder &amp; Pipeline</div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
        ${card('','FPS',ov.encoder&&ov.encoder.fps!=null?ov.encoder.fps.toFixed(1):'—','target 30',I.bars,'','Frames per second currently being encoded.')}
        ${card('','Realtime Speed',ov.encoder&&ov.encoder.speed!=null?ov.encoder.speed.toFixed(2)+'×':'—','target 1.00×',I.restart,'','How closely the encoder is keeping pace with real time.')}
        ${card('','Output Bitrate',ov.encoder&&ov.encoder.bitrate_kbps!=null?(ov.encoder.bitrate_kbps/1000).toFixed(1)+' Mbps':'—','',I.stream,'','Current outgoing video bitrate.')}
        ${card('','Dropped Frames',ov.encoder?ov.encoder.drop_frames||0:'—','this run',I.alert,(ov.encoder&&ov.encoder.drop_frames)?'amber':'','Frames dropped by the encoder this run.')}
        ${card('','Liquidsoap',ov.liquidsoap_alive?'Running':'Stopped','audio engine',I.headphones,ov.liquidsoap_alive?'green':'red','Whether the audio engine process is alive.')}
        ${card('','Local Encoder Uptime',ov.encoder&&ov.encoder.uptime_sec?fmtLong(ov.encoder.uptime_sec):'—','since last (re)start',I.clock,'','How long the local FFmpeg process has been running — not the same as YouTube Live Duration.')}
        ${card('','Encoder Restarts',ov.encoder?ov.encoder.restarts||0:'—','this run',I.restart,(ov.encoder&&ov.encoder.restarts)?'amber':'','How many times the encoder restarted this run (watch for a restart storm).')}
    </div>
    <div class="mon-section-h">${ic(I.bars,'green')}Telemetry<span class="right" style="margin-left:auto"><span class="seg">${MON_RANGES.map(([v,l])=>`<button class="${(state._monRange||'1h')===v?'active':''}" data-act="mon-range" data-v="${v}">${l}</button>`).join('')}</span></span></div>
    <div class="panel"><div class="panel-b">
      ${tel?monFresh(tel):pill('off','NO DATA')}
      <div class="two" style="margin-top:10px">
        <div class="mini-chart"><span class="chart-tag">FPS</span><canvas data-monchart="fps"></canvas></div>
        <div class="mini-chart"><span class="chart-tag">Realtime Speed</span><canvas data-monchart="speed"></canvas></div>
      </div>
      <div class="mini-chart" style="margin-top:10px"><span class="chart-tag">Output Bitrate</span><canvas data-monchart="bitrate"></canvas></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:10px">
        ${monStat('FPS', tel&&tel.fps, v=>v.toFixed(1))}
        ${monStat('Realtime Speed', tel&&tel.speed, v=>v.toFixed(2)+'×')}
        ${monStat('Bitrate', tel&&tel.bitrate_kbps, v=>(v/1000).toFixed(2)+' Mbps')}
      </div>
    </div></div>`;
  } else if (tab === 'monitors') {
    const up = pill('green','healthy'); const unk = pill('off','—');
    const trow = (name, sub, status, target, tags) => `<tr><td><div class="row-title">${h(name)}</div><div class="row-sub">${h(sub)}</div></td><td>${status}</td><td class="mono small">${h(target)}</td><td>${tags.map(t=>`<span class="chip slate" style="margin-right:4px">${h(t)}</span>`).join('')}</td></tr>`;
    const section = (title, rows) => `<div class="mon-section-h">${h(title)}</div><div class="tblwrap"><table class="tbl"><thead><tr><th>Monitor</th><th>Status</th><th>Target</th><th>Tags</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    body = `
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:4px">
      ${card('','Total Monitors',11,'across 4 groups',I.list,'','Every check this page organizes into Public/Broadcast/Host/Secondary.')}
      ${card('',"Open Incidents",ov.open_incident_count||0,ov.open_incident_count?'needs attention':'all clear',I.alert,ov.open_incident_count?'red':'green','')}
      ${card('','Broadcast Health',bh.level.toUpperCase(),bh.title,I.stream,MON_LVL_CLS[bh.level],'')}
    </div>
    ${section('Public', [
      trow('API','api.hungreegoat.com/v1/*',up,'/v1/*',['public']),
      trow('Control','control.hungreegoat.com',up,'/api/*',['public','auth']),
      trow('Player','player.hungreegoat.com',unk,'vercel',['public']),
      trow('Broadcast Health Endpoint','semantic health',ov.broadcast_health?pill(MON_LVL_CLS[bh.level]||'off',bh.level):unk,'/v1/health/broadcast',['public']),
      trow('Reverse Tunnel','Beelink → gateway','healthy'===('healthy')?up:up,'hetzner-usg:18090',['internal']),
    ].join(''))}
    ${section('Broadcast', [
      trow('Liquidsoap','audio engine',ov.liquidsoap_alive?up:pill('red','down'),'liq.alive()',['broadcast']),
      trow('FFmpeg Process','video encoder',ov.encoder&&ov.encoder.state==='running'?up:pill('amber',ov.encoder?ov.encoder.state:'unknown'),'stream-lofi.json',['broadcast']),
      trow('FFmpeg Forward Progress','StallDetector',ov.encoder?pill('green','watched'):unk,'frame / out_time',['broadcast']),
      trow('Background Visuals','BgFeeder',up,'bg helper',['broadcast']),
      trow('YouTube Ingest','liveStream.status',ov.youtube?pill(ov.youtube.stream_status==='active'?'green':'amber',ov.youtube.stream_status||'unknown'):unk,'streamStatus',['broadcast','youtube']),
      trow('YouTube Broadcast','liveBroadcast.status',ov.youtube?pill(ov.youtube.lifecycle_status==='live'?'green':'amber',ov.youtube.lifecycle_status||'unknown'):unk,'lifeCycleStatus',['broadcast','youtube']),
    ].join(''))}
    ${section('Host', [
      trow('Beelink','this host',up,'ai-node-01',['host']),
      trow('CPU / RAM / Load / Disk','see Settings → System',pill('blue','see Settings'),'/api/overview',['host']),
    ].join(''))}
    ${section('Secondary Perspectives', [
      trow('Hetzner External Monitor','outside the house',unk,'hgc-monitor-external.sh',['secondary','external']),
      trow('Raspberry Pi Local Monitor','LAN-local',unk,'hgc-monitor-local.sh',['secondary','local']),
      trow('Pi → Beelink LAN','bypasses gateway',unk,'192.168.6.233:8090',['secondary','local']),
    ].join(''))}
    <p class="small muted2" style="margin-top:10px">"—" means HGC itself cannot see that monitor's own last-check time from here (it runs on a different host) — use Notifications → Send Test Push to verify the alert channel end-to-end.</p>`;
  } else if (tab === 'notifications') {
    const email = ov.email || {};
    body = `
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:4px">
      ${card('','Channels Armed', (ov.alerting_armed?1:0) + (email.configured?1:0), 'of 3 possible',I.bell,ov.alerting_armed?'green':'amber','')}
      ${card('','Push',ov.alerting_armed?'Available':'Off','ntfy.sh',I.bell,ov.alerting_armed?'green':'red','')}
      ${card('','Email',email.configured?'Available':'Not configured','Resend',I.alert,email.configured?'green':'amber','')}
      ${card('','SMS','Not configured','provider required',I.alert,'off','')}
    </div>
    <div class="mon-section-h">${ic(I.bell,'green')}Push — ntfy.sh</div>
    <div class="panel"><div class="panel-b">
      <dl class="kv"><dt>Status</dt><dd>${ov.alerting_armed?pill('green','Available'):pill('off','Not configured')}</dd><dt>Provider</dt><dd>ntfy (free, no account)</dd><dt>Server</dt><dd class="mono">https://ntfy.sh (default — no custom server needed)</dd></dl>
      <p class="small muted" style="margin-top:8px"><b>iPhone/Android setup:</b> 1) Install the free <b>ntfy</b> app &middot; 2) Tap <b>+</b> &middot; 3) <b>Add Subscription</b> &middot; 4) Enter the topic name from <code>~/hungree-goat/secrets/ntfy-topic.txt</code> (not shown here — treat it like a low-sensitivity credential, see docs/security.md) &middot; 5) Leave "Use another server" <b>off</b> &middot; 6) Subscribe &middot; 7) Allow notifications.</p>
      <button class="btn sm gold" type="button" data-act="mon-test" data-kind="push">${I.bell} Send Test Push</button>
    </div></div>
    <div class="mon-section-h">${ic(I.alert,'amber')}Email — Resend</div>
    <div class="panel"><div class="panel-b">
      <dl class="kv"><dt>Status</dt><dd>${email.configured?pill('green','Available'):pill('amber','Resend API key required')}</dd><dt>Sender</dt><dd class="mono">alerts@hungreegoat.com${email.domain_verified===false?' <span class="muted2">(domain not yet verified in Resend)</span>':''}</dd><dt>Destination</dt><dd class="mono">info@hungreegoat.com</dd></dl>
      <p class="small muted" style="margin-top:8px">${email.configured?'Configured and ready — 5-minute-unresolved escalation tier.':'No Resend API key found in <code>~/hungree-goat/secrets/resend-api-key.txt</code>. Provide one and this activates automatically — no other configuration needed.'}</p>
      ${email.configured?`<button class="btn sm" type="button" data-act="mon-test" data-kind="email">${I.alert} Send Test Email</button>`:''}
    </div></div>
    <div class="mon-section-h">${ic(I.alert,'amber')}SMS</div>
    <div class="panel"><div class="panel-b">
      <dl class="kv"><dt>Status</dt><dd>${pill('off','Provider required')}</dd><dt>Destination</dt><dd class="mono">+1 840-999-2755 (known — not the blocker)</dd></dl>
      <p class="small muted" style="margin-top:8px">No SMS provider (e.g. Twilio, Telnyx) is connected. Optional — does not block push or email. The escalation architecture below already has this tier's shape ready.</p>
    </div></div>
    <div class="mon-section-h">${ic(I.cog)}Escalation Policy</div>
    <div class="tblwrap"><table class="tbl"><thead><tr><th>Tier</th><th>Channel</th><th>Status</th></tr></thead><tbody>
      <tr><td>Immediate</td><td>Push (ntfy)</td><td>${ov.alerting_armed?pill('green','Available'):pill('off','Not configured')}</td></tr>
      <tr><td>5 min unresolved</td><td>Email (Resend)</td><td>${email.configured?pill('green','Available'):pill('amber','Key required')}</td></tr>
      <tr><td>10 min unresolved</td><td>SMS</td><td>${pill('off','Provider required')}</td></tr>
    </tbody></table></div>`;
  } else if (tab === 'alertrules') {
    const CAT_ICON = {youtube_ingest:I.yt, youtube_lifecycle:I.yt, stream_stall_heartbeat:I.stream, stream_stall_first:I.stream, stream_stall_forward:I.stream, liquidsoap_stall:I.headphones, silence:I.headphones, usb:I.db, speed_degraded:I.restart, drop_frames:I.bars};
    const nCrit = (rules||[]).filter(r=>r.severity==='critical').length;
    body = `
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:4px">
      ${card('','Total Rules',(rules||[]).length,'fixed defaults',I.list,'','')}
      ${card('','Active Rules',(rules||[]).length,'all evaluated every 15s',I.check,'green','')}
      ${card('','Critical',nCrit,'severity',I.alert,'red','')}
      ${card('','Warning',(rules||[]).length-nCrit,'severity',I.alert,'amber','')}
    </div>
    <div class="tblwrap"><table class="tbl"><thead><tr><th>Rule</th><th>Severity</th><th>Source</th><th>Status</th></tr></thead><tbody>
      ${(rules||[]).map(r=>`<tr><td><div class="row-title">${h(r.condition)}</div></td><td>${pill(r.severity==='critical'?'red':'amber',r.severity)}</td><td class="mono small muted2">${h(r.key)}</td><td>${pill('green','Active')}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="small muted2" style="margin-top:10px">Fixed sensible defaults for this release — thresholds live in code next to the checks they describe (<code>streamer.py</code>'s <code>StallDetector</code>, <code>main.py</code>'s watchdog) so they can never drift out of sync with what's actually evaluated. Operator-editable thresholds are a planned follow-up (see docs/monitoring-alerts.md), not built here — this list is real and live, not a mockup.</p>`;
  } else if (tab === 'incidents') {
    const trow = (a) => { const dur = a.resolved_at ? fmtLong(a.resolved_at - a.ts) : fmtLong(Date.now()/1000 - a.ts);
      return `<tr><td><div class="row-title">${h(a.title)}</div><div class="row-sub" title="${h(a.message)}">${h(monShortMsg(a.message))}</div></td><td>${pill(MON_SEV_CLS[a.severity]==='red'?'red':'amber',a.severity)}</td><td>${pill(a.state==='resolved'?'off':'blue', a.state==='resolved'?'Resolved':(a.state==='acknowledged'?'Monitoring':'Investigating'))}</td><td class="small">${fmtDate(a.ts)}</td><td class="small">${a.state==='resolved'?dur:dur+' (ongoing)'}</td><td class="small">${h(a.station||'system')}${a.count>1?` · ×${a.count}`:''}</td></tr>`; };
    body = `
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:4px">
      ${card('','Total Incidents',relAlerts.length,'stream/YouTube/media',I.logs,'','')}
      ${card('','Open',openIncidents.length,openIncidents.length?'needs attention':'all clear',I.alert,openIncidents.length?'red':'green','')}
      ${card('','Resolved',resolvedIncidents.length,'historical',I.check,'green','')}
    </div>
    <div class="mon-section-h">Open (${openIncidents.length})</div>
    ${openIncidents.length?`<div class="tblwrap"><table class="tbl"><thead><tr><th>Incident</th><th>Severity</th><th>Status</th><th>Started</th><th>Duration</th><th>Source</th></tr></thead><tbody>${openIncidents.map(trow).join('')}</tbody></table></div>`:empty(I.check,'No open incidents','')}
    <div class="mon-section-h">Resolved (${resolvedIncidents.length})</div>
    ${resolvedIncidents.length?`<div class="tblwrap"><table class="tbl"><thead><tr><th>Incident</th><th>Severity</th><th>Status</th><th>Started</th><th>Duration</th><th>Source</th></tr></thead><tbody>${resolvedIncidents.slice(0,30).map(trow).join('')}</tbody></table></div>`:empty(I.check,'No resolved incidents yet','')}
    <p class="small muted2" style="margin-top:10px">Reuses the existing events/alerts system (see docs/monitoring-alerts.md) — not a separate parallel log. Root cause is only ever shown when the underlying event message states it directly; nothing here is inferred or fabricated.</p>`;
  } else if (tab === 'settings') {
    body = `<div class="panel"><div class="panel-h"><h3>${ic(I.cog)}Monitoring Settings</h3></div><div class="panel-b">
      <p class="small muted">Full architecture, correlation model, and known gaps: <a class="link" href="https://github.com/amaeteventurestudios/hungreegoat/blob/main/docs/monitoring-alerts.md" target="_blank" rel="noopener">docs/monitoring-alerts.md</a>.</p>
      <h4 style="margin:14px 0 6px">Test &amp; Simulation</h4>
      <p class="small muted2" style="margin-bottom:8px">Simulations only write a clearly-labeled [TEST] entry to the event log and (for Down/Recovery) send a labeled test push — they never touch Liquidsoap, FFmpeg, or the real YouTube broadcast.</p>
      <div class="row-actions">
        <button class="btn sm" type="button" data-act="mon-test" data-kind="push">${I.bell} Send Test Push</button>
        <button class="btn sm ghost" type="button" data-act="mon-test" data-kind="simulate_down">${I.alert} Simulate Stream Down</button>
        <button class="btn sm ghost" type="button" data-act="mon-test" data-kind="simulate_warning">${I.alert} Simulate Warning</button>
        <button class="btn sm ghost" type="button" data-act="mon-test" data-kind="simulate_recovery">${I.check} Simulate Recovery</button>
      </div>
    </div></div>`;
  }

  return `<div class="page-h"><h2>Monitoring &amp; Alerts</h2><span class="small muted">Real, API-backed monitoring for the broadcast pipeline, YouTube state, and external reachability — not placeholder cards.</span></div>${tabsHtml}<div>${body}</div>`;
} };
Object.assign(ACTIONS, {
  'mon-tab': (el)=>{ state._monTab=el.dataset.v; render(); },
  'mon-range': (el)=>{ state._monRange=el.dataset.v; delete state.pageData.monitoring; render(); },
  'mon-test': async(el)=>{ const kind=el.dataset.kind; const labels={push:'Test push sent — check your phone',email:'Test email sent',simulate_down:'Simulated outage logged (TEST)',simulate_warning:'Simulated warning logged (TEST)',simulate_recovery:'Simulated recovery logged (TEST)'};
    const r = await act(()=>post(`/api/monitoring/test?station=${S()}`,{kind}), labels[kind]||'Done', {noRefresh:true});
    if (r) { delete state.pageData.monitoring; render(); } },
});

pages.skins = { async load(){ return api('/api/skins'); }, view(d){ const list=d.skins; const builtIn=list.filter(s=>s.source==='built-in'); const custom=list.filter(s=>s.source==='custom');
  const card=(s,i,arr)=>{ const cover=s.thumbnail||s.image;
    // A <video> at rest with no poster paints nothing (preload="metadata" never decodes a
    // frame until playback starts) — that black box was the reported bug. The resting card
    // visual is always a plain <img> against the best still available (thumbnail, else the
    // image asset, else — genuinely nothing — an explicit placeholder, never a misleading
    // blank rectangle); a <video> only exists for the hover-to-preview interaction, and only
    // once a cover image has already given the card something real to show.
    // The video sits absolutely over the (always-visible) img and only becomes opaque once
    // it actually has a frame to show, so hovering before it's buffered never flashes black.
    const visual = cover ? `<img class="bg" src="${h(cover)}" alt="">${s.video?`<video src="${h(s.video)}" muted loop playsinline preload="none" onmouseover="this.play().catch(()=>{})" onmouseout="this.pause()" onplaying="this.style.opacity=1" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .15s"></video>`:''}`
      : (s.video||s.image ? `<div class="ph">Processing thumbnail…</div>` : `<div class="ph">No scene asset yet — upload a video or image</div>`);
    return `<div class="panel" data-key="skin-${s.id}"><div class="preview" style="aspect-ratio:16/9;border-radius:16px 16px 0 0;border:0;position:relative">${visual}${s.default?'<span class="lbl">DEFAULT</span>':''}${s.enabled?'':'<span class="lbl" style="left:auto;right:8px">DISABLED</span>'}</div>
    <div class="panel-b"><b style="display:block;font:800 15px var(--display);margin-bottom:6px">${h(s.name)}</b><div class="chips">${pill(s.source==='built-in'?'blue':'gold',s.source==='built-in'?'built-in':'custom')}${s.broadcast_eligible?pill('cyan','broadcast'):''}${pill(s.video?'on':s.image?'blue':'off',s.video?'video':s.image?'image':'no asset')}${s.time_mode==='variants'?pill('cyan','time variants'):''}${Object.entries(s.ambience||{}).filter(([,v])=>v>0).map(([k,v])=>`<span class="chip slate">${h(k)} ${v}%</span>`).join('')}</div></div>
    <div class="panel-f"><button class="btn xs" data-act="skin-preview" data-id="${s.id}">${I.eye} Preview</button><button class="btn xs" data-act="skin-edit" data-id="${s.id}">${I.edit} Edit</button><button class="btn xs" data-act="skin-toggle" data-id="${s.id}">${s.enabled?'Disable':'Enable'}</button><button class="btn xs ${s.default?'gold':''}" data-act="skin-default" data-id="${s.id}">${s.default?'Default ✓':'Set default'}</button><button class="btn xs icon" data-act="skin-move" data-id="${s.id}" data-dir="-1" ${i===0?'disabled':''} title="Move up">${I.up}</button><button class="btn xs icon" data-act="skin-move" data-id="${s.id}" data-dir="1" ${i===arr.length-1?'disabled':''} title="Move down">${I.down}</button><button class="btn xs icon red" data-act="skin-del" data-id="${s.id}" style="margin-left:auto" title="Delete this skin and its uploaded assets">${I.trash}</button></div></div>`;
  };
  return `<div class="page-h"><h2>Player Skins</h2><div class="right"><button class="btn sm gold" data-act="skin-new">${I.plus} New Skin</button></div></div>
  <div class="panel" style="padding:16px 18px;margin-bottom:14px">
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
      <div style="flex:2;min-width:240px"><b style="font:800 16px var(--display)">Every scene your listeners can choose</b><p class="small muted" style="margin:6px 0 0;line-height:1.55">This page is the single source of truth for the visual scenes offered at <b class="gold">player.hungreegoat.com</b>. Enable, reorder, preview, set the default, or delete any scene here — including the ones HUNGREE Goat originally shipped with — and it changes the same way on the public player. There is no separate hidden list.</p></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><div class="stat" style="min-width:130px"><div class="k">Built-in scenes</div><div class="v gold">${d.built_in_count||0}</div></div><div class="stat" style="min-width:130px"><div class="k">Your uploaded skins</div><div class="v">${d.custom_count||0}</div></div></div>
    </div>
    <details style="margin-top:10px"><summary class="link small" style="cursor:pointer">Upload requirements & storage details</summary>
      <div class="small muted" style="margin-top:8px;line-height:1.6">
      <b>Video:</b> MP4 or WebM, recommended 1920×1080, a seamless 15–60 second loop, up to 40 MB.<br>
      <b>Still image:</b> 2560×1440 preferred.<br>
      <b>Thumbnail:</b> 640×400, PNG/JPEG/WebP — generate one automatically from the visual, or upload your own.<br>
      Assets are stored on the HUNGREE-GOAT drive under <span class="mono">/media/hungree-goat/skins/</span>; the manifest (<span class="mono">data/skins.json</span>) is included in the regular data backup. Changes reach the public player within about 30 seconds. A skin can also be marked for the YouTube broadcast — see <a class="link" href="#/broadcast">Broadcast Visuals</a>.</div></details>
  </div>
  ${skinManageTableHtml(list)}
  <h3 style="margin:0 0 8px;font:800 15px var(--display);display:flex;align-items:center;gap:8px">${ic(I.image,'blue')}ORIGINAL SKINS (${builtIn.length})${help('The scenes HUNGREE Goat first shipped with. They work exactly like any custom skin here — enable/disable, reorder, set a default, upload or replace their art, or delete them for good.')}</h3>
  <div class="grid eq" style="grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr));margin-bottom:18px">${builtIn.length?builtIn.map((s,i)=>card(s,i,builtIn)).join(''):`<div class="panel"><div class="panel-b">${empty(I.image,'No original skins left','Every scene this player shipped with has been deleted. Add one from scratch below.')}</div></div>`}</div>
  <h3 style="margin:0 0 8px;font:800 15px var(--display);display:flex;align-items:center;gap:8px">${ic(I.image,'gold')}MY SKINS <span class="muted" style="font-weight:600">/ CUSTOM (${custom.length})</span>${help('Scenes you have added yourself.')}</h3>
  <div class="grid eq" style="grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr))">${custom.length?custom.map((s,i)=>card(s,i,custom)).join(''):`<div class="panel"><div class="panel-b">${empty(I.image,'No custom skins yet','Add your own scene — a rooftop, a specific city, a mood — to extend the player.',`<button class="btn sm gold" data-act="skin-new">${I.plus} New Skin</button>`)}</div></div>`}</div>`; } };

/* ---- Skin editor: operator-friendly multi-section form, kept in local module state so
   uploads/ambience edits re-render the open modal without a full page reload. ---- */
const AMBLIST=Object.entries({cityTraffic:'City Traffic',cityRain:'City Rain',fireplace:'Fireplace',campfire:'Campfire',snow:'Snow',summerStorm:'Summer Storm',fan:'Fan',forestNight:'Forest Night',waves:'Waves',ocean:'Ocean',wind:'Wind',people:'People',river:'River',rainForest:'Rainforest',birds:'Birds'});
const SKIN_EDIT={active:false};
function skinEditOpen(s,isNew=false){ s=s||{}; Object.assign(SKIN_EDIT,{active:true,isNew,id:s.id||null,name:s.name||'',description:s.description||'',
  enabled:s.enabled!==false,default:!!s.default,accent:s.accent||'#f2c14e',video:s.video||null,image:s.image||null,thumbnail:s.thumbnail||null,
  time_mode:s.time_mode||'always',time_variants:JSON.parse(JSON.stringify(s.time_variants||{})),ambience:JSON.parse(JSON.stringify(s.ambience||{})),
  broadcastEligible:!!s.broadcast_eligible,previewTime:'afternoon',source:s.source||'custom',probe:null,saving:false});
  modal(()=>skinEditorHtml()); }
/* A video is only usable as a YouTube broadcast background if FFmpeg can read it as a
   local file on the Pi — true for anything uploaded through this editor, false for a
   scene whose visual is hosted externally (an absolute http(s) URL). Mirrors
   hgc/skins.py::_is_managed exactly, so the toggle is never shown as available when the
   backend would reject it anyway. */
const canBroadcast=(e)=>!!(e.video && !/^https?:\/\//i.test(e.video));
function skinEditorHtml(){ const e=SKIN_EDIT; const visUrl=e.video||e.image; const isVideo=!!e.video;
  const ambRows=Object.keys(e.ambience).filter(k=>AMBLIST.find(([kk])=>kk===k)).map(k=>{ const label=(AMBLIST.find(([kk])=>kk===k)||[k,k])[1];
    return `<div class="rule" data-key="amb-${k}"><span class="lbl" style="flex:0 0 130px">${h(label)}</span><input type="range" min="0" max="100" value="${e.ambience[k]}" data-input="skin-amb-vol" data-key="${k}" style="flex:1;accent-color:var(--gold)"><b class="small mono" style="width:38px;text-align:right">${e.ambience[k]}%</b><button type="button" class="btn xs icon ghost" data-act="skin-amb-rm" data-key="${k}">${I.x}</button></div>`; }).join('');
  const addable=AMBLIST.filter(([k])=>!(k in e.ambience));
  const previewSrc=(()=>{ if(e.time_mode==='variants'){ const v=e.time_variants[e.previewTime]; if(v&&(v.video||v.image)) return v.video||v.image; } return visUrl; })();
  return `<h3>${I.image} ${e.isNew?'New':'Edit'} skin<button class="btn xs ghost icon x" data-act="skin-cancel">${I.x}</button></h3>
  <div class="form" style="gap:16px">
    <div class="wide"><b style="font:700 12px var(--display);color:var(--gold3)">1 · SKIN IDENTITY</b></div>
    <label class="wide">Skin name<input class="inp" id="skin-name" value="${h(e.name)}" placeholder="Lagos rooftop" data-input="skin-field" data-key="name"></label>
    <label class="wide">Description <span class="muted2">(optional)</span><input class="inp" value="${h(e.description)}" placeholder="A quiet rooftop over Lagos at night" data-input="skin-field" data-key="description"></label>
    <div class="wide small muted2">An internal id is generated from the name automatically.</div>

    <div class="wide" style="margin-top:4px"><b style="font:700 12px var(--display);color:var(--gold3)">2 · SKIN MEDIA</b></div>
    ${isVideo?`
    <div class="wide small" style="font-weight:700;color:var(--gold3);text-transform:uppercase;letter-spacing:.04em">Video</div>
    <div class="wide" data-drop data-drop-kind="skin-visual"><div class="preview" style="aspect-ratio:16/9;max-width:420px"><video src="${h(e.video)}" ${e.thumbnail?`poster="${h(e.thumbnail)}"`:''} autoplay muted loop playsinline></video></div>
      <div class="small muted" style="margin-top:6px">This is the video currently attached to this skin.${e.probe?` ${e.probe.width&&e.probe.height?`${e.probe.width}×${e.probe.height} · `:''}${e.probe.duration?`${e.probe.duration}s · `:''}${fmtBytes(e.probe.bytes)} · ${h(e.probe.format).toUpperCase()} — ${e.probe.meets_recommended?'<span class="green">meets recommended specs</span>':'<span class="amber">below recommended specs (will still work)</span>'}`:''}</div>
      <div class="mediaActions">
        <label class="mediaAction" title="Upload or drop a replacement video here">${I.upload}<b>Replace Video</b><small>MP4 / WebM — or drag &amp; drop</small><input type="file" accept="video/mp4,video/webm" class="hidden" data-change="skin-visual" data-kind="video"></label>
      </div></div>
    `:`
    <div class="wide small" style="font-weight:700;color:var(--gold3);text-transform:uppercase;letter-spacing:.04em">Visual</div>
    <div class="wide" data-drop data-drop-kind="skin-visual"><div class="preview" style="aspect-ratio:16/9;max-width:420px">${e.image?`<img class="bg" src="${h(e.image)}" alt="">`:`<div class="ph">No visual uploaded yet — upload or drag one below</div>`}</div>
      ${e.image?`<div class="small muted" style="margin-top:6px">This is the still image currently attached to this skin (a static-image scene — most custom skins are video; see Broadcast Visuals for which types are broadcast-eligible).</div>`:''}
      <div class="mediaActions">
        <label class="mediaAction" title="Upload or drop a video here">${I.upload}<b>Upload Video</b><small>MP4 / WebM — or drag &amp; drop</small><input type="file" accept="video/mp4,video/webm" class="hidden" data-change="skin-visual" data-kind="video"></label>
        <label class="mediaAction" title="Upload or drop an image here">${I.image}<b>${e.image?'Replace':'Upload'} Image</b><small>PNG / JPEG / WebP — or drag &amp; drop</small><input type="file" accept="image/*" class="hidden" data-change="skin-visual" data-kind="image"></label>
      </div></div>
    `}

    <div class="wide small" style="font-weight:700;color:var(--gold3);text-transform:uppercase;letter-spacing:.04em;margin-top:4px">Thumbnail</div>
    <div class="wide" data-drop data-drop-kind="skin-thumbnail" style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
      <div class="preview" style="width:140px;aspect-ratio:8/5;flex:none">${e.thumbnail?`<img class="bg" src="${h(e.thumbnail)}" alt="">`:`<div class="ph small">No thumbnail yet</div>`}</div>
      <div class="mediaActions">
        <label class="mediaAction" title="Upload or drop a thumbnail image">${I.upload}<b>Replace Thumbnail</b><small>PNG / JPEG / WebP — or drag &amp; drop</small><input type="file" accept="image/*" class="hidden" data-change="skin-visual" data-kind="thumbnail"></label>
      </div></div>

    <div class="wide" style="margin-top:4px"><b style="font:700 12px var(--display);color:var(--gold3)">3 · TIME BEHAVIOR</b></div>
    <div class="wide"><label style="display:flex;align-items:flex-start;gap:8px;font-weight:600;font-size:12.5px;cursor:pointer"><input type="radio" name="time_mode" style="margin-top:2px" ${e.time_mode==='always'?'checked':''} data-act="skin-timemode" value="always"> <span>Same scene all day <span class="muted2" style="display:block;font-weight:500;margin-top:2px">(recommended) One visual. The Player automatically dims/warms it for dawn, afternoon, dusk and night — you don't upload anything extra.</span></span></label>
    <label style="display:flex;align-items:flex-start;gap:8px;font-weight:600;font-size:12.5px;margin-top:10px;cursor:pointer"><input type="radio" name="time_mode" style="margin-top:2px" ${e.time_mode==='variants'?'checked':''} data-act="skin-timemode" value="variants"> <span>Different visual per time of day<span class="muted2" style="display:block;font-weight:500;margin-top:2px">Upload a separate video/image for Dawn, Afternoon, Dusk and/or Night. Any time you don't provide one for still uses the main visual above.</span></span></label>
    ${e.time_mode==='variants'?`<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:10px">${TIMES4.map(([tk,tl])=>{ const v=e.time_variants[tk]||{}; return `<div class="panel" style="padding:8px"><div class="small muted" style="margin-bottom:4px">${tl}</div><div class="preview" style="aspect-ratio:16/9">${v.video?`<video src="${h(v.video)}" muted loop playsinline autoplay></video>`:v.image?`<img class="bg" src="${h(v.image)}" alt="">`:`<div class="ph small">Uses the main visual</div>`}</div><label class="btn xs" style="margin-top:6px;width:100%;justify-content:center">${I.upload} Upload<input type="file" accept="video/mp4,video/webm,image/*" class="hidden" data-change="skin-variant" data-time="${tk}"></label></div>`; }).join('')}</div>`:''}</div>

    <div class="wide" style="margin-top:4px"><b style="font:700 12px var(--display);color:var(--gold3)">4 · ACCENT COLOUR</b></div>
    <div class="wide" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <input type="color" value="${h(e.accent)}" data-input="skin-accent" style="width:44px;height:34px;padding:2px;border-radius:8px">
      <input class="inp mono" style="width:110px" value="${h(e.accent)}" data-input="skin-accent-hex" maxlength="7">
      <span class="chip" style="background:${h(e.accent)}22;border-color:${h(e.accent)}55;color:${h(e.accent)}">Aa Preview</span>
      ${ACCENT_PRESETS.map(([n,c])=>`<button type="button" class="btn xs" data-act="skin-accent-preset" data-c="${c}" style="border-color:${c}"><span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${c};margin-right:5px"></span>${n}</button>`).join('')}
    </div>

    <div class="wide" style="margin-top:4px"><b style="font:700 12px var(--display);color:var(--gold3)">5 · DEFAULT AMBIENCE</b></div>
    <div class="wide">${ambRows||'<div class="small muted">No default ambience — the player opens with the mixer silent.</div>'}
      ${addable.length?`<div style="margin-top:8px"><select class="sel" id="skin-amb-add" style="height:34px">${addable.map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select> <button type="button" class="btn xs" data-act="skin-amb-add">${I.plus} Add Ambient Sound</button></div>`:''}</div>

    <div class="wide" style="margin-top:4px"><b style="font:700 12px var(--display);color:var(--gold3)">6 · PREVIEW SKIN</b></div>
    <div class="wide"><div class="seg">${TIMES4.map(([tk,tl])=>`<button type="button" class="${e.previewTime===tk?'active':''}" data-act="skin-preview-time" data-t="${tk}">${tl}</button>`).join('')}</div>
      <div class="preview" style="aspect-ratio:16/9;max-width:420px;margin-top:8px;border-color:${h(e.accent)}55">${previewSrc?(previewSrc.match(/\.(mp4|webm)(\?|$)/)?`<video src="${h(previewSrc)}" ${e.thumbnail?`poster="${h(e.thumbnail)}"`:''} autoplay muted loop playsinline></video>`:`<img class="bg" src="${h(previewSrc)}" alt="">`):`<div class="ph">No visual yet</div>`}<span class="lbl">${e.previewTime.toUpperCase()}</span></div></div>

    <div class="wide" style="margin-top:4px"><b style="font:700 12px var(--display);color:var(--gold3)">7 · PUBLISHING</b></div>
    <div class="wide rules"><div class="rule"><span class="lbl">Enabled — visible in the player's scene picker</span><span class="toggle ${e.enabled?'on':''}" data-act="skin-toggle-enabled"></span></div>
    <div class="rule"><span class="lbl">Set as default scene</span><span class="toggle ${e.default?'on':''}" data-act="skin-toggle-default"></span></div>
    <div class="rule"><span class="lbl">Also use for YouTube broadcast<small>${canBroadcast(e)?'Makes this video selectable in Broadcast Visuals — independent of whether it\'s enabled here':'Needs an uploaded video (not an image, and not an externally-hosted one) to be broadcast-eligible'}</small></span><span class="toggle ${e.broadcastEligible?'on':''} ${canBroadcast(e)?'':'disabled'}" data-act="skin-toggle-broadcast"></span></div></div>
  </div>
  <div class="row-actions" style="position:sticky;bottom:-16px;background:var(--panel2);padding:12px 0 2px;margin-top:14px"><button type="button" class="btn" data-act="skin-cancel">Cancel</button><button type="button" class="btn gold" data-act="skin-save" ${e.saving?'disabled':''}>${e.saving?'Saving…':'Save Skin'}</button></div>`; }
Object.assign(ACTIONS, {
  'skin-new': async()=>{ const draft=await post('/api/skins/draft'); skinEditOpen(draft,true); },
  'skin-edit': (el)=>skinEditOpen(state.pageData.skins.skins.find(x=>x.id===el.dataset.id),false),
  'skin-preview': (el)=>{ const s=state.pageData.skins.skins.find(x=>x.id===el.dataset.id); modal(()=>{ const src=s.video||s.image; return `<h3>${I.eye} Preview — ${h(s.name)}<button class="btn xs ghost icon x" data-act="close-modal">${I.x}</button></h3><div class="preview" style="aspect-ratio:16/9">${src?(s.video?`<video src="${h(src)}" autoplay muted loop playsinline></video>`:`<img class="bg" src="${h(src)}" alt="">`):`<div class="ph">No visual uploaded yet</div>`}</div><div class="chips" style="margin-top:10px">${pill(s.source==='built-in'?'blue':'gold',s.source)}${pill(s.enabled?'on':'off',s.enabled?'enabled':'disabled')}${s.default?pill('gold','default'):''}${s.broadcast_eligible?pill('cyan','broadcast-eligible'):''}</div>`; }); },
  'skin-toggle': async(el)=>{ const s=state.pageData.skins.skins.find(x=>x.id===el.dataset.id); await act(()=>put(`/api/skins/${s.id}`,{name:s.name,description:s.description,enabled:!s.enabled,accent:s.accent,ambience:s.ambience,order:s.order,time_mode:s.time_mode,time_variants:s.time_variants,broadcast_eligible:s.broadcast_eligible}), s.enabled?'Skin disabled':'Skin enabled'); delete state.pageData.skins; render(); },
  'skin-toggle-bc': async(el)=>{ const s=state.pageData.skins.skins.find(x=>x.id===el.dataset.id); if(!skinCanBroadcast(s)) return; await act(()=>put(`/api/skins/${s.id}`,{name:s.name,description:s.description,enabled:s.enabled,accent:s.accent,ambience:s.ambience,order:s.order,time_mode:s.time_mode,time_variants:s.time_variants,broadcast_eligible:!s.broadcast_eligible}), s.broadcast_eligible?'Removed from broadcast rotation':'Added to broadcast rotation'); delete state.pageData.skins; render(); },
  'skin-mgmt-open': ()=>{ SKIN_MGMT.open=!SKIN_MGMT.open; render(); },
  'skin-mgmt-sel': (el)=>{ if(el.checked) SKIN_MGMT.selected.add(el.dataset.id); else SKIN_MGMT.selected.delete(el.dataset.id); render(); },
  'skin-mgmt-select-all': ()=>{ const list=state.pageData.skins.skins; if(list.every(s=>SKIN_MGMT.selected.has(s.id))) SKIN_MGMT.selected=new Set(); else SKIN_MGMT.selected=new Set(list.map(s=>s.id)); render(); },
  'skin-mgmt-bulk': async(el)=>{ const field=el.dataset.field, value=el.dataset.value==='1'; const list=state.pageData.skins.skins; const ids=[...SKIN_MGMT.selected];
    const targets=ids.map(id=>list.find(x=>x.id===id)).filter(Boolean).filter(s=>field!=='broadcast_eligible'||value===false||skinCanBroadcast(s));
    const skipped=ids.length-targets.length;
    await act(()=>Promise.all(targets.map(s=>put(`/api/skins/${s.id}`,{name:s.name,description:s.description,enabled:field==='enabled'?value:s.enabled,accent:s.accent,ambience:s.ambience,order:s.order,time_mode:s.time_mode,time_variants:s.time_variants,broadcast_eligible:field==='broadcast_eligible'?value:s.broadcast_eligible}))),
      `${targets.length} skin${targets.length===1?'':'s'} updated${skipped?`, ${skipped} skipped (no broadcastable video)`:''}`);
    delete state.pageData.skins; render(); },
  'skin-default': async(el)=>{ await act(()=>post(`/api/skins/${el.dataset.id}/default`),'Default skin set'); delete state.pageData.skins; render(); },
  'skin-move': async(el)=>{ const list=state.pageData.skins.skins; const group=list.filter(x=>x.source===list.find(y=>y.id===el.dataset.id).source); const ids=group.map(x=>x.id); const i=ids.indexOf(el.dataset.id), j=i+Number(el.dataset.dir); if(j<0||j>=ids.length) return; [ids[i],ids[j]]=[ids[j],ids[i]]; const fullOrder=list.map(x=>x.id===ids[i]?ids[j]:x.id===ids[j]?ids[i]:x.id); await act(()=>post('/api/skins/reorder',{order:fullOrder})); delete state.pageData.skins; render(); },
  'skin-del': async(el)=>{ const s=state.pageData.skins.skins.find(x=>x.id===el.dataset.id); const msg=`Delete "${s.name}"? This will remove it from the HUNGREE Goat Player for good, including any uploaded video/image and thumbnail. This can't be undone.`; if(await confirmDlg(msg,'Delete',true)){ await act(()=>del(`/api/skins/${el.dataset.id}`),'Skin deleted'); delete state.pageData.skins; render(); } },
  'skin-timemode': (el)=>{ SKIN_EDIT.time_mode=el.value; modal(()=>skinEditorHtml()); },
  'skin-preview-time': (el)=>{ SKIN_EDIT.previewTime=el.dataset.t; modal(()=>skinEditorHtml()); },
  'skin-accent-preset': (el)=>{ SKIN_EDIT.accent=el.dataset.c; modal(()=>skinEditorHtml()); },
  'skin-amb-add': ()=>{ const sel=document.getElementById('skin-amb-add'); if(!sel) return; SKIN_EDIT.ambience[sel.value]=50; modal(()=>skinEditorHtml()); },
  'skin-amb-rm': (el)=>{ delete SKIN_EDIT.ambience[el.dataset.key]; modal(()=>skinEditorHtml()); },
  'skin-toggle-enabled': ()=>{ SKIN_EDIT.enabled=!SKIN_EDIT.enabled; modal(()=>skinEditorHtml()); },
  'skin-toggle-default': ()=>{ SKIN_EDIT.default=!SKIN_EDIT.default; modal(()=>skinEditorHtml()); },
  'skin-toggle-broadcast': ()=>{ if(!canBroadcast(SKIN_EDIT)) return; SKIN_EDIT.broadcastEligible=!SKIN_EDIT.broadcastEligible; modal(()=>skinEditorHtml()); },
  'skin-thumb-gen': async(el)=>{ const e=SKIN_EDIT; const source=(e.video||e.image||'').split('/').pop(); if(!source) return; el.disabled=true;
    // Read the thumbnail straight off this call's own response — a still-draft skin (a New
    // Skin whose visual/thumbnail is being generated before the first Save) doesn't exist
    // in /api/skins yet (see public_list's draft filter), so re-fetching the list here would
    // silently fail to find it.
    const r=await act(()=>post(`/api/skins/${e.id}/thumbnail/generate?source=${encodeURIComponent(source)}`),'Thumbnail generated',{noRefresh:true});
    if(r){ e.thumbnail=`/api/skins/assets/${r.file}`; delete state.pageData.skins; modal(()=>skinEditorHtml()); } else el.disabled=false; },
  'skin-save': async()=>{ const e=SKIN_EDIT; if(!e.name.trim()){ toast('Give this skin a name first','err'); return; } e.saving=true; modal(()=>skinEditorHtml());
    // e.id always exists by now (New Skin creates a real draft row the moment the modal
    // opens — see skinEditOpen/'skin-new' — so every save, new or existing, is this same
    // PUT; upsert() clears the row's draft flag the instant a real save like this reaches it).
    const body={name:e.name.trim(),description:e.description,enabled:e.enabled,accent:e.accent,ambience:e.ambience,time_mode:e.time_mode,time_variants:e.time_variants,broadcast_eligible:canBroadcast(e)?e.broadcastEligible:false};
    const r=await act(()=>put(`/api/skins/${e.id}`,body),'Skin saved',{noRefresh:true});
    if(!r){ e.saving=false; modal(()=>skinEditorHtml()); return; }
    if(e.default) await post(`/api/skins/${r.id}/default`).catch(()=>{});
    delete state.pageData.skins;
    toast(`${e.name} saved successfully. It will appear in the player shortly.`,'ok'); closeModal(); render(); },
  'skin-cancel': async()=>{ const e=SKIN_EDIT; const wasNew=e.isNew, id=e.id; closeModal();
    // Only a genuinely never-saved draft gets deleted — once Save has succeeded once,
    // e.isNew is false (see 'skin-save') so closing afterward is an ordinary close, and any
    // uploads made along the way are real, saved, and kept.
    if(wasNew && id){ try{ await del(`/api/skins/${id}`); }catch(_){} delete state.pageData.skins; render(); } },
});
// Shared by the file-input CHANGES handler and the drag/drop listener below — one upload
// path regardless of how the file arrived. Returns the raw API result (falsy on failure,
// already toasted by act()) so callers can bail out cleanly.
async function skinUploadAsset(file, kind){
  const e=SKIN_EDIT; const fd=new FormData(); fd.append('file',file); toast(`Uploading ${file.name}…`);
  const r=await act(()=>api(`/api/skins/${e.id}/asset/${kind}`,{method:'POST',body:fd}),'Asset uploaded',{noRefresh:true});
  if(!r) return null;
  const url=`/api/skins/assets/${r.file}`;
  if(kind==='video'){ e.video=url; e.image=null; } else if(kind==='image'){ e.image=url; e.video=null; } else e.thumbnail=url;
  if(r.thumbnail) e.thumbnail=r.thumbnail;   // a video/image upload can auto-generate one — reflect it immediately
  e.probe=r.probe||e.probe; delete state.pageData.skins; modal(()=>skinEditorHtml());
  return r;
}
Object.assign(CHANGES, {
  'skin-visual': async(el)=>{ const f=el.files[0]; if(!f) return; await skinUploadAsset(f, el.dataset.kind); },
  'skin-variant': async(el)=>{ const f=el.files[0]; if(!f) return; const e=SKIN_EDIT; const kind=/\.(mp4|webm)$/i.test(f.name)?'video':'image'; const fd=new FormData(); fd.append('file',f); toast(`Uploading ${f.name}…`);
    const r=await act(()=>api(`/api/skins/${e.id}/asset/${kind}?time_key=${el.dataset.time}`,{method:'POST',body:fd}),'Variant uploaded',{noRefresh:true}); if(!r) return;
    e.time_variants[el.dataset.time]={...(e.time_variants[el.dataset.time]||{}), [kind]:`/api/skins/assets/${r.file}`}; delete state.pageData.skins; modal(()=>skinEditorHtml()); },
  'skin-field': (el)=>{ SKIN_EDIT[el.dataset.key]=el.value; },
  'skin-amb-vol': (el)=>{ SKIN_EDIT.ambience[el.dataset.key]=Number(el.value); const b=el.nextElementSibling; if(b) b.textContent=el.value+'%'; },
  'skin-accent': (el)=>{ SKIN_EDIT.accent=el.value; const hex=document.querySelector('[data-input="skin-accent-hex"]'); if(hex) hex.value=el.value; },
  'skin-accent-hex': (el)=>{ if(/^#[0-9a-f]{6}$/i.test(el.value)){ SKIN_EDIT.accent=el.value; const c=document.querySelector('[data-input="skin-accent"]'); if(c) c.value=el.value; } },
});

/* ======================= BROADCAST VISUALS ======================= */
/* The looping background videos the live YouTube stream can show, layered on the Player
   Skins registry (any skin with an uploaded video can be flagged broadcast-eligible there —
   see section 8 of the skin editor). This page only manages WHICH eligible video is on air
   and how the rotation picks between them; uploading/editing the video itself happens on
   the Player Skins page so there is exactly one upload workflow, not two. */
const COLL_EDIT={active:false};
function collEditOpen(c, eligible){ c=c||{}; Object.assign(COLL_EDIT,{active:true,isNew:!c.id,id:c.id||null,name:c.name||'',
  order:c.order||'sequential',video_ids:[...(c.video_ids||[])],eligible,saving:false});
  modal(()=>collEditorHtml()); }
function collEditorHtml(){ const c=COLL_EDIT; const byId=Object.fromEntries(c.eligible.map(v=>[v.id,v]));
  const chosen=c.video_ids.filter(id=>byId[id]); const avail=c.eligible.filter(v=>!c.video_ids.includes(v.id));
  return `<h3>${I.film} ${c.isNew?'New':'Edit'} collection<button class="btn xs ghost icon x" data-act="close-modal">${I.x}</button></h3>
  <div class="form" style="gap:14px">
    <label class="wide">Collection name<input class="inp" id="coll-name" value="${h(c.name)}" placeholder="Rainy Nights" data-input="coll-field" data-key="name"></label>
    <label class="wide">Order<select class="sel" data-input="coll-order"><option value="sequential" ${c.order==='sequential'?'selected':''}>Sequential — clip 1, 2, 3… then wraps back to 1</option><option value="shuffle" ${c.order==='shuffle'?'selected':''}>Shuffle — random each new song, avoids an immediate repeat</option></select></label>
    <div class="wide"><b style="font:700 12px var(--display);color:var(--gold3)">VIDEOS IN THIS COLLECTION (${chosen.length})</b>
      ${chosen.length?`<div class="list" style="margin-top:8px">${chosen.map((v,i)=>`<div class="row" data-key="cv-${v.id}"><span class="idx">${i+1}</span><img class="th" src="${h(v.thumbnail||'')}" loading="lazy" onerror="this.style.visibility='hidden'"><div class="tt"><b>${h(v.name)}</b></div><span class="acts"><button type="button" class="btn xs icon ghost" data-act="coll-move" data-id="${v.id}" data-dir="-1" ${i===0?'disabled':''}>${I.up}</button><button type="button" class="btn xs icon ghost" data-act="coll-move" data-id="${v.id}" data-dir="1" ${i===chosen.length-1?'disabled':''}>${I.down}</button><button type="button" class="btn xs icon ghost" data-act="coll-remove" data-id="${v.id}">${I.x}</button></span></div>`).join('')}</div>`
        :`<div class="small muted" style="margin-top:8px">No videos yet — add at least one below.</div>`}</div>
    ${avail.length?`<div class="wide"><b style="font:700 12px var(--display);color:var(--gold3)">ADD FROM ELIGIBLE VISUALS</b><div class="chips" style="margin-top:8px">${avail.map(v=>`<button type="button" class="btn xs" data-act="coll-add" data-id="${v.id}">${I.plus} ${h(v.name)}</button>`).join('')}</div></div>`
      :(c.eligible.length===0?`<div class="wide small muted">No videos are marked "Also use for YouTube broadcast" yet — enable that on a skin's Publishing section first (<a class="link" href="#/skins">Player Skins</a>).</div>`:'')}
  </div>
  <div class="row-actions" style="position:sticky;bottom:-16px;background:var(--panel2);padding:12px 0 2px;margin-top:14px"><button type="button" class="btn" data-act="close-modal">Cancel</button><button type="button" class="btn gold" data-act="coll-save" ${c.saving?'disabled':''}>${c.saving?'Saving…':'Save Collection'}</button></div>`; }

pages.broadcast = { live:true, async load(){ return api('/api/broadcast'); }, view(d){
  const s=st(); const np=(s&&s.now_playing)||{}; const modeCard=(id,icon,title,desc,active)=>`<button type="button" class="panel bcmode ${active?'active':''}" data-act="bc-mode-${id}" style="text-align:left;padding:16px;cursor:pointer;border-color:${active?'var(--gold)':''}"><div style="display:flex;align-items:center;gap:10px"><span class="ic ${active?'gold':''}" style="width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:${active?'rgba(242,193,78,.16)':'rgba(128,168,214,.08)'}">${icon}</span><b style="font:800 14px var(--display)">${title}</b>${active?pill('gold','ACTIVE'):''}</div><p class="small muted" style="margin:8px 0 0">${desc}</p></button>`;
  const cur=d.now.current_visual;
  return `<div class="page-h"><h2>Broadcast Visuals</h2><div class="right"><button class="btn sm gold" data-act="coll-new">${I.plus} New Collection</button></div></div>
  <div class="panel" style="padding:16px 18px;margin-bottom:14px">
    <p class="small muted" style="margin:0 0 12px;line-height:1.55">What plays as the looping background on the live YouTube broadcast. Only the background changes — album art, Now Playing and all HUNGREE Goat branding stay exactly as they are; that overlay is composited live and is never baked into an uploaded clip. The background switches once per song, using the real track change as the trigger, and never restarts the stream to do it.</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
      <div class="stat"><div class="k">Live mode</div><div class="v gold" style="text-transform:capitalize">${d.mode}</div></div>
      <div class="stat"><div class="k">${d.mode==='rotation'?'Active collection':'Single visual'}</div><div class="v">${d.mode==='rotation'?(d.collections.find(c=>c.id===d.active_collection)?.name||'— none set —'):(d.eligible_visuals.find(v=>v.id===d.single_visual)?.name||'HUNGREE Goat Loop (default)')}</div></div>
      ${d.mode==='rotation'?`<div class="stat"><div class="k">Order</div><div class="v" style="text-transform:capitalize">${d.collections.find(c=>c.id===d.active_collection)?.order||'—'}</div></div><div class="stat"><div class="k">Active visuals</div><div class="v">${d.active_count}</div></div>`:''}
      <div class="stat"><div class="k">Current visual</div><div class="v">${cur?h(cur.name):'Original loop (fallback)'}</div></div>
      <div class="stat"><div class="k">Current track</div><div class="v" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h(np.title||'—')}</div></div>
    </div></div>
  <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px">
    ${modeCard('single',I.image,'Single Visual','Pick one animation. It plays for every song until you change it — the original default behavior.',d.mode==='single')}
    ${modeCard('rotation',I.repeat,'Rotation','Pick a collection of clips. The background changes to the next one at every real track change, forever, until you switch collections or modes.',d.mode==='rotation')}
  </div>
  ${d.mode==='single'?`<h3 style="margin:0 0 8px;font:800 15px var(--display)">${ic(I.image,'gold')}CHOOSE THE SINGLE VISUAL</h3>
    <div class="grid eq" style="grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr));margin-bottom:18px">${d.eligible_visuals.length?d.eligible_visuals.map(v=>`<button type="button" class="panel" style="text-align:left;padding:0;cursor:pointer;border-color:${v.id===d.single_visual?'var(--gold)':''}" data-act="bc-pick-single" data-id="${v.id}"><div class="preview" style="aspect-ratio:16/9;border-radius:16px 16px 0 0;border:0">${v.thumbnail?`<img class="bg" src="${h(v.thumbnail)}" alt="">`:`<div class="ph small">No thumbnail</div>`}${v.id===d.single_visual?'<span class="lbl">SELECTED</span>':''}</div><div class="panel-b"><b style="font:800 13px var(--display)">${h(v.name)}</b>${v.player_enabled?'':`<div class="small muted" style="margin-top:2px">Not a Player scene — broadcast only</div>`}</div></button>`).join(''):`<div class="panel"><div class="panel-b">${empty(I.film,'No eligible visuals yet','Upload a video on Player Skins and turn on "Also use for YouTube broadcast" in its Publishing section.',`<a class="btn sm gold" href="#/skins">${I.image} Player Skins</a>`)}</div></div>`}</div>`
  :`<h3 style="margin:0 0 8px;font:800 15px var(--display)">${ic(I.film,'gold')}COLLECTIONS (${d.collections.length})${help('A collection is the set of clips actually in rotation — an eligible video not added to any active collection never plays. Activate a collection to make it the one on air.')}</h3>
    <div class="grid eq" style="grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr));margin-bottom:18px">${d.collections.length?d.collections.map(c=>`<div class="panel" data-key="coll-${c.id}"><div class="panel-b"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><b style="font:800 15px var(--display);flex:1;min-width:0">${h(c.name)}</b>${c.id===d.active_collection?pill('gold','ACTIVE'):''}${pill('slate',c.order)}</div>
      <div class="chips" style="margin-top:8px">${c.videos.slice(0,4).map(v=>`<span class="chip slate">${h(v.name)}</span>`).join('')}${c.count>4?`<span class="chip slate">+${c.count-4} more</span>`:''}${!c.count?'<span class="small muted">No videos yet</span>':''}</div></div>
      <div class="panel-f"><button class="btn xs ${c.id===d.active_collection?'gold':''}" data-act="bc-activate-collection" data-id="${c.id}">${c.id===d.active_collection?'Active ✓':'Activate'}</button><button class="btn xs" data-act="coll-edit" data-id="${c.id}">${I.edit} Edit</button><button class="btn xs icon red" data-act="coll-del" data-id="${c.id}" style="margin-left:auto">${I.trash}</button></div></div>`).join(''):`<div class="panel"><div class="panel-b">${empty(I.film,'No collections yet','Group eligible visuals into a named set — Rainy Nights, Christmas, Lagos — then activate it.',`<button class="btn sm gold" data-act="coll-new">${I.plus} New Collection</button>`)}</div></div>`}</div>
    ${(()=>{ const activeColl=d.collections.find(c=>c.id===d.active_collection);
      const order=(activeColl?.video_ids||[]).filter(id=>d.eligible_visuals.some(v=>v.id===id));
      const inRotation=order.map((id,i)=>({v:d.eligible_visuals.find(v=>v.id===id),pos:i+1}));
      const notInRotation=d.eligible_visuals.filter(v=>!order.includes(v.id));
      const card=(v,pos)=>{ const isNow=cur&&cur.id===v.id;
        return `<div class="panel" style="${isNow?'border-color:var(--gold)':''}"><div class="preview" style="aspect-ratio:16/9;border-radius:16px 16px 0 0;border:0;position:relative">${v.thumbnail?`<img class="bg" src="${h(v.thumbnail)}" alt="">`:`<div class="ph small">No thumbnail</div>`}${pos?`<span class="lbl" style="background:rgba(7,13,24,.85)">#${pos}</span>`:''}${isNow?`<span class="lbl" style="left:auto;right:8px;background:var(--gold);color:#1a1204">${I.play} NOW PLAYING</span>`:''}</div><div class="panel-b"><b style="font:800 12.5px var(--display)">${h(v.name)}</b>${!pos?`<div class="small muted" style="margin-top:2px">Not in active collection</div>`:''}</div></div>`; };
      return `<h3 style="margin:0 0 8px;font:800 15px var(--display)">${ic(I.image,'blue')}ALL ELIGIBLE VISUALS (${d.eligible_visuals.length})${help('Every video currently flagged for broadcast use. Numbered cards are in the active collection, in rotation order — the gold "NOW PLAYING" card is the one on air right now. Unnumbered, dimmed cards are eligible but not added to the active collection, so they never play.')}</h3>
    <div class="grid eq" style="grid-template-columns:repeat(auto-fill,minmax(min(200px,100%),1fr))">${d.eligible_visuals.length?[...inRotation.map(({v,pos})=>card(v,pos)),...notInRotation.map(v=>`<div style="opacity:.55">${card(v,null)}</div>`)].join(''):`<div class="panel"><div class="panel-b">${empty(I.film,'No eligible visuals yet','Upload a video on Player Skins and turn on "Also use for YouTube broadcast".',`<a class="btn sm gold" href="#/skins">${I.image} Player Skins</a>`)}</div></div>`}</div>`; })()}`}`; } };
Object.assign(ACTIONS, {
  'bc-mode-single': async()=>{ await act(()=>post('/api/broadcast/mode',{mode:'single'}),'Switched to Single Visual'); delete state.pageData.broadcast; render(); },
  'bc-mode-rotation': async()=>{ await act(()=>post('/api/broadcast/mode',{mode:'rotation'}),'Switched to Rotation'); delete state.pageData.broadcast; render(); },
  'bc-pick-single': async(el)=>{ await act(()=>post('/api/broadcast/mode',{mode:'single',single_visual:el.dataset.id}),'Single visual set'); delete state.pageData.broadcast; render(); },
  'bc-activate-collection': async(el)=>{ await act(()=>post('/api/broadcast/mode',{mode:'rotation',active_collection:el.dataset.id}),'Collection activated'); delete state.pageData.broadcast; render(); },
  'coll-new': ()=>collEditOpen(null, state.pageData.broadcast.eligible_visuals),
  'coll-edit': (el)=>collEditOpen(state.pageData.broadcast.collections.find(c=>c.id===el.dataset.id), state.pageData.broadcast.eligible_visuals),
  'coll-del': async(el)=>{ const c=state.pageData.broadcast.collections.find(x=>x.id===el.dataset.id); if(await confirmDlg(`Delete the "${c.name}" collection? Its videos stay eligible for broadcast, they just leave this collection.`,'Delete',true)){ await act(()=>del(`/api/broadcast/collections/${el.dataset.id}`),'Collection deleted'); delete state.pageData.broadcast; render(); } },
  'coll-add': (el)=>{ COLL_EDIT.video_ids.push(el.dataset.id); modal(()=>collEditorHtml()); },
  'coll-remove': (el)=>{ COLL_EDIT.video_ids=COLL_EDIT.video_ids.filter(id=>id!==el.dataset.id); modal(()=>collEditorHtml()); },
  'coll-move': (el)=>{ const ids=COLL_EDIT.video_ids; const i=ids.indexOf(el.dataset.id), j=i+Number(el.dataset.dir); if(j<0||j>=ids.length) return; [ids[i],ids[j]]=[ids[j],ids[i]]; modal(()=>collEditorHtml()); },
  'coll-save': async()=>{ const c=COLL_EDIT; if(!c.name.trim()){ toast('Give this collection a name first','err'); return; } if(!c.video_ids.length){ toast('Add at least one video first','err'); return; } c.saving=true; modal(()=>collEditorHtml());
    const body={name:c.name.trim(),order:c.order,video_ids:c.video_ids};
    const r=await act(()=>c.id?put(`/api/broadcast/collections/${c.id}`,body):post('/api/broadcast/collections',body),'Collection saved',{noRefresh:true});
    if(!r){ c.saving=false; modal(()=>collEditorHtml()); return; }
    delete state.pageData.broadcast; closeModal(); render(); },
});
Object.assign(CHANGES, {
  'coll-field': (el)=>{ COLL_EDIT[el.dataset.key]=el.value; },
  'coll-order': (el)=>{ COLL_EDIT.order=el.value; },
});

/* ======================= WORKOUT DJ ======================= */
const WORKOUT_LABELS = {general:'General Workout',strength:'Strength',treadmill:'Treadmill / Run',cycling:'Cycling',rowing:'Rowing',hiit:'HIIT'};
const MIX_STATUS_PILL = {creating:['slate','Creating'],recording:['blue','Recording'],mastering:['amber','Mastering'],saving:['amber','Saving'],ready:['green','Ready'],failed:['red','Failed']};
const TEMPO_LABEL = (m) => { if(!m.tempo_mode || m.tempo_mode==='original') return 'original tempo';
  if(m.tempo_mode==='target_bpm') return `target ${m.target_bpm||'?'} BPM`;
  const pct = m.tempo_boost_pct; return pct?`tempo ${pct>0?'+':''}${pct}%`:'original tempo'; };
function mixRow(m){
  const [cls,lbl]=MIX_STATUS_PILL[m.status]||['slate',m.status]; const busy = m.status==='recording'||m.status==='mastering'||m.status==='creating';
  const open = state._mixRecipeOpen===m.id;
  return `<div data-key="mix-${m.id}"><div class="row" style="align-items:center">
    <div class="tt" style="flex:1;min-width:0"><b>${h(m.title)}</b><span>${WORKOUT_LABELS[m.workout_type]||h(m.workout_type||'')} · ${h(m.intensity||'')} · ${TEMPO_LABEL(m)}${m.measured_lufs!=null?` · ${m.measured_lufs.toFixed(1)} LUFS`:''}</span></div>
    <span class="dur">${m.actual_duration_sec?fmtLong(m.actual_duration_sec):(m.target_duration_sec?'~'+fmtLong(m.target_duration_sec):'')}</span>
    <span class="pill ${cls}">${lbl}${busy?' …':''}</span>
    <span class="acts">${m.status==='ready'?`<button class="btn xs" data-act="mix-recipe-toggle" data-id="${m.id}">${open?'Hide':'Recipe'}</button><audio controls preload="none" style="height:32px;max-width:220px" src="/api/dj/mixes/${m.id}/audio.wav"></audio><a class="btn xs icon ghost" href="/api/dj/mixes/${m.id}/download" title="Download">${I.upload}</a>`:''}<button class="btn xs icon red" data-act="wo-delete" data-id="${m.id}" title="Delete">${I.trash}</button></span>
  </div>
  ${open?`<div class="small muted" style="padding:4px 0 10px 4px">${(state._mixRecipeData&&state._mixRecipeData[m.id])?
      (state._mixRecipeData[m.id].length?state._mixRecipeData[m.id].map(t=>`<div>${h(t.title)} — source ${t.source_bpm||'?'} BPM → playback ${t.effective_bpm?Math.round(t.effective_bpm*10)/10:'?'} BPM (${t.tempo_adjust_pct>0?'+':''}${t.tempo_adjust_pct||0}%)${t.key_lock?' · key lock on':''}${t.source_key?' · '+h(t.source_key):''} · in at ${fmtDur(t.transition_in_sec||0)}</div>`).join(''):'No recipe recorded for this mix.')
    :'Loading…'}</div>`:''}</div>`;
}
function profileTempoLabel(p){ if(!p.tempo_mode||p.tempo_mode==='automatic') return 'Automatic (from intensity)'; if(p.tempo_mode==='original') return 'Original — no acceleration';
  if(p.tempo_mode==='target_bpm') return `Target ${p.target_bpm||'?'} BPM`; return `Boost ${p.tempo_boost_pct>0?'+':''}${p.tempo_boost_pct||0}%`; }
function profileRow(p){ return `<div class="row" data-key="profile-${p.id}">
  <div class="tt" style="flex:1;min-width:0"><b>${h(p.name)}${p.enabled?'':' (disabled)'}</b><span>${WORKOUT_LABELS[p.workout_type]||h(p.workout_type)} · ${h(p.default_intensity)} · ${fmtLong(p.default_duration_sec)} · ${profileTempoLabel(p)} · ${h(p.transition_type)} transitions</span></div>
  <span class="acts"><button class="btn xs" data-act="profile-edit" data-id="${p.id}">${I.edit} Edit</button><button class="btn xs" data-act="profile-duplicate" data-id="${p.id}">${I.copy} Duplicate</button><button class="btn xs" data-act="profile-toggle" data-id="${p.id}">${p.enabled?'Disable':'Enable'}</button><button class="btn xs icon red" data-act="profile-del" data-id="${p.id}" title="Delete">${I.trash}</button></span></div>`; }
const PROFILE_EDIT = {active:false};
function profileEditOpen(p){ p=p||{}; Object.assign(PROFILE_EDIT,{active:true,id:p.id||null,name:p.name||'',workout_type:p.workout_type||'general',
  default_duration_sec:p.default_duration_sec||1800,default_intensity:p.default_intensity||'moderate',transition_duration_sec:p.transition_duration_sec||8,
  transition_type:p.transition_type||'blend',tempo_mode:p.tempo_mode||'automatic',tempo_boost_pct:p.tempo_boost_pct||50,target_bpm:p.target_bpm||140,
  mastering_preset:p.mastering_preset||'workout_streaming',enabled:p.enabled!==false,saving:false});
  modal(()=>profileEditorHtml()); }
function profileEditorHtml(){ const e=PROFILE_EDIT;
  return `<h3>${I.tag} ${e.id?'Edit':'New'} workout profile<button class="btn xs ghost icon x" data-act="close-modal">${I.x}</button></h3>
  <form class="form" data-form="profile-save">
    <label class="wide">Name<input class="inp" name="name" value="${h(e.name)}" required></label>
    <label>Workout type<select class="sel" name="workout_type">${Object.entries(WORKOUT_LABELS).map(([k,l])=>`<option value="${k}" ${e.workout_type===k?'selected':''}>${l}</option>`).join('')}</select></label>
    <label>Default intensity<select class="sel" name="default_intensity">${['easy','moderate','high','intense'].map(x=>`<option value="${x}" ${e.default_intensity===x?'selected':''}>${x[0].toUpperCase()+x.slice(1)}</option>`).join('')}</select></label>
    <label>Default duration (minutes)<input class="inp" type="number" name="duration_min" min="1" max="240" value="${Math.round(e.default_duration_sec/60)}"></label>
    <label>Transition style<select class="sel" name="transition_type">${['blend','echo-out','cut','filter-sweep'].map(x=>`<option value="${x}" ${e.transition_type===x?'selected':''}>${x}</option>`).join('')}</select></label>
    <label>Tempo mode<select class="sel" name="tempo_mode" data-change="profile-field">${[['automatic','Automatic (from intensity)'],['original','Original — no acceleration'],['boost','Tempo Boost %'],['target_bpm','Target BPM']].map(([v,l])=>`<option value="${v}" ${e.tempo_mode===v?'selected':''}>${l}</option>`).join('')}</select></label>
    ${e.tempo_mode==='boost'?`<label>Tempo boost (%)<input class="inp" type="number" name="tempo_boost_pct" min="-50" max="100" value="${h(e.tempo_boost_pct)}"></label>`:''}
    ${e.tempo_mode==='target_bpm'?`<label>Target BPM<input class="inp" type="number" name="target_bpm" min="60" max="220" value="${h(e.target_bpm)}"></label>`:''}
    <label>Mastering preset<select class="sel" name="mastering_preset">${['workout_streaming','club','podcast','broadcast'].map(x=>`<option value="${x}" ${e.mastering_preset===x?'selected':''}>${x}</option>`).join('')}</select></label>
    <label>Enabled<select class="sel" name="enabled"><option value="1" ${e.enabled?'selected':''}>Yes</option><option value="0" ${!e.enabled?'selected':''}>No</option></select></label>
    <div class="row-actions"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn gold" type="submit" ${e.saving?'disabled':''}>${e.saving?'Saving…':'Save Profile'}</button></div>
  </form>`; }
Object.assign(ACTIONS, {
  'profile-new': ()=>profileEditOpen(null),
  'profile-edit': (el)=>profileEditOpen(state.pageData.workout.profiles.find(x=>x.id===Number(el.dataset.id))),
  'profile-duplicate': async(el)=>{ const p=state.pageData.workout.profiles.find(x=>x.id===Number(el.dataset.id)); if(!p) return;
    const body={...p, name:p.name+' (copy)'}; delete body.id; delete body.created_at; delete body.updated_at;
    await act(()=>post('/api/dj/profiles',body),'Profile duplicated'); },
  'profile-toggle': async(el)=>{ const p=state.pageData.workout.profiles.find(x=>x.id===Number(el.dataset.id)); if(!p) return;
    await act(()=>put(`/api/dj/profiles/${p.id}`,{...p,enabled:!p.enabled}), p.enabled?'Profile disabled':'Profile enabled'); },
  'profile-del': async(el)=>{ if(await confirmDlg('Delete this workout profile? Mixes already created with it are unaffected.','Delete',true)) act(()=>del(`/api/dj/profiles/${el.dataset.id}`),'Profile deleted'); },
});
Object.assign(CHANGES, {
  'profile-field': (el)=>{ PROFILE_EDIT[el.name]=el.value; modal(()=>profileEditorHtml()); },
});
Object.assign(FORMS, {
  'profile-save': async(f,b)=>{ const e=PROFILE_EDIT; e.saving=true; modal(()=>profileEditorHtml());
    const body={name:b.name.trim(),workout_type:b.workout_type,default_intensity:b.default_intensity,
      default_duration_sec:Number(b.duration_min)*60,transition_type:b.transition_type,transition_duration_sec:e.transition_duration_sec,
      tempo_mode:b.tempo_mode,tempo_boost_pct:b.tempo_boost_pct?Number(b.tempo_boost_pct):null,target_bpm:b.target_bpm?Number(b.target_bpm):null,
      mastering_preset:b.mastering_preset,enabled:b.enabled==='1'};
    const r=await act(()=>e.id?put(`/api/dj/profiles/${e.id}`,body):post('/api/dj/profiles',body),'Profile saved',{noRefresh:true});
    e.saving=false; if(r){ delete state.pageData.workout; closeModal(); render(); } else modal(()=>profileEditorHtml()); },
});
pages.workout = { live:true, async load(){
  const [mixes, analyzeStatus, pls, profiles] = await Promise.all([
    api(`/api/dj/mixes?station=${S()}`), api('/api/dj/analyze/status'), api(`${P()}/playlists`), api('/api/dj/profiles')
  ]);
  return {mixes, analyzeStatus, workoutPlaylists: pls.filter(p=>p.kind==='workout'), profiles};
}, view(d){
  const wf = state._woForm || (state._woForm = {playlist:(d.workoutPlaylists[0]||{}).slug||'workout', workout_type:'general', intensity:'moderate',
    duration_choice:'5', custom_minutes:75, tempo_choice:'automatic', custom_pct:50, target_bpm:140, key_lock:true});
  const pendingAnalyze = d.analyzeStatus.running;
  const durH = wf.duration_choice==='custom' ? Math.floor(Number(wf.custom_minutes||0)/60)+'h '+(Number(wf.custom_minutes||0)%60)+'m' : '';
  return `<div class="page-h"><h2>Workout DJ</h2><div class="right"><a class="btn sm" href="/dj/index.html" target="_blank" rel="noopener">${I.headphones} Full DJ Console</a></div></div>
  <div class="panel" style="padding:16px 18px;margin-bottom:14px">
    <p class="small muted" style="margin:0 0 12px;line-height:1.55">Auto-DJ builds a brand-new workout mix from your Library — beatmatched, tempo-accelerated, transitioned and mastered automatically — and saves it as a finished recording under Mixes. Library tracks and playlists are never modified or duplicated.</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
      <div class="stat"><div class="k">Workout playlists</div><div class="v">${d.workoutPlaylists.length}</div></div>
      <div class="stat"><div class="k">Mixes saved</div><div class="v">${d.mixes.length}</div></div>
      <div class="stat"><div class="k">Analysis</div><div class="v">${pendingAnalyze?`Analyzing… ${d.analyzeStatus.done}/${d.analyzeStatus.total}`:'Idle'}</div></div>
    </div>
  </div>
  <div class="two">
    <div class="panel"><div class="panel-h"><h3>${ic(I.plus,'gold')}CREATE WORKOUT MIX</h3></div><div class="panel-b">
      ${d.workoutPlaylists.length ? `<form data-form="wo-create" class="form">
        ${d.profiles.length?`<label class="wide">Load from profile <span class="muted2">(fills in the fields below — still editable)</span><select class="sel" data-change="wo-load-profile"><option value="">— choose a profile —</option>${d.profiles.map(p=>`<option value="${p.id}">${h(p.name)} (${WORKOUT_LABELS[p.workout_type]||h(p.workout_type)})</option>`).join('')}</select></label>`:''}
        <label>Playlist<select class="sel" name="playlist">${d.workoutPlaylists.map(p=>`<option value="${h(p.slug)}" ${wf.playlist===p.slug?'selected':''}>${h(p.name)} (${p.track_count||0} tracks)</option>`).join('')}</select></label>
        <label>Workout type<select class="sel" name="workout_type">${Object.entries(WORKOUT_LABELS).map(([k,l])=>`<option value="${k}" ${wf.workout_type===k?'selected':''}>${l}</option>`).join('')}</select></label>
        <label>Intensity<select class="sel" name="intensity">${['easy','moderate','high','intense'].map(x=>`<option value="${x}" ${wf.intensity===x?'selected':''}>${x[0].toUpperCase()+x.slice(1)}</option>`).join('')}</select></label>
        <label>Duration<select class="sel" name="duration_choice" data-change="wo-field">${[['5','5 minutes'],['10','10 minutes'],['15','15 minutes'],['20','20 minutes'],['30','30 minutes'],['45','45 minutes'],['60','60 minutes'],['90','90 minutes'],['120','120 minutes'],['custom','Custom…']].map(([v,l])=>`<option value="${v}" ${wf.duration_choice===v?'selected':''}>${l}</option>`).join('')}</select></label>
        ${wf.duration_choice==='custom'?`<label>Custom duration (minutes)<input class="inp" type="number" name="custom_minutes" min="1" max="240" step="1" value="${h(wf.custom_minutes)}" data-input="wo-field"><small class="muted2">${durH}</small></label>`:''}
        <label>Tempo<select class="sel" name="tempo_choice" data-change="wo-field">${[['automatic','Automatic (from intensity)'],['original','Original — no acceleration'],['25','Tempo Boost +25%'],['50','Tempo Boost +50%'],['75','Tempo Boost +75%'],['100','Tempo Boost +100%'],['custom','Custom %…'],['target_bpm','Target BPM…']].map(([v,l])=>`<option value="${v}" ${wf.tempo_choice===v?'selected':''}>${l}</option>`).join('')}</select></label>
        ${wf.tempo_choice==='custom'?`<label>Custom tempo boost (%)<input class="inp" type="number" name="custom_pct" min="-50" max="100" step="1" value="${h(wf.custom_pct)}" data-input="wo-field"></label>`:''}
        ${wf.tempo_choice==='target_bpm'?`<label>Target BPM<input class="inp" type="number" name="target_bpm" min="60" max="220" step="1" value="${h(wf.target_bpm)}" data-input="wo-field"></label>`:''}
        <label style="display:flex;align-items:center;gap:8px;margin-top:22px"><input type="checkbox" name="key_lock" ${wf.key_lock?'checked':''} data-input="wo-field" style="width:16px;height:16px"> Preserve pitch/key (key lock)</label>
        <div class="wide row-actions"><button class="btn gold" type="submit">${I.play} Create &amp; Generate Mix</button></div>
      </form>` : empty(I.list,'No workout playlist yet','Create a playlist with kind "workout" on the Playlists page, add tracks to it, then come back here.',`<a class="btn sm gold" href="#/playlists">${I.list} Playlists</a>`)}
    </div></div>
    <div class="panel"><div class="panel-h"><h3>${ic(I.tag,'blue')}TRACK ANALYSIS</h3></div><div class="panel-b">
      <p class="small muted" style="margin:0 0 10px">Auto-DJ needs each track's tempo and key before it can beatmix it. Run this once after adding new tracks to a workout playlist.</p>
      <button class="btn sm ${pendingAnalyze?'':'gold'}" data-act="wo-analyze" ${pendingAnalyze?'disabled':''}>${pendingAnalyze?`Analyzing ${d.analyzeStatus.done}/${d.analyzeStatus.total}…`:'Analyze Workout Playlist'}</button>
    </div></div>
  </div>
  <h3 style="margin:18px 0 8px;font:800 15px var(--display)">${ic(I.list,'gold')}MIXES (${d.mixes.length})</h3>
  <div class="panel" style="margin-bottom:18px"><div class="panel-b">${d.mixes.length?d.mixes.map(mixRow).join(''):empty(I.list,'No mixes yet','Create your first workout mix above.')}</div></div>
  <div class="page-h" style="margin-bottom:8px"><h3 style="margin:0;font:800 15px var(--display);display:flex;align-items:center;gap:8px">${ic(I.tag,'gold')}WORKOUT PROFILES (${d.profiles.length})</h3><div class="right"><button class="btn sm gold" data-act="profile-new">${I.plus} New Profile</button></div></div>
  <div class="panel"><div class="panel-b" style="gap:0">${d.profiles.length?d.profiles.map(profileRow).join(''):empty(I.tag,'No profiles yet','Profiles store reusable defaults (duration, tempo, transitions) for a workout type.')}</div></div>`;
} };
Object.assign(CHANGES, {
  'wo-field': (el)=>{ const wf=state._woForm; if(!wf) return; const k=el.name; wf[k]= el.type==='checkbox'?el.checked:el.value; render(); },
  'wo-load-profile': (el)=>{ if(!el.value) return; const p=state.pageData.workout.profiles.find(x=>x.id===Number(el.value)); if(!p) return;
    const mins=Math.round((p.default_duration_sec||300)/60); const known=[5,10,15,20,30,45,60,90,120];
    const tempoChoice = p.tempo_mode==='boost' ? String(p.tempo_boost_pct||0) : (p.tempo_mode||'automatic');
    state._woForm = {...state._woForm, workout_type:p.workout_type, intensity:p.default_intensity,
      duration_choice: known.includes(mins)?String(mins):'custom', custom_minutes:mins,
      tempo_choice: tempoChoice, custom_pct:p.tempo_boost_pct||50, target_bpm:p.target_bpm||140};
    render(); },
});
Object.assign(FORMS, {
  'wo-create': async(f,b)=>{
    const duration_min = b.duration_choice==='custom' ? Number(b.custom_minutes||0) : Number(b.duration_choice);
    if(!duration_min || duration_min<=0){ toast('Enter a valid duration first','err'); return; }
    state._woForm = {playlist:b.playlist, workout_type:b.workout_type, intensity:b.intensity,
      duration_choice:b.duration_choice, custom_minutes:b.custom_minutes||75,
      tempo_choice:b.tempo_choice, custom_pct:b.custom_pct||50, target_bpm:b.target_bpm||140, key_lock:b.key_lock==='on'};
    const target_duration_sec = duration_min*60;
    // tempo_choice is either a mode keyword (automatic/original/custom/target_bpm) or a bare
    // number string ("25"/"50"/"75"/"100") standing for a fixed Tempo Boost percentage.
    const tc = b.tempo_choice;
    const isNumeric = /^-?\d+(\.\d+)?$/.test(tc);
    const tempo_mode = isNumeric ? 'boost' : tc;
    const tempo_boost_pct = isNumeric ? Number(tc) : (tc==='custom' ? Number(b.custom_pct||0) : null);
    const target_bpm = tc==='target_bpm' ? Number(b.target_bpm||0) : null;
    const key_lock = b.key_lock==='on';
    const btn = f.querySelector('button[type=submit]'); btn.disabled=true; btn.textContent='Starting…';
    try {
      const mix = await post('/api/dj/mixes', {station:S(), workout_type:b.workout_type, intensity:b.intensity, target_duration_sec});
      await post(`/api/dj/mixes/${mix.id}/generate`, {playlist:b.playlist, transition_sec:8, transition_type:'blend',
        tempo_mode, tempo_boost_pct, target_bpm, key_lock});
      toast('Workout mix started — recording in real time, this takes about as long as the mix itself.','ok');
      delete state.pageData.workout; render();
    } catch(e) { toast(e.message,'err'); btn.disabled=false; btn.textContent='Create & Generate Mix'; }
  },
});
Object.assign(ACTIONS, {
  'wo-analyze': ()=>act(()=>post(`/api/dj/analyze?station=${S()}&playlist=${(state._woForm&&state._woForm.playlist)||'workout'}`), 'Analysis started'),
  'wo-delete': async(el)=>{ if(await confirmDlg('Delete this mix? The original Library tracks it was built from are never affected.','Delete',true)) act(()=>del(`/api/dj/mixes/${el.dataset.id}`),'Mix deleted'); },
  'mix-recipe-toggle': async(el)=>{ const id=Number(el.dataset.id); if(state._mixRecipeOpen===id){ state._mixRecipeOpen=null; render(); return; }
    state._mixRecipeOpen=id; render();
    if(!(state._mixRecipeData && state._mixRecipeData[id])){ const m=await api(`/api/dj/mixes/${id}`); state._mixRecipeData=state._mixRecipeData||{}; state._mixRecipeData[id]=m.recipe||[]; render(); } },
});

/* ======================= ALERTS PAGE ======================= */
pages.alerts = { live:true, async load(){ return api('/api/alerts?state=all&limit=300'); }, view(A){ const sev={critical:'err',error:'err',warning:'warn',info:'blue'}; const view=state.alertPage||'active'; const list=A.alerts.filter(a=> view==='active'?a.state!=='resolved':a.state==='resolved'); const c=A.counts;
  return `<div class="page-h"><h2>Alerts</h2><span class="chip red">${c.crit||0} critical</span><span class="chip red">${c.err||0} errors</span><span class="chip amber">${c.warn||0} warnings</span><div class="right"><span class="seg"><button class="${view==='active'?'active':''}" data-act="alert-page" data-v="active">Active</button><button class="${view==='resolved'?'active':''}" data-act="alert-page" data-v="resolved">Resolved (${c.resolved||0})</button></span><button class="btn sm" data-act="alerts-bulk" data-op="read-all">Mark all read</button><button class="btn sm" data-act="alerts-bulk" data-op="clear-read">Clear read</button><button class="btn sm" data-act="alerts-bulk" data-op="clear-resolved">Clear resolved</button></div></div>
  <div class="panel"><div class="panel-b">${list.length?list.map(a=>`<div class="alert ${a.severity} ${a.read?'':'unread'} ${a.state==='resolved'?'resolved':''}" data-key="ap-${a.id}"><span class="led ${a.state==='resolved'?'on':sev[a.severity]}"></span><div><b>${h(a.title)} ${pill(sev[a.severity]==='err'?'red':sev[a.severity]==='warn'?'amber':'blue',a.severity)} ${a.count>1?pill('off','×'+a.count):''} ${a.state==='acknowledged'?pill('blue','acknowledged'):''}</b><p>${h(a.message)}</p><div class="meta">${h(a.station||'system')} · first ${fmtDate(a.ts)} · last ${fmtDate(a.updated_at||a.ts)}${a.state==='resolved'?' · resolved '+fmtDate(a.resolved_at):''}</div></div><div class="acts">${a.state==='open'?`<button class="btn xs" data-act="alert" data-id="${a.id}" data-op="ack">Acknowledge</button>`:''}${a.state!=='resolved'?`<button class="btn xs" data-act="alert" data-id="${a.id}" data-op="resolve">Resolve</button>`:''}<button class="btn xs ghost" data-act="alert" data-id="${a.id}" data-op="clear">Clear</button></div></div>`).join(''):empty(I.check, view==='active'?'No active alerts':'No resolved alerts','Alerts are raised from warnings, errors and critical events; clearing them keeps the event log intact.')}</div></div>`; } };
Object.assign(ACTIONS, { 'alert-page': (el)=>{ state.alertPage=el.dataset.v; render(); } });

/* ======================= LOGS ======================= */
const LOG_SOURCES = [['events','Events'],['liquidsoap','Audio engine'],['ffmpeg','Video'],['stream','Stream service'],['control','Control'],['kernel','Kernel / USB']];
const LOG_RANGES = [['15m','Last 15 minutes'],['1h','Last hour'],['24h','Last 24 hours'],['7d','Last 7 days'],['all','All time']];
const LOG_LEVELS = ['info','warning','error','critical'];
const LOG_LEVEL_RE = { info:/\binfo\b/i, warning:/\bwarn(ing)?\b/i, error:/\berror\b/i, critical:/\b(crit(ical)?|fatal|panic)\b/i };
const logLabel = src => (LOG_SOURCES.find(([v])=>v===src)||[src,src])[1];
const logRangeMs = r => ({'15m':15*60e3,'1h':60*60e3,'24h':24*60*60e3,'7d':7*24*60*60e3}[r]);
// Matches journalctl `-o short-iso` (control/stream) and `dmesg --time-format iso` (kernel)
// leading timestamps, plus ffmpeg's bracket/"===" wrapped `time.strftime(...)` header lines.
// A line that doesn't match at all is time-range-agnostic (kept regardless of the selected
// range) — liquidsoap's own log lines use `YYYY/MM/DD` (slashes), never matched here.
function logLineTs(line) {
  const m = /^(?:\[|===\s*)?(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})([.,]\d+)?\s*([+-]\d{2}:?\d{2}|Z)?/.exec(line);
  if (!m) return null;
  const frac = m[3] ? '.' + m[3].slice(1) : '';
  let off = m[4] || '';
  if (off && off !== 'Z' && !off.includes(':')) off = off.slice(0,3) + ':' + off.slice(3);
  // No offset in the line (e.g. ffmpeg's `time.strftime` header, which is naive local time,
  // not UTC) — leave it off entirely rather than assuming 'Z'/UTC, so the date-only string
  // parses as local time in whatever timezone the viewer's own browser is in. Defaulting to
  // UTC here would silently misfilter by a full timezone offset on a server that isn't UTC.
  const t = Date.parse(`${m[1]}T${m[2]}${frac}${off}`);
  return isNaN(t) ? null : t;
}
function logFiltered(d) {
  const q = (state._logQuery||'').trim().toLowerCase(), sev = state._logSev||'';
  const ms = logRangeMs(state._logRange||'24h'), cutoff = ms ? Date.now()-ms : null;
  if (d.src === 'events') return d.ev.filter(e => {
    if (sev && e.severity !== sev) return false;
    if (cutoff && e.ts*1000 < cutoff) return false;
    if (q && !`${e.category} ${e.message} ${e.station||''}`.toLowerCase().includes(q)) return false;
    return true;
  });
  return (d.lines||[]).filter(line => {
    if (sev && !LOG_LEVEL_RE[sev].test(line)) return false;
    if (cutoff) { const t = logLineTs(line); if (t != null && t < cutoff) return false; }
    if (q && !line.toLowerCase().includes(q)) return false;
    return true;
  });
}
const logRowsToText = (src, rows) => src === 'events'
  ? rows.map(e => `${new Date(e.ts*1000).toISOString()} [${e.severity}] ${e.category}: ${e.message}${e.station?' ('+e.station+')':''}`).join('\n')
  : rows.join('\n');
function logMeta() {
  const f = [`range=${state._logRange||'24h'}`];
  if (state._logSev) f.push(`level=${state._logSev}`);
  if (state._logQuery) f.push(`search=${JSON.stringify(state._logQuery)}`);
  return { station: S(), generated: new Date().toISOString(), filters: f.join(', ') };
}
const logStamp = () => new Date().toISOString().replace(/[-:]/g,'').split('.')[0];
function downloadText(filename, content, mime) {
  const url = URL.createObjectURL(new Blob([content], {type: mime}));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
function logMarkdownOne(src, rows, meta) {
  return `# HUNGREE Goat Diagnostic Log — ${logLabel(src)}\n\n- Station: ${meta.station}\n- Generated: ${meta.generated}\n- Filters: ${meta.filters}\n- Lines: ${rows.length}\n\n` +
    '```\n' + (logRowsToText(src, rows) || '(no lines match current filters)') + '\n```\n';
}
function logJsonOne(src, rows, meta) {
  return JSON.stringify({ source: src, label: logLabel(src), ...meta, count: rows.length, [src==='events'?'events':'lines']: rows }, null, 2);
}
async function logFetchAll() {
  const sev = state._logSev||''; const out = {};
  await Promise.all(LOG_SOURCES.map(async ([src]) => {
    out[src] = src === 'events'
      ? { src, ev: await api(`/api/events?limit=600${sev?'&severity='+sev:''}${state._logAll?'':'&station='+S()}`) }
      : { src, lines: (await api(`/api/logs/${src}?station=${S()}&lines=800`)).lines };
  }));
  return out;
}
async function logBundle(format) {
  toast('Building diagnostic bundle…');
  let all; try { all = await logFetchAll(); } catch(e) { toast('Could not build bundle: '+e.message, 'err'); return; }
  const meta = logMeta(), stamp = logStamp();
  if (format === 'md') {
    let out = `# HUNGREE Goat Diagnostic Bundle\n\n- Station: ${meta.station}\n- Generated: ${meta.generated}\n- Filters: ${meta.filters}\n\n`;
    for (const [src] of LOG_SOURCES) { const rows = logFiltered(all[src]); out += `## ${logLabel(src)}\n\n` + '```\n' + (logRowsToText(src, rows) || '(no lines match current filters)') + '\n```\n\n'; }
    downloadText(`hungreegoat-diagnostic-bundle-${S()}-${stamp}.md`, out, 'text/markdown');
  } else {
    const obj = { ...meta, sources: {} };
    for (const [src] of LOG_SOURCES) { const rows = logFiltered(all[src]); obj.sources[src] = { label: logLabel(src), count: rows.length, [src==='events'?'events':'lines']: rows }; }
    downloadText(`hungreegoat-diagnostic-bundle-${S()}-${stamp}.json`, JSON.stringify(obj, null, 2), 'application/json');
  }
  toast('Diagnostic bundle downloaded', 'ok');
}
// Body-level fixed-position portal (click-toggle sibling of the hover-driven .tt-portal in
// app.js) — a popover nested inside .panel gets clipped/mispositioned by backdrop-filter's
// containing-block behavior, the same root cause already fixed once for tooltips.
let logMenuEl = null, logMenuOpenFor = null;
function logMenuEnsure() { if (!logMenuEl) { logMenuEl = document.createElement('div'); logMenuEl.className = 'log-menu'; document.body.appendChild(logMenuEl); } return logMenuEl; }
function logMenuClose() { if (logMenuEl) logMenuEl.classList.remove('show'); logMenuOpenFor = null; }
function logMenuOpen(trigger) {
  const el = logMenuEnsure();
  el.innerHTML = [['log-export-txt','Download as .txt'],['log-export-md','Download as Markdown (.md)'],['log-export-json','Download as JSON (.json)']]
    .map(([a,l])=>`<button type="button" data-act="${a}">${l}</button>`).join('') + '<div class="log-menu-sep"></div>' +
    [['log-export-bundle-md','Diagnostic bundle (.md, all sources)'],['log-export-bundle-json','Diagnostic bundle (.json, all sources)']]
    .map(([a,l])=>`<button type="button" data-act="${a}">${l}</button>`).join('');
  el.style.visibility = 'hidden'; el.classList.add('show');
  const r = trigger.getBoundingClientRect(), w = el.offsetWidth, hgt = el.offsetHeight;
  el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  el.style.top = ((r.bottom + 6 + hgt <= window.innerHeight) ? r.bottom + 6 : Math.max(8, r.top - hgt - 6)) + 'px';
  el.style.visibility = ''; logMenuOpenFor = trigger;
}
document.addEventListener('click', e => {
  if (!logMenuOpenFor) return;
  if (e.target.closest('.log-menu') || logMenuOpenFor.contains(e.target)) return;
  logMenuClose();
}, true);
window.addEventListener('hashchange', logMenuClose);
document.addEventListener('keydown', e => { if (e.key === 'Escape') logMenuClose(); });

pages.logs = { live:true, async load(){ const src=state._logSrc||'events'; if(src==='events'){ const sev=state._logSev||''; return {src, ev: await api(`/api/events?limit=600${sev?'&severity='+sev:''}${state._logAll?'':'&station='+S()}`)}; } return {src, lines:(await api(`/api/logs/${src}?station=${S()}&lines=800`)).lines}; },
  view(d){ const src=d.src, rows=logFiltered(d), range=state._logRange||'24h', total=src==='events'?d.ev.length:(d.lines||[]).length;
    const body = src==='events'
      ? `<div class="events" style="max-height:70vh">${rows.map(e=>`<div class="ev" data-key="lv-${e.id}"><span class="led ${{info:'blue',warning:'warn',error:'err',critical:'err'}[e.severity]}"></span><span class="t" style="width:auto">${fmtDate(e.ts)}</span><span class="m" style="white-space:normal">${pill({info:'off',warning:'amber',error:'red',critical:'red'}[e.severity],e.severity)} <span class="muted2 small">${h(e.category)}</span> ${h(e.message)}${e.station?`<small>${h(e.station)}</small>`:''}</span></div>`).join('')||empty(I.logs, total?'No matching events':'No events', total?'Try widening the time range, level, or search.':'Track changes and system events appear here.')}</div>`
      : `<div class="logbox">${rows.length?h(rows.join('\n')):(total?'No lines match the current search / time range / level filters.':'(empty)')}</div>`;
    const toolbar = `<div class="logs-toolbar">
      <div class="row">
        <div class="search">${I.search}<input placeholder="Search logs…" value="${h(state._logQuery||'')}" data-input="log-search"></div>
        <select class="sel" data-change="log-range">${LOG_RANGES.map(([v,l])=>`<option value="${v}" ${range===v?'selected':''}>${l}</option>`).join('')}</select>
        <select class="sel" data-change="log-sev"><option value="">All levels</option>${LOG_LEVELS.map(x=>`<option value="${x}" ${state._logSev===x?'selected':''}>${x[0].toUpperCase()+x.slice(1)}</option>`).join('')}</select>
        ${src==='events'?`<label class="small muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-change="log-all" ${state._logAll?'checked':''}> all stations</label>`:''}
      </div>
      <div class="row"><span class="seg">${LOG_SOURCES.map(([v,l])=>`<button class="${src===v?'active':''}" data-act="logsrc" data-v="${v}">${l}</button>`).join('')}</span></div>
      <div class="row actions">
        <button class="btn sm" data-act="log-copy">${I.copy} Copy Current</button>
        <button class="btn sm" data-act="log-export-toggle">Export Logs ▾</button>
        <button class="btn sm" data-act="log-refresh">${I.restart} Refresh</button>
      </div>
      ${range!=='all'&&(src==='liquidsoap'||src==='ffmpeg')?`<div class="log-hint muted small">Time filter is best-effort on this log source — lines without a recognizable timestamp are always shown.</div>`:''}
    </div>`;
    return `<div class="page-h"><h2>Logs</h2><span class="right muted small">${rows.length} of ${total} shown</span></div><div class="panel"><div class="panel-b">${toolbar}${body}</div></div>`; } };
Object.assign(ACTIONS, {
  'logsrc': (el)=>{ state._logSrc=el.dataset.v; logMenuClose(); delete state.pageData.logs; render(); },
  'log-refresh': ()=>{ logMenuClose(); delete state.pageData.logs; render(); },
  'log-copy': async()=>{ const d=state.pageData.logs; if(!d) return; const rows=logFiltered(d); const text=logRowsToText(d.src, rows)||'(no lines match current filters)';
    try { await navigator.clipboard.writeText(text); toast(`Copied ${rows.length} line${rows.length===1?'':'s'} from ${logLabel(d.src)}`, 'ok'); }
    catch(e) { toast('Clipboard blocked by the browser — use Export instead', 'err'); } },
  'log-export-toggle': (el)=>{ if (logMenuOpenFor===el) logMenuClose(); else logMenuOpen(el); },
  'log-export-txt': ()=>{ logMenuClose(); const d=state.pageData.logs; if(!d) return; const rows=logFiltered(d); downloadText(`hungreegoat-${d.src}-${S()}-${logStamp()}.txt`, logRowsToText(d.src, rows)||'(no lines match current filters)', 'text/plain'); },
  'log-export-md': ()=>{ logMenuClose(); const d=state.pageData.logs; if(!d) return; const rows=logFiltered(d); downloadText(`hungreegoat-${d.src}-${S()}-${logStamp()}.md`, logMarkdownOne(d.src, rows, logMeta()), 'text/markdown'); },
  'log-export-json': ()=>{ logMenuClose(); const d=state.pageData.logs; if(!d) return; const rows=logFiltered(d); downloadText(`hungreegoat-${d.src}-${S()}-${logStamp()}.json`, logJsonOne(d.src, rows, logMeta()), 'application/json'); },
  'log-export-bundle-md': ()=>{ logMenuClose(); return logBundle('md'); },
  'log-export-bundle-json': ()=>{ logMenuClose(); return logBundle('json'); },
});
Object.assign(CHANGES, {
  'log-sev': (el)=>{ state._logSev=el.value; delete state.pageData.logs; render(); },
  'log-all': (el)=>{ state._logAll=el.checked; delete state.pageData.logs; render(); },
  'log-range': (el)=>{ state._logRange=el.value; render(); },
  'log-search': (el)=>{ state._logQuery=el.value; render(); },
});

/* ======================= SETTINGS ======================= */
pages.settings = { view(){ const s=st(); const ov=state.overview; const sys=ov.system; const set=s.settings; return `<div class="page-h"><h2>Settings</h2></div>
  <div class="two"><div class="panel"><div class="panel-h"><h3>${ic(I.cog)}Station — ${h(s.name)}</h3></div><div class="panel-b"><div class="rules">
    ${rule('shuffle', I.shuffle, 'Shuffle Mode', set.shuffle)}${rule('sequential', I.list, 'Sequential Mode', set.sequential)}${rule('weighted_rotation', I.shuffle, 'Weighted Rotation', set.weighted_rotation, 'Tracks not heard for a while are favoured')}${rule('normalization', I.bars, 'ReplayGain / Normalization', set.normalization, 'Per-track gain toward −18 LUFS + live normaliser')}${rule('silence_guard', I.shield, 'Silence Guard', set.silence_guard, 'Skip after 12 s of silence and log the event')}${rule('cue_points', I.cut, 'Cue Points', set.cue_points)}${rule('request_queue_enabled', I.queue, 'Request Queue', set.request_queue_enabled)}
    <div class="rule"><span class="ic">${I.wave}</span><span class="lbl">Track fade-in<small>gentle start for each track</small></span><select class="sel" data-change="setting" data-key="crossfade_sec">${[0,1,2,3,5].map(v=>`<option value="${v}" ${Number(set.crossfade_sec)===v?'selected':''}>${v?v+' sec':'Off'}</option>`).join('')}</select></div></div></div></div>
  <div style="display:flex;flex-direction:column;gap:12px"><div class="panel"><div class="panel-h"><h3>${ic(I.cpu,'blue')}System</h3></div><div class="panel-b"><dl class="kv"><dt>Host</dt><dd>${h(sys.hostname)} · ${sys.cores} cores · up ${fmtLong(sys.uptime_sec)}</dd><dt>Load</dt><dd>${sys.load.join(' / ')}</dd><dt>RAM</dt><dd>${fmtBytes(sys.ram.used)} / ${fmtBytes(sys.ram.total)}</dd><dt>Root disk</dt><dd>${sys.root_disk.percent}% used · ${fmtBytes(sys.root_disk.free)} free</dd><dt>HUNGREE-GOAT</dt><dd>${sys.usb.mounted?`${sys.usb.percent}% used · ${fmtBytes(sys.usb.free)} free · ${sys.usb.writable?'writable':'<span class="red">READ-ONLY / FAULT</span>'}`:'<span class="red">not mounted</span>'}</dd><dt>Throttle</dt><dd class="mono">${h(sys.throttle.raw||'n/a')}${sys.throttle.under_voltage?' · UNDER-VOLTAGE':''}</dd><dt>Control</dt><dd>up ${fmtLong(ov.control.uptime_sec)} · assets ${h(window.HGC_V||'')}</dd></dl>${(!sys.usb.writable||sys.usb.fs_shutdown)?`<button class="btn amber sm" data-act="usb-repair">Repair drive</button>`:''}</div></div>
    <div class="panel"><div class="panel-h"><h3>${ic(I.cog)}Operator password${help('Changes the single operator account password used to sign in here. You stay signed in afterward — this does not log you out.')}</h3></div><div class="panel-b"><form data-form="password" class="form" autocomplete="off"><label>Current password<span style="position:relative"><input class="inp" type="password" name="current" required autocomplete="current-password" style="width:100%"><button type="button" class="btn xs ghost icon pw-eye" data-act="pw-show" data-for="current" style="position:absolute;right:2px;top:2px" tabindex="-1">${I.eye}</button></span></label><label>New password<span style="position:relative"><input class="inp" type="password" name="new" minlength="9" required autocomplete="new-password" style="width:100%"><button type="button" class="btn xs ghost icon pw-eye" data-act="pw-show" data-for="new" style="position:absolute;right:2px;top:2px" tabindex="-1">${I.eye}</button></span><span class="small muted2" style="font-weight:400">Minimum 9 characters</span></label><label>Confirm new password<span style="position:relative"><input class="inp" type="password" name="confirm" minlength="9" required autocomplete="new-password" style="width:100%"><button type="button" class="btn xs ghost icon pw-eye" data-act="pw-show" data-for="confirm" style="position:absolute;right:2px;top:2px" tabindex="-1">${I.eye}</button></span></label><div class="wide err" id="pw-err" style="color:var(--red);font-size:12px;min-height:16px"></div><div class="wide row-actions" style="margin-top:2px"><button class="btn gold sm" type="submit">Change password</button></div></form></div></div>
    <div class="panel"><div class="panel-h"><h3>${ic(I.image,'gold')}Public website${help('Settings that affect only what hungreegoat.com shows the public — never the operator-facing Queue page, which always shows the full engine horizon.')}</h3></div><div class="panel-b"><div class="rule"><span class="ic">${I.list}</span><span class="lbl">Website Up Next Count<small>Number of upcoming tracks shown publicly on hungreegoat.com</small></span><select class="sel" data-change="setting" data-key="public_up_next_count" style="height:34px">${[3,5,10].map(v=>`<option value="${v}" ${Number(set.public_up_next_count||5)===v?'selected':''}>${v} tracks</option>`).join('')}</select></div></div></div>
    <div class="panel"><div class="panel-h"><h3>${ic(I.link,'cyan')}Remote access</h3></div><div class="panel-b small muted">The app uses same-origin API calls, path-relative assets and proxy-aware cookies, so it can sit behind an HTTPS reverse proxy at <span class="mono">control.hungreegoat.com</span> without code changes. Keep port 8090 off the public internet; publish only through the HTTPS gateway with authentication in front.</div></div></div></div>`; } };
Object.assign(ACTIONS, { 'pw-show': (el)=>{ const inp=el.parentElement.querySelector('input'); if(!inp) return; inp.type = inp.type==='password'?'text':'password'; } });
Object.assign(FORMS, { 'password': async(f,b)=>{ const err=f.querySelector('#pw-err');
  if(b.new.length<9){ err.textContent='New password must be at least 9 characters.'; return; }
  if(b.new!==b.confirm){ err.textContent='New password and confirmation do not match.'; return; }
  if(b.new===b.current){ err.textContent='New password must be different from your current password.'; return; }
  err.textContent='';
  const r=await act(()=>post('/api/password',{current:b.current,new:b.new}),'Password changed — you stay signed in',{noRefresh:true}); if(r) f.reset(); } });
})();
