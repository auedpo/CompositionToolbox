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

        public static int[] ComputeFocusAffine(int[] baseSet, int modulus, int multiplier, int focus)
        {
            if (modulus <= 0 || baseSet.Length == 0) return Array.Empty<int>();
            var result = new int[baseSet.Length];
            for (int i = 0; i < baseSet.Length; i++)
            {
                var value = (multiplier * baseSet[i]) - focus;
                result[i] = NormalizeMod(value, modulus);
            }
            return result.Distinct().OrderBy(v => v).ToArray();
        }

        public static bool IsBijective(int multiplier, int modulus)
        {
            if (modulus <= 0) return false;
            return Gcd(Math.Abs(multiplier), modulus) == 1;
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
