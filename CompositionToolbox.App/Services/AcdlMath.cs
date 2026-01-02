using System;
using System.Collections.Generic;
using System.Linq;

namespace CompositionToolbox.App.Services
{
    public enum AcdlProjectionMode
    {
        TrimLargest,
        RoundRobin
    }

    public static class AcdlMath
    {
        public static int[] ComputeCint(int[] pcs, int modulus)
        {
            if (pcs == null || pcs.Length == 0 || modulus <= 0) return Array.Empty<int>();
            var k = pcs.Length;
            var gaps = new int[k];
            for (int i = 0; i < k - 1; i++)
            {
                gaps[i] = NormalizeMod(pcs[i + 1] - pcs[i], modulus);
            }
            gaps[k - 1] = NormalizeMod(pcs[0] - pcs[k - 1], modulus);
            return gaps;
        }

        public static int[] BuildPitchListFromGaps(int start, int[] gaps, int modulus)
        {
            if (gaps == null || gaps.Length == 0 || modulus <= 0) return Array.Empty<int>();
            var list = new int[gaps.Length];
            list[0] = NormalizeMod(start, modulus);
            for (int i = 1; i < gaps.Length; i++)
            {
                list[i] = NormalizeMod(list[i - 1] + gaps[i - 1], modulus);
            }
            return list;
        }

        public static bool TryProjectGaps(
            int[] baseGaps,
            int modulus,
            int anchorIndex,
            int multiplier,
            AcdlProjectionMode mode,
            out int fixedGap,
            out int[] projectedGaps,
            out int scaledFreeSum,
            out int targetFreeSum,
            out string? invalidReason)
        {
            fixedGap = 0;
            projectedGaps = Array.Empty<int>();
            scaledFreeSum = 0;
            targetFreeSum = 0;
            invalidReason = null;

            if (baseGaps == null || baseGaps.Length == 0 || modulus <= 0)
            {
                invalidReason = "No base gaps.";
                return false;
            }
            if (anchorIndex < 0 || anchorIndex >= baseGaps.Length)
            {
                invalidReason = "Invalid anchor index.";
                return false;
            }
            if (multiplier < 1)
            {
                invalidReason = "Multiplier must be >= 1.";
                return false;
            }

            var k = baseGaps.Length;
            fixedGap = baseGaps[anchorIndex];
            targetFreeSum = modulus - fixedGap;
            var freeCount = k - 1;
            if (targetFreeSum < freeCount)
            {
                invalidReason = "R < free gap count.";
                return false;
            }

            var v = new int[k];
            for (int i = 0; i < k; i++)
            {
                if (i == anchorIndex) continue;
                v[i] = baseGaps[i] * multiplier;
                scaledFreeSum += v[i];
            }

            var excess = scaledFreeSum - targetFreeSum;
            if (excess < 0)
            {
                invalidReason = "Scaled sum below target.";
                return false;
            }

            if (excess > 0)
            {
                if (mode == AcdlProjectionMode.TrimLargest)
                {
                    while (excess > 0)
                    {
                        int maxIndex = -1;
                        int maxValue = int.MinValue;
                        for (int i = 0; i < k; i++)
                        {
                            if (i == anchorIndex) continue;
                            if (v[i] <= 1) continue;
                            if (v[i] > maxValue || (v[i] == maxValue && i < maxIndex))
                            {
                                maxValue = v[i];
                                maxIndex = i;
                            }
                        }

                        if (maxIndex < 0)
                        {
                            invalidReason = "Projection exhausted.";
                            return false;
                        }

                        v[maxIndex] -= 1;
                        excess -= 1;
                    }
                }
                else
                {
                    var freeIndices = new List<int>();
                    for (int i = 0; i < k; i++)
                    {
                        if (i != anchorIndex) freeIndices.Add(i);
                    }
                    if (freeIndices.Count == 0)
                    {
                        invalidReason = "No free gaps.";
                        return false;
                    }

                    int startIndex = freeIndices[0];
                    int startValue = v[startIndex];
                    foreach (var idx in freeIndices)
                    {
                        var value = v[idx];
                        if (value > startValue || (value == startValue && idx < startIndex))
                        {
                            startValue = value;
                            startIndex = idx;
                        }
                    }

                    freeIndices.Sort();
                    var ordered = new List<int>(freeIndices.Count);
                    var startPos = freeIndices.IndexOf(startIndex);
                    for (int i = 0; i < freeIndices.Count; i++)
                    {
                        var pos = (startPos + i) % freeIndices.Count;
                        ordered.Add(freeIndices[pos]);
                    }

                    while (excess > 0)
                    {
                        var decremented = false;
                        foreach (var idx in ordered)
                        {
                            if (excess == 0) break;
                            if (v[idx] > 1)
                            {
                                v[idx] -= 1;
                                excess -= 1;
                                decremented = true;
                            }
                        }
                        if (!decremented)
                        {
                            invalidReason = "Projection exhausted.";
                            return false;
                        }
                    }
                }
            }

            projectedGaps = baseGaps.ToArray();
            for (int i = 0; i < k; i++)
            {
                if (i == anchorIndex) continue;
                projectedGaps[i] = v[i];
            }
            return true;
        }

        private static int NormalizeMod(int value, int modulus)
        {
            var n = value % modulus;
            return n < 0 ? n + modulus : n;
        }
    }
}
