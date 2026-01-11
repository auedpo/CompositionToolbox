// Purpose: Helpers for rhythm grouping based on divisor group sizes.

using System;
using System.Collections.Generic;

namespace CompositionToolbox.App.Utilities
{
    public static class RhythmGrouping
    {
        public static int[] GetMeasureDivisors(int cycleUnits)
        {
            var cycle = Math.Max(1, cycleUnits);
            var divisors = new List<int>();
            for (var i = 1; i * i <= cycle; i++)
            {
                if (cycle % i != 0) continue;
                divisors.Add(i);
                var other = cycle / i;
                if (other != i)
                {
                    divisors.Add(other);
                }
            }
            divisors.Sort();
            return divisors.ToArray();
        }
    }
}
