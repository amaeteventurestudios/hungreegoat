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
pages.dashboard = { view(){ const s=st(), ov=state.overview; const np=s.now_playing, sys=ov.system, stream=s.stream, sched=s.schedule, set=s.settings;
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
  <div class="hide-m"><span class="toggle green ${t.enabled?'on':''}" data-act="track-enable" data-id="${t.id}" title="${t.enabled?'Enabled':'Disabled'}"></span></div>
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
    <div class="panel-b" style="gap:8px"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><div class="search" style="flex:1;min-width:160px">${I.search}<input placeholder="Filter this playlist…" value="${h(state._plq||'')}" data-input="pl-filter"></div><select class="sel" data-change="pl-sort" style="height:36px">${[['position','Playlist order'],['title','Title'],['duration','Duration']].map(([v,l])=>`<option value="${v}" ${sort===v?'selected':''}>${l}</option>`).join('')}</select>${cur.slug==='all'?'':`<button class="btn sm" data-act="pl-add-open">${I.plus} Add tracks</button>`}${['jingles','station_ids'].includes(cur.kind)?`<button class="btn sm gold" data-act="upload-open">${I.upload} Upload ${cur.kind==='jingles'?'jingles':'station IDs'}</button>`:''}</div>
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
pages.youtube = { live:true, async load(){ return api(`${P()}/youtube`); }, view(y){ const s=st(); const m=y.meta||{}; const show=state._showKey;
  return `<div class="page-h"><h2>YouTube Setup</h2><span class="chip ${y.configured?'green':'amber'}">${y.configured?'stream key saved':'stream key needed'}</span><span class="chip ${y.output_enabled?'blue':'slate'}">${y.output_enabled?'output enabled':'output disabled'}</span></div>
  <div class="two"><div class="panel"><div class="panel-h"><h3>${ic(I.yt,'red')}Credentials — ${h(s.short)}</h3><span class="right small">${y.saved_at?'saved '+fmtDate(y.saved_at):''}</span></div><div class="panel-b">
    <form data-form="youtube" class="form"><label class="wide">RTMPS endpoint<input class="inp mono" name="rtmps_url" value="${h(y.rtmps_url)}" required></label>
    <label class="wide">Stream key ${y.configured?`<span class="muted2">(currently ${h(y.key_masked)} — leave blank to keep)</span>`:''}<div style="display:flex;gap:6px"><input class="inp mono" name="stream_key" type="${show?'text':'password'}" placeholder="${y.configured?'••••••••••••••••':'paste the stream key from YouTube Studio'}" autocomplete="off" style="flex:1"><button type="button" class="btn icon" data-act="key-show" title="${show?'Hide':'Show'} while typing">${I.eye}</button></div></label>
    <label>Output enabled<select class="sel" name="output_enabled"><option value="1" ${y.output_enabled?'selected':''}>Yes — publish to YouTube</option><option value="0" ${!y.output_enabled?'selected':''}>No — encode only</option></select></label><label>Station destination<input class="inp" value="${h(s.name)}" disabled></label>
    <div class="wide note small">The key is written to <code>~/hungree-goat/secrets/youtube-${S()}.env</code> (mode 600), never logged, never sent back to the browser, and never committed to Git. Saving a new key restarts the video output.</div>
    <div class="row-actions">${y.configured?`<button type="button" class="btn red" data-act="yt-clear">${I.x} Remove key</button>`:''}<button type="button" class="btn" data-act="yt-test">${I.link} Test connection</button><button class="btn gold" type="submit">${I.check} Save</button></div></form>
    <div id="yt-test" class="small" style="min-height:18px">${state._ytTest?`<span class="${state._ytTest.ok?'green':'red'}">${h(state._ytTest.ok?`Reachable: ${state._ytTest.host} (${state._ytTest.ip}) · ${state._ytTest.tls} · ${state._ytTest.ms} ms`:`Failed: ${state._ytTest.error}`)}</span><div class="muted2">${h(state._ytTest.note||'')}</div>`:''}</div>
    <dl class="kv" style="margin-top:8px"><dt>Connection</dt><dd>${y.state==='running'&&y.target==='youtube'?`<span class="green">publishing</span> · ${Math.round(y.bitrate_kbps||0)} kbps · up ${fmtLong(y.uptime_sec)}`:y.state==='waiting'?`<span class="amber">waiting</span> · ${h(y.last_error||'')}`:h(y.state||'stopped')}</dd><dt>Last successful</dt><dd>${y.last_connected?fmtDate(y.last_connected):'never'}</dd><dt>Encoder</dt><dd>${y.encoder.resolution} @ ${y.encoder.fps} fps · ${y.encoder.video_kbps} kbps video · ${y.encoder.audio_kbps} kbps AAC</dd></dl></div>
    <div class="panel-f qa">${svcButtons(s.stream.service,{startAct:'stream-start',stopAct:'stream-stop',restartAct:'stream-restart',startDisabled:s.library.empty,startDisabledTitle:'Station library is empty — add media first',suffix:'Output'})}</div></div>
  <div class="panel"><div class="panel-h"><h3>${ic(I.tag)}Broadcast Details</h3><span class="right">${pill('warn','Requires YouTube Studio')}</span></div><div class="panel-b">
    <div class="note warn small">HUNGREE Goat Control has no YouTube API authorization, so these fields are kept as your operator reference and for a future integration — apply them in YouTube Studio → Go live → Stream settings.</div>
    <form data-form="youtube-meta" class="form"><label class="wide">Stream title<input class="inp" name="title" value="${h(m.title||'')}" placeholder="HUNGREE Goat ${h(s.short)} — 24/7 Study · Chill · Relax"></label><label class="wide">Description<textarea class="inp" name="description" rows="3">${h(m.description||'')}</textarea></label>
    <label>Category<select class="sel" name="category">${['Music','Entertainment','People & Blogs'].map(c=>`<option ${(m.category||'Music')===c?'selected':''}>${c}</option>`).join('')}</select></label><label>Latency<select class="sel" name="latency">${[['normal','Normal (recommended 24/7)'],['low','Low'],['ultra','Ultra-low']].map(([v,l])=>`<option value="${v}" ${(m.latency||'normal')===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Visibility<select class="sel" name="visibility">${['Public','Unlisted','Private'].map(c=>`<option ${(m.visibility||'Public')===c?'selected':''}>${c}</option>`).join('')}</select></label><label>Channel<input class="inp" name="channel" value="${h(m.channel||'')}" placeholder="HUNGREE Goat Music"></label>
    <label class="wide">Public watch URL <span class="muted2">(used by hungreegoat.com "Watch on YouTube")</span><input class="inp mono" name="public_url" value="${h(m.public_url||'')}" placeholder="https://www.youtube.com/@yourchannel/live"></label>
    <label class="wide">Public station description<input class="inp" name="public_description" value="${h(m.public_description||'')}" placeholder="Shown on the public homepage and player"></label>
    <div class="row-actions"><button class="btn gold" type="submit">Save details</button></div></form>
    <div class="small muted">Human-only steps in YouTube Studio: enable live streaming on the channel, create the stream, set title/description/category/visibility/latency/DVR, copy the stream key here.</div></div></div></div>`; } };
Object.assign(ACTIONS, { 'key-show': ()=>{ state._showKey=!state._showKey; render(); }, 'yt-clear': async()=>{ if(await confirmDlg('Remove the saved YouTube stream key? The output will stop publishing.','Remove key',true)){ const r=await act(()=>post(`${P()}/youtube`,{rtmps_url:state.pageData.youtube.rtmps_url, clear_key:true}),'Stream key removed'); if(r){ delete state.pageData.youtube; render(); } } }, 'yt-test': async()=>{ state._ytTest=null; render(); state._ytTest=await post(`${P()}/youtube/test`).catch(e=>({ok:false,error:e.message})); render(); } });
Object.assign(FORMS, { 'youtube': async(f,b)=>{ const body={rtmps_url:b.rtmps_url, output_enabled:b.output_enabled==='1'}; if(b.stream_key&&b.stream_key.trim()) body.stream_key=b.stream_key.trim(); const r=await act(()=>post(`${P()}/youtube`,body), body.stream_key?'Stream key saved — output restarting':'Saved'); if(r){ f.stream_key.value=''; state._showKey=false; delete state.pageData.youtube; render(); } },
  'youtube-meta': async(f,b)=>{ const r=await act(()=>post(`${P()}/youtube`,{rtmps_url:state.pageData.youtube.rtmps_url, meta:b}),'Broadcast details saved'); if(r){ delete state.pageData.youtube; render(); } } });

/* ======================= PLAYER SKINS ======================= */
const TIMES4=[['dawn','Dawn'],['afternoon','Afternoon'],['dusk','Dusk'],['night','Night']];
const ACCENT_PRESETS=[['Gold','#f2c14e'],['Blue','#4f8cff'],['Orange','#ff8a3d'],['Green','#2ecc8a'],['Teal','#38d6e8']];
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

    <div class="wide" style="margin-top:4px"><b style="font:700 12px var(--display);color:var(--gold3)">2 · SKIN VISUAL</b></div>
    <div class="wide" data-drop data-drop-kind="skin-visual"><div class="preview" style="aspect-ratio:16/9;max-width:420px">${isVideo?`<video src="${h(e.video)}" ${e.thumbnail?`poster="${h(e.thumbnail)}"`:''} autoplay muted loop playsinline></video>`:e.image?`<img class="bg" src="${h(e.image)}" alt="">`:`<div class="ph">No visual uploaded yet — upload or drag one below</div>`}</div>
      ${visUrl?`<div class="small muted" style="margin-top:6px">This is the media currently attached to this skin.${e.probe?` ${e.probe.width&&e.probe.height?`${e.probe.width}×${e.probe.height} · `:''}${e.probe.duration?`${e.probe.duration}s · `:''}${fmtBytes(e.probe.bytes)} · ${h(e.probe.format).toUpperCase()} — ${e.probe.meets_recommended?'<span class="green">meets recommended specs</span>':'<span class="amber">below recommended specs (will still work)</span>'}`:''}</div>`:''}
      <div class="mediaActions">
        <label class="mediaAction" title="Upload or drop a video here">${I.upload}<b>Upload Video</b><small>MP4 / WebM — or drag &amp; drop</small><input type="file" accept="video/mp4,video/webm" class="hidden" data-change="skin-visual" data-kind="video"></label>
        <label class="mediaAction" title="Upload or drop an image here">${I.image}<b>Upload Image</b><small>PNG / JPEG / WebP — or drag &amp; drop</small><input type="file" accept="image/*" class="hidden" data-change="skin-visual" data-kind="image"></label>
      </div></div>

    <div class="wide" style="margin-top:4px"><b style="font:700 12px var(--display);color:var(--gold3)">3 · THUMBNAIL</b></div>
    <div class="wide" data-drop data-drop-kind="skin-thumbnail" style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
      <div class="preview" style="width:140px;aspect-ratio:8/5;flex:none">${e.thumbnail?`<img class="bg" src="${h(e.thumbnail)}" alt="">`:`<div class="ph small">No thumbnail yet</div>`}</div>
      <div class="mediaActions">
        <button type="button" class="mediaAction ${visUrl?'':'disabled'}" data-act="skin-thumb-gen" ${visUrl?'':'disabled'} title="${visUrl?'Extract a still frame / resized copy from the visual above':'Upload a visual first'}">${I.image}<b>Generate</b><small>from visual</small></button>
        <label class="mediaAction" title="Upload or drop a thumbnail image">${I.upload}<b>Upload Custom</b><small>PNG / JPEG / WebP — or drag &amp; drop</small><input type="file" accept="image/*" class="hidden" data-change="skin-visual" data-kind="thumbnail"></label>
      </div></div>

    <div class="wide" style="margin-top:4px"><b style="font:700 12px var(--display);color:var(--gold3)">4 · TIME BEHAVIOR</b></div>
    <div class="wide"><label style="display:flex;align-items:flex-start;gap:8px;font-weight:600;font-size:12.5px;cursor:pointer"><input type="radio" name="time_mode" style="margin-top:2px" ${e.time_mode==='always'?'checked':''} data-act="skin-timemode" value="always"> <span>Same scene all day <span class="muted2" style="display:block;font-weight:500;margin-top:2px">(recommended) One visual. The Player automatically dims/warms it for dawn, afternoon, dusk and night — you don't upload anything extra.</span></span></label>
    <label style="display:flex;align-items:flex-start;gap:8px;font-weight:600;font-size:12.5px;margin-top:10px;cursor:pointer"><input type="radio" name="time_mode" style="margin-top:2px" ${e.time_mode==='variants'?'checked':''} data-act="skin-timemode" value="variants"> <span>Different visual per time of day<span class="muted2" style="display:block;font-weight:500;margin-top:2px">Upload a separate video/image for Dawn, Afternoon, Dusk and/or Night. Any time you don't provide one for still uses the main visual above.</span></span></label>
    ${e.time_mode==='variants'?`<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:10px">${TIMES4.map(([tk,tl])=>{ const v=e.time_variants[tk]||{}; return `<div class="panel" style="padding:8px"><div class="small muted" style="margin-bottom:4px">${tl}</div><div class="preview" style="aspect-ratio:16/9">${v.video?`<video src="${h(v.video)}" muted loop playsinline autoplay></video>`:v.image?`<img class="bg" src="${h(v.image)}" alt="">`:`<div class="ph small">Uses the main visual</div>`}</div><label class="btn xs" style="margin-top:6px;width:100%;justify-content:center">${I.upload} Upload<input type="file" accept="video/mp4,video/webm,image/*" class="hidden" data-change="skin-variant" data-time="${tk}"></label></div>`; }).join('')}</div>`:''}</div>

    <div class="wide" style="margin-top:4px"><b style="font:700 12px var(--display);color:var(--gold3)">5 · ACCENT COLOUR</b></div>
    <div class="wide" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <input type="color" value="${h(e.accent)}" data-input="skin-accent" style="width:44px;height:34px;padding:2px;border-radius:8px">
      <input class="inp mono" style="width:110px" value="${h(e.accent)}" data-input="skin-accent-hex" maxlength="7">
      <span class="chip" style="background:${h(e.accent)}22;border-color:${h(e.accent)}55;color:${h(e.accent)}">Aa Preview</span>
      ${ACCENT_PRESETS.map(([n,c])=>`<button type="button" class="btn xs" data-act="skin-accent-preset" data-c="${c}" style="border-color:${c}"><span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${c};margin-right:5px"></span>${n}</button>`).join('')}
    </div>

    <div class="wide" style="margin-top:4px"><b style="font:700 12px var(--display);color:var(--gold3)">6 · DEFAULT AMBIENCE</b></div>
    <div class="wide">${ambRows||'<div class="small muted">No default ambience — the player opens with the mixer silent.</div>'}
      ${addable.length?`<div style="margin-top:8px"><select class="sel" id="skin-amb-add" style="height:34px">${addable.map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select> <button type="button" class="btn xs" data-act="skin-amb-add">${I.plus} Add Ambient Sound</button></div>`:''}</div>

    <div class="wide" style="margin-top:4px"><b style="font:700 12px var(--display);color:var(--gold3)">7 · PREVIEW SKIN</b></div>
    <div class="wide"><div class="seg">${TIMES4.map(([tk,tl])=>`<button type="button" class="${e.previewTime===tk?'active':''}" data-act="skin-preview-time" data-t="${tk}">${tl}</button>`).join('')}</div>
      <div class="preview" style="aspect-ratio:16/9;max-width:420px;margin-top:8px;border-color:${h(e.accent)}55">${previewSrc?(previewSrc.match(/\.(mp4|webm)(\?|$)/)?`<video src="${h(previewSrc)}" ${e.thumbnail?`poster="${h(e.thumbnail)}"`:''} autoplay muted loop playsinline></video>`:`<img class="bg" src="${h(previewSrc)}" alt="">`):`<div class="ph">No visual yet</div>`}<span class="lbl">${e.previewTime.toUpperCase()}</span></div></div>

    <div class="wide" style="margin-top:4px"><b style="font:700 12px var(--display);color:var(--gold3)">8 · PUBLISHING</b></div>
    <div class="wide rules"><div class="rule"><span class="lbl">Enabled — visible in the player's scene picker</span><span class="toggle ${e.enabled?'on':''}" data-act="skin-toggle-enabled"></span></div>
    <div class="rule"><span class="lbl">Set as default scene</span><span class="toggle ${e.default?'on':''}" data-act="skin-toggle-default"></span></div>
    <div class="rule"><span class="lbl">Also use for YouTube broadcast<small>${canBroadcast(e)?'Makes this video selectable in Broadcast Visuals — independent of whether it\'s enabled here':'Needs an uploaded video (not an image, and not an externally-hosted one) to be broadcast-eligible'}</small></span><span class="toggle ${e.broadcastEligible?'on':''} ${canBroadcast(e)?'':'disabled'}" data-act="skin-toggle-broadcast"></span></div></div>
  </div>
  <div class="row-actions" style="position:sticky;bottom:-16px;background:var(--panel2);padding:12px 0 2px;margin-top:14px"><button type="button" class="btn" data-act="skin-cancel">Cancel</button><button type="button" class="btn gold" data-act="skin-save" ${e.saving?'disabled':''}>${e.saving?'Saving…':'Save Skin'}</button></div>`; }
Object.assign(ACTIONS, {
  'skin-new': async()=>{ const draft=await post('/api/skins/draft'); skinEditOpen(draft,true); },
  'skin-edit': (el)=>skinEditOpen(state.pageData.skins.skins.find(x=>x.id===el.dataset.id),false),
  'skin-preview': (el)=>{ const s=state.pageData.skins.skins.find(x=>x.id===el.dataset.id); modal(()=>{ const src=s.video||s.image; return `<h3>${I.eye} Preview — ${h(s.name)}<button class="btn xs ghost icon x" data-act="close-modal">${I.x}</button></h3><div class="preview" style="aspect-ratio:16/9">${src?(s.video?`<video src="${h(src)}" autoplay muted loop playsinline></video>`:`<img class="bg" src="${h(src)}" alt="">`):`<div class="ph">No visual uploaded yet</div>`}</div><div class="chips" style="margin-top:10px">${pill(s.source==='built-in'?'blue':'gold',s.source)}${pill(s.enabled?'on':'off',s.enabled?'enabled':'disabled')}${s.default?pill('gold','default'):''}${s.broadcast_eligible?pill('cyan','broadcast-eligible'):''}</div>`; }); },
  'skin-toggle': async(el)=>{ const s=state.pageData.skins.skins.find(x=>x.id===el.dataset.id); await act(()=>put(`/api/skins/${s.id}`,{name:s.name,description:s.description,enabled:!s.enabled,accent:s.accent,ambience:s.ambience,order:s.order,time_mode:s.time_mode,time_variants:s.time_variants}), s.enabled?'Skin disabled':'Skin enabled'); delete state.pageData.skins; render(); },
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
    if(r){ e.thumbnail=`/v1/skins/assets/${r.file}`; delete state.pageData.skins; modal(()=>skinEditorHtml()); } else el.disabled=false; },
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
  const url=`/v1/skins/assets/${r.file}`;
  if(kind==='video'){ e.video=url; e.image=null; } else if(kind==='image'){ e.image=url; e.video=null; } else e.thumbnail=url;
  if(r.thumbnail) e.thumbnail=r.thumbnail;   // a video/image upload can auto-generate one — reflect it immediately
  e.probe=r.probe||e.probe; delete state.pageData.skins; modal(()=>skinEditorHtml());
  return r;
}
Object.assign(CHANGES, {
  'skin-visual': async(el)=>{ const f=el.files[0]; if(!f) return; await skinUploadAsset(f, el.dataset.kind); },
  'skin-variant': async(el)=>{ const f=el.files[0]; if(!f) return; const e=SKIN_EDIT; const kind=/\.(mp4|webm)$/i.test(f.name)?'video':'image'; const fd=new FormData(); fd.append('file',f); toast(`Uploading ${f.name}…`);
    const r=await act(()=>api(`/api/skins/${e.id}/asset/${kind}?time_key=${el.dataset.time}`,{method:'POST',body:fd}),'Variant uploaded',{noRefresh:true}); if(!r) return;
    e.time_variants[el.dataset.time]={...(e.time_variants[el.dataset.time]||{}), [kind]:`/v1/skins/assets/${r.file}`}; delete state.pageData.skins; modal(()=>skinEditorHtml()); },
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
    <h3 style="margin:0 0 8px;font:800 15px var(--display)">${ic(I.image,'blue')}ALL ELIGIBLE VISUALS (${d.eligible_visuals.length})${help('Every video currently flagged for broadcast use, whether or not it is in an active collection.')}</h3>
    <div class="grid eq" style="grid-template-columns:repeat(auto-fill,minmax(min(200px,100%),1fr))">${d.eligible_visuals.length?d.eligible_visuals.map(v=>`<div class="panel"><div class="preview" style="aspect-ratio:16/9;border-radius:16px 16px 0 0;border:0">${v.thumbnail?`<img class="bg" src="${h(v.thumbnail)}" alt="">`:`<div class="ph small">No thumbnail</div>`}</div><div class="panel-b"><b style="font:800 12.5px var(--display)">${h(v.name)}</b></div></div>`).join(''):`<div class="panel"><div class="panel-b">${empty(I.film,'No eligible visuals yet','Upload a video on Player Skins and turn on "Also use for YouTube broadcast".',`<a class="btn sm gold" href="#/skins">${I.image} Player Skins</a>`)}</div></div>`}</div>`}`; } };
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
function mixRow(m){
  const [cls,lbl]=MIX_STATUS_PILL[m.status]||['slate',m.status]; const busy = m.status==='recording'||m.status==='mastering'||m.status==='creating';
  return `<div class="row" data-key="mix-${m.id}" style="align-items:center">
    <div class="tt" style="flex:1;min-width:0"><b>${h(m.title)}</b><span>${WORKOUT_LABELS[m.workout_type]||h(m.workout_type||'')} · ${h(m.intensity||'')}${m.measured_lufs!=null?` · ${m.measured_lufs.toFixed(1)} LUFS`:''}</span></div>
    <span class="dur">${m.actual_duration_sec?fmtDur(m.actual_duration_sec):(m.target_duration_sec?'~'+fmtDur(m.target_duration_sec):'')}</span>
    <span class="pill ${cls}">${lbl}${busy?' …':''}</span>
    <span class="acts">${m.status==='ready'?`<audio controls preload="none" style="height:32px;max-width:220px" src="/api/dj/mixes/${m.id}/audio.wav"></audio><a class="btn xs icon ghost" href="/api/dj/mixes/${m.id}/download" title="Download">${I.upload}</a>`:''}<button class="btn xs icon red" data-act="wo-delete" data-id="${m.id}" title="Delete">${I.trash}</button></span>
  </div>`;
}
pages.workout = { live:true, async load(){
  const [mixes, analyzeStatus, pls] = await Promise.all([
    api(`/api/dj/mixes?station=${S()}`), api('/api/dj/analyze/status'), api(`${P()}/playlists`)
  ]);
  return {mixes, analyzeStatus, workoutPlaylists: pls.filter(p=>p.kind==='workout')};
}, view(d){
  const wf = state._woForm || (state._woForm = {playlist:(d.workoutPlaylists[0]||{}).slug||'workout', workout_type:'general', intensity:'moderate', duration_min:5});
  const pendingAnalyze = d.analyzeStatus.running;
  return `<div class="page-h"><h2>Workout DJ</h2><div class="right"><a class="btn sm" href="/dj/index.html" target="_blank" rel="noopener">${I.headphones} Full DJ Console</a></div></div>
  <div class="panel" style="padding:16px 18px;margin-bottom:14px">
    <p class="small muted" style="margin:0 0 12px;line-height:1.55">Auto-DJ builds a brand-new workout mix from your Library — beatmatched, transitioned and mastered automatically — and saves it as a finished recording under Mixes. Library tracks and playlists are never modified or duplicated.</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
      <div class="stat"><div class="k">Workout playlists</div><div class="v">${d.workoutPlaylists.length}</div></div>
      <div class="stat"><div class="k">Mixes saved</div><div class="v">${d.mixes.length}</div></div>
      <div class="stat"><div class="k">Analysis</div><div class="v">${pendingAnalyze?`Analyzing… ${d.analyzeStatus.done}/${d.analyzeStatus.total}`:'Idle'}</div></div>
    </div>
  </div>
  <div class="two">
    <div class="panel"><div class="panel-h"><h3>${ic(I.plus,'gold')}CREATE WORKOUT MIX</h3></div><div class="panel-b">
      ${d.workoutPlaylists.length ? `<form data-form="wo-create" class="form">
        <label>Playlist<select class="sel" name="playlist">${d.workoutPlaylists.map(p=>`<option value="${h(p.slug)}" ${wf.playlist===p.slug?'selected':''}>${h(p.name)} (${p.track_count||0} tracks)</option>`).join('')}</select></label>
        <label>Workout type<select class="sel" name="workout_type">${Object.entries(WORKOUT_LABELS).map(([k,l])=>`<option value="${k}" ${wf.workout_type===k?'selected':''}>${l}</option>`).join('')}</select></label>
        <label>Intensity<select class="sel" name="intensity">${['easy','moderate','high','intense'].map(x=>`<option value="${x}" ${wf.intensity===x?'selected':''}>${x[0].toUpperCase()+x.slice(1)}</option>`).join('')}</select></label>
        <label>Duration<select class="sel" name="duration_min">${[5,10,15,20,30,45,60].map(x=>`<option value="${x}" ${Number(wf.duration_min)===x?'selected':''}>${x} minutes</option>`).join('')}</select></label>
        <div class="wide row-actions"><button class="btn gold" type="submit">${I.play} Create &amp; Generate Mix</button></div>
      </form>` : empty(I.list,'No workout playlist yet','Create a playlist with kind "workout" on the Playlists page, add tracks to it, then come back here.',`<a class="btn sm gold" href="#/playlists">${I.list} Playlists</a>`)}
    </div></div>
    <div class="panel"><div class="panel-h"><h3>${ic(I.tag,'blue')}TRACK ANALYSIS</h3></div><div class="panel-b">
      <p class="small muted" style="margin:0 0 10px">Auto-DJ needs each track's tempo and key before it can beatmix it. Run this once after adding new tracks to a workout playlist.</p>
      <button class="btn sm ${pendingAnalyze?'':'gold'}" data-act="wo-analyze" ${pendingAnalyze?'disabled':''}>${pendingAnalyze?`Analyzing ${d.analyzeStatus.done}/${d.analyzeStatus.total}…`:'Analyze Workout Playlist'}</button>
    </div></div>
  </div>
  <h3 style="margin:18px 0 8px;font:800 15px var(--display)">${ic(I.list,'gold')}MIXES (${d.mixes.length})</h3>
  <div class="panel"><div class="panel-b">${d.mixes.length?d.mixes.map(mixRow).join(''):empty(I.list,'No mixes yet','Create your first workout mix above.')}</div></div>`;
} };
Object.assign(FORMS, {
  'wo-create': async(f,b)=>{
    state._woForm = {playlist:b.playlist, workout_type:b.workout_type, intensity:b.intensity, duration_min:b.duration_min};
    const target_duration_sec = Number(b.duration_min)*60;
    const btn = f.querySelector('button[type=submit]'); btn.disabled=true; btn.textContent='Starting…';
    try {
      const mix = await post('/api/dj/mixes', {station:S(), workout_type:b.workout_type, intensity:b.intensity, target_duration_sec});
      await post(`/api/dj/mixes/${mix.id}/generate`, {playlist:b.playlist, transition_sec:8, transition_type:'blend'});
      toast('Workout mix started — recording in real time, this takes about as long as the mix itself.','ok');
      delete state.pageData.workout; render();
    } catch(e) { toast(e.message,'err'); btn.disabled=false; btn.textContent='Create & Generate Mix'; }
  },
});
Object.assign(ACTIONS, {
  'wo-analyze': ()=>act(()=>post(`/api/dj/analyze?station=${S()}&playlist=${(state._woForm&&state._woForm.playlist)||'workout'}`), 'Analysis started'),
  'wo-delete': async(el)=>{ if(await confirmDlg('Delete this mix? The original Library tracks it was built from are never affected.','Delete',true)) act(()=>del(`/api/dj/mixes/${el.dataset.id}`),'Mix deleted'); },
});

/* ======================= ALERTS PAGE ======================= */
pages.alerts = { live:true, async load(){ return api('/api/alerts?state=all&limit=300'); }, view(A){ const sev={critical:'err',error:'err',warning:'warn',info:'blue'}; const view=state.alertPage||'active'; const list=A.alerts.filter(a=> view==='active'?a.state!=='resolved':a.state==='resolved'); const c=A.counts;
  return `<div class="page-h"><h2>Alerts</h2><span class="chip red">${c.crit||0} critical</span><span class="chip red">${c.err||0} errors</span><span class="chip amber">${c.warn||0} warnings</span><div class="right"><span class="seg"><button class="${view==='active'?'active':''}" data-act="alert-page" data-v="active">Active</button><button class="${view==='resolved'?'active':''}" data-act="alert-page" data-v="resolved">Resolved (${c.resolved||0})</button></span><button class="btn sm" data-act="alerts-bulk" data-op="read-all">Mark all read</button><button class="btn sm" data-act="alerts-bulk" data-op="clear-read">Clear read</button><button class="btn sm" data-act="alerts-bulk" data-op="clear-resolved">Clear resolved</button></div></div>
  <div class="panel"><div class="panel-b">${list.length?list.map(a=>`<div class="alert ${a.severity} ${a.read?'':'unread'} ${a.state==='resolved'?'resolved':''}" data-key="ap-${a.id}"><span class="led ${a.state==='resolved'?'on':sev[a.severity]}"></span><div><b>${h(a.title)} ${pill(sev[a.severity]==='err'?'red':sev[a.severity]==='warn'?'amber':'blue',a.severity)} ${a.count>1?pill('off','×'+a.count):''} ${a.state==='acknowledged'?pill('blue','acknowledged'):''}</b><p>${h(a.message)}</p><div class="meta">${h(a.station||'system')} · first ${fmtDate(a.ts)} · last ${fmtDate(a.updated_at||a.ts)}${a.state==='resolved'?' · resolved '+fmtDate(a.resolved_at):''}</div></div><div class="acts">${a.state==='open'?`<button class="btn xs" data-act="alert" data-id="${a.id}" data-op="ack">Acknowledge</button>`:''}${a.state!=='resolved'?`<button class="btn xs" data-act="alert" data-id="${a.id}" data-op="resolve">Resolve</button>`:''}<button class="btn xs ghost" data-act="alert" data-id="${a.id}" data-op="clear">Clear</button></div></div>`).join(''):empty(I.check, view==='active'?'No active alerts':'No resolved alerts','Alerts are raised from warnings, errors and critical events; clearing them keeps the event log intact.')}</div></div>`; } };
Object.assign(ACTIONS, { 'alert-page': (el)=>{ state.alertPage=el.dataset.v; render(); } });

/* ======================= LOGS ======================= */
pages.logs = { live:true, async load(){ const src=state._logSrc||'events'; if(src==='events'){ const sev=state._logSev||''; return {src, ev: await api(`/api/events?limit=300${sev?'&severity='+sev:''}${state._logAll?'':'&station='+S()}`)}; } return {src, lines:(await api(`/api/logs/${src}?station=${S()}&lines=400`)).lines}; },
  view(d){ const src=d.src; const body = src==='events' ? `<div class="events" style="max-height:70vh">${d.ev.map(e=>`<div class="ev" data-key="lv-${e.id}"><span class="led ${{info:'blue',warning:'warn',error:'err',critical:'err'}[e.severity]}"></span><span class="t" style="width:auto">${fmtDate(e.ts)}</span><span class="m" style="white-space:normal">${pill({info:'off',warning:'amber',error:'red',critical:'red'}[e.severity],e.severity)} <span class="muted2 small">${h(e.category)}</span> ${h(e.message)}${e.station?`<small>${h(e.station)}</small>`:''}</span></div>`).join('')||empty(I.logs,'No events','')}</div>` : `<div class="logbox">${h(d.lines.join('\n'))||'(empty)'}</div>`;
    return `<div class="page-h"><h2>Logs</h2><div class="right"><span class="seg">${[['events','Events'],['liquidsoap','Audio engine'],['ffmpeg','Video'],['stream','Stream service'],['control','Control'],['kernel','Kernel / USB']].map(([v,l])=>`<button class="${src===v?'active':''}" data-act="logsrc" data-v="${v}">${l}</button>`).join('')}</span>${src==='events'?`<select class="sel" data-change="log-sev" style="height:34px"><option value="">All severities</option>${['info','warning','error','critical'].map(x=>`<option ${state._logSev===x?'selected':''}>${x}</option>`).join('')}</select><label class="small muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-change="log-all" ${state._logAll?'checked':''}> all stations</label>`:''}<button class="btn sm" data-act="log-refresh">${I.restart}</button></div></div><div class="panel"><div class="panel-b">${body}</div></div>`; } };
Object.assign(ACTIONS, { 'logsrc': (el)=>{ state._logSrc=el.dataset.v; delete state.pageData.logs; render(); }, 'log-refresh': ()=>{ delete state.pageData.logs; render(); } });
Object.assign(CHANGES, { 'log-sev': (el)=>{ state._logSev=el.value; delete state.pageData.logs; render(); }, 'log-all': (el)=>{ state._logAll=el.checked; delete state.pageData.logs; render(); } });

/* ======================= SETTINGS ======================= */
pages.settings = { view(){ const s=st(); const ov=state.overview; const sys=ov.system; const set=s.settings; return `<div class="page-h"><h2>Settings</h2></div>
  <div class="two"><div class="panel"><div class="panel-h"><h3>${ic(I.cog)}Station — ${h(s.name)}</h3></div><div class="panel-b"><div class="rules">
    ${rule('shuffle', I.shuffle, 'Shuffle Mode', set.shuffle)}${rule('sequential', I.list, 'Sequential Mode', set.sequential)}${rule('weighted_rotation', I.shuffle, 'Weighted Rotation', set.weighted_rotation, 'Tracks not heard for a while are favoured')}${rule('normalization', I.bars, 'ReplayGain / Normalization', set.normalization, 'Per-track gain toward −18 LUFS + live normaliser')}${rule('silence_guard', I.shield, 'Silence Guard', set.silence_guard, 'Skip after 12 s of silence and log the event')}${rule('cue_points', I.cut, 'Cue Points', set.cue_points)}${rule('request_queue_enabled', I.queue, 'Request Queue', set.request_queue_enabled)}
    <div class="rule"><span class="ic">${I.wave}</span><span class="lbl">Track fade-in<small>gentle start for each track</small></span><select class="sel" data-change="setting" data-key="crossfade_sec">${[0,1,2,3,5].map(v=>`<option value="${v}" ${Number(set.crossfade_sec)===v?'selected':''}>${v?v+' sec':'Off'}</option>`).join('')}</select></div></div></div></div>
  <div style="display:flex;flex-direction:column;gap:12px"><div class="panel"><div class="panel-h"><h3>${ic(I.cpu,'blue')}System</h3></div><div class="panel-b"><dl class="kv"><dt>Host</dt><dd>${h(sys.hostname)} · ${sys.cores} cores · up ${fmtLong(sys.uptime_sec)}</dd><dt>Load</dt><dd>${sys.load.join(' / ')}</dd><dt>RAM</dt><dd>${fmtBytes(sys.ram.used)} / ${fmtBytes(sys.ram.total)}</dd><dt>Root disk</dt><dd>${sys.root_disk.percent}% used · ${fmtBytes(sys.root_disk.free)} free</dd><dt>HUNGREE-GOAT</dt><dd>${sys.usb.mounted?`${sys.usb.percent}% used · ${fmtBytes(sys.usb.free)} free · ${sys.usb.writable?'writable':'<span class="red">READ-ONLY / FAULT</span>'}`:'<span class="red">not mounted</span>'}</dd><dt>Throttle</dt><dd class="mono">${h(sys.throttle.raw||'n/a')}${sys.throttle.under_voltage?' · UNDER-VOLTAGE':''}</dd><dt>Control</dt><dd>up ${fmtLong(ov.control.uptime_sec)} · assets ${h(window.HGC_V||'')}</dd></dl>${(!sys.usb.writable||sys.usb.fs_shutdown)?`<button class="btn amber sm" data-act="usb-repair">Repair drive</button>`:''}</div></div>
    <div class="panel"><div class="panel-h"><h3>${ic(I.cog)}Operator password${help('Changes the single operator account password used to sign in here. You stay signed in afterward — this does not log you out.')}</h3></div><div class="panel-b"><form data-form="password" class="form" autocomplete="off"><label>Current password<span style="position:relative"><input class="inp" type="password" name="current" required autocomplete="current-password" style="width:100%"><button type="button" class="btn xs ghost icon pw-eye" data-act="pw-show" data-for="current" style="position:absolute;right:2px;top:2px" tabindex="-1">${I.eye}</button></span></label><label>New password (min 9 characters)<span style="position:relative"><input class="inp" type="password" name="new" minlength="9" required autocomplete="new-password" style="width:100%"><button type="button" class="btn xs ghost icon pw-eye" data-act="pw-show" data-for="new" style="position:absolute;right:2px;top:2px" tabindex="-1">${I.eye}</button></span></label><label>Confirm new password<span style="position:relative"><input class="inp" type="password" name="confirm" minlength="9" required autocomplete="new-password" style="width:100%"><button type="button" class="btn xs ghost icon pw-eye" data-act="pw-show" data-for="confirm" style="position:absolute;right:2px;top:2px" tabindex="-1">${I.eye}</button></span></label><div class="wide err" id="pw-err" style="color:var(--red);font-size:12px;min-height:16px"></div><div class="row-actions"><button class="btn gold sm" type="submit">Change password</button></div></form></div></div>
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
