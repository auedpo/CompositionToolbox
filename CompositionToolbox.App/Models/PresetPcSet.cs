using System;
using System.Linq;

namespace CompositionToolbox.App.Models
{
    public class PresetPcSet
    {
        public string Id { get; set; } = string.Empty;
        public int Modulus { get; set; }
        public int[] PrimeForm { get; set; } = Array.Empty<int>();
        public int Cardinality { get; set; }
        public string? DisplayName { get; set; }
        public string[] Tags { get; set; } = Array.Empty<string>();
        public string[]? ZRelations { get; set; }
        public string? ZRelation { get; set; }
        public int[] IntervalVector { get; set; } = Array.Empty<int>();
        public string? Cint { get; set; }

        public string PrimeFormDisplay => $"({string.Join(' ', PrimeForm)})";
        public string DisplayText => string.IsNullOrWhiteSpace(DisplayName)
            ? $"{Id} {PrimeFormDisplay}"
            : $"{DisplayName} {PrimeFormDisplay}";

        public string PrimeFormPlain => string.Join(' ', PrimeForm);

        // Lightweight display helpers so the UI can bind to models before a heavy VM is created
        public string NameDisplay => string.IsNullOrWhiteSpace(DisplayName) ? Id : DisplayName!;
        public string CardinalityValue => Cardinality.ToString();
        public int IC1 => IntervalVector.Length > 0 ? IntervalVector[0] : 0;
        public int IC2 => IntervalVector.Length > 1 ? IntervalVector[1] : 0;
        public int IC3 => IntervalVector.Length > 2 ? IntervalVector[2] : 0;
        public int IC4 => IntervalVector.Length > 3 ? IntervalVector[3] : 0;
        public int IC5 => IntervalVector.Length > 4 ? IntervalVector[4] : 0;
        public int IC6 => IntervalVector.Length > 5 ? IntervalVector[5] : 0;
    }
}
