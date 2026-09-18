$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$wrangler = Join-Path $root 'node_modules/.bin/wrangler.CMD'
$base = 'https://www.bonlist.site'
$id = [guid]::NewGuid().ToString()
$sessionId = [guid]::NewGuid().ToString()
$token = [guid]::NewGuid().ToString('N')
$email = "cv-smoke-$id@example.invalid"
$headers = @{ Authorization = "Bearer $token" }

function Invoke-CvPost([string]$path, [object]$payload) {
  $body = ConvertTo-Json -InputObject $payload -Depth 40 -Compress
  $response = Invoke-WebRequest -Uri "$base$path" -Method Post -Headers $headers -ContentType 'application/json' -Body $body -SkipHttpErrorCheck -TimeoutSec 90
  Write-Host "$path -> $([int]$response.StatusCode)"
  if ([int]$response.StatusCode -ge 300) { throw "$path failed: $($response.Content)" }
  return ($response.Content | ConvertFrom-Json)
}

$created = $false
try {
  $sql = "INSERT INTO users (id, email, password_hash, name, email_verified) VALUES ('$id', '$email', 'temporary-smoke-test', 'CV Smoke Test', 1); INSERT INTO sessions (id, user_id, token, expires_at) VALUES ('$sessionId', '$id', '$token', datetime('now', '+15 minutes'));"
  & $wrangler d1 execute bonlist-db --remote --command $sql | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not create temporary test session.' }
  $created = $true

  $me = Invoke-WebRequest -Uri "$base/api/career/auth/me" -Headers $headers -SkipHttpErrorCheck -TimeoutSec 30
  Write-Output "auth/me -> $([int]$me.StatusCode)"
  if ([int]$me.StatusCode -ge 300) { throw 'Temporary signed-in session was rejected.' }

  $cvText = "Alex Morgan`nalex.morgan@example.invalid`nData Analyst`nProfessional Summary`nData analyst with experience creating business dashboards and improving report accuracy for operations teams.`nWork Experience`nData Analyst at Example Company, 2022 to 2025`nBuilt monthly dashboards and checked data quality for business leaders.`nEducation`nBachelor of Science in Statistics, Example University, 2021`nSkills`nSQL, Excel, Power BI, Data analysis, Reporting"
  $parsed = Invoke-CvPost '/api/career/cv/parse-upload' @{ fileName = 'sample-cv.txt'; text = $cvText }
  if (-not $parsed.cv_content -or $parsed.cv_content.experiences.Count -lt 1) { throw 'CV text was not structured into experience.' }

  $generated = Invoke-CvPost '/api/career/cv/generate' @{ name = 'Alex Morgan'; email = $email; targetRole = 'Data Analyst'; location = 'Cape Town'; extracted = $parsed; structure = 'professional' }
  if (-not $generated.document -or -not $generated.document.fullName) { throw 'CV generation returned no document.' }

  $saved = Invoke-CvPost '/api/career/cv/save' @{ document = $generated.document; title = 'CV smoke test' }
  if (-not $saved.id) { throw 'CV save returned no identifier.' }

  $quality = Invoke-CvPost '/api/career/cv/quality-score' @{ cvDocument = $generated.document }
  if ($null -eq $quality.overallScore) { throw 'Quality score response is missing a score.' }

  $report = Invoke-CvPost '/api/career/diagnostic' @{ fileName = 'sample-cv.txt'; text = $cvText; role = 'Data Analyst'; location = 'Cape Town' }
  if (-not $report.id) { throw 'CV reviewer returned no report.' }
  Write-Output "review matches -> $($report.relatedJobs.Count)"

  $latest = Invoke-WebRequest -Uri "$base/api/career/diagnostic/latest" -Headers $headers -SkipHttpErrorCheck -TimeoutSec 30
  Write-Output "diagnostic/latest -> $([int]$latest.StatusCode)"
  if ([int]$latest.StatusCode -ge 300) { throw 'Saved review cannot be reopened.' }
  Write-Output 'CV smoke test passed.'
} finally {
  if ($created) {
    $cleanup = "PRAGMA foreign_keys=ON; DELETE FROM application_outcomes WHERE user_id='$id'; DELETE FROM generated_cvs WHERE user_id='$id'; DELETE FROM cv_reports WHERE user_id='$id'; DELETE FROM career_profiles WHERE user_id='$id'; DELETE FROM sessions WHERE user_id='$id'; DELETE FROM users WHERE id='$id';"
    & $wrangler d1 execute bonlist-db --remote --command $cleanup | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Temporary test data cleanup needs attention.' }
    else { Write-Output 'Temporary test data removed.' }
  }
}
