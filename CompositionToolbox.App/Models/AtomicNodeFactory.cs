// Purpose: Domain model that represents the Atomic Node Factory data used across the application.

using System;
using System.Collections.Generic;
using System.Linq;

namespace CompositionToolbox.App.Models
{
    public static class AtomicNodeFactory
    {
        public static AtomicNode CreatePitchList(
            int modulus,
            PcMode mode,
            IEnumerable<int>? ordered,
            IEnumerable<int>? unordered,
            string label,
            OpDescriptor provenance,
            string? valueJson = null)
        {
            return CreateNode(
                modulus,
                mode,
                ordered,
                unordered,
                AtomicValueType.PitchList,
                label,
                provenance,
                valueJson);
        }

        public static AtomicNode CreateRhythmPattern(
            int modulus,
            PcMode mode,
            IEnumerable<int>? ordered,
            IEnumerable<int>? unordered,
            string label,
            OpDescriptor provenance,
            string? valueJson = null)
        {
            return CreateNode(
                modulus,
                mode,
                ordered,
                unordered,
                AtomicValueType.RhythmPattern,
                label,
                provenance,
                valueJson);
        }

        public static AtomicNode CreateVoicingList(
            int modulus,
            PcMode mode,
            IEnumerable<int>? ordered,
            IEnumerable<int>? unordered,
            string label,
            OpDescriptor provenance,
            string? valueJson = null)
        {
            return CreateNode(
                modulus,
                mode,
                ordered,
                unordered,
                AtomicValueType.VoicingList,
                label,
                provenance,
                valueJson);
        }

        public static AtomicNode CreateRegisterPattern(
            int modulus,
            PcMode mode,
            IEnumerable<int>? ordered,
            IEnumerable<int>? unordered,
            string label,
            OpDescriptor provenance,
            string? valueJson = null)
        {
            return CreateNode(
                modulus,
                mode,
                ordered,
                unordered,
                AtomicValueType.RegisterPattern,
                label,
                provenance,
                valueJson);
        }

        public static AtomicNode CreateNoteEventSequence(
            int modulus,
            PcMode mode,
            IEnumerable<int>? ordered,
            IEnumerable<int>? unordered,
            string label,
            OpDescriptor provenance,
            string? valueJson = null)
        {
            return CreateNode(
                modulus,
                mode,
                ordered,
                unordered,
                AtomicValueType.NoteEventSeq,
                label,
                provenance,
                valueJson);
        }

        private static AtomicNode CreateNode(
            int modulus,
            PcMode mode,
            IEnumerable<int>? ordered,
            IEnumerable<int>? unordered,
            AtomicValueType valueType,
            string label,
            OpDescriptor provenance,
            string? valueJson)
        {
            if (provenance == null)
            {
                throw new ArgumentNullException(nameof(provenance));
            }

            return new AtomicNode
            {
                Modulus = modulus,
                Mode = mode,
                Ordered = ToArray(ordered),
                Unordered = ToArray(unordered),
                ValueType = valueType,
                Label = label ?? string.Empty,
                OpFromPrev = provenance,
                ValueJson = valueJson
            };
        }

        private static int[] ToArray(IEnumerable<int>? source)
        {
            return source?.ToArray() ?? Array.Empty<int>();
        }
    }
}
