param(
  [string]$Question = "你好",
  [string]$Model = "qwen-max",
  [switch]$SkipLogin
)

$port = $env:HBUT_HTTP_BRIDGE_PORT
if (-not $port) { $port = "4399" }
$baseUrl = "http://127.0.0.1:$port"

function Invoke-JsonPost {
  param([string]$Url, [hashtable]$Body)
  $json = $Body | ConvertTo-Json -Depth 6
  try {
    return Invoke-RestMethod -Method Post -Uri $Url -Body $json -ContentType "application/json"
  } catch {
    Write-Host "[error] POST $Url failed: $($_.Exception.Message)"
    if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream()) {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $err = $reader.ReadToEnd()
      if ($err) { Write-Host $err }
    }
    throw
  }
}

if (-not $SkipLogin) {
  $username = $env:HBUT_TEST_USER
  $password = $env:HBUT_TEST_PASS
  if (-not $username) {
    $username = Read-Host "HBUT username"
  }
  if (-not $password) {
    $sec = Read-Host "HBUT password" -AsSecureString
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    $password = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }

  Write-Host "[info] login..."
  try {
    $loginRes = Invoke-JsonPost "$baseUrl/login" @{
      username = $username
      password = $password
      captcha = ""
      lt = ""
      execution = ""
    }
    Write-Host "[info] login ok: $($loginRes.student_id)"
  } catch {
    Write-Host "[warn] login failed, continue to ai_init"
  }
}

Write-Host "[info] ai_init..."
try {
  $initRes = Invoke-JsonPost "$baseUrl/ai_init" @{}
} catch {
  Write-Host "[error] ai_init failed"
  exit 1
}
if (-not $initRes.success) {
  Write-Host "[error] ai_init success=false"
  exit 1
}

$token = $initRes.token
$bladeAuth = $initRes.blade_auth
Write-Host "[info] ai_init ok"

$client = New-Object System.Net.Http.HttpClient
$request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, "$baseUrl/ai_chat_stream")
$request.Headers.Accept.Clear()
$request.Headers.Accept.Add([System.Net.Http.Headers.MediaTypeWithQualityHeaderValue]::new("text/event-stream"))
$payload = @{
  token = $token
  blade_auth = $bladeAuth
  question = $Question
  upload_url = ""
  model = $Model
} | ConvertTo-Json -Depth 6
$request.Content = New-Object System.Net.Http.StringContent($payload, [System.Text.Encoding]::UTF8, "application/json")

Write-Host "[info] stream start..."
$response = $client.SendAsync($request, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).Result
if (-not $response.IsSuccessStatusCode) {
  Write-Host "[error] stream failed: $($response.StatusCode)"
  exit 1
}

$stream = $response.Content.ReadAsStreamAsync().Result
$reader = New-Object System.IO.StreamReader($stream)
$final = ""
while (-not $reader.EndOfStream) {
  $line = $reader.ReadLine()
  if (-not $line) { continue }
  $raw = $line.Trim()
  if ($raw.StartsWith("data:")) {
    $raw = $raw.Substring(5).Trim()
  }
  if ($raw -eq "[DONE]") { break }
  $obj = $null
  try {
    $obj = $raw | ConvertFrom-Json -ErrorAction Stop
  } catch {
    Write-Host "[raw] $raw"
    continue
  }
  if ($obj.type -eq 1 -or $obj.type -eq "1") {
    $content = [string]$obj.content
    if ($content) {
      $final += $content
      Write-Host $content
    }
    continue
  }
  if ($obj.type -eq 11 -or $obj.type -eq "11") {
    $thinking = [string]$obj.thinking
    if ($thinking) { Write-Host "[thinking] $thinking" }
    continue
  }
  Write-Host "[info] other type: $raw"
}

Write-Host "[info] stream done"
if ($final) {
  Write-Host "[info] final length: $($final.Length)"
}
