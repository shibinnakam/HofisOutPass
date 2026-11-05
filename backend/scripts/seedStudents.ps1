# ============================================================
# HOFIS – Seed students.json into DynamoDB StudentsTable
# Run once: .\backend\scripts\seedStudents.ps1
# Requires AWS CLI configured with ap-south-1 credentials.
# ============================================================

$region      = "ap-south-1"
$tableName   = "Hofis_Students"
$studentsFile = Join-Path $PSScriptRoot "..\..\frontend\data\students.json"

if (-not (Test-Path $studentsFile)) {
    Write-Error "students.json not found at $studentsFile"
    exit 1
}

$students = Get-Content $studentsFile -Raw | ConvertFrom-Json
$total    = $students.Count
$count    = 0

Write-Host "Seeding $total students into DynamoDB table '$tableName' in region '$region'..."

foreach ($s in $students) {
    # Build a DynamoDB-formatted item (all values as strings "S")
    $item = [ordered]@{
        admissionNumber = @{ S = [string]$s.admissionNumber }
        studentName     = @{ S = [string]$s.studentName }
        fatherName      = @{ S = if ($s.fatherName) { [string]$s.fatherName } else { "" } }
        class           = @{ S = if ($s.class)       { [string]$s.class }       else { "" } }
        division        = @{ S = if ($s.division)    { [string]$s.division }    else { "" } }
        contactNumber   = @{ S = if ($s.contactNumber) { [string]$s.contactNumber } else { "" } }
    }

    $json = $item | ConvertTo-Json -Depth 5 -Compress

    aws dynamodb put-item `
        --region $region `
        --table-name $tableName `
        --item $json `
        --return-consumed-capacity NONE 2>&1 | Out-Null

    $count++
    if ($count % 50 -eq 0) {
        Write-Host "  Inserted $count / $total ..."
    }
}

Write-Host ""
Write-Host "Done! $count students seeded into '$tableName'."

