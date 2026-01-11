// Purpose: Swirling Mists model representing Swirling Mists Enums data for the lens.

namespace CompositionToolbox.App.Models.SwirlingMists
{
    public enum MistTimeMode
    {
        Ticks
    }

    public enum WaveformKind
    {
        CustomTable,
        Sine,
        RandomWalk
    }

    public enum InterpolationKind
    {
        Nearest,
        Linear
    }

    public enum RandomWalkBoundMode
    {
        Reflect
    }
}
