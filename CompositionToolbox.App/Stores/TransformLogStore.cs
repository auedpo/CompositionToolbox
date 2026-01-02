using CommunityToolkit.Mvvm.ComponentModel;
using System.Collections.ObjectModel;
using CompositionToolbox.App.Models;
using System.Linq;
using System.Diagnostics;

namespace CompositionToolbox.App.Stores
{
    public class TransformLogStore : ObservableObject
    {
        private const string RootOpType = "INPUT";
        public ObservableCollection<AtomicNode> Nodes { get; } = new ObservableCollection<AtomicNode>();

        private AtomicNode? _selectedNode;
        public AtomicNode? SelectedNode
        {
            get => _selectedNode;
            set
            {
                SetProperty(ref _selectedNode, value);
                SelectedNodeChanged?.Invoke(this, _selectedNode);
            }
        }

        public event EventHandler<AtomicNode?>? SelectedNodeChanged;

        private readonly CompositeStore? _compositeStore;

        public TransformLogStore() { }

        public TransformLogStore(CompositeStore compositeStore)
        {
            _compositeStore = compositeStore ?? throw new ArgumentNullException(nameof(compositeStore));
        }

        public void AppendAndSelect(AtomicNode node)
        {
            if (!ValidateProvenance(node)) return;
            Trace.WriteLine($"[TransformLogStore] AppendAndSelect: adding node {node.NodeId} ts={DateTime.UtcNow:o} tid={Environment.CurrentManagedThreadId}");
            Trace.WriteLine(Environment.StackTrace);
            if (_compositeStore != null)
            {
                var nodeId = _compositeStore.GetOrAddNode(node);
                var canonical = _compositeStore.Nodes.First(n => n.NodeId == nodeId);
                Nodes.Add(canonical);
                Trace.WriteLine($"[TransformLogStore] AppendAndSelect: added canonical node {canonical.NodeId} ts={DateTime.UtcNow:o}");
                SelectedNode = canonical;
            }
            else
            {
                Nodes.Add(node);
                Trace.WriteLine($"[TransformLogStore] AppendAndSelect: added node {node.NodeId} ts={DateTime.UtcNow:o}");
                SelectedNode = node;
            }
        }

        public bool AppendUnlessNoop(AtomicNode candidate)
        {
            if (candidate == null) return false;
            if (!ValidateProvenance(candidate)) return false;
            if (SelectedNode != null && AreEquivalent(SelectedNode, candidate))
            {
                return false;
            }

            Trace.WriteLine($"[TransformLogStore] AppendUnlessNoop: adding candidate {candidate.NodeId} ts={DateTime.UtcNow:o} tid={Environment.CurrentManagedThreadId}");
            Trace.WriteLine(Environment.StackTrace);
            if (_compositeStore != null)
            {
                var nodeId = _compositeStore.GetOrAddNode(candidate);
                var canonical = _compositeStore.Nodes.First(n => n.NodeId == nodeId);
                Nodes.Add(canonical);
                Trace.WriteLine($"[TransformLogStore] AppendUnlessNoop: added canonical candidate {canonical.NodeId} ts={DateTime.UtcNow:o}");
                SelectedNode = canonical;
                return true;
            }

            Nodes.Add(candidate);
            Trace.WriteLine($"[TransformLogStore] AppendUnlessNoop: added candidate {candidate.NodeId} ts={DateTime.UtcNow:o}");
            SelectedNode = candidate;
            return true;
        }

        public void RefreshNode(AtomicNode node)
        {
            if (node == null) return;
            var index = Nodes.IndexOf(node);
            if (index < 0) return;
            Nodes[index] = node;
        }

        private bool ValidateProvenance(AtomicNode node)
        {
            var op = node.OpFromPrev;
            if (op == null)
            {
#if DEBUG
                throw new InvalidOperationException("OpFromPrev is required for all node-creating transforms.");
#else
                System.Windows.MessageBox.Show(
                    "Unable to create node: missing operation provenance (OpFromPrev).",
                    "Transform Log",
                    System.Windows.MessageBoxButton.OK,
                    System.Windows.MessageBoxImage.Warning);
                return false;
#endif
            }

            var isRoot = string.Equals(op.OpType, RootOpType, StringComparison.OrdinalIgnoreCase);
            if (!isRoot && op.SourceNodeId == null)
            {
#if DEBUG
                throw new InvalidOperationException("SourceNodeId is required for non-root transforms.");
#else
                System.Windows.MessageBox.Show(
                    "Unable to create node: missing SourceNodeId provenance.",
                    "Transform Log",
                    System.Windows.MessageBoxButton.OK,
                    System.Windows.MessageBoxImage.Warning);
                return false;
#endif
            }

            return true;
        }

        private static bool AreEquivalent(AtomicNode current, AtomicNode candidate)
        {
            if (current.Mode != candidate.Mode) return false;
            if (current.Modulus != candidate.Modulus) return false;

            return current.Mode == PcMode.Ordered
                ? current.Ordered.SequenceEqual(candidate.Ordered)
                : current.Unordered.SequenceEqual(candidate.Unordered);
        }
    }
}
