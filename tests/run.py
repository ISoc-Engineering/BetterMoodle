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
] + [  # four more, so the dashboard's course strip has to scroll
    {'id': cid, 'fullname': name, 'shortname': name.split(':')[0], 'coursecategory': 'Computer Science',
     'isfavourite': False, 'viewurl': f'/course/view.php?id={cid}', 'courseimage': ''}
    for cid, name in [(103, 'COMP0003: Theory of Computation'), (104, 'COMP0004: Object-Oriented Programming'),
                      (105, 'ENGF0001: Engineering Challenges'), (106, 'COMP0005: Algorithms')]
]

def event(eid, name, course, offset, kind='Assignment is due', actionable=True, eventtype='due'):
    return {'id': eid, 'name': name, 'activityname': name, 'activitystr': kind, 'modulename': 'assign', 'eventtype': eventtype,
            'timesort': NOW + offset, 'overdue': offset < 0, 'url': f'/mod/assign/view.php?id={eid}',
            'action': {'url': f'/mod/assign/view.php?id={eid}', 'name': 'Add submission', 'actionable': actionable},
            'course': {'id': course['id'], 'fullname': course['fullname']}}

EVENTS = [
    event(901, 'Robot maze', COURSES[0], -3600),
    event(902, 'Haskell sheet 1', COURSES[0], 26 * 3600),
    event(903, 'Proofs problem set', COURSES[1], 9 * 86400),
    # Past, but nothing left to do (handed in outside Moodle / closed): must NOT show as overdue.
    event(904, 'Individual video presentation', COURSES[0], -2 * 86400, actionable=False),
    # A marking deadline for staff: never shown to students.
    event(905, 'Mark the robot mazes', COURSES[0], 3 * 86400, kind='Grading due', eventtype='gradingdue'),
]

# What Moodle returns for sort='ul.timeaccess desc' (most recently accessed first).
ACCESS_ORDER = [104, 101, 103, 102, 106, 105]

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

# Forums per course: every course has an Announcements forum in General; only COMP0002 (101) has Q&A.
ANNOUNCEMENT_CM = {101: '3009', 102: '3011'}
FORUM_BY_CM = {'3009': 9, '2004': 10, '3011': 11}

def course_sections(courseid):
    out = []
    for s in SECTIONS:
        cms = [c for c in s['cms'] if c[0] != '2004' or courseid == 101]
        if s['number'] == 0:
            cms = cms + [(ANNOUNCEMENT_CM.get(courseid, f'39{courseid}'), 'Announcements', 'forum', None)]
            if courseid == 102:  # like UCL's COMP0002: the Q&A board is an Advanced Forum (mod/hsuforum)
                cms = cms + [(HSU_CM, 'Discussion board', 'hsuforum', None)]
        out.append({**s, 'cms': cms})
    return out

# ---------------------------------------------------------------- Advanced Forum (mod/hsuforum)
# Its own pages and markup: a discussion is an <article class="hsuforum-thread">; replies sit in nested
# <ol class="hsuforum-thread-replies-list">, and a reply's own replies are NEXT to it, not inside it.
HSU_CM = '3012'
HSU_DISCUSSIONS = [
    # (d, title, author, created ago, replies shown in the list (None = the list doesn't say), posts)
    (901, 'Induction help', 'Dana Student', 15 * 86400, 3, [
        (9011, 0, 'TA Priya', 14 * 86400, 'Start at n = 1.'),
        (9012, 9011, 'Dana Student', 14 * 86400 - 600, 'Thanks, that fixed it!'),
        (9013, 0, 'Alex Peer', 13 * 86400, 'Or n = 0 if it holds there.')]),
    (902, 'Proof by contradiction?', 'Kim Lee', 16 * 86400, None, [
        (9021, 0, 'Lecturer', 15 * 86400, 'Yes, that works.')]),
]

