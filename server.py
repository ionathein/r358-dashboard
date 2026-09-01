import http.server
import socketserver
import json
import os
import sys
import threading
import time
import webbrowser
import subprocess

PORT = 8555
BASE_DIR = r"C:\Users\ionat\.gemini\antigravity\scratch\r358_dashboard"
SCRATCH_DIR = r"C:\Users\ionat\.gemini\antigravity\brain\28800f6e-bc7b-431e-a316-7bd151bb0f36\scratch"
SYNC_SCRIPT = os.path.join(SCRATCH_DIR, "sync_outlook.py")

class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_GET(self):
        if self.path == "/api/sync" or self.path == "/api/sync/":
            self.handle_sync()
        elif self.path == "/api/summary":
            self.handle_summary()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == "/api/sync" or self.path == "/api/sync/":
            self.handle_sync()
        else:
            super().do_POST()

    def handle_sync(self):
        print("[API] Solicitud de sincronización recibida...")
        try:
            res = subprocess.run(["python", SYNC_SCRIPT], capture_output=True, text=True, timeout=120)
            print(res.stdout)
            
            summary_file = os.path.join(BASE_DIR, "summary.json")
            with open(summary_file, "r", encoding="utf-8") as f:
                summary = json.load(f)
                
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            response_data = {
                "status": "success",
                "message": "Sincronización completada exitosamente",
                "summary": summary
            }
            self.wfile.write(json.dumps(response_data, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode("utf-8"))

    def handle_summary(self):
        summary_file = os.path.join(BASE_DIR, "summary.json")
        if os.path.exists(summary_file):
            with open(summary_file, "r", encoding="utf-8") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(data.encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

def hourly_sync_worker():
    while True:
        time.sleep(3600)
        print("[Auto-Sync] Sincronización horaria periódica con Outlook...")
        try:
            subprocess.run(["python", SYNC_SCRIPT], capture_output=True, text=True, timeout=120)
        except Exception as e:
            print("[Auto-Sync Error]", e)

def main():
    os.chdir(BASE_DIR)
    
    sync_thread = threading.Thread(target=hourly_sync_worker, daemon=True)
    sync_thread.start()
    
    url = f"http://localhost:{PORT}/index.html"
    print(f"=======================================================")
    print(f" Dashboard R358 Activo en: {url}")
    print(f" Auto-sincronización horaria con Outlook activada")
    print(f"=======================================================")
    
    try:
        webbrowser.open(url)
    except:
        pass
        
    for p in range(PORT, PORT + 10):
        try:
            socketserver.TCPServer.allow_reuse_address = True
            with socketserver.TCPServer(("", p), DashboardHandler) as httpd:
                print(f"Servidor escuchando en puerto {p}...")
                httpd.serve_forever()
                break
        except OSError:
            continue

if __name__ == "__main__":
    main()
