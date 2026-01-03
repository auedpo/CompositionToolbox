namespace CompositionToolbox.App.Models.SwirlingMists
{
    public sealed class RandomWalkParams
    {
        public int Seed { get; set; }
        public double StepSize { get; set; } = 0.25;
        public double ClampMin { get; set; } = -1.0;
        public double ClampMax { get; set; } = 1.0;
        public double StartValue { get; set; }
        public RandomWalkBoundMode BoundMode { get; set; } = RandomWalkBoundMode.Reflect;
        public int SmoothingWindow { get; set; }
    }
}
