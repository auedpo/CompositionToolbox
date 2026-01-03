using System;
using CompositionToolbox.App.Models.SwirlingMists;

namespace CompositionToolbox.App.Services.SwirlingMists
{
    public static class MistFieldEvaluator
    {
        public static double EvaluateStratum(
            Stratum stratum,
            double t,
            double x,
            InterpolationKind interpolation,
            WaveformTableCache cache,
            int fieldSeed)
        {
            if (!stratum.Enabled)
            {
                return stratum.Baseline;
            }

            var length = Math.Max(1, stratum.LoopLength);
            var phase = x + stratum.Phase0 + stratum.Speed * t;
            phase %= length;
            if (phase < 0)
            {
                phase += length;
            }

            var table = cache.GetTable(stratum.Waveform, length, fieldSeed);
            var delta = WaveformSampler.Sample(table, phase, interpolation);
            var clamp = NormalizeClamp(stratum.RangeClamp);
            return stratum.Baseline + clamp.Clamp(delta);
        }

        public static double[] EvaluateField(
            MistField field,
            double t,
            double x,
            InterpolationKind interpolation,
            WaveformTableCache cache)
        {
            var values = new double[field.Strata.Count];
            for (var i = 0; i < field.Strata.Count; i++)
            {
                values[i] = EvaluateStratum(field.Strata[i], t, x, interpolation, cache, field.Seed);
            }
            return values;
        }

        private static ClampRange NormalizeClamp(ClampRange clamp)
        {
            if (clamp.Max >= clamp.Min)
            {
                return clamp;
            }

            return new ClampRange(clamp.Max, clamp.Min);
        }
    }
}
