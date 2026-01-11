// Purpose: Utility that maps raw duration units to notation-friendly symbols and base note values.

using System;
using System.Collections.Generic;
using System.Linq;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.Utilities
{
    public static class NotationDurationMapper
    {
        private static readonly IReadOnlyList<string> _baseNoteValues = new[] { "1/64", "1/32", "1/16", "1/8", "1/4", "1/2", "1" };

        private static readonly Dictionary<string, double> _baseNoteBeats = _baseNoteValues.ToDictionary(
            value => value,
            value => value switch
            {
                "1/64" => 0.0625,
                "1/32" => 0.125,
                "1/16" => 0.25,
                "1/8" => 0.5,
                "1/4" => 1.0,
                "1/2" => 2.0,
                "1" => 4.0,
                _ => 1.0
            });

        private static readonly Dictionary<string, int> _baseNoteDenominators = _baseNoteValues.ToDictionary(
            value => value,
            value => value switch
            {
                "1/64" => 64,
                "1/32" => 32,
                "1/16" => 16,
                "1/8" => 8,
                "1/4" => 4,
                "1/2" => 2,
                "1" => 1,
                _ => 4
            });

        private static readonly (string Symbol, double Beats)[] _durationTable = new[]
        {
            ("w", 4.0),
            ("h", 2.0),
            ("q", 1.0),
            ("8", 0.5),
            ("16", 0.25),
            ("32", 0.125),
            ("64", 0.0625)
        };

        private static readonly (string Symbol, int Ticks)[] _tickDurations = new[]
        {
            ("w", 64),
            ("h", 32),
            ("q", 16),
            ("8", 8),
            ("16", 4),
            ("32", 2),
            ("64", 1)
        };

        public static IReadOnlyList<string> BaseNoteValues => _baseNoteValues;

        public static double GetBaseNoteBeats(string baseValue)
        {
            if (string.IsNullOrWhiteSpace(baseValue)) return 1.0;
            return _baseNoteBeats.TryGetValue(baseValue, out var beats) ? beats : 1.0;
        }

        public static int GetBaseNoteDenominator(string baseValue)
        {
            if (string.IsNullOrWhiteSpace(baseValue)) return 4;
            return _baseNoteDenominators.TryGetValue(baseValue, out var denom) ? denom : 4;
        }

        public static string MapDurationSymbol(int duration, double baseNoteBeats)
        {
            if (duration <= 0) return "q";
            var beats = duration * baseNoteBeats;
            var best = _durationTable[^1];
            var bestDiff = double.MaxValue;
            foreach (var entry in _durationTable)
            {
                var diff = Math.Abs(beats - entry.Beats);
                if (diff < bestDiff)
                {
                    bestDiff = diff;
                    best = entry;
                }
            }
            return best.Symbol;
        }

        public static IReadOnlyList<NotationDurationSegment> BuildDurationSegments(int units, string baseNoteValue)
        {
            var safeUnits = Math.Max(1, units);
            var denominator = GetBaseNoteDenominator(baseNoteValue);
            if (denominator <= 0) denominator = 4;
            var ticksPerUnit = 64 / denominator;
            if (ticksPerUnit <= 0) ticksPerUnit = 16;
            var remainingTicks = safeUnits * ticksPerUnit;
            var segments = new List<NotationDurationSegment>();

            var candidates = new List<(int Ticks, string Symbol, int Dots)>();
            foreach (var entry in _tickDurations)
            {
                var baseTicks = entry.Ticks;
                candidates.Add((baseTicks, entry.Symbol, 0));
                if (baseTicks % 2 == 0)
                {
                    candidates.Add((baseTicks + baseTicks / 2, entry.Symbol, 1));
                }
                if (baseTicks % 4 == 0)
                {
                    candidates.Add((baseTicks + baseTicks / 2 + baseTicks / 4, entry.Symbol, 2));
                }
            }

            var ordered = candidates
                .OrderByDescending(c => c.Ticks)
                .ThenByDescending(c => c.Dots)
                .ToArray();

            while (remainingTicks > 0)
            {
                var match = ordered.FirstOrDefault(c => c.Ticks <= remainingTicks);
                if (match.Ticks <= 0)
                {
                    segments.Add(new NotationDurationSegment("64", 0));
                    remainingTicks -= 1;
                    continue;
                }

                segments.Add(new NotationDurationSegment(match.Symbol, match.Dots));
                remainingTicks -= match.Ticks;
            }

            return segments;
        }
    }
}
