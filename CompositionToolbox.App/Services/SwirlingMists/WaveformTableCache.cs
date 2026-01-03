using System;
using System.Collections.Generic;
using CompositionToolbox.App.Models.SwirlingMists;

namespace CompositionToolbox.App.Services.SwirlingMists
{
    public sealed class WaveformTableCache
    {
        private readonly Dictionary<WaveformCacheKey, double[]> _cache = new();

        public double[] GetTable(WaveformDefinition waveform, int loopLength, int fieldSeed)
        {
            var key = WaveformCacheKey.Create(waveform, loopLength, fieldSeed);
            if (_cache.TryGetValue(key, out var cached))
            {
                return cached;
            }

            double[] table = waveform.Kind switch
            {
                WaveformKind.CustomTable => WaveformTableBuilder.BuildCustomTable(waveform.CustomTable, loopLength),
                WaveformKind.RandomWalk => WaveformTableBuilder.BuildRandomWalkTable(waveform.RandomWalk, loopLength, fieldSeed),
                _ => WaveformTableBuilder.BuildSineTable(loopLength)
            };

            _cache[key] = table;
            return table;
        }

        private readonly record struct WaveformCacheKey(
            WaveformKind Kind,
            int LoopLength,
            int Seed,
            int CustomHash,
            double StepSize,
            double ClampMin,
            double ClampMax,
            double StartValue,
            RandomWalkBoundMode BoundMode,
            int SmoothingWindow)
        {
            public static WaveformCacheKey Create(WaveformDefinition waveform, int loopLength, int fieldSeed)
            {
                var customHash = 0;
                if (waveform.Kind == WaveformKind.CustomTable && waveform.CustomTable.Length > 0)
                {
                    unchecked
                    {
                        customHash = 17;
                        foreach (var value in waveform.CustomTable)
                        {
                            customHash = customHash * 31 + value.GetHashCode();
                        }
                    }
                }

                var random = waveform.RandomWalk ?? new RandomWalkParams();
                var seed = unchecked(fieldSeed * 397) ^ random.Seed;
                return new WaveformCacheKey(
                    waveform.Kind,
                    loopLength,
                    seed,
                    customHash,
                    random.StepSize,
                    random.ClampMin,
                    random.ClampMax,
                    random.StartValue,
                    random.BoundMode,
                    random.SmoothingWindow);
            }
        }
    }
}
