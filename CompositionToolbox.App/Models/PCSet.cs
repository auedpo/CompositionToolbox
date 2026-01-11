// Purpose: Domain model that represents the PC Set data used across the application.

using System;
using System.Collections.Generic;
using System.Linq;

namespace CompositionToolbox.App.Models
{
    public sealed class PCSet
    {
        public PCSet(int modulus, IReadOnlyList<int> members)
        {
            Modulus = modulus;
            Members = members ?? Array.Empty<int>();
        }

        public int Modulus { get; }
        public IReadOnlyList<int> Members { get; }

        public int Cardinality => Members.Count;

        public string ToBracketString()
        {
            return $"[{string.Join(' ', Members)}]";
        }

        public static PCSet FromMembers(int modulus, IEnumerable<int> pcs)
        {
            var list = pcs?.ToArray() ?? Array.Empty<int>();
            return new PCSet(modulus, list);
        }
    }
}
