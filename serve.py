#!/usr/bin/env python3
"""FlowCore: запуск панели и установка как приложение.

    python serve.py                 # http://localhost:8088 — установка на этом ПК
    python serve.py --tunnel        # + временный https-адрес для телефона
    python serve.py --lan           # + адрес в домашней сети (без https, установки не будет)
    python serve.py --tunnel --open # то же и сразу открыть браузер

Почему для телефона нужен туннель: браузер разрешает установку PWA и офлайн-режим
только на защищённом источнике (https или localhost). Адрес вида 192.168.x.x
защищённым не считается, поэтому по Wi-Fi «Установить приложение» не появится.

Туннель даёт публичный адрес на время работы. Данные панели при этом остаются
в браузере устройства: на сервере лежит только код, дневника там нет.
"""

import argparse
import http.server
import mimetypes
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TOOLS = ROOT / ".tools"
PAGE = "flowcore.html"
CLOUDFLARED_ASSETS = {
    "Windows": "cloudflared-windows-amd64.exe",
    "Linux": "cloudflared-linux-amd64",
    "Darwin": "cloudflared-darwin-amd64",
}
INDEX_HTML = """<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>FlowCore</title>
<meta http-equiv="refresh" content="0; url=./flowcore.html"></head>
<body style="background:#030704;color:#68f796;font-family:sans-serif;padding:24px">
Открываю панель: <a style="color:#2ce666" href="./flowcore.html">flowcore.html</a>
</body></html>
"""


def safe_print(*parts):
    text = " ".join(str(p) for p in parts)
    try:
        print(text, flush=True)
    except UnicodeEncodeError:
        print(text.encode("ascii", "replace").decode("ascii"), flush=True)


def lan_ip():
    """Локальный адрес машины в домашней сети (без внешних запросов)."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("192.0.2.1", 9))  # фиктивный адрес: маршрута нет, нужен только выбор интерфейса
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    """Статика из папки проекта, «/» открывает панель, html не кэшируется."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            body = INDEX_HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        if self.path.endswith((".html", ".webmanifest", "sw.js")):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Тихий лог: в консоли нужны только адреса и события
        if "404" in (fmt % args) or "500" in (fmt % args):
            safe_print("  !", fmt % args)


def existing_cloudflared():
    found = shutil.which("cloudflared")
    if found:
        return found
    for name in ("cloudflared.exe", "cloudflared"):
        candidate = TOOLS / name
        if candidate.exists():
            return str(candidate)
    return None


def download_cloudflared():
    system = platform.system()
    asset = CLOUDFLARED_ASSETS.get(system)
    if not asset:
        safe_print(f"Автозагрузка cloudflared не поддерживается на {system}.")
        safe_print("Поставь вручную: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/")
        return None

    TOOLS.mkdir(exist_ok=True)
    target = TOOLS / ("cloudflared.exe" if system == "Windows" else "cloudflared")
    url = f"https://github.com/cloudflare/cloudflared/releases/latest/download/{asset}"
    if system == "Darwin":
        url += ".tgz"

    safe_print("Скачиваю cloudflared один раз (~60 МБ) в", target)
    tmp = target.with_suffix(target.suffix + ".part")
    try:
        with urllib.request.urlopen(url, timeout=60) as response, open(tmp, "wb") as out:
            total = int(response.headers.get("Content-Length") or 0)
            done = 0
            while True:
                chunk = response.read(1024 * 256)
                if not chunk:
                    break
                out.write(chunk)
                done += len(chunk)
                if done % (16 * 1024 * 1024) < 1024 * 256:
                    safe_print(f"  {done // (1024 * 1024)} МБ" + (f" из {total // (1024 * 1024)}" if total else ""))
    except Exception as error:  # сеть, 404, таймаут — всё лечится ручной установкой
        tmp.unlink(missing_ok=True)
        safe_print(f"Не удалось скачать cloudflared: {error}")
        return None

    if system == "Darwin":
        try:
            subprocess.run(["tar", "-xzf", str(tmp), "-C", str(TOOLS)], check=True)
            tmp.unlink(missing_ok=True)
        except Exception as error:
            safe_print("Не удалось распаковать архив:", error)
            return None
    else:
        tmp.replace(target)

    try:
        target.chmod(0o755)
    except OSError:
        pass
    safe_print("Готово.")
    return str(target)