def hsu_view_page():
    items = ''
    for d, title, who, ago, shown, _ in HSU_DISCUSSIONS:
        count = f'<a href="/mod/hsuforum/discuss.php?d={d}#replies">{shown} replies</a> <span class="hsuforum-unreadcount">2 new</span>' if shown else ''
        items += (f'<li><article id="p{d}0" class="hsuforum-thread hsuforum-post-target" data-discussionid="{d}" data-postid="{d}0" data-author="{esc(who)}" data-isdiscussion="true">'
                  f'<header><img class="userpicture" src=""><p class="hsuforum-thread-byline"><span class="hsuforum-thread-author"><a href="/user/view.php?id=60">{esc(who)}</a></span> '
                  f'<time datetime="{iso(NOW - ago)}">date</time></p>'
                  f'<h4 class="hsuforum-thread-title"><a class="js-forum-discussion-title" href="https://moodle.example/mod/hsuforum/discuss.php?d={d}">{esc(title)}</a></h4></header>'
                  f'<div class="hsuforum-thread-meta">{count}</div></article></li>')
    return (f'<!doctype html><body id="page-mod-hsuforum-view"><div id="region-main"><a class="btn" href="/mod/hsuforum/post.php?forum=12">Add a new discussion</a>'
            f'<ol class="hsuforum-threads-wrapper">{items}</ol></div></body>')

def hsu_discuss_page(did):
    disc = next((x for x in HSU_DISCUSSIONS if x[0] == did), None)
    if not disc:
        return '<!doctype html><body><div id="region-main">Not found</div></body>'
    d, title, who, ago, _, posts = disc
    def reply(p):
        pid, _, author, pago, text = p
        kids = ''.join(reply(k) for k in posts if k[1] == pid)
        return (f'<li class="hsuforum-post" data-depth="1"><div class="hsuforum-post-wrapper hsuforum-post-target" id="p{pid}" data-postid="{pid}" data-author="{esc(author)}" data-ispost="true">'
                f'<img class="userpicture" src=""><div class="hsuforum-post-body"><h6 class="hsuforum-post-byline"><a href="/user/view.php?id=2">{esc(author)}</a> '
                f'<time datetime="{iso(NOW - pago)}">date</time></h6><div class="posting fullpost"><p>{esc(text)}</p></div></div></div>'
                + (f'<ol class="hsuforum-thread-replies-list">{kids}</ol>' if kids else '') + '</li>')
    replies = ''.join(reply(p) for p in posts if p[1] == 0)
    return (f'<!doctype html><body id="page-mod-hsuforum-discuss"><div id="region-main">'
            f'<article id="p{d}0" class="hsuforum-thread hsuforum-post-target" data-discussionid="{d}" data-postid="{d}0" data-author="{esc(who)}" data-isdiscussion="true">'
            f'<header><h4 class="hsuforum-thread-title">{esc(title)}</h4><time datetime="{iso(NOW - ago)}">date</time></header>'
            f'<div class="hsuforum-thread-content"><div class="hsuforum-post-body"><div class="posting fullpost"><p>Opening post of {esc(title)}</p></div></div></div>'
            f'<div class="hsuforum-thread-replies"><ol class="hsuforum-thread-replies-list">{replies}</ol></div></article></div></body>')

def course_state(courseid):
    cms, sections = [], []
    for s in course_sections(courseid):
        sections.append({'id': s['id'], 'number': s['number'], 'title': s['title'], 'visible': True, 'current': False,
                         'sectionurl': f'/course/section.php?id={s["id"]}', 'cmlist': [c[0] for c in s['cms']]})
        for cid, name, mod, _ in s['cms']:
            cms.append({'id': cid, 'name': name, 'module': mod, 'uservisible': True, 'url': f'/mod/{mod}/view.php?id={cid}'})
    return json.dumps({'course': {'id': str(courseid), 'statekey': f'{NOW}_x'}, 'section': sections, 'cm': cms})

def section_page(section_id):
    s = next((x for x in course_sections(101) if x['id'] == section_id), None)
    rows = ''
    for cid, name, mod, ftype in (s['cms'] if s else []):
        icon = f'/theme/image.php/ucl/core/1/f/{ftype}-24' if ftype else f'/theme/image.php/ucl/{mod}/1/monologo'
        badge = (ftype or '').upper()
        rows += (f'<li class="activity" data-id="{cid}"><img class="activityicon" src="{icon}">'
                 f'<span class="activitybadge">{badge}</span><span class="resourcelinkdetails">1.2 MB</span></li>')
    return f'<!doctype html><body><ul>{rows}</ul></body>'

FORUMS = [{'id': 9, 'cmid': 3009, 'course': 101, 'type': 'news', 'name': 'Announcements'},
          {'id': 10, 'cmid': 2004, 'course': 101, 'type': 'general', 'name': 'Q&amp;A forum', 'unreadpostscount': 3},
          {'id': 11, 'cmid': 3011, 'course': 102, 'type': 'news', 'name': 'Announcements'}]

