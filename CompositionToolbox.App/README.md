# CompositionToolbox Prototype (WPF, .NET 9)

Build & run (dotnet CLI):

1. Open a terminal in this project folder (where CompositionToolbox.App.csproj lives).
2. Restore & build:
   dotnet restore
   dotnet build
3. Run:
   dotnet run

Notes:
- Requires .NET 9 SDK and WebView2 runtime installed on Windows.
- The `Assets/notation.html` uses VexFlow from unpkg CDN in this prototype. You can replace with a local copy if desired.
- MIDI requires an available MIDI out device. The app enumerates devices at startup.
