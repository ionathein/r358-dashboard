import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8550
DIRECTORY = r"C:\Users\ionat\.gemini\antigravity\scratch\r358_dashboard"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def main():
    os.chdir(DIRECTORY)
    url = f"http://localhost:{PORT}/index.html"
    print(f"Iniciando servidor local del Dashboard R358 en {url}...")
    
    # Try to open in default browser
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"Abre en tu navegador: {url}")
        
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Servidor activo en el puerto {PORT}. Presiona Ctrl+C para detener.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detenido.")

if __name__ == "__main__":
    main()