def disc(did, name, who, uid, created, last, replies=0, unread=0, pinned=False, lastby=None, message=None):
    return {'discussion': did, 'id': did * 10, 'name': name, 'userfullname': who, 'userid': uid, 'created': NOW - created,
            'timemodified': NOW - last, 'usermodifiedfullname': lastby or who, 'numreplies': replies,
            'numunread': unread, 'pinned': pinned, 'locked': False,
            'userpictureurl': '/theme/image.php/ucl/core/1/u/f2',
            'message': message or f'<p>About {name}</p>'}

# Replies in discussion 202: two answers to the opening post, one reply to a reply.
def post(pid, parent, who, ago, text):
    return {'id': pid, 'parentid': parent, 'author': {'fullname': who, 'urls': {'profileimage': ''}},
            'timecreated': NOW - ago, 'message': f'<p>{text}</p>', 'isdeleted': False}

POSTS = {202: [post(2020, 0, 'Sam Student', 3 * 3600, 'My solver segfaults on the big maze. Log: <a href="https://example.org/log">crash log</a></p>' + '<p>More detail.</p>' * 12 + '<p>End.'),
               post(2021, 2020, 'TA Priya', 2 * 3600, 'Check your bounds.'),
               post(2022, 2021, 'Sam Student', 3600, 'That was it, thanks!'),
               post(2023, 2020, 'Alex Peer', 1800, 'Same here, see <a href="https://example.org/gdb">this gdb guide</a>.')]}

DISCUSSIONS = {
    9: [{'discussion': 55, 'name': 'Week one announcement', 'userfullname': 'Course team', 'timemodified': NOW - 7200}],
    11: [{'discussion': 77, 'name': 'Problem class moved', 'userfullname': 'Lecturer', 'timemodified': NOW - 600}],
    10: [
        disc(201, 'Coursework FAQ (read first)', 'Course team', 50, 20 * 86400, 20 * 86400, pinned=True),
        disc(202, 'Segfault in the maze solver', 'Sam Student', 51, 3 * 3600, 1800, replies=3, unread=2, lastby='Alex Peer',
             message='<p>My solver segfaults on the big maze. Log: <a href="https://example.org/log">crash log</a></p>' + '<p>More detail.</p>' * 12),
        disc(203, 'Is recursion allowed in Q3?', 'Me Myself', 7, 2 * 86400, 26 * 3600, replies=1, lastby='Lecturer'),
        disc(204, 'Lab room change', 'Lecturer', 52, 12 * 86400, 12 * 86400, unread=1),
    ],
}

# ---------------------------------------------------------------- forum pages (Moodle 4 markup)
# UCL blocks the forum web services, so BetterMoodle reads these pages instead.

def iso(ts):
    return time.strftime('%Y-%m-%dT%H:%M:%S+00:00', time.gmtime(ts))

def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')

def forum_view_page(cmid):
    fid = FORUM_BY_CM.get(cmid)
    forum = next((f for f in FORUMS if f['id'] == fid), None)
    rows = ''
    for d in sorted(DISCUSSIONS.get(fid, []), key=lambda d: (not d.get('pinned'), -d['timemodified'])):
        did, who = d['discussion'], d.get('userfullname', '')
        unread = f'<a href="/mod/forum/discuss.php?d={did}#unread" data-region="unread-count">{d["numunread"]}</a>' if d.get('numunread') else ''
        pin = '<span class="icon fa fa-thumb-tack" title="Pinned"></span>' if d.get('pinned') else ''
        rows += (f'<tr class="discussion{" pinned" if d.get("pinned") else ""}" data-region="discussion-list-item" data-discussionid="{did}">'
                 f'<th class="topic"><a href="https://moodle.example/mod/forum/discuss.php?d={did}" title="{esc(d["name"])}">{esc(d["name"])}</a>{pin}</th>'
                 f'<td class="author"><div class="d-flex"><img class="userpicture" src="/theme/image.php/ucl/core/1/u/f2" alt="">'
                 f'<div class="author-info"><div class="text-truncate"><a href="/user/view.php?id={d.get("userid", 0)}">{esc(who)}</a></div>'
                 f'<div class="author-date"><time datetime="{iso(d.get("created", d["timemodified"]))}">date</time></div></div></div></td>'
                 f'<td class="text-center"><span>{d.get("numreplies", 0)}</span> {unread}</td>'
                 f'<td class="text-left"><div class="author-info"><div class="text-truncate">{esc(d.get("usermodifiedfullname", who))}</div>'
                 f'<a href="/mod/forum/discuss.php?d={did}"><time datetime="{iso(d["timemodified"])}">date</time></a></div></td></tr>')
    add = f'<a class="btn btn-primary" href="/mod/forum/post.php?forum={fid}">Add discussion topic</a>' if forum and forum['type'] != 'news' else ''
    return (f'<!doctype html><body id="page-mod-forum-view"><div id="region-main">{add}'
            f'<table class="table discussion-list"><tbody>{rows}</tbody></table></div></body>')

