// Purpose: Service orchestrating focus affine math operations for the app.

using System;
using System.Linq;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.Services
{
    public static class FocusAffineMath
    {
        public static int[] ComputeDistinctSet(int[] pcs, int modulus)
        {
            return MusicUtils.NormalizeUnordered(pcs, modulus);
        }

        public static int[] NormalizeOrdered(int[] pcs, int modulus)
        {
            if (pcs == null) return Array.Empty<int>();
            if (modulus <= 0) return pcs.ToArray();
            return pcs.Select(pc => NormalizeMod(pc, modulus)).ToArray();
        }

        public static int[] ComputeOffsets(int[] xs, int modulus, int multiplier, int focusIndex)
        {
            if (modulus <= 0 || xs.Length == 0) return Array.Empty<int>();
            if (focusIndex < 0 || focusIndex >= xs.Length) return Array.Empty<int>();

            var focus = xs[focusIndex];
            var result = new int[xs.Length];
            for (int i = 0; i < xs.Length; i++)
            {
                var delta = NormalizeMod(xs[i] - focus, modulus);
                var scaled = NormalizeMod(multiplier * delta, modulus);
                result[i] = scaled;
            }

            return result;
        }

        public static int[] ComputeOutputs(int[] xs, int modulus, int multiplier, int focusIndex)
        {
            if (modulus <= 0 || xs.Length == 0) return Array.Empty<int>();
            if (focusIndex < 0 || focusIndex >= xs.Length) return Array.Empty<int>();

            var focus = xs[focusIndex];
            var offsets = ComputeOffsets(xs, modulus, multiplier, focusIndex);
            var result = new int[xs.Length];
            for (int i = 0; i < offsets.Length; i++)
            {
                result[i] = NormalizeMod(focus + offsets[i], modulus);
            }

            return result;
        }

        public static bool IsBijective(int multiplier, int modulus)
        {
            if (modulus <= 0) return false;
            return Gcd(Math.Abs(multiplier), modulus) == 1;
        }

        public static int[] ComputeFocusAffine(int[] pcs, int modulus, int multiplier, int focus)
        {
            if (modulus <= 0 || pcs == null || pcs.Length == 0) return Array.Empty<int>();

            var distinct = ComputeDistinctSet(pcs, modulus);
            // Shift inputs by focus (wrap with modulus)
            var shifted = distinct.Select(x => NormalizeMod(x + focus, modulus)).ToArray();
            // Derive focus index using modulo to allow focus values beyond set length (tests use this behavior)
            var focusIndex = shifted.Length == 0 ? 0 : ((focus % shifted.Length) + shifted.Length) % shifted.Length;
            var outputs = ComputeOutputs(shifted, modulus, multiplier, focusIndex);
            // Return sorted ascending for deterministic presentation
            return outputs.OrderBy(x => x).ToArray();
        }

        private static int NormalizeMod(int value, int modulus)
        {
            var n = value % modulus;
            return n < 0 ? n + modulus : n;
        }

        private static int Gcd(int a, int b)
        {
            while (b != 0)
            {
                var t = a % b;
                a = b;
                b = t;
            }
            return a;
        }
    }
}
