# Posts a car listing alert to Discord.
#
# The webhook URL is read from .secrets.local.json, which is gitignored. This script
# contains no secret and is safe to commit.
#
#   .\scripts\notify.ps1 -Title "New match" -Message "..." -Url "https://..." -Score 92
#
# Or pipe a whole listing object:
#   .\scripts\notify.ps1 -ListingJson (Get-Content car.json -Raw)

param(
  [string]$Title = "Car Tracker",
  [string]$Message = "",
  [string]$Url = "",
  [int]$Score = -1,
  [string]$ListingJson = "",
  [switch]$Test
)

$ErrorActionPreference = "Stop"

$secretsPath = Join-Path $PSScriptRoot "..\.secrets.local.json"
if (-not (Test-Path $secretsPath)) {
  Write-Error "Missing .secrets.local.json. Create it with a discordWebhook field."
  exit 1
}

$secrets = Get-Content $secretsPath -Raw | ConvertFrom-Json
$webhook = $secrets.discordWebhook
if ([string]::IsNullOrWhiteSpace($webhook)) {
  Write-Error "discordWebhook is empty in .secrets.local.json"
  exit 1
}

# Colour the embed by how well the car scores against the criteria.
function Get-ScoreColor([int]$s) {
  if ($s -lt 0)  { return 8421504 }   # grey  - no score
  if ($s -ge 85) { return 3066993 }   # green - strong match
  if ($s -ge 70) { return 15844367 }  # amber - worth a look
  return 15158332                     # red   - probably skip
}

if ($Test) {
  $Title = "Car Tracker connected"
  $Message = "Notifications are working. You'll get a message here when a new match appears."
  $Score = -1
}

$fields = @()
if ($Score -ge 0) {
  $fields += @{ name = "Score"; value = "$Score/100"; inline = $true }
}

$embed = @{
  title       = $Title
  description = $Message
  color       = Get-ScoreColor $Score
  timestamp   = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  footer      = @{ text = "Car Tracker" }
}
if ($Url)          { $embed.url = $Url }
if ($fields.Count) { $embed.fields = $fields }

$payload = @{ embeds = @($embed) } | ConvertTo-Json -Depth 10

try {
  Invoke-RestMethod -Uri $webhook -Method Post -ContentType "application/json" -Body $payload | Out-Null
  Write-Host "Posted to Discord: $Title"
} catch {
  Write-Error "Discord post failed: $_"
  exit 1
}
