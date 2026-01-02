using System;
using System.Collections.Generic;

namespace CompositionToolbox.App.Models
{
    public sealed class WorkspacePreview
    {
        public WorkspacePreview(
            AtomicNode node,
            string renderMode,
            IReadOnlyList<WorkspacePreviewAttribute>? attributes = null,
            int[]? midiNotes = null)
        {
            Node = node ?? throw new ArgumentNullException(nameof(node));
            RenderMode = string.IsNullOrWhiteSpace(renderMode) ? "line" : renderMode;
            Attributes = attributes ?? Array.Empty<WorkspacePreviewAttribute>();
            MidiNotes = midiNotes;
        }

        public AtomicNode Node { get; }
        public string RenderMode { get; }
        public IReadOnlyList<WorkspacePreviewAttribute> Attributes { get; }
        public int[]? MidiNotes { get; }
    }
}
