using System;
using System.Collections.Generic;

namespace CompositionToolbox.App.Models
{
    public enum CompositePreviewTarget
    {
        Auto,
        Pitch,
        Voicing,
        Events,
        Rhythm,
        Register,
        Instrument
    }

    public class Composite
    {
        public Guid CompositeId { get; set; } = Guid.NewGuid();
        public string Title { get; set; } = "Default";
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public Guid? CurrentStateId { get; set; }
    }

    public class CompositeState
    {
        public Guid StateId { get; set; } = Guid.NewGuid();
        public Guid CompositeId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public Guid? PitchRef { get; set; }
        public Guid? RhythmRef { get; set; }
        public Guid? RegisterRef { get; set; }
        public Guid? InstrumentRef { get; set; }
        public Guid? VoicingRef { get; set; }
        public Guid? EventsRef { get; set; }
        public CompositePreviewTarget ActivePreview { get; set; } = CompositePreviewTarget.Auto;
        public string? Label { get; set; }
    }

    public class CompositeRefChange
    {
        public string Slot { get; set; } = string.Empty;
        public Guid? OldRef { get; set; }
        public Guid? NewRef { get; set; }
    }

    public class CompositeRefPatch
    {
        public List<CompositeRefChange> Changes { get; set; } = new List<CompositeRefChange>();
    }

    public class CompositeTransformLogEntry
    {
        public Guid EntryId { get; set; } = Guid.NewGuid();
        public Guid CompositeId { get; set; }
        public Guid? PrevStateId { get; set; }
        public Guid NewStateId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public string Op { get; set; } = string.Empty;
        public Dictionary<string, object>? OpParams { get; set; }
        public CompositeRefPatch Patch { get; set; } = new CompositeRefPatch();
    }
}
