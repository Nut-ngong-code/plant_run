# WSL2 -> Windows LAN port forwarder for Plant Watering backend.
# Run as ADMINISTRATOR every time WSL is rebooted (WSL IP changes on each boot).
#
# Usage (PowerShell admin):
#   cd "E:\Akapop\final project\code\scripts"
#   .\wsl-portforward.ps1
#
# After running, ESP32 on the Wi-Fi LAN can reach the backend at:
#   http://<this-PC-Wi-Fi-IP>:3000   (e.g. http://192.168.1.7:3000)

$ErrorActionPreference = "Stop"

# Detect WSL eth0 IP from inside WSL
$wslIp = (wsl hostname -I).Trim().Split()[0]
if ([string]::IsNullOrEmpty($wslIp)) {
    Write-Error "Cannot detect WSL IP. Is WSL running? Try: wsl -l -v"
    exit 1
}
Write-Host "WSL IP detected: $wslIp" -ForegroundColor Cyan

# Reset existing portproxy rules so we don't stack stale entries
netsh interface portproxy reset | Out-Null

# Forward incoming :3000 (any LAN interface) -> WSL eth0:3000 (backend)
netsh interface portproxy add v4tov4 `
    listenport=3000 listenaddress=0.0.0.0 `
    connectport=3000 connectaddress=$wslIp | Out-Null

# Allow inbound on Windows firewall (idempotent — remove old rule first)
$ruleName = "WSL Plant Backend 3000"
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $ruleName `
    -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow | Out-Null

Write-Host ""
Write-Host "Active portproxy rules:" -ForegroundColor Green
netsh interface portproxy show v4tov4

# Show this PC's Wi-Fi IP so user knows what to put in the firmware
$wifiIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.InterfaceAlias -like "Wi-Fi*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -First 1 -ExpandProperty IPAddress)
Write-Host ""
Write-Host "ESP32 should target: http://$wifiIp`:3000  (use this as API_BASE in firmware)" -ForegroundColor Yellow
