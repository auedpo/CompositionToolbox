using System;

namespace CompositionToolbox.App.Models.SwirlingMists
{
    public sealed class SwirlingMistsSnapshot
    {
        public SwirlingMistsSnapshot(double t, double x, double[] values)
        {
            T = t;
            X = x;
            Values = values ?? Array.Empty<double>();
        }

        public double T { get; }
        public double X { get; }
        public double[] Values { get; }
    }
}
