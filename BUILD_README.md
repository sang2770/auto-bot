# Auto Bot 78Win - Portable Executable

## 🚀 Build Instructions

### Prerequisites

- Node.js installed on your system
- npm (comes with Node.js)

### Building the Portable Executable

#### On Windows:

1. Double-click `build.bat`
2. Wait for the build process to complete
3. Find your executable in the `dist` folder: `AutoBot-78Win-Portable-1.0.0.exe`

#### On Mac/Linux:

1. Run `chmod +x build.sh` (first time only)
2. Run `./build.sh`
3. Find your executable in the `dist` folder

#### Manual Build:

```bash
# Install dependencies
npm install

# Build portable Windows executable
npm run build-win

# Build for all platforms
npm run build
```

## 📁 Output Files

After building, you'll find these files in the `dist` folder:

- **`AutoBot-78Win-Portable-1.0.0.exe`** - Portable executable (no installation needed)
- **`AutoBot-78Win Setup 1.0.0.exe`** - Full installer

## 🎯 Using the Portable Executable

1. Copy `AutoBot-78Win-Portable-1.0.0.exe` to any folder
2. Double-click to run (no installation required)
3. The app will create its configuration files in the same directory
4. Chrome extension files are bundled inside the executable

## ⚙️ Configuration

The app automatically:

- Saves configuration in `config.json` (same directory as exe)
- Loads the bot-tele Chrome extension
- Starts WebSocket server on port 8080
- Manages browser instances for automation

## 🔧 Features

- ✅ Portable - No installation required
- ✅ Self-contained - All dependencies included
- ✅ Chrome extension integration
- ✅ WebSocket communication
- ✅ Automatic maintenance detection & restart
- ✅ Configuration persistence
- ✅ Browser automation with Puppeteer

## 🛠️ Build Customization

Edit `package.json` in the `build` section to customize:

- App name and version
- Icon (place custom icon in `assets/` folder)
- Build targets (Windows, Mac, Linux)
- Output filename format

## 📋 System Requirements

- Windows 7 or later (for Windows build)
- Chrome browser installed
- Internet connection for game access
- Administrator privileges (recommended)

## 🔍 Troubleshooting

### Build Issues:

- Ensure Node.js is installed: `node --version`
- Clear npm cache: `npm cache clean --force`
- Delete `node_modules` and run `npm install` again

### Runtime Issues:

- Run as Administrator if browser automation fails
- Check Windows Defender/Antivirus settings
- Ensure Chrome is installed and updated

## 📞 Support

For issues or questions, check the console logs in the Electron app's Developer Tools (Ctrl+Shift+I).
