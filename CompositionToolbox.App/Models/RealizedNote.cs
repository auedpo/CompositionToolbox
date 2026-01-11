// Purpose: Domain model that represents the Realized Note data used across the application.

namespace CompositionToolbox.App.Models
{
    public sealed record RealizedNote(int MidiNote, double BendSemitones, int? Velocity = null);
}
