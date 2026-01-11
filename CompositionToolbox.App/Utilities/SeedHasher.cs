// Purpose: Utility helpers concerning seed hasher for the UI.

using System;
using System.Linq;

namespace CompositionToolbox.App.Utilities
{
    public static class SeedHasher
    {
        private const string AllowedChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

        public static string NormalizeSeedText(string? value, int maxLength = 8)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return string.Empty;
            }

            var chars = value.Where(c => AllowedChars.IndexOf(c) >= 0).ToArray();
            if (chars.Length == 0)
            {
                return string.Empty;
            }

            if (maxLength > 0 && chars.Length > maxLength)
            {
                return new string(chars, 0, maxLength);
            }

            return new string(chars);
        }

        public static int HashSeed(string seed)
        {
            unchecked
            {
                var hash = 19;
                foreach (var c in seed)
                {
                    hash = (hash * 31) + c;
                }
                return hash;
            }
        }

        public static string SeedTextFromInt(int seed, int length = 8)
        {
            if (length <= 0)
            {
                return string.Empty;
            }

            var buffer = new char[length];
            var value = (uint)seed;
            for (var i = 0; i < buffer.Length; i++)
            {
                buffer[i] = AllowedChars[(int)(value % (uint)AllowedChars.Length)];
                value /= (uint)AllowedChars.Length;
            }
            return new string(buffer);
        }
    }
}
