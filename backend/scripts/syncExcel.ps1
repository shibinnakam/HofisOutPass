# =====================================================================
# Holy Family International School (HOFIS) - Excel Student Synchronizer
# Reads Book1.xlsx and updates frontend and backend student data stores
# =====================================================================

param(
    [string]$ExcelPath = "Book1.xlsx"
)

Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not (Test-Path $ExcelPath)) {
    Write-Host "File not found: $ExcelPath"
    exit 1
}

Write-Host "Reading students from $ExcelPath..."

$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $ExcelPath))
$sheetEntry = $zip.Entries | Where-Object { $_.FullName -eq "xl/worksheets/sheet1.xml" }
$stringsEntry = $zip.Entries | Where-Object { $_.FullName -eq "xl/sharedStrings.xml" }

if (-not $sheetEntry) {
    Write-Host "Could not find xl/worksheets/sheet1.xml in $ExcelPath"
    $zip.Dispose()
    exit 1
}

# 1. Parse Shared Strings
$sharedStrings = @()
if ($stringsEntry) {
    $reader = New-Object System.IO.StreamReader($stringsEntry.Open())
    $rawXml = $reader.ReadToEnd()
    $reader.Close()

    $siMatches = [regex]::Matches($rawXml, '<si>(.*?)</si>')
    foreach ($m in $siMatches) {
        $siContent = $m.Groups[1].Value
        $tMatches = [regex]::Matches($siContent, '<t(?:\s+[^>]*)?>(.*?)</t>')
        $strVal = ""
        foreach ($tm in $tMatches) {
            $strVal += $tm.Groups[1].Value
        }
        $sharedStrings += $strVal
    }
}

# 2. Parse Sheet Cells
$sReader = New-Object System.IO.StreamReader($sheetEntry.Open())
$sheetXml = [xml]$sReader.ReadToEnd()
$sReader.Close()
$zip.Dispose()

$rows = @()
foreach ($row in $sheetXml.worksheet.sheetData.row) {
    $rowObj = [ordered]@{}
    foreach ($c in $row.c) {
        $colLetter = ($c.r -replace '\d+', '')
        $val = ""
        if ($c.t -eq "s") {
            $idx = [int]$c.v
            if ($idx -lt $sharedStrings.Count) {
                $val = $sharedStrings[$idx]
            }
        } elseif ($c.v) {
            $val = [string]$c.v
        }
        $rowObj[$colLetter] = $val
    }
    $rows += $rowObj
}

if ($rows.Count -lt 2) {
    Write-Host "No data rows found in $ExcelPath."
    exit 0
}

# 3. Detect Column Headers from Row 1
$headerRow = $rows[0]
$headerMap = @{}
foreach ($k in $headerRow.Keys) {
    $cleanHeader = ($headerRow[$k] -replace '\s+', ' ').Trim().ToLower()
    $headerMap[$k] = $cleanHeader
}

# 4. Extract Students
$students = @()
for ($i = 1; $i -lt $rows.Count; $i++) {
    $r = $rows[$i]
    $adm = ""
    $name = ""
    $father = ""
    $cls = ""
    $div = ""

    foreach ($col in $headerMap.Keys) {
        $h = $headerMap[$col]
        $val = if ($r.Contains($col)) { [string]$r[$col] } else { "" }
        $val = $val.Trim()

        if ($h -match "father") {
            $father = $val
        } elseif ($h -match "admission|adm") {
            $adm = $val
        } elseif ($h -match "student|name") {
            $name = $val
        } elseif ($h -eq "class" -or $h -match "grade") {
            $cls = $val
        } elseif ($h -match "div|sec") {
            $div = $val
        }
    }

    if ($adm -ne "") {
        $students += [pscustomobject]@{
            admissionNumber = $adm
            studentName     = $name
            fatherName      = $father
            class           = $cls
            division        = $div
            contactNumber   = "+91 98765 43210"
        }
    }
}

Write-Host "Extracted $($students.Count) student record(s) from ${ExcelPath}:"
foreach ($s in $students) {
    Write-Host "  Adm: $($s.admissionNumber) | Name: $($s.studentName) | Father: $($s.fatherName) | Class: $($s.class)-$($s.division)"
}

$jsonArray = $students | ConvertTo-Json -Depth 4
if ($students.Count -eq 1) {
    # Ensure JSON array formatting for single item
    $jsonArray = "[`n" + $jsonArray + "`n]"
}

# 5. Export to frontend/js/students-data.js
$jsContent = "/**`n * Student records synchronized from Book1.xlsx`n */`nwindow.BOOK1_STUDENTS = " + $jsonArray + ";`n"
$jsDir = "frontend/js"
if (-not (Test-Path $jsDir)) { New-Item -ItemType Directory -Path $jsDir -Force | Out-Null }
Set-Content -Path "frontend/js/students-data.js" -Value $jsContent -Encoding UTF8
Write-Host "Created: frontend/js/students-data.js"

# 6. Export to frontend/data/students.json
$dataDir = "frontend/data"
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null }
Set-Content -Path "frontend/data/students.json" -Value $jsonArray -Encoding UTF8
Write-Host "Created: frontend/data/students.json"

# 7. Export to backend/test/mockData.json
$mockDir = "backend/test"
if (-not (Test-Path $mockDir)) { New-Item -ItemType Directory -Path $mockDir -Force | Out-Null }
Set-Content -Path "backend/test/mockData.json" -Value $jsonArray -Encoding UTF8
Write-Host "Created: backend/test/mockData.json"

Write-Host "Book1.xlsx synchronization complete!"