def start_tunnel(exe, port):
    """Поднимает быстрый туннель и возвращает (процесс, поток чтения, событие с URL)."""
    process = subprocess.Popen(
        [exe, "tunnel", "--url", f"http://127.0.0.1:{port}", "--no-autoupdate"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    found = {}
    ready = threading.Event()

    def pump():
        pattern = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")
        assert process.stdout is not None
        for line in process.stdout:
            match = pattern.search(line)
            if match and not ready.is_set():
                found["url"] = match.group(0)
                ready.set()
            if "ERR" in line or "error" in line.lower():
                found.setdefault("log", line.strip())

    threading.Thread(target=pump, daemon=True).start()
    return process, found, ready


def main():
    parser = argparse.ArgumentParser(description="Локальный сервер FlowCore и установка как PWA")
    parser.add_argument("--port", type=int, default=8088, help="порт (по умолчанию 8088)")
    parser.add_argument("--lan", action="store_true", help="открыть доступ в домашней сети без https")
    parser.add_argument("--tunnel", action="store_true", help="временный https-адрес для телефона")
    parser.add_argument("--open", action="store_true", help="открыть браузер после старта")
    parser.add_argument("--no-fetch", action="store_true", help="не скачивать cloudflared автоматически")
    args = parser.parse_args()

    if not (ROOT / PAGE).exists():
        safe_print(f"Не найден {PAGE} рядом с этим скриптом:", ROOT)
        return 2

    # .webmanifest должен отдаваться с правильным типом, иначе Chrome ругается на манифест
    mimetypes.add_type("application/manifest+json", ".webmanifest")
    mimetypes.add_type("text/javascript", ".js")

    host = "0.0.0.0" if args.lan else "127.0.0.1"
    server = http.server.ThreadingHTTPServer((host, args.port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    local_url = f"http://localhost:{args.port}/"
    safe_print("")
    safe_print(f"FlowCore запущен в  {ROOT}")
    safe_print(f"  ПК:       {local_url}")
    if args.lan:
        safe_print(f"  В сети:   http://{lan_ip()}:{args.port}/   (без https — установка не появится)")

    tunnel = None
    try:
        if args.tunnel:
            exe = existing_cloudflared()
            if not exe and not args.no_fetch:
                exe = download_cloudflared()
            if not exe:
                safe_print("")
                safe_print("cloudflared не найден. Поставь его и повтори:")
                safe_print("  winget install --id Cloudflare.cloudflared")
                safe_print("или запусти с флагом без автозагрузки, положив cloudflared.exe в .tools/")
            else:
                safe_print("")
                safe_print("Поднимаю временный https-адрес…")
                tunnel, found, ready = start_tunnel(exe, args.port)
                if ready.wait(timeout=45):
                    public_url = found.get("url", "")
                    safe_print(f"  Телефон:  {public_url}")
                    safe_print("")
                    safe_print("Как поставить на телефон:")
                    safe_print("  Android Chrome: меню ⋮ → «Установить приложение»")
                    safe_print("  iPhone Safari:  Поделиться → «На экран Домой»")
                    safe_print("  Адрес живёт, пока открыт этот скрипт. Дневник остаётся в браузере телефона.")
                    if args.open:
                        webbrowser.open(public_url)
                else:
                    safe_print("Туннель не поднялся.")
                    if found.get("log"):
                        safe_print("  ", found["log"])

        if not args.tunnel and args.open:
            webbrowser.open(local_url)

        if args.tunnel or args.lan:
            safe_print("")
            safe_print("Ctrl+C — остановить.")
        else:
            safe_print("")
            safe_print(f"Установка на этом ПК: открой {local_url} в Chrome/Edge,")
            safe_print("значок установки появится справа в адресной строке.")
            safe_print("Для телефона: python serve.py --tunnel")
            safe_print("Ctrl+C — остановить.")

        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        safe_print("")
        safe_print("Останавливаю…")
    finally:
        server.shutdown()
        server.server_close()
        if tunnel and tunnel.poll() is None:
            tunnel.terminate()
            try:
                tunnel.wait(timeout=5)
            except subprocess.TimeoutExpired:
                tunnel.kill()
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    sys.exit(main())
