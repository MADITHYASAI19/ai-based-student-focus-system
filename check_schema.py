import sqlite3

conn = sqlite3.connect('study_companion.db')
cursor = conn.cursor()
cursor.execute('SELECT sql FROM sqlite_master WHERE type="table" AND name="users"')
print(cursor.fetchone()[0])
conn.close()
