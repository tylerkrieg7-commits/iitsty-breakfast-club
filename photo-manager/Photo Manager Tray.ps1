# Breakfast Club Photo Manager - tray helper
# Sits by the clock, shows how many phones are connected and lets you open the manager.
# Right-click the icon for: Open manager, Copy phone link, Back up now, Quit.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$base = "http://localhost:8787"
$ni = New-Object System.Windows.Forms.NotifyIcon
$ni.Icon = [System.Drawing.SystemIcons]::Information
$ni.Visible = $true
$ni.Text = "Photo Manager: starting..."
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$mi = @{}
foreach ($n in @("status","phones","-","open","link","backup","-2","quit")) {
  if ($n.StartsWith("-")) { [void]$menu.Items.Add("-") } else { $i = $menu.Items.Add($n); $mi[$n] = $i }
}
$mi.status.Text = "Photo Manager"; $mi.status.Enabled = $false
$mi.phones.Text = "Phones: ..."; $mi.phones.Enabled = $false
$mi.open.Text = "Open the manager"
$mi.link.Text = "Copy the phone link"
$mi.backup.Text = "Back up the library now"
$mi.quit.Text = "Quit this helper"
$ni.ContextMenuStrip = $menu
$script:lastLink = ""
$script:lastBusy = 0
$script:up = $false
function Poll {
  try {
    $r = Invoke-RestMethod -Uri "$base/api/status" -TimeoutSec 3
    $script:up = $true
    $p = $r.phones
    $script:lastLink = [string]$r.link
    $t = "Photo Manager: " + $p.active + " phone(s) connected"
    if ($p.busy -gt 0) { $t = "Photo Manager: " + $p.busy + " phone(s) syncing" }
    if ($t.Length -gt 62) { $t = $t.Substring(0,62) }
    $ni.Text = $t
    $mi.phones.Text = "Phones connected: " + $p.active + "   (seen today: " + $p.today + ")"
    $mi.status.Text = "Library: " + $r.files + " files"
    if ($p.busy -gt 0 -and $script:lastBusy -eq 0) { $ni.ShowBalloonTip(2500, "Photo Manager", "A phone is syncing now", [System.Windows.Forms.ToolTipIcon]::Info) }
    $script:lastBusy = $p.busy
  } catch {
    $script:up = $false
    $ni.Text = "Photo Manager: not running"
    $mi.phones.Text = "The Photo Manager is not running"
    $mi.status.Text = "Start 'Start Photo Manager.bat'"
  }
}
$mi.open.add_Click({ Start-Process $base })
$ni.add_DoubleClick({ Start-Process $base })
$mi.link.add_Click({ if ($script:lastLink) { [System.Windows.Forms.Clipboard]::SetText($script:lastLink); $ni.ShowBalloonTip(1500, "Photo Manager", "Phone link copied", [System.Windows.Forms.ToolTipIcon]::Info) } else { $ni.ShowBalloonTip(1500, "Photo Manager", "No phone link yet", [System.Windows.Forms.ToolTipIcon]::Warning) } })
$mi.backup.add_Click({ try { Invoke-RestMethod -Method Post -Uri "$base/api/backups/now" | Out-Null; $ni.ShowBalloonTip(1500, "Photo Manager", "Backing up...", [System.Windows.Forms.ToolTipIcon]::Info) } catch {} })
$mi.quit.add_Click({ $ni.Visible = $false; $ni.Dispose(); [System.Windows.Forms.Application]::Exit() })
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.add_Tick({ Poll })
$timer.Start()
Poll
[System.Windows.Forms.Application]::Run()
