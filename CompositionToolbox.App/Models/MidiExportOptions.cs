// Purpose: Domain model that represents the Midi Export Options data used across the application.

namespace CompositionToolbox.App.Models
{
    public sealed class MidiExportOptions
    {
        public MidiRenderMode RenderMode { get; init; } = MidiRenderMode.Chord;
        public double PitchBendRangeSemitones { get; init; } = 2.0;
        public bool UseMpeChannels { get; init; }
    }
}
