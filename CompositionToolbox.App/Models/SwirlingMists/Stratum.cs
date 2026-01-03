namespace CompositionToolbox.App.Models.SwirlingMists
{
    public sealed class Stratum
    {
        public double Baseline { get; set; }
        public int LoopLength { get; set; } = 16;
        public double Speed { get; set; } = 1.0;
        public double Phase0 { get; set; }
        public ClampRange RangeClamp { get; set; } = new ClampRange(-1.0, 1.0);
        public bool Enabled { get; set; } = true;
        public WaveformDefinition Waveform { get; set; } = new WaveformDefinition();
        public System.Windows.Media.Color Color { get; set; } = System.Windows.Media.Colors.DeepSkyBlue;
    }
}
