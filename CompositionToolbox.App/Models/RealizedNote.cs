namespace CompositionToolbox.App.Models
{
    public sealed record RealizedNote(int MidiNote, double BendSemitones, int? Velocity = null);
}
