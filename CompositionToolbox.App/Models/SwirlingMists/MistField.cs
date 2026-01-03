using System.Collections.Generic;

namespace CompositionToolbox.App.Models.SwirlingMists
{
    public sealed class MistField
    {
        public int Seed { get; set; }
        public string Units { get; set; } = "generic";
        public MistTimeMode TimeMode { get; set; } = MistTimeMode.Ticks;
        public List<Stratum> Strata { get; } = new List<Stratum>();
    }
}
