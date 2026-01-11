// Purpose: Domain model that represents the Composite Snapshot data used across the application.

using System;

namespace CompositionToolbox.App.Models
{
    public sealed class CompositeSnapshot
    {
        public CompositeSnapshot(
            Guid compositeId,
            string displayName,
            Guid? stateId,
            AtomicNode pitchNode,
            int[] ordered,
            int[] unordered,
            PcMode mode,
            RealizationConfig realizationConfig,
            DateTime capturedAtUtc)
        {
            CompositeId = compositeId;
            DisplayName = displayName;
            StateId = stateId;
            PitchNode = pitchNode;
            Ordered = ordered ?? Array.Empty<int>();
            Unordered = unordered ?? Array.Empty<int>();
            Mode = mode;
            RealizationConfig = realizationConfig ?? new RealizationConfig();
            CapturedAtUtc = capturedAtUtc;
        }

        public Guid CompositeId { get; }
        public string DisplayName { get; }
        public Guid? StateId { get; }
        public AtomicNode PitchNode { get; }
        public int[] Ordered { get; }
        public int[] Unordered { get; }
        public PcMode Mode { get; }
        public RealizationConfig RealizationConfig { get; }
        public DateTime CapturedAtUtc { get; }

        public int Modulus => PitchNode.Modulus;

        public CompositeSnapshot WithMode(PcMode mode)
        {
            return new CompositeSnapshot(
                CompositeId,
                DisplayName,
                StateId,
                PitchNode,
                Ordered,
                Unordered,
                mode,
                RealizationConfig,
                CapturedAtUtc);
        }
    }
}
