// Purpose: Swirling Mists model representing Waveform Definition data for the lens.

using System;

namespace CompositionToolbox.App.Models.SwirlingMists
{
    public sealed class WaveformDefinition
    {
        public WaveformKind Kind { get; set; } = WaveformKind.Sine;
        public double[] CustomTable { get; set; } = Array.Empty<double>();
        public RandomWalkParams RandomWalk { get; set; } = new RandomWalkParams();
    }
}
