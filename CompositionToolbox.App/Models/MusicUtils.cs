using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using System.Security.Cryptography;

namespace CompositionToolbox.App.Models
{
    public static class MusicUtils
    {
        private const string Base62Chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

        public static int[] NormalizeUnordered(int[] pcs, int modulus)
        {
            return pcs.Select(x => ((x % modulus) + modulus) % modulus).Distinct().OrderBy(x => x).ToArray();
        }

        public static int[] ComputeNormalOrder(int[] pcs, int modulus)
        {
            var set = NormalizeUnordered(pcs, modulus);
            if (set.Length == 0) return Array.Empty<int>();
            if (set.Length == 1) return new[] { 0 };

            int k = set.Length;
            int[]? best = null;
            int bestSpan = int.MaxValue;
            int[]? bestAdj = null;
            int bestIndex = int.MaxValue;
            int bestStart = int.MaxValue; // starting pitch-class of the chosen rotation (0..modulus-1)
            int bestPenult = int.MaxValue; // interval between first and penultimate note (since candidate is transposed to 0, this is candidate[k-2]

            for (int i = 0; i < k; i++)
            {
                var rotated = new int[k];
                for (int j = 0; j < k; j++)
                {
                    var idx = (i + j) % k;
                    var val = set[idx];
                    if (idx < i) val += modulus;
                    rotated[j] = val;
                }

                var candidate = TransposeToZero(rotated, modulus);
                var span = candidate[k - 1];
                var adj = AdjacentIntervals(candidate);

                if (span < bestSpan)
                {
                    best = candidate;
                    bestSpan = span;
                    bestAdj = adj;
                    bestIndex = i;
                    bestPenult = candidate[k - 2];
                    bestStart = set[i];
                    continue;
                }

                if (span > bestSpan || bestAdj == null || best == null) continue;

                // Tie on total span: apply tie-break rules per specification
                // Rahn-style leftward tie-break ("most compact toward the left"):
                // If rotations tie on overall span, compare the distance from the first
                // note to the second-last note; if tied, compare first→third-last; keep
                // moving leftward until a difference is found. This ensures each upper
                // notes are as "scrunched down" as possible. Example: {1,4,7,8,10} ->
                // normal form [7,8,10,1,4].
                bool decided = false;
                bool chooseCandidate = false;
                for (int offset = 2; offset <= k - 1; offset++)
                {
                    var idx = k - offset;
                    var candVal = candidate[idx];
                    var bestVal = best[idx];
                    if (candVal < bestVal)
                    {
                        chooseCandidate = true;
                        decided = true;
                        break;
                    }
                    if (candVal > bestVal)
                    {
                        chooseCandidate = false;
                        decided = true;
                        break;
                    }
                    // otherwise continue to next leftward comparison
                }

                if (decided && chooseCandidate)
                {
                    best = candidate;
                    bestSpan = span;
                    bestAdj = adj;
                    bestIndex = i;
                    bestPenult = candidate[k - 2];
                    bestStart = set[i];
                    continue;
                }

                // If still tied after leftward comparisons, fall back to starting-PC comparison
                var startPc = set[i];
                if (startPc < bestStart || (startPc == bestStart && i < bestIndex))
                {
                    best = candidate;
                    bestSpan = span;
                    bestAdj = adj;
                    bestIndex = i;
                    bestPenult = candidate[k - 2];
                    bestStart = startPc;
                }
            }

            // Return the normal-order rotation in the original pitch-class space
            if (best == null || bestIndex == int.MaxValue) return Array.Empty<int>();

            var rotatedOut = new int[k];
            for (int j = 0; j < k; j++)
            {
                rotatedOut[j] = set[(bestIndex + j) % k];
            }
            return rotatedOut;
        }

        public static int[] ComputePrimeForm(int[] pcs, int modulus)
        {
            var set = NormalizeUnordered(pcs, modulus);
            if (set.Length == 0) return Array.Empty<int>();
            if (set.Length == 1) return new[] { 0 };

            var normal = ComputeNormalOrder(set, modulus);
            var normalTransposed = TransposeToZero(normal, modulus);

            var inverted = set.Select(x => NormalizeMod(-x, modulus)).ToArray();
            var normalInv = ComputeNormalOrder(inverted, modulus);
            var normalInvTransposed = TransposeToZero(normalInv, modulus);

            var cmp = ComparePackedKey(normalTransposed, normalInvTransposed);
            return cmp <= 0 ? normalTransposed : normalInvTransposed;
        }

