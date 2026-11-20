#!/usr/bin/env python3
"""Run BetterMoodle's browser checks against a fake UCL Moodle. No packages needed.

    python tests/run.py            # uses Firefox if installed, otherwise Chrome/Edge/Chromium
    python tests/run.py --browser chrome

It serves the repo plus fake Moodle pages and web services on localhost, opens tests/index.html in a
headless browser with a throwaway profile, prints PASS/FAIL per check and exits 1 on any failure.
"""
import argparse
import http.server
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
NOW = int(time.time())
finished = threading.Event()
report = {}

# ---------------------------------------------------------------- fake Moodle data

COURSES = [
    {'id': 101, 'fullname': 'COMP0002: Principles of Programming', 'shortname': 'COMP0002', 'coursecategory': 'Computer Science',
     'isfavourite': False, 'viewurl': '/course/view.php?id=101',
     'courseimage': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4='},
    {'id': 102, 'fullname': 'COMP0147: Discrete Mathematics', 'shortname': 'COMP0147', 'coursecategory': 'Computer Science',
     'isfavourite': True, 'viewurl': '/course/view.php?id=102', 'courseimage': 'https://tracker.example/pixel.png'},
]

def event(eid, name, course, offset, kind='Assignment is due'):
    return {'id': eid, 'name': name, 'activityname': name, 'activitystr': kind, 'modulename': 'assign',
            'timesort': NOW + offset, 'overdue': offset < 0, 'url': f'/mod/assign/view.php?id={eid}',
            'action': {'url': f'/mod/assign/view.php?id={eid}', 'name': 'Add submission'},
            'course': {'id': course['id'], 'fullname': course['fullname']}}

EVENTS = [
    event(901, 'Robot maze', COURSES[0], -3600),
    event(902, 'Haskell sheet 1', COURSES[0], 26 * 3600),
    event(903, 'Proofs problem set', COURSES[1], 9 * 86400),
]

# Sections: General (aggressive mode hides it), two weeks of material.
SECTIONS = [
    {'id': '1000', 'number': 0, 'title': 'General', 'cms': [('2000', 'Module handbook', 'resource', 'pdf')]},
    {'id': '1001', 'number': 1, 'title': 'Week 1', 'cms': [
        ('2001', 'Lecture 1 slides', 'resource', 'pdf'),
        ('2002', 'Lab sheet 1', 'resource', 'pdf'),
        ('2003', 'Week 1 quiz', 'quiz', None),
        ('2004', 'Q&A forum', 'forum', None)]},
    {'id': '1002', 'number': 2, 'title': 'Week 2', 'cms': [
        ('2005', 'Lecture 2 slides', 'resource', 'pdf'),
        ('2006', 'Starter code', 'resource', 'archive')]},
]

def course_state(courseid):
    cms, sections = [], []
    for s in SECTIONS:
        sections.append({'id': s['id'], 'number': s['number'], 'title': s['title'], 'visible': True, 'current': False,
                         'sectionurl': f'/course/section.php?id={s["id"]}', 'cmlist': [c[0] for c in s['cms']]})
        for cid, name, mod, _ in s['cms']:
            cms.append({'id': cid, 'name': name, 'module': mod, 'uservisible': True, 'url': f'/mod/{mod}/view.php?id={cid}'})
    return json.dumps({'course': {'id': str(courseid), 'statekey': f'{NOW}_x'}, 'section': sections, 'cm': cms})

def section_page(section_id):
    s = next((x for x in SECTIONS if x['id'] == section_id), None)
    rows = ''
    for cid, name, mod, ftype in (s['cms'] if s else []):
        icon = f'/theme/image.php/ucl/core/1/f/{ftype}-24' if ftype else f'/theme/image.php/ucl/{mod}/1/monologo'
        badge = (ftype or '').upper()
        rows += (f'<li class="activity" data-id="{cid}"><img class="activityicon" src="{icon}">'
                 f'<span class="activitybadge">{badge}</span><span class="resourcelinkdetails">1.2 MB</span></li>')
    return f'<!doctype html><body><ul>{rows}</ul></body>'

FORUMS = [{'id': 9, 'course': 101, 'type': 'news', 'name': 'Announcements'},
          {'id': 10, 'course': 101, 'type': 'general', 'name': 'Q&A'},
          {'id': 11, 'course': 102, 'type': 'news', 'name': 'Announcements'}]

DISCUSSIONS = {
    9: [{'discussion': 55, 'name': 'Week one announcement', 'userfullname': 'Course team', 'timemodified': NOW - 7200}],
    11: [{'discussion': 77, 'name': 'Problem class moved', 'userfullname': 'Lecturer', 'timemodified': NOW - 600}],
}

def web_service(method, args):
    if method == 'core_course_get_enrolled_courses_by_timeline_classification':
        return {'courses': COURSES, 'nextoffset': 2}
    if method == 'core_calendar_get_action_events_by_timesort':
        return {'events': EVENTS}
    if method == 'core_calendar_get_action_events_by_course':
        return {'events': [e for e in EVENTS if e['course']['id'] == args['courseid']]}
    if method == 'core_courseformat_get_state':
        return course_state(args['courseid'])
    if method == 'mod_forum_get_forums_by_courses':
        return [f for f in FORUMS if f['course'] in args['courseids']]
    if method == 'mod_forum_get_forum_discussions':
        return {'discussions': DISCUSSIONS.get(args['forumid'], [])}
    raise KeyError(method)

# ---------------------------------------------------------------- server

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *args):
        pass

    def send(self, body, ctype='text/html; charset=utf-8', status=200):
        data = body.encode('utf-8') if isinstance(body, str) else body
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if url.path in ('/my/', '/course/view.php'):
            return self.send((ROOT / 'tests' / 'fixture.html').read_text(encoding='utf-8'))
        if url.path == '/course/section.php':
            return self.send(section_page(urllib.parse.parse_qs(url.query).get('id', [''])[0]))
        if url.path.startswith('/mod/'):
            return self.send('<!doctype html><body id="destination">Moodle activity page</body>')
        if url.path.startswith('/theme/'):
            return self.send('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"/>', 'image/svg+xml')
        return super().do_GET()

    def do_POST(self):
        url = urllib.parse.urlsplit(self.path)
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])) or b'null')
        if url.path == '/lib/ajax/service.php':
            reply = []
            for call in body:
                try:
                    reply.append({'error': False, 'data': web_service(call['methodname'], call['args'])})
                except KeyError as e:
                    reply.append({'error': True, 'exception': {'message': f'Unknown web service {e}'}})
            return self.send(json.dumps(reply), 'application/json')
        if url.path == '/report':
            report.update(body)
            self.send('', status=204)
            finished.set()
            return
        self.send('not found', status=404)

