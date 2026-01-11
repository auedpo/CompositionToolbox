// Purpose: Swirling Mists model representing Clamp Range data for the lens.

namespace CompositionToolbox.App.Models.SwirlingMists
{
    public readonly struct ClampRange
    {
        public ClampRange(double min, double max)
        {
            Min = min;
            Max = max;
        }

        public double Min { get; }
        public double Max { get; }

        public double Clamp(double value)
        {
            if (value < Min) return Min;
            if (value > Max) return Max;
            return value;
        }
    }
}
