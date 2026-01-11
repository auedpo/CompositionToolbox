// Purpose: Swirling Mists service that performs waveform table builder work for the lens calculus.

using System;
using CompositionToolbox.App.Models.SwirlingMists;

namespace CompositionToolbox.App.Services.SwirlingMists
{
    public static class WaveformTableBuilder
    {
        public static double[] BuildCustomTable(double[] samples, int loopLength)
        {
            if (loopLength <= 0)
            {
                return Array.Empty<double>();
            }

            if (samples == null || samples.Length == 0)
            {
                return new double[loopLength];
            }

            if (samples.Length == loopLength)
            {
                var copy = new double[loopLength];
                Array.Copy(samples, copy, loopLength);
                return copy;
            }

            if (loopLength == 1)
            {
                return new[] { samples[0] };
            }

            var resampled = new double[loopLength];
            var maxIndex = samples.Length - 1;
            for (var i = 0; i < loopLength; i++)
            {
                var t = i / (double)(loopLength - 1);
                var sampleIndex = t * maxIndex;
                var i0 = (int)Math.Floor(sampleIndex);
                var i1 = Math.Min(i0 + 1, maxIndex);
                var frac = sampleIndex - i0;
                var v0 = samples[i0];
                var v1 = samples[i1];
                resampled[i] = v0 + (v1 - v0) * frac;
            }

            return resampled;
        }

        public static double[] BuildSineTable(int loopLength)
        {
            if (loopLength <= 0)
            {
                return Array.Empty<double>();
            }

            var table = new double[loopLength];
            var twoPi = 2.0 * Math.PI;
            for (var i = 0; i < loopLength; i++)
            {
                table[i] = Math.Sin(twoPi * i / loopLength);
            }
            return table;
        }

        public static double[] BuildRandomWalkTable(RandomWalkParams parameters, int loopLength, int fieldSeed)
        {
            if (loopLength <= 0)
            {
                return Array.Empty<double>();
            }

            var min = Math.Min(parameters.ClampMin, parameters.ClampMax);
            var max = Math.Max(parameters.ClampMin, parameters.ClampMax);
            var seed = unchecked(fieldSeed * 397) ^ parameters.Seed;
            var rng = new Random(seed);
            var table = new double[loopLength];
            var value = ReflectIntoRange(parameters.StartValue, min, max);
            table[0] = value;

            for (var i = 1; i < loopLength; i++)
            {
                var step = (rng.NextDouble() * 2.0 - 1.0) * parameters.StepSize;
                value = ReflectIntoRange(value + step, min, max);
                table[i] = value;
            }

            var smoothing = parameters.SmoothingWindow;
            if (smoothing > 1)
            {
                table = SmoothTable(table, smoothing);
            }

            return table;
        }

        private static double ReflectIntoRange(double value, double min, double max)
        {
            if (max <= min)
            {
                return min;
            }

            var range = max - min;
            while (value < min || value > max)
            {
                if (value < min)
                {
                    value = min + (min - value);
                }
                else if (value > max)
                {
                    value = max - (value - max);
                }

                if (range <= 0)
                {
                    return min;
                }
            }

            return value;
        }

        private static double[] SmoothTable(double[] table, int windowSize)
        {
            var length = table.Length;
            var smoothed = new double[length];
            var half = windowSize / 2;
            for (var i = 0; i < length; i++)
            {
                var sum = 0.0;
                var count = 0;
                var start = Math.Max(0, i - half);
                var end = Math.Min(length - 1, i + half);
                for (var j = start; j <= end; j++)
                {
                    sum += table[j];
                    count++;
                }
                smoothed[i] = count > 0 ? sum / count : table[i];
            }
            return smoothed;
        }
    }
}
