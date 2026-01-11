// Purpose: Swirling Mists service that performs waveform sampler work for the lens calculus.

using System;
using CompositionToolbox.App.Models.SwirlingMists;

namespace CompositionToolbox.App.Services.SwirlingMists
{
    public static class WaveformSampler
    {
        public static double Sample(double[] table, double phaseIndex, InterpolationKind interpolation)
        {
            if (table == null || table.Length == 0)
            {
                return 0.0;
            }

            var length = table.Length;
            var index = phaseIndex % length;
            if (index < 0)
            {
                index += length;
            }

            if (interpolation == InterpolationKind.Nearest)
            {
                var nearest = (int)Math.Round(index, MidpointRounding.AwayFromZero) % length;
                return table[nearest];
            }

            var i0 = (int)Math.Floor(index);
            var i1 = (i0 + 1) % length;
            var frac = index - i0;
            return table[i0] + (table[i1] - table[i0]) * frac;
        }
    }
}