# ---------------------------------------------------------------- browser

def find_browser(preferred):
    names = {
        'firefox': ['firefox', r'C:\Program Files\Mozilla Firefox\firefox.exe', '/Applications/Firefox.app/Contents/MacOS/firefox'],
        'chrome': ['google-chrome', 'chromium', 'chromium-browser', 'chrome',
                   r'C:\Program Files\Google\Chrome\Application\chrome.exe',
                   r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
                   '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    }
    order = [preferred] if preferred else ['firefox', 'chrome']
    for kind in order:
        for n in names[kind]:
            path = shutil.which(n) or (n if os.path.isfile(n) else None)
            if path:
                return kind, path
    sys.exit('No Firefox or Chrome found. Install one, or pass --browser.')

def launch(kind, path, profile, url):
    if kind == 'firefox':
        args = [path, '--headless', '--no-remote', '--profile', profile, '--window-size=1280,900', url]
    else:
        args = [path, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
                f'--user-data-dir={profile}', '--window-size=1280,900', url]
    return subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--browser', choices=['firefox', 'chrome'])
    ap.add_argument('--timeout', type=int, default=90)
    opts = ap.parse_args()
    kind, path = find_browser(opts.browser)
    with http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler) as server, \
            tempfile.TemporaryDirectory(prefix='bettermoodle-browser-', ignore_cleanup_errors=True) as profile:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        url = f'http://127.0.0.1:{server.server_port}/tests/index.html'
        print(f'Running checks in headless {kind} ({path})')
        proc = launch(kind, path, profile, url)
        try:
            if not finished.wait(opts.timeout):
                sys.exit(f'FAIL: browser checks timed out after {opts.timeout}s')
            for line in report['results']:
                print(line)
            print(f"\n{len(report['results']) - report['failures']} passed, {report['failures']} failed")
            sys.exit(1 if report['failures'] else 0)
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
            server.shutdown()

if __name__ == '__main__':
    main()
