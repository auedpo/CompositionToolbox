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
    }
}
