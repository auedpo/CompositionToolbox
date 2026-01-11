// Purpose: Math helpers for generating interference rhythms from multiple periodic generators.

using System;
using System.Collections.Generic;
using System.Linq;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.Services
{
    public static class InterferenceRhythmMath
    {
        public static InterferenceResult ComputeTwoGeneratorResultant(int a, int b, int? pitchA, int? pitchB)
        {
            var generatorA = new RhythmGeneratorDef("A", new[] { Math.Max(1, a) }, pitchA);
            var generatorB = new RhythmGeneratorDef("B", new[] { Math.Max(1, b) }, pitchB);
            return ComputeResultant(new[] { generatorA, generatorB });
        }

        public static InterferenceResult ComputeResultant(IReadOnlyList<RhythmGeneratorDef> generators)
        {
            if (generators == null)
            {
                throw new ArgumentNullException(nameof(generators));
            }

            var ordered = generators.Where(g => g != null).ToArray();
            if (ordered.Length == 0)
            {
                throw new ArgumentException("At least one generator must be provided.", nameof(generators));
            }

            var periods = ordered.Select(g => Math.Max(1, g.Period)).ToArray();
            var cycle = ComputeCycle(periods);
            var eventsByTime = BuildEventTimeline(ordered, cycle);
            var times = eventsByTime.Keys.ToArray();
            var durations = ComputeDurations(times, cycle);
            var events = BuildEvents(ordered, eventsByTime, durations);

            return new InterferenceResult(ordered, cycle, events, durations);
        }

        private static SortedDictionary<int, List<RhythmGeneratorDef>> BuildEventTimeline(
            IReadOnlyList<RhythmGeneratorDef> generators,
            int cycle)
        {
            var events = new SortedDictionary<int, List<RhythmGeneratorDef>>();
            foreach (var generator in generators)
            {
                var period = Math.Max(1, generator.Period);
                var offsets = generator.Offsets;
                if (offsets.Count == 0)
                {
                    offsets = new[] { 0 };
                }

                for (var multiple = 0; multiple * period < cycle; multiple++)
                {
                    var baseTime = multiple * period;
                    foreach (var offset in offsets)
                    {
                        var time = baseTime + offset;
                        if (time >= cycle)
                        {
                            continue;
                        }

                        if (!events.TryGetValue(time, out var list))
                        {
                            list = new List<RhythmGeneratorDef>();
                            events[time] = list;
                        }

                        if (!list.Contains(generator))
                        {
                            list.Add(generator);
                        }
                    }
                }
            }

            if (!events.ContainsKey(0))
            {
                events[0] = new List<RhythmGeneratorDef>();
            }

            return events;
        }

        private static IReadOnlyList<int> ComputeDurations(int[] times, int cycle)
        {
            if (times.Length == 0)
            {
                return new[] { cycle };
            }

            var durations = new List<int>();
            for (var i = 0; i < times.Length - 1; i++)
            {
                durations.Add(times[i + 1] - times[i]);
            }

            durations.Add(cycle - times[^1]);
            return durations;
        }

        private static IReadOnlyList<InterferenceEvent> BuildEvents(
            IReadOnlyList<RhythmGeneratorDef> generators,
            SortedDictionary<int, List<RhythmGeneratorDef>> timeline,
            IReadOnlyList<int> durations)
        {
            var events = new List<InterferenceEvent>();
            var index = 0;
            foreach (var kvp in timeline)
            {
                var time = kvp.Key;
                var fired = kvp.Value;
                var duration = index < durations.Count ? durations[index] : 0;
                index++;
                var fires = new List<string>();
                var pitches = new List<int>();
                var unpitched = false;
                foreach (var generator in generators)
                {
                    if (fired.Contains(generator))
                    {
                        fires.Add(generator.Id);
                        if (generator.Pitch.HasValue)
                        {
                            pitches.Add(generator.Pitch.Value);
                        }
                        else
                        {
                            unpitched = true;
                        }
                    }
                }

                events.Add(new InterferenceEvent(time, fires, pitches, unpitched, duration));
            }

            return events;
        }

        private static int ComputeCycle(int[] periods)
        {
            var cycle = 1;
            foreach (var period in periods)
            {
                cycle = Lcm(cycle, Math.Max(1, period));
            }
            return Math.Max(1, cycle);
        }

        private static int Lcm(int a, int b)
        {
            return Math.Abs(a / Math.Max(1, Gcd(a, b))) * Math.Max(1, b);
        }

        private static int Gcd(int a, int b)
        {
            while (b != 0)
            {
                var t = b;
                b = a % b;
                a = t;
            }
            return Math.Abs(a);
        }
    }
}
