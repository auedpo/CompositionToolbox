using System;
using System.Linq;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Stores;

namespace CompositionToolbox.App.Services
{
    public static class CompositeSnapshotFactory
    {
        public static CompositeSnapshot? CreateFromSelection(CompositeStore store, RealizationConfig realizationConfig)
        {
            if (store == null) return null;
            var composite = store.SelectedComposite;
            if (composite == null) return null;
            var state = store.SelectedState ?? store.GetCurrentState(composite);
            if (state?.PitchRef == null) return null;

            var node = store.Nodes.FirstOrDefault(n => n.NodeId == state.PitchRef.Value);
            if (node == null) return null;

            var ordered = node.Ordered?.ToArray() ?? Array.Empty<int>();
            var unordered = node.Unordered?.ToArray() ?? Array.Empty<int>();
            if (unordered.Length == 0 && ordered.Length > 0)
            {
                unordered = MusicUtils.NormalizeUnordered(ordered, node.Modulus);
            }
            if (ordered.Length == 0 && unordered.Length > 0)
            {
                ordered = unordered.ToArray();
            }

            var name = string.IsNullOrWhiteSpace(composite.Title) ? "Composite" : composite.Title.Trim();
            var config = realizationConfig?.Clone() ?? new RealizationConfig();

            return new CompositeSnapshot(
                composite.CompositeId,
                name,
                state.StateId,
                node,
                ordered,
                unordered,
                node.Mode,
                config,
                DateTime.UtcNow);
        }
    }
}
