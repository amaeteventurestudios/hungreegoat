"""CLI: python -m hgc scan [--loudness] | serve | stream <station> | report"""
import json, sys
from . import config, db


def main(argv):
    cmd = argv[0] if argv else "help"
    if cmd == "scan":
        from . import catalog
        loud = "--loudness" in argv
        for sid in config.STATION_IDS:
            def prog(i, n, name):
                print(f"\r[{sid}] {i}/{n} {name[:60]:<60}", end="", flush=True)
            s = catalog.scan_station(sid, loudness=loud, progress=prog)
            print()
            catalog.ensure_default_playlists(sid)
            catalog.write_liquidsoap_playlists(sid)
            print(json.dumps(s, indent=1))
        print(json.dumps(catalog.probe_video(config.LOOP_SOURCE), indent=1))
        print(json.dumps(catalog.probe_video(config.LOOP_720), indent=1))
    elif cmd == "serve":
        import uvicorn
        uvicorn.run("hgc.main:app", host=config.API_HOST, port=config.API_PORT, log_level="info", access_log=False, proxy_headers=True, forwarded_allow_ips="127.0.0.1")
    elif cmd == "stream":
        from . import streamer
        streamer.main(argv[1])
    elif cmd == "report":
        for sid in config.STATION_IDS:
            r = db.q1("SELECT COUNT(*) n, SUM(size) b, SUM(duration) d FROM tracks WHERE station=? AND corrupt=0", (sid,))
            print(sid, dict(r))
    else:
        print(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
