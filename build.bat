@echo off
echo 🚀 Starting Auto Bot 78Win build process...

REM Check if node_modules exists
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
)

REM Create default icon if it doesn't exist
if not exist "assets\icon.png" (
    echo 🎨 Creating default icon...
    node -e "const fs = require('fs'); const svgIcon = '<svg width=\"256\" height=\"256\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"256\" height=\"256\" fill=\"#0078d7\"/><text x=\"128\" y=\"140\" text-anchor=\"middle\" fill=\"white\" font-size=\"48\" font-family=\"Arial\">🎰</text><text x=\"128\" y=\"190\" text-anchor=\"middle\" fill=\"white\" font-size=\"20\" font-family=\"Arial\">Auto Bot</text><text x=\"128\" y=\"215\" text-anchor=\"middle\" fill=\"white\" font-size=\"16\" font-family=\"Arial\">78Win</text></svg>'; fs.writeFileSync('assets/icon.svg', svgIcon); console.log('✅ Default icon created');"
)

REM Build for Windows portable
echo 🔨 Building Windows portable executable...
npm run build-win

echo ✅ Build completed!
echo 📁 Check the 'dist' folder for your portable executable
echo 🎯 Look for: AutoBot-78Win-Portable-1.0.0.exe
pause
