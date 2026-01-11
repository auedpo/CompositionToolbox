// Purpose: Swirling Mists service that performs swirling mists extractor work for the lens calculus.

using System;
using System.Collections.Generic;
using CompositionToolbox.App.Models.SwirlingMists;

namespace CompositionToolbox.App.Services.SwirlingMists
{
    public static class SwirlingMistsExtractor
    {
        public static IReadOnlyList<SwirlingMistsSnapshot> ExtractXWindow(
            MistField field,
            double t,
            double xStart,
            double xEnd,
            int count,
            InterpolationKind interpolation,
            WaveformTableCache cache)
        {
            var xs = BuildWindow(xStart, xEnd, count);
            var snapshots = new List<SwirlingMistsSnapshot>(xs.Length);
            foreach (var x in xs)
            {
                var values = MistFieldEvaluator.EvaluateField(field, t, x, interpolation, cache);
                snapshots.Add(new SwirlingMistsSnapshot(t, x, values));
            }
            return snapshots;
        }

        public static IReadOnlyList<SwirlingMistsSnapshot> ExtractTWindow(
            MistField field,
            double x,
            double tStart,
            double tEnd,
            int count,
            InterpolationKind interpolation,
            WaveformTableCache cache)
        {
            var ts = BuildWindow(tStart, tEnd, count);
            var snapshots = new List<SwirlingMistsSnapshot>(ts.Length);
            foreach (var t in ts)
            {
                var values = MistFieldEvaluator.EvaluateField(field, t, x, interpolation, cache);
                snapshots.Add(new SwirlingMistsSnapshot(t, x, values));
            }
            return snapshots;
        }

        public static double[] BuildWindow(double start, double end, int count)
        {
            if (count <= 0)
            {
                return Array.Empty<double>();
            }

            if (count == 1)
            {
                return new[] { start };
            }

            var values = new double[count];
            var step = (end - start) / (count - 1);
            for (var i = 0; i < count; i++)
            {
                values[i] = start + step * i;
            }
            return values;
        }
    }
}
