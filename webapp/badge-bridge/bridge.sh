#!/usr/bin/env bash
# Starts (make) or stops (make stop) the USB badge bridge in the background, on the host:
# Docker cannot reach the USB port of the reader on macOS and Windows.
set -u
cd "$(dirname "$0")"
PID_FILE=bridge.pid
LOG_FILE=bridge.log
ERROR_FILE=bridge-error.log
CERT="$(pwd)/../../cybersecurity/waf/certs/server.crt"
# Secrets that make loads into Vault: the API reads its DEVICE_TOKEN from there
BACKEND_SECRETS="$(pwd)/../../cybersecurity/vault/secrets/backend.env"

# Succeed under WSL: only the Windows node.exe sees the COM ports, and WSL cannot keep it running in the background
on_windows()
{
	! command -v node >/dev/null 2>&1 && command -v node.exe >/dev/null 2>&1
}

# Print the PID saved by start_bridge (a Windows PID under WSL)
saved_pid()
{
	tr -d '\r\n' < "$PID_FILE"
}

# Succeed if the bridge started by this script is still running
is_running()
{
	if [ ! -s "$PID_FILE" ]
	then
		return 1
	fi
	if on_windows
	then
		tasklist.exe /FI "PID eq $(saved_pid)" /NH 2>/dev/null | grep -qi node.exe
	else
		kill -0 "$(saved_pid)" 2>/dev/null
	fi
}

# Start node in the background: Windows starts it itself under WSL, nohup and setsid elsewhere
launch()
{
	# Trust the self-signed certificate of the WAF; WSLENV passes it to Windows as a Windows path
	export NODE_EXTRA_CA_CERTS="$CERT"
	export WSLENV="${WSLENV:+$WSLENV:}NODE_EXTRA_CA_CERTS/p"
	# Same DEVICE_TOKEN as the API: read from the file make loads into Vault, parsed like
	# bootstrap.sh does (everything after the first "=", last line wins). Node gives the
	# environment priority over --env-file, so this replaces the copy in .env.
	if [ -f "$BACKEND_SECRETS" ]
	then
		DEVICE_TOKEN="$(grep '^DEVICE_TOKEN=' "$BACKEND_SECRETS" | tail -n 1 | cut -d= -f2- | tr -d '\r')"
		if [ -n "$DEVICE_TOKEN" ]
		then
			export DEVICE_TOKEN
			export WSLENV="$WSLENV:DEVICE_TOKEN"
		else
			unset DEVICE_TOKEN
		fi
	fi
	if on_windows
	then
		powershell.exe -NoProfile -Command "(Start-Process node.exe -ArgumentList '--env-file-if-exists=.env','bridge.js' -WindowStyle Hidden -RedirectStandardOutput $LOG_FILE -RedirectStandardError $ERROR_FILE -PassThru).Id | Set-Content -Encoding ascii $PID_FILE" > /dev/null 2>&1 &
	elif command -v setsid >/dev/null 2>&1
	then
		setsid nohup node --env-file-if-exists=.env bridge.js > "$LOG_FILE" 2>&1 &
		echo $! > "$PID_FILE"
	else
		nohup node --env-file-if-exists=.env bridge.js > "$LOG_FILE" 2>&1 &
		echo $! > "$PID_FILE"
	fi
}

# Start the bridge if it is configured, and say whether it stayed up (never fails make)
start_bridge()
{
	if [ ! -f .env ]
	then
		echo "Badge bridge not started: no webapp/badge-bridge/.env (see .env.example)"
		return 0
	fi
	if is_running
	then
		echo "Badge bridge already running"
		return 0
	fi
	if ! command -v node >/dev/null 2>&1 && ! command -v node.exe >/dev/null 2>&1
	then
		echo "Badge bridge not started: Node.js is not installed"
		return 0
	fi
	if [ ! -d node_modules ]
	then
		npm ci --omit=dev --silent
	fi
	rm -f "$PID_FILE" "$LOG_FILE" "$ERROR_FILE"
	launch
	sleep 4
	if is_running
	then
		echo "Badge bridge running (log: webapp/badge-bridge/$LOG_FILE)"
	else
		echo "Badge bridge stopped (reader unplugged or port busy?):"
		cat "$LOG_FILE" "$ERROR_FILE" 2>/dev/null | tail -n 3
		rm -f "$PID_FILE"
	fi
}

# Stop the bridge started by start_bridge, if any
stop_bridge()
{
	if is_running
	then
		if on_windows
		then
			taskkill.exe /F /PID "$(saved_pid)" > /dev/null
		else
			kill "$(saved_pid)"
		fi
		echo "Badge bridge stopped"
	fi
	rm -f "$PID_FILE"
}

if [ "${1:-}" = stop ]
then
	stop_bridge
else
	start_bridge
fi