        public static int[] ComputeIntervalVector(int[] pcs, int modulus)
        {
            var prime = ComputePrimeForm(pcs, modulus);
            if (prime.Length == 0) return Array.Empty<int>();
            if (modulus <= 0) return Array.Empty<int>();

            var maxIc = modulus / 2;
            if (maxIc <= 0) return Array.Empty<int>();
            var counts = new int[maxIc];

            for (int i = 0; i < prime.Length; i++)
            {
                for (int j = i + 1; j < prime.Length; j++)
                {
                    var interval = NormalizeMod(prime[j] - prime[i], modulus);
                    if (interval == 0) continue;
                    var ic = Math.Min(interval, modulus - interval);
                    if (ic <= 0 || ic > maxIc) continue;
                    counts[ic - 1]++;
                }
            }

            return counts;
        }

        public static int[] RealizePcs(int[] pcs, int modulus, PcMode mode, RealizationConfig config)
        {
            if (pcs == null || pcs.Length == 0) return Array.Empty<int>();
            if (modulus <= 0) return Array.Empty<int>();
            var local = config ?? new RealizationConfig();
            return mode == PcMode.Ordered
                ? RealizeOrderedSequence(pcs, modulus, local)
                : RealizeChord(pcs, modulus, local);
        }

        private static int[] RealizeOrderedSequence(int[] pcs, int modulus, RealizationConfig config)
        {
            var baseMidi = config.Pc0RefMidi;
            var normalized = pcs.Select(x => NormalizeMod(x, modulus)).ToArray();
            if (normalized.Length == 0) return Array.Empty<int>();

            var result = new int[normalized.Length];
            result[0] = baseMidi + normalized[0];

            if (config.OrderedUnwrapMode == OrderedUnwrapMode.FixedOctave)
            {
                for (int i = 0; i < normalized.Length; i++)
                {
                    result[i] = baseMidi + normalized[i];
                }
                return FitToAmbitus(result, modulus, config.AmbitusLowMidi, config.AmbitusHighMidi);
            }

            for (int i = 1; i < normalized.Length; i++)
            {
                var target = baseMidi + normalized[i];
                if (config.OrderedUnwrapMode == OrderedUnwrapMode.AnchorFirst)
                {
                    var shift = FindBestShift(target, result[0], modulus);
                    result[i] = target + (shift * modulus);
                }
                else
                {
                    var shift = FindBestShift(target, result[i - 1], modulus);
                    result[i] = target + (shift * modulus);
                }
            }

            return FitToAmbitus(result, modulus, config.AmbitusLowMidi, config.AmbitusHighMidi);
        }

        private static int[] RealizeChord(int[] pcs, int modulus, RealizationConfig config)
        {
            var baseMidi = config.Pc0RefMidi;
            var normalized = NormalizeUnordered(pcs, modulus);
            if (normalized.Length == 0) return Array.Empty<int>();

            var chord = normalized.Select(pc => baseMidi + pc).ToArray();

            if (config.ChordVoicingMode == ChordVoicingMode.Spread)
            {
                for (int i = 1; i < chord.Length; i++)
                {
                    if (i % 2 == 1)
                    {
                        chord[i] += modulus;
                    }
                }
            }

            if (config.ChordVoicingMode == ChordVoicingMode.Centered)
            {
                chord = FitToAmbitus(chord, modulus, config.AmbitusLowMidi, config.AmbitusHighMidi, preferCenter: true);
            }
            else
            {
                chord = FitToAmbitus(chord, modulus, config.AmbitusLowMidi, config.AmbitusHighMidi);
            }

            return chord;
        }

        private static int[] FitToAmbitus(int[] notes, int modulus, int? low, int? high, bool preferCenter = false)
        {
            if (notes.Length == 0) return notes;
            if (low == null || high == null) return notes;

            var min = notes.Min();
            var max = notes.Max();
            var shiftMin = (int)Math.Ceiling((low.Value - min) / (double)modulus);
            var shiftMax = (int)Math.Floor((high.Value - max) / (double)modulus);

            int shift;
            if (shiftMin <= shiftMax)
            {
                if (preferCenter)
                {
                    var center = (low.Value + high.Value) / 2.0;
                    shift = ChooseShiftForCenter(notes, modulus, shiftMin, shiftMax, center);
                }
                else
                {
                    shift = Math.Clamp(0, shiftMin, shiftMax);
                }
            }
            else
            {
                shift = preferCenter
                    ? ChooseShiftForCenter(notes, modulus, shiftMax, shiftMin, (low.Value + high.Value) / 2.0)
                    : (min < low ? shiftMin : shiftMax);
            }

            if (shift == 0) return notes;

            var shifted = new int[notes.Length];
            for (int i = 0; i < notes.Length; i++)
            {
                shifted[i] = notes[i] + (shift * modulus);
            }
            return shifted;
        }

