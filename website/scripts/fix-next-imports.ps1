$files = Get-ChildItem -Path "src/views" -Recurse -Filter "*.tsx"
foreach ($file in $files) {
    $content = [System.IO.File]::ReadAllText($file.FullName)
    $original = $content

    $content = $content -replace "import \{ Link, useSearchParams \} from 'react-router-dom';", "import Link from 'next/link';`r`nimport { useSearchParams } from 'next/navigation';"
    $content = $content -replace "import \{ Link \} from 'react-router-dom';", "import Link from 'next/link';"
    $content = $content -replace '<Link to=', '<Link href='
    $content = $content -replace "from '\.\./components/Navbar'", "from '@/components/Navbar'"
    $content = $content -replace "from '\.\./\.\./components/Navbar'", "from '@/components/Navbar'"

    $needsClient = $content -match "useState|useEffect|useRef|useMemo|useCallback|useSearchParams"
    if ($needsClient -and $content -notmatch "'use client'") {
        $content = "'use client';`r`n`r`n" + $content
    }

    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($file.FullName, $content)
        Write-Output "Updated: $($file.FullName)"
    }
}
