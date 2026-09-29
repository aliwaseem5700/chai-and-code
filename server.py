#!/usr/bin/env python3
"""
Chai & Code - Local Skills-Swap Platform Server
Provides static file serving, SQLite database initialization, and JSON REST API with secure authentication.
"""

import os
import json
import sqlite3
import hashlib
import uuid
import mimetypes
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "chai_and_code.db")
PORT = int(os.environ.get("PORT", 8000))

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str, salt: str = None):
    if not salt:
        salt = uuid.uuid4().hex
    pwd_hash = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    ).hex()
    return pwd_hash, salt

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        full_name TEXT NOT NULL,
        neighborhood TEXT NOT NULL,
        bio TEXT,
        avatar TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Auth Sessions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)

    # Skills table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        teach_skill TEXT NOT NULL,
        teach_category TEXT NOT NULL,
        teach_level TEXT DEFAULT 'Intermediate',
        learn_skill TEXT NOT NULL,
        preferred_spot TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)

    # Swaps table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS swaps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requester_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        skill_offered TEXT NOT NULL,
        skill_requested TEXT NOT NULL,
        meetup_spot TEXT NOT NULL,
        scheduled_time TEXT,
        note TEXT,
        status TEXT DEFAULT 'Completed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(requester_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(receiver_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)

    # Stories table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS stories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user1_name TEXT NOT NULL,
        user2_name TEXT NOT NULL,
        user1_avatar TEXT,
        user2_avatar TEXT,
        skill1 TEXT NOT NULL,
        skill2 TEXT NOT NULL,
        quote TEXT NOT NULL,
        cafe_spot TEXT NOT NULL,
        neighborhood TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()
    conn.close()

class ChaiAndCodeHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS for local testing
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        payload = json.dumps(data).encode('utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def read_json_body(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                raw_body = self.rfile.read(content_length)
                return json.loads(raw_body.decode('utf-8'))
        except Exception as e:
            print(f"Error parsing JSON: {e}")
        return {}

    def get_authenticated_user(self):
        auth_header = self.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return None
        token = auth_header.split(' ', 1)[1].strip()
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT u.id, u.username, u.full_name, u.neighborhood, u.bio, u.avatar
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ?
        """, (token,))
        user = cursor.fetchone()
        conn.close()
        if user:
            return dict(user)
        return None

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # API Endpoints
        if path == '/api/skills':
            category = query.get('category', [''])[0].strip().lower()
            neighborhood = query.get('neighborhood', [''])[0].strip().lower()
            search = query.get('search', [''])[0].strip().lower()

            conn = get_db()
            cursor = conn.cursor()
            sql = """
                SELECT s.id, s.user_id, s.teach_skill, s.teach_category, s.teach_level,
                       s.learn_skill, s.preferred_spot, s.description, s.created_at,
                       u.full_name, u.neighborhood, u.avatar, u.username
                FROM skills s
                JOIN users u ON s.user_id = u.id
                WHERE 1=1
            """
            params = []
            if category and category != 'all':
                sql += " AND LOWER(s.teach_category) = ?"
                params.append(category)
            if neighborhood and neighborhood != 'all':
                sql += " AND LOWER(u.neighborhood) LIKE ?"
                params.append(f"%{neighborhood}%")
            if search:
                sql += """ AND (
                    LOWER(s.teach_skill) LIKE ? OR 
                    LOWER(s.learn_skill) LIKE ? OR 
                    LOWER(s.preferred_spot) LIKE ? OR 
                    LOWER(u.full_name) LIKE ? OR 
                    LOWER(s.description) LIKE ?
                )"""
                term = f"%{search}%"
                params.extend([term, term, term, term, term])

            sql += " ORDER BY s.id DESC"
            cursor.execute(sql, params)
            rows = [dict(r) for r in cursor.fetchall()]
            conn.close()
            return self.send_json(200, {"skills": rows, "count": len(rows)})

        elif path == '/api/me':
            user = self.get_authenticated_user()
            if not user:
                return self.send_json(401, {"error": "Not authenticated"})

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM skills WHERE user_id = ? ORDER BY id DESC", (user['id'],))
            user_skills = [dict(r) for r in cursor.fetchall()]

            cursor.execute("""
                SELECT sw.*, u1.full_name as requester_name, u2.full_name as receiver_name
                FROM swaps sw
                JOIN users u1 ON sw.requester_id = u1.id
                JOIN users u2 ON sw.receiver_id = u2.id
                WHERE sw.requester_id = ? OR sw.receiver_id = ?
                ORDER BY sw.id DESC
            """, (user['id'], user['id']))
            user_swaps = [dict(r) for r in cursor.fetchall()]
            conn.close()

            user['skills'] = user_skills
            user['swaps'] = user_swaps
            return self.send_json(200, {"user": user})

        elif path == '/api/swaps/recent':
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT sw.id, sw.skill_offered, sw.skill_requested, sw.meetup_spot, sw.status, sw.created_at,
                       u1.full_name as requester_name, u1.avatar as requester_avatar,
                       u2.full_name as receiver_name, u2.avatar as receiver_avatar
                FROM swaps sw
                JOIN users u1 ON sw.requester_id = u1.id
                JOIN users u2 ON sw.receiver_id = u2.id
                ORDER BY sw.id DESC LIMIT 10
            """)
            swaps = [dict(r) for r in cursor.fetchall()]
            conn.close()
            return self.send_json(200, {"swaps": swaps})

        elif path == '/api/stories':
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM stories ORDER BY id ASC")
            stories = [dict(r) for r in cursor.fetchall()]
            conn.close()
            return self.send_json(200, {"stories": stories})

        # Static files serving
        clean_path = path.lstrip('/')
        if not clean_path:
            clean_path = 'index.html'

        file_path = os.path.join(BASE_DIR, clean_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            mime_type, _ = mimetypes.guess_type(file_path)
            if not mime_type:
                mime_type = 'application/octet-stream'
            self.send_response(200)
            self.send_header('Content-Type', mime_type)
            with open(file_path, 'rb') as f:
                content = f.read()
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return

        # 404 fallback
        self.send_json(404, {"error": "Not Found"})

    def do_POST(self):
        path = urlparse(self.path).path
        body = self.read_json_body()

        if path == '/api/register':
            username = body.get('username', '').strip().lower()
            password = body.get('password', '').strip()
            full_name = body.get('fullName', '').strip()
            neighborhood = body.get('neighborhood', 'Indiranagar').strip()
            bio = body.get('bio', '').strip()
            teach_skill = body.get('teachSkill', '').strip()
            teach_category = body.get('teachCategory', 'tech').strip().lower()
            teach_level = body.get('teachLevel', 'Intermediate').strip()
            learn_skill = body.get('learnSkill', '').strip()
            preferred_spot = body.get('preferredSpot', '').strip() or 'Local Cafe / Library'

            if not username or not password or not full_name:
                return self.send_json(400, {"error": "Username/email, password, and full name are required."})

            if len(password) < 6:
                return self.send_json(400, {"error": "Password must be at least 6 characters long."})

            conn = get_db()
            cursor = conn.cursor()

            # Check if user already exists
            cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
            if cursor.fetchone():
                conn.close()
                return self.send_json(409, {"error": "An account with this email/username already exists. Please log in."})

            pwd_hash, salt = hash_password(password)
            avatars = ['☕', '🍵', '👩🏽‍💻', '👨🏽‍💻', '🎨', '🎸', '👨🏽‍🍳', '📚', '🌻']
            avatar = body.get('avatar') or avatars[hash(username) % len(avatars)]

            cursor.execute("""
                INSERT INTO users (username, password_hash, salt, full_name, neighborhood, bio, avatar)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (username, pwd_hash, salt, full_name, neighborhood, bio, avatar))
            user_id = cursor.lastrowid

            # Create initial skill if provided
            if teach_skill and learn_skill:
                cursor.execute("""
                    INSERT INTO skills (user_id, teach_skill, teach_category, teach_level, learn_skill, preferred_spot, description)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (user_id, teach_skill, teach_category, teach_level, learn_skill, preferred_spot, bio))

            # Create authentication session token
            session_token = uuid.uuid4().hex
            cursor.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (session_token, user_id))

            conn.commit()
            conn.close()

            return self.send_json(201, {
                "message": "Account created successfully! Welcome to Chai & Code.",
                "token": session_token,
                "user": {
                    "id": user_id,
                    "username": username,
                    "fullName": full_name,
                    "neighborhood": neighborhood,
                    "avatar": avatar,
                    "teachSkill": teach_skill,
                    "learnSkill": learn_skill
                }
            })

        elif path == '/api/login':
            username = body.get('username', '').strip().lower()
            password = body.get('password', '').strip()

            if not username or not password:
                return self.send_json(400, {"error": "Please provide your login ID / email and password."})

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT id, username, password_hash, salt, full_name, neighborhood, bio, avatar FROM users WHERE username = ?", (username,))
            user = cursor.fetchone()

            if not user:
                conn.close()
                return self.send_json(401, {"error": "Invalid username or password. Check your credentials."})

            pwd_hash, _ = hash_password(password, user['salt'])
            if pwd_hash != user['password_hash']:
                conn.close()
                return self.send_json(401, {"error": "Invalid username or password."})

            session_token = uuid.uuid4().hex
            cursor.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (session_token, user['id']))
            conn.commit()
            conn.close()

            return self.send_json(200, {
                "message": f"Welcome back, {user['full_name']}!",
                "token": session_token,
                "user": {
                    "id": user['id'],
                    "username": user['username'],
                    "fullName": user['full_name'],
                    "neighborhood": user['neighborhood'],
                    "bio": user['bio'],
                    "avatar": user['avatar']
                }
            })

        elif path == '/api/logout':
            auth_header = self.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ', 1)[1].strip()
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
                conn.commit()
                conn.close()
            return self.send_json(200, {"message": "Logged out successfully."})

        elif path == '/api/swaps':
            user = self.get_authenticated_user()
            if not user:
                return self.send_json(401, {"error": "You must be logged in to propose a swap over chai."})

            receiver_id = body.get('receiverId')
            skill_offered = body.get('skillOffered', '').strip()
            skill_requested = body.get('skillRequested', '').strip()
            meetup_spot = body.get('meetupSpot', '').strip() or 'Local Neighborhood Cafe'
            scheduled_time = body.get('scheduledTime', 'This weekend')
            note = body.get('note', '')

            if not receiver_id or not skill_offered or not skill_requested:
                return self.send_json(400, {"error": "Receiver, skill offered, and skill requested are required."})

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO swaps (requester_id, receiver_id, skill_offered, skill_requested, meetup_spot, scheduled_time, note, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')
            """, (user['id'], receiver_id, skill_offered, skill_requested, meetup_spot, scheduled_time, note))
            swap_id = cursor.lastrowid
            conn.commit()
            conn.close()

            return self.send_json(201, {
                "message": "Swap proposal sent! The neighbor will be notified to meet over chai.",
                "swapId": swap_id
            })

        self.send_json(404, {"error": "API route not found."})

def run():
    init_db()
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, ChaiAndCodeHandler)
    print(f"[OK] Chai & Code server running at http://localhost:{PORT}")
    print(f"[DIR] Serving from {BASE_DIR}")
    print(f"[DB] Database located at {DB_PATH}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()

if __name__ == '__main__':
    run()