        private static int FindBestShift(int target, int anchor, int modulus)
        {
            var raw = (anchor - target) / (double)modulus;
            var baseShift = (int)Math.Round(raw);
            var bestShift = baseShift;
            var bestDistance = Math.Abs((target + baseShift * modulus) - anchor);
            for (int delta = -1; delta <= 1; delta++)
            {
                var shift = baseShift + delta;
                var distance = Math.Abs((target + shift * modulus) - anchor);
                if (distance < bestDistance)
                {
                    bestDistance = distance;
                    bestShift = shift;
                }
            }
            return bestShift;
        }

        private static int ChooseShiftForCenter(int[] notes, int modulus, int shiftMin, int shiftMax, double center)
        {
            var bestShift = shiftMin;
            var bestScore = double.MaxValue;
            for (int shift = shiftMin; shift <= shiftMax; shift++)
            {
                var avg = notes.Average(n => n + (shift * modulus));
                var score = Math.Abs(avg - center);
                if (score < bestScore)
                {
                    bestScore = score;
                    bestShift = shift;
                }
            }
            return bestShift;
        }

        private static int[] TransposeToZero(int[] list, int modulus)
        {
            var t = list[0];
            var result = new int[list.Length];
            for (int i = 0; i < list.Length; i++)
            {
                result[i] = NormalizeMod(list[i] - t, modulus);
            }
            return result;
        }

        private static int NormalizeMod(int value, int modulus)
        {
            var n = value % modulus;
            return n < 0 ? n + modulus : n;
        }

        private static int[] AdjacentIntervals(int[] candidate)
        {
            if (candidate.Length <= 1) return Array.Empty<int>();
            var adj = new int[candidate.Length - 1];
            for (int i = 1; i < candidate.Length; i++)
            {
                adj[i - 1] = candidate[i] - candidate[i - 1];
            }
            return adj;
        }

        private static int CompareAdjacentLeftToRight(int[] a, int[] b)
        {
            var k = Math.Min(a.Length, b.Length);
            for (int i = 0; i < k; i++)
            {
                if (a[i] < b[i]) return -1;
                if (a[i] > b[i]) return 1;
            }
            return 0;
        }

        private static int ComparePackedKey(int[] a, int[] b)
        {
            var adjA = AdjacentIntervals(a);
            var adjB = AdjacentIntervals(b);
            var cmp = CompareAdjacentLeftToRight(adjA, adjB);
            if (cmp != 0) return cmp;

            int n = Math.Min(a.Length, b.Length);
            for (int i = 0; i < n; i++)
            {
                if (a[i] < b[i]) return -1;
                if (a[i] > b[i]) return 1;
            }
            if (a.Length < b.Length) return -1;
            if (a.Length > b.Length) return 1;
            return 0;
        }

        public static int[] ApplyPermutation(int[] pcs, string seed)
        {
            if (pcs == null) return Array.Empty<int>();
            if (pcs.Length <= 1) return pcs.ToArray();
            ulong s = DecodeBase62(seed);
            // Reduce to 32-bit for System.Random constructor
            int seed32 = (int)(s ^ (s >> 32));
            var rng = new Random(seed32);
            var arr = pcs.ToArray();
            // Fisher-Yates
            for (int i = arr.Length - 1; i > 0; i--)
            {
                int j = rng.Next(i + 1);
                var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
            }
            return arr;
        }

        public static string GenerateRandomBase62(int length)
        {
            Span<byte> bytes = stackalloc byte[length];
            RandomNumberGenerator.Fill(bytes);
            var chars = new char[length];
            for (int i = 0; i < length; i++)
            {
                chars[i] = Base62Chars[bytes[i] % Base62Chars.Length];
            }
            return new string(chars);
        }

        public static ulong DecodeBase62(string s)
        {
            if (string.IsNullOrEmpty(s)) return 0UL;
            ulong v = 0UL;
            foreach (var ch in s)
            {
                int idx = Base62Chars.IndexOf(ch);
                if (idx < 0) continue;
                v = v * 62UL + (ulong)idx;
            }
            return v;
        }

        public static int[] GenerateRandomPcList(int modulus, int length)
        {
            if (modulus <= 0) return Array.Empty<int>();
            if (length <= 0) return Array.Empty<int>();
            var result = new List<int>();
            if (length >= modulus)
            {
                // produce a full permutation of 0..mod-1 then take prefix
                var all = Enumerable.Range(0, modulus).ToArray();
                // shuffle all
                var rnd = new Random();
                for (int i = all.Length - 1; i > 0; i--)
                {
                    int j = rnd.Next(i + 1);
                    var tmp = all[i]; all[i] = all[j]; all[j] = tmp;
                }
                return all.Take(length).ToArray();
            }
            var used = new HashSet<int>();
            var rand = new Random();
            while (result.Count < length)
            {
                int x = rand.Next(modulus);
                if (!used.Add(x)) continue;
                result.Add(x);
            }
            return result.ToArray();
        }
    }
}
