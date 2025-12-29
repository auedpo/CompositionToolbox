Composition Toolbox - Prototype

Project folder: CompositionToolbox.App

Quick start (recommended):

1. From the workspace root, create a solution and add the project (one-time):
   dotnet new sln -n CompositionToolbox
   dotnet sln add "CompositionToolbox.App\CompositionToolbox.App.csproj"

2. Build & run from the project folder:
   cd "CompositionToolbox.App"
   dotnet restore
   dotnet build
   dotnet run

Requirements:
- Windows with .NET 9 SDK
- WebView2 runtime installed (https://developer.microsoft.com/microsoft-edge/webview2/)
- A MIDI output device to hear playback (optional)

What this prototype includes:
- Initialization lens for creating a starting PitchNode from PC list
- Transform log with selectable nodes
- Play button to send MIDI notes via NAudio
- Notation rendering using WebView2 + VexFlow (notation.html in Assets)

Notes:
- This is v1 focusing on wiring UI, state, MIDI, and notation. No advanced transforms yet.
