// Purpose: Data models that represent interference rhythm generators and their resultant events.

using System;
using System.Collections.Generic;
using System.Linq;

namespace CompositionToolbox.App.Models
{
    public sealed class RhythmGeneratorDef
    {
        private readonly int[] _parts;
        private readonly int[] _offsets;
        private readonly int _period;

        public RhythmGeneratorDef(string id, IEnumerable<int>? parts, int? pitch)
        {
            if (string.IsNullOrWhiteSpace(id))
            {
                throw new ArgumentException("Generator id must be provided.", nameof(id));
            }

            Id = id;

            var sanitized = (parts ?? Array.Empty<int>())
                .Where(x => x > 0)
                .ToArray();
            if (sanitized.Length == 0)
            {
                sanitized = new[] { 1 };
            }

            _parts = sanitized;
            _period = _parts.Sum();
            if (_period <= 0)
            {
                _period = 1;
            }

            _offsets = BuildOffsets(_parts);
            Pitch = pitch;
        }

        public string Id { get; }

        public IReadOnlyList<int> Parts => _parts;

        public int? Pitch { get; }

        public int Period => _period;

        public IReadOnlyList<int> Offsets => _offsets;

        private static int[] BuildOffsets(int[] parts)
        {
            if (parts.Length == 0)
            {
                return Array.Empty<int>();
            }

            var offsets = new List<int> { 0 };
            var cumulative = 0;
            for (var i = 0; i < parts.Length - 1; i++)
            {
                cumulative += parts[i];
                offsets.Add(cumulative);
            }

            return offsets.ToArray();
        }
    }

    public sealed class InterferenceEvent
    {
        public InterferenceEvent(int time, IReadOnlyList<string>? fires, IReadOnlyList<int>? pitches, bool unpitched, int duration)
        {
            Time = time;
            Fires = fires ?? Array.Empty<string>();
            Pitches = pitches ?? Array.Empty<int>();
            Unpitched = unpitched;
            Duration = duration;
        }

        public int Time { get; }

        public int Duration { get; }

        public IReadOnlyList<string> Fires { get; }

        public IReadOnlyList<int> Pitches { get; }

        public bool Unpitched { get; }

        public string TimeDisplay => Time.ToString();

        public string DurationDisplay => Duration.ToString();

        public string FiresDisplay => Fires.Count == 0 ? "-" : string.Join(", ", Fires);

        public string PitchesDisplay => Pitches.Count == 0 ? (Unpitched ? "unpitched" : "-") : string.Join(", ", Pitches);
    }

    public sealed class InterferenceResult
    {
        private readonly int[] _generatorPeriods;

        public InterferenceResult(
            IReadOnlyList<RhythmGeneratorDef> generators,
            int cycle,
            IReadOnlyList<InterferenceEvent> events,
            IReadOnlyList<int> durations)
        {
            Generators = generators ?? throw new ArgumentNullException(nameof(generators));
            if (Generators.Count == 0)
            {
                throw new ArgumentException("At least one generator definition is required.", nameof(generators));
            }

            Cycle = Math.Max(1, cycle);
            Events = events ?? throw new ArgumentNullException(nameof(events));
            Durations = durations ?? throw new ArgumentNullException(nameof(durations));
            if (Durations.Count != Events.Count)
            {
                throw new ArgumentException("Durations must align with events.", nameof(durations));
            }

            _generatorPeriods = Generators.Select(g => g.Period).ToArray();
        }

        public IReadOnlyList<RhythmGeneratorDef> Generators { get; }

        public IReadOnlyList<int> GeneratorPeriods => _generatorPeriods;

        public int Cycle { get; }

        public IReadOnlyList<InterferenceEvent> Events { get; }

        public IReadOnlyList<int> Durations { get; }
    }
}
