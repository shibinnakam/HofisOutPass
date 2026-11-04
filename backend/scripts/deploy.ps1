# AWS SAM Deployment Script for Holy Family International School Outpass System
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Holy Family International School (HOFIS) Outpass System" -ForegroundColor Yellow
Write-Host "  AWS Serverless Deployment (Cognito + Lambda + DynamoDB)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Check if AWS credentials exist
try {
    $identity = aws sts get-caller-identity | ConvertFrom-Json
    Write-Host "AWS Account: $($identity.Account) | Arn: $($identity.Arn)" -ForegroundColor Green
} catch {
    Write-Host "ERROR: AWS CLI is not configured with active credentials." -ForegroundColor Red
    Write-Host "Please run 'aws configure' and provide your AWS Access Key, Secret Key, and Region (e.g. ap-south-1 or us-east-1)." -ForegroundColor Yellow
    Exit 1
}

# Prompt for stack name or default
$stackName = "hofis-outpass-system"
$region = "ap-south-1"

Write-Host "Building SAM application..." -ForegroundColor Yellow
sam build --template template.yaml

if ($LASTEXITCODE -ne 0) {
    Write-Host "SAM build failed. Please inspect errors above." -ForegroundColor Red
    Exit $LASTEXITCODE
}

Write-Host "Deploying stack '$stackName' to region '$region'..." -ForegroundColor Yellow
sam deploy `
    --stack-name $stackName `
    --region $region `
    --resolve-s3 `
    --capabilities CAPABILITY_IAM `
    --no-confirm-changeset

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deployment successful!" -ForegroundColor Green
    Write-Host "Now retrieving Stack Outputs to configure frontend..." -ForegroundColor Cyan
    $outputs = aws cloudformation describe-stacks --stack-name $stackName --region $region --query "Stacks[0].Outputs" | ConvertFrom-Json
    $outputs | Format-Table OutputKey, OutputValue
    Write-Host "Copy ApiEndpoint, UserPoolId, and UserPoolClientId to frontend/js/aws-config.js!" -ForegroundColor Green
} else {
    Write-Host "SAM deploy failed." -ForegroundColor Red
}