def post_html(p, children):
    kids = ''.join(post_html(c, children) for c in children.get(p['id'], []))
    return (f'<div class="forum-post-container" data-region="post" data-post-id="{p["id"]}" id="p{p["id"]}">'
            f'<article class="forum-post-core" data-region="post-core"><header><img class="userpicture" src="" alt="">'
            f'<h3 data-region-content="forum-post-core-subject">Subject</h3>'
            f'<div>by <a href="/user/view.php?id=1">{esc(p["author"]["fullname"])}</a> - <time datetime="{iso(p["timecreated"])}">date</time></div></header>'
            f'<div class="post-content-container">{p["message"]}</div></article>'
            f'<div class="indent" data-region="replies-container">{kids}</div></div>')

def discuss_page(did):
    posts = POSTS.get(did)
    if posts is None:  # a discussion with only its opening post
        d = next((x for ds in DISCUSSIONS.values() for x in ds if x['discussion'] == did), None)
        if not d:
            return '<!doctype html><body><div id="region-main">Not found</div></body>'
        posts = [{'id': did * 10, 'parentid': 0, 'author': {'fullname': d.get('userfullname', '')},
                  'timecreated': d.get('created', d['timemodified']), 'message': d.get('message', '')}]
    children = {}
    for p in posts:
        children.setdefault(p['parentid'], []).append(p)
    return '<!doctype html><body id="page-mod-forum-discuss"><div id="region-main">' + ''.join(post_html(p, children) for p in children.get(0, [])) + '</div></body>'

def web_service(method, args):
    if method == 'core_course_get_enrolled_courses_by_timeline_classification':
        courses = COURSES
        if args.get('sort') == 'ul.timeaccess desc':
            courses = sorted(COURSES, key=lambda c: ACCESS_ORDER.index(c['id']))
        return {'courses': courses, 'nextoffset': len(courses)}
    if method == 'core_calendar_get_action_events_by_timesort':
        return {'events': EVENTS}
    if method == 'core_calendar_get_action_events_by_course':
        return {'events': [e for e in EVENTS if e['course']['id'] == args['courseid']]}
    if method == 'core_courseformat_get_state':
        return course_state(args['courseid'])
    if method == 'mod_forum_get_forums_by_courses':
        return [f for f in FORUMS if f['course'] in args['courseids']]
    if method == 'mod_forum_get_discussion_posts':
        return {'posts': POSTS.get(args['discussionid'], [])}
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
        # Opening a forum page shows the fixture; BetterMoodle fetching one gets Moodle's markup.
        navigating = self.headers.get('Sec-Fetch-Mode') == 'navigate'
        qs = urllib.parse.parse_qs(url.query)
        if url.path == '/mod/forum/index.php' or (url.path == '/mod/forum/view.php' and navigating):
            return self.send((ROOT / 'tests' / 'fixture.html').read_text(encoding='utf-8'))
        if url.path == '/mod/forum/view.php':
            return self.send(forum_view_page(qs.get('id', [''])[0]))
        if url.path == '/mod/forum/discuss.php':
            return self.send(discuss_page(int(qs.get('d', ['0'])[0])))
        if url.path == '/mod/hsuforum/view.php':
            return self.send((ROOT / 'tests' / 'fixture.html').read_text(encoding='utf-8') if navigating else hsu_view_page())
        if url.path == '/mod/hsuforum/discuss.php':
            return self.send(hsu_discuss_page(int(qs.get('d', ['0'])[0])))
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
