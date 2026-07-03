$files = Get-ChildItem -Path "src/views" -Recurse -Filter "*.tsx"
foreach ($file in $files) {
    $content = [System.IO.File]::ReadAllText($file.FullName)
    $original = $content
    $content = $content -replace '\bto=', 'href='
    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($file.FullName, $content)
        Write-Output "Fixed href: $($file.Name)"
    }
}
