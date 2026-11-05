# =====================================================================
# HOFIS - Seed Students from Database (Class playschool to X) into AWS DynamoDB
# =====================================================================

$Region = "ap-south-1"
$TableName = "Hofis_Students"
$JsonPath = Join-Path $PSScriptRoot "..\..\frontend\data\students.json"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Holy Family International School (HOFIS)                  " -ForegroundColor Cyan
Write-Host " Uploading Students to AWS DynamoDB Table '$TableName'   " -ForegroundColor Cyan
Write-Host " Region: $Region                                           " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $JsonPath)) {
    Write-Host "students.json not found. Running syncExcel.ps1 first..." -ForegroundColor Yellow
    & "$PSScriptRoot\syncExcel.ps1"
}

$students = Get-Content -Raw -Path $JsonPath | ConvertFrom-Json

Write-Host "Found $($students.Count) student record(s) to upload..." -ForegroundColor Green

foreach ($s in $students) {
    $adm = [string]$s.admissionNumber
    $name = [string]$s.studentName
    $father = [string]$s.fatherName
    $cls = [string]$s.class
    $div = [string]$s.division
    $phone = if ($s.contactNumber) { [string]$s.contactNumber } else { "+91 98765 43210" }
    $email = if ($s.contactEmail) { [string]$s.contactEmail } else { "" }

    Write-Host "Uploading Adm: $adm ($name, Class $cls-$div)..." -NoNewline

    $tempFile = [System.IO.Path]::GetTempFileName()
    $putItem = @{
        TableName = $TableName
        Item = @{
            admissionNumber = @{ S = $adm }
            studentName     = @{ S = $name }
            fatherName      = @{ S = $father }
            class           = @{ S = $cls }
            division        = @{ S = $div }
            contactNumber   = @{ S = $phone }
            contactEmail    = @{ S = $email }
        }
    }
    $jsonContent = $putItem | ConvertTo-Json -Depth 5
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($tempFile, $jsonContent, $utf8NoBom)
    $fileUri = "file://" + $tempFile.Replace('\', '/')

    $output = aws dynamodb put-item --cli-input-json "$fileUri" --region $Region 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " [OK]" -ForegroundColor Green
    } else {
        Write-Host " [FAILED]" -ForegroundColor Red
        Write-Host "   $output" -ForegroundColor DarkYellow
    }
    Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Seeding process complete!                                " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
