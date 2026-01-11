// Purpose: Contract for services that export MIDI from snapshots.

using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.Services
{
    public interface IMidiExportService
    {
        string ExportToTempMidi(CompositeSnapshot snap, MidiExportOptions opts);
    }
}
