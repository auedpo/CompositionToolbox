// Purpose: Helper models that describe custom notation rendering hints for the workspace preview.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Serialization;

namespace CompositionToolbox.App.Models
{
    public sealed class NotationDurationSegment
    {
        public NotationDurationSegment(string duration, int dots)
        {
            Duration = string.IsNullOrWhiteSpace(duration) ? "q" : duration;
            Dots = Math.Max(0, dots);
        }

        [JsonPropertyName("duration")]
        public string Duration { get; }

        [JsonPropertyName("dots")]
        public int Dots { get; }
    }

    public sealed class NotationEventSpec
    {
        private static readonly NotationDurationSegment[] EmptySegments = Array.Empty<NotationDurationSegment>();

        public NotationEventSpec(IEnumerable<int>? midiPitches, string duration, int units, IEnumerable<NotationDurationSegment>? segments = null)
        {
            MidiPitches = (midiPitches ?? Array.Empty<int>()).ToArray();
            Duration = string.IsNullOrWhiteSpace(duration) ? "q" : duration;
            Units = Math.Max(1, units);
            Segments = (segments ?? EmptySegments).ToArray();
        }

        [JsonPropertyName("pitches")]
        public IReadOnlyList<int> MidiPitches { get; }

        [JsonPropertyName("duration")]
        public string Duration { get; }

        [JsonPropertyName("units")]
        public int Units { get; }

        [JsonPropertyName("segments")]
        public IReadOnlyList<NotationDurationSegment> Segments { get; }
    }

    public sealed class NotationRenderExtras
    {
        public NotationRenderExtras(
            string? clef,
            IEnumerable<NotationEventSpec>? events,
            double baseBeats,
            string baseNoteValue = "1/4",
            int? measureUnits = null,
            int? cycleUnits = null)
        {
            Clef = clef;
            Events = (events ?? Array.Empty<NotationEventSpec>()).ToArray();
            BaseBeats = baseBeats > 0 ? baseBeats : 1.0;
            BaseNoteValue = string.IsNullOrWhiteSpace(baseNoteValue) ? "1/4" : baseNoteValue;
            MeasureUnits = measureUnits.HasValue && measureUnits.Value > 0 ? measureUnits : null;
            CycleUnits = cycleUnits.HasValue && cycleUnits.Value > 0 ? cycleUnits : null;
        }

        [JsonPropertyName("clef")]
        public string? Clef { get; }

        [JsonPropertyName("events")]
        public IReadOnlyList<NotationEventSpec> Events { get; }

        [JsonPropertyName("baseBeats")]
        public double BaseBeats { get; }

        [JsonPropertyName("baseNote")]
        public string BaseNoteValue { get; }

        [JsonPropertyName("measureUnits")]
        public int? MeasureUnits { get; }

        [JsonPropertyName("cycleUnits")]
        public int? CycleUnits { get; }
    }
}
