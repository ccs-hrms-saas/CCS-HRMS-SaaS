#!/bin/bash
# Upload CCS HRMS Kiosk installer to GitHub Releases
# Usage: GITHUB_TOKEN=your_token ./upload-release.sh

set -e

REPO="ccs-hrms-saas/CCS-HRMS-SaaS"
TAG="v1.0.0-kiosk"
EXE_PATH="dist/CCS HRMS Kiosk Setup 1.0.0.exe"
ASSET_NAME="CCS-HRMS-Kiosk-Setup-1.0.0.exe"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ Set GITHUB_TOKEN first:"
  echo "   export GITHUB_TOKEN=ghp_your_token_here"
  echo "   ./upload-release.sh"
  exit 1
fi

echo "📦 Creating GitHub release $TAG..."
RELEASE_RESPONSE=$(curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/$REPO/releases" \
  -d "{
    \"tag_name\": \"$TAG\",
    \"name\": \"CCS HRMS Desktop Kiosk v1.0.0\",
    \"body\": \"Windows installer for the CCS HRMS Desktop Kiosk attendance app.\",
    \"draft\": false,
    \"prerelease\": false
  }")

UPLOAD_URL=$(echo "$RELEASE_RESPONSE" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('upload_url','').split('{')[0])" 2>/dev/null)
RELEASE_ID=$(echo "$RELEASE_RESPONSE" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('id',''))" 2>/dev/null)

if [ -z "$UPLOAD_URL" ] || [ "$UPLOAD_URL" = "None" ]; then
  echo "⚠️  Release may already exist, fetching existing..."
  RELEASE_RESPONSE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
    "https://api.github.com/repos/$REPO/releases/tags/$TAG")
  UPLOAD_URL=$(echo "$RELEASE_RESPONSE" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('upload_url','').split('{')[0])")
  RELEASE_ID=$(echo "$RELEASE_RESPONSE" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('id',''))")
fi

echo "⬆️  Uploading $ASSET_NAME (may take a minute)..."
UPLOAD_RESPONSE=$(curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@$EXE_PATH" \
  "${UPLOAD_URL}?name=${ASSET_NAME}")

DOWNLOAD_URL=$(echo "$UPLOAD_RESPONSE" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('browser_download_url',''))" 2>/dev/null)

echo ""
echo "✅ Done!"
echo "📥 Windows download URL:"
echo "   $DOWNLOAD_URL"
echo ""
echo "Now paste this URL in:"
echo "  Developer → Tenant → Mobile Tab → Desktop Kiosk → Windows Download URL field → Save"
